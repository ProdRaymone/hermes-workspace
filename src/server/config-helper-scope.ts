import {
  buildHermesConfigScopeForInstance,
  buildHermesConfigScopePayload,
  patchHermesConfigForScope,
  readHermesConfigForScope,
} from './hermes-config-scope'
import { redactSecretValues } from './secret-redaction'
import type { HermesInstance } from './hermes-instances'
import type { ProfileFileExecutor } from './profile-files'

type ConfigHelperOptions = {
  executor?: ProfileFileExecutor
}

type NormalizedConfigPatch = {
  config?: Record<string, unknown>
  env?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function objectFromPath(path: string, value: unknown): Record<string, unknown> {
  const segments = path
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length === 0) throw new Error('Config path is required')
  if (segments.some((segment) => segment === '__proto__')) {
    throw new Error('Config path is not allowed')
  }

  const root: Record<string, unknown> = {}
  let cursor = root
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = value
      return
    }
    const next: Record<string, unknown> = {}
    cursor[segment] = next
    cursor = next
  })
  return root
}

function normalizeRawPatch(raw: string): NormalizedConfigPatch {
  const parsed = JSON.parse(raw) as unknown
  if (!isRecord(parsed)) throw new Error('Raw config patch must be an object')

  if (isRecord(parsed.config) || isRecord(parsed.env)) {
    return {
      ...(isRecord(parsed.config) ? { config: parsed.config } : {}),
      ...(isRecord(parsed.env) ? { env: parsed.env } : {}),
    }
  }

  return { config: parsed }
}

export function normalizeConfigPatchBody(
  body: unknown,
): NormalizedConfigPatch {
  if (!isRecord(body)) return {}

  if (isRecord(body.config) || isRecord(body.env)) {
    return {
      ...(isRecord(body.config) ? { config: body.config } : {}),
      ...(isRecord(body.env) ? { env: body.env } : {}),
    }
  }

  if (typeof body.raw === 'string' && body.raw.trim()) {
    return normalizeRawPatch(body.raw)
  }

  if (typeof body.path === 'string') {
    return { config: objectFromPath(body.path, body.value) }
  }

  if (isRecord(body.patch)) return { config: body.patch }

  return { config: body }
}

export async function readConfigHelperForInstance(
  instance: HermesInstance,
  options: ConfigHelperOptions = {},
) {
  const scope = buildHermesConfigScopeForInstance(instance)
  const payload = await readHermesConfigForScope(scope, {
    executor: options.executor,
  })

  return {
    ok: true,
    instance: scope.instance,
    payload: redactSecretValues(payload) as Record<string, unknown>,
    scope: buildHermesConfigScopePayload(scope),
  }
}

export async function patchConfigHelperForInstance(
  instance: HermesInstance,
  body: unknown,
  options: ConfigHelperOptions = {},
) {
  const scope = buildHermesConfigScopeForInstance(instance)
  await patchHermesConfigForScope(scope, normalizeConfigPatchBody(body), {
    executor: options.executor,
  })

  return {
    ok: true,
    instance: scope.instance,
    message: 'Config updated. Restart Hermes to apply changes.',
    scope: buildHermesConfigScopePayload(scope),
  }
}
