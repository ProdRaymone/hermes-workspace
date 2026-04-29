import {
  buildHermesConfigScopeForInstance,
  buildHermesConfigScopePayload,
  readHermesConfigForScope,
} from './hermes-config-scope'
import { redactProfileFileError } from './profile-files'
import { redactSecretValues, redactStringRecord } from './secret-redaction'
import type { HermesInstance, HermesInstanceSource } from './hermes-instances'
import type { ProfileFileExecutor } from './profile-files'

export type McpConfigScopeKind = 'legacy-default' | 'selected-instance'
export type McpConfigSource = 'selected-gateway' | 'profile-file'

export type McpConfigScope = {
  instance: string
  label: string
  profile: string
  profilePath: string
  gatewayUrl: string
  source: HermesInstanceSource
  kind: McpConfigScopeKind
}

export type McpConfigScopePayload = {
  instance: string
  label: string
  profile: string
  profilePath: string
  gatewayUrl: string
  kind: McpConfigScopeKind
  transport: 'default-gateway' | 'selected-gateway'
}

export type McpServerRecord = {
  name: string
  transport: 'stdio' | 'http'
  command?: string
  args?: Array<string>
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  timeout?: number
  connectTimeout?: number
  auth?: unknown
}

export type McpServersResult = {
  ok: boolean
  code?: string
  message?: string
  instance: string
  source: McpConfigSource
  scope: McpConfigScopePayload
  servers: Array<McpServerRecord>
}

export type McpReloadResult = {
  ok: boolean
  code?: string
  message: string
  instance: string
  source: 'selected-gateway'
  scope: McpConfigScopePayload
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

type McpConfigOptions = {
  fetcher?: Fetcher
  executor?: ProfileFileExecutor
  timeoutMs?: number
}

const BEARER_TOKEN = process.env.HERMES_API_TOKEN || ''
const DEFAULT_TIMEOUT_MS = 5_000
const RELOAD_PATHS = ['/api/reload-mcp', '/api/mcp/reload']

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

function getFetcher(options: McpConfigOptions): Fetcher {
  return options.fetcher ?? fetch
}

function scopeUrl(scope: McpConfigScope, endpoint: string): string {
  const base = scope.gatewayUrl.replace(/\/+$/, '')
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${base}${path}`
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined && entry !== null)
    .map(([key, entry]) => [key, String(entry)] as const)

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function isWslSelectedProfile(scope: McpConfigScope): boolean {
  return scope.kind === 'selected-instance' && scope.source === 'wsl'
}

function scopeToHermesInstance(scope: McpConfigScope): Pick<
  HermesInstance,
  'id' | 'label' | 'profileName' | 'profilePath' | 'source' | 'isDefault'
> {
  return {
    id: scope.instance,
    label: scope.label,
    profileName: scope.profile,
    profilePath: scope.profilePath,
    source: scope.source,
    isDefault: scope.kind === 'legacy-default',
  }
}

function unavailableResult(
  scope: McpConfigScope,
  code: string,
  message: string,
): McpServersResult {
  return {
    ok: false,
    code,
    message,
    instance: scope.instance,
    source: 'selected-gateway',
    scope: buildMcpConfigScopePayload(scope),
    servers: [],
  }
}

function redactMessage(message: string): string {
  return redactProfileFileError(message)
}

export function buildMcpConfigScopeForInstance(
  instance: Pick<
    HermesInstance,
    | 'id'
    | 'label'
    | 'profileName'
    | 'profilePath'
    | 'gatewayUrl'
    | 'source'
    | 'isDefault'
  >,
): McpConfigScope {
  const isDefault = instance.isDefault || instance.id === 'default'
  return {
    instance: isDefault ? 'default' : instance.id,
    label: instance.label || (isDefault ? 'Hermes 1' : instance.id),
    profile: instance.profileName || (isDefault ? 'default' : instance.id),
    profilePath: instance.profilePath,
    gatewayUrl: instance.gatewayUrl,
    source: instance.source,
    kind: isDefault ? 'legacy-default' : 'selected-instance',
  }
}

export function buildMcpConfigScopePayload(
  scope: McpConfigScope,
): McpConfigScopePayload {
  return {
    instance: scope.instance,
    label: scope.label,
    profile: scope.profile,
    profilePath: scope.profilePath,
    gatewayUrl: scope.gatewayUrl,
    kind: scope.kind,
    transport:
      scope.kind === 'legacy-default' ? 'default-gateway' : 'selected-gateway',
  }
}

export function readMcpServers(payload: unknown): Array<McpServerRecord> {
  const root =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {}

  const config =
    root.config && typeof root.config === 'object'
      ? (root.config as Record<string, unknown>)
      : root

  const rawServers = config.mcp_servers
  if (
    !rawServers ||
    typeof rawServers !== 'object' ||
    Array.isArray(rawServers)
  ) {
    return []
  }

  return Object.entries(rawServers as Record<string, unknown>).flatMap(
    ([name, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return []
      const record = value as Record<string, unknown>
      const command =
        typeof record.command === 'string' ? record.command : undefined
      const url = typeof record.url === 'string' ? record.url : undefined
      const transport = url ? 'http' : 'stdio'

      return [
        {
          name,
          transport,
          command,
          args: Array.isArray(record.args)
            ? record.args.map((entry) => String(entry))
            : undefined,
          env: redactStringRecord(toStringRecord(record.env)),
          url,
          headers: redactStringRecord(toStringRecord(record.headers)),
          timeout:
            typeof record.timeout === 'number' ? record.timeout : undefined,
          connectTimeout:
            typeof record.connect_timeout === 'number'
              ? record.connect_timeout
              : undefined,
          auth: redactSecretValues(record.auth),
        } satisfies McpServerRecord,
      ]
    },
  )
}

async function fetchSelectedGatewayConfig(
  scope: McpConfigScope,
  options: McpConfigOptions,
): Promise<{ ok: true; payload: unknown } | { ok: false; status?: number }> {
  try {
    const response = await getFetcher(options)(scopeUrl(scope, '/api/config'), {
      headers: authHeaders(),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })

    if (!response.ok) return { ok: false, status: response.status }
    return {
      ok: true,
      payload: await response.json().catch(() => ({})),
    }
  } catch {
    return { ok: false }
  }
}

export async function listMcpServersForScope(
  scope: McpConfigScope,
  options: McpConfigOptions = {},
): Promise<McpServersResult> {
  const gateway = await fetchSelectedGatewayConfig(scope, options)
  if (gateway.ok) {
    return {
      ok: true,
      instance: scope.instance,
      source: 'selected-gateway',
      scope: buildMcpConfigScopePayload(scope),
      servers: readMcpServers(gateway.payload),
    }
  }

  if (isWslSelectedProfile(scope)) {
    try {
      const configScope = buildHermesConfigScopeForInstance(
        scopeToHermesInstance(scope),
      )
      const config = await readHermesConfigForScope(configScope, {
        executor: options.executor,
      })
      return {
        ok: true,
        instance: scope.instance,
        source: 'profile-file',
        scope: buildMcpConfigScopePayload(scope),
        servers: readMcpServers(config),
        message:
          'Selected Hermes gateway is unavailable; showing MCP servers from the selected profile config file.',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return unavailableResult(
        scope,
        'profile_files_unavailable',
        redactMessage(message),
      )
    }
  }

  return unavailableResult(
    scope,
    gateway.status ? 'capability_unavailable' : 'instance_unavailable',
    gateway.status
      ? `Failed to load MCP servers from selected gateway config (${gateway.status}).`
      : 'Could not reach selected Hermes gateway config endpoint.',
  )
}

export async function reloadMcpForScope(
  scope: McpConfigScope,
  options: McpConfigOptions = {},
): Promise<McpReloadResult> {
  let sawGatewayResponse = false

  for (const path of RELOAD_PATHS) {
    try {
      const response = await getFetcher(options)(scopeUrl(scope, path), {
        method: 'POST',
        headers: authHeaders(),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      })
      sawGatewayResponse = true

      if (response.ok) {
        return {
          ok: true,
          instance: scope.instance,
          source: 'selected-gateway',
          scope: buildMcpConfigScopePayload(scope),
          message: 'MCP server reload requested.',
        }
      }
    } catch {
      // Try the next candidate endpoint on the same selected gateway.
    }
  }

  return {
    ok: false,
    code: sawGatewayResponse ? 'capability_unavailable' : 'instance_unavailable',
    instance: scope.instance,
    source: 'selected-gateway',
    scope: buildMcpConfigScopePayload(scope),
    message: sawGatewayResponse
      ? 'MCP reload endpoint unavailable on the selected Hermes gateway.'
      : 'Selected Hermes gateway is unavailable for MCP reload.',
  }
}
