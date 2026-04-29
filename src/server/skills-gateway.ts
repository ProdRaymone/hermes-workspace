import { redactProfileFileError } from './profile-files'
import type { HermesInstance } from './hermes-instances'

export type SkillsGatewayScopeKind = 'legacy-default' | 'selected-instance'

export type SkillsGatewayScope = {
  instance: string
  label: string
  profile: string
  profilePath: string
  gatewayUrl: string
  kind: SkillsGatewayScopeKind
}

export type SkillsScopePayload = {
  instance: string
  label: string
  profile: string
  profilePath: string
  kind: SkillsGatewayScopeKind
  transport: 'default-gateway' | 'selected-gateway'
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

type SkillsGatewayOptions = {
  fetcher?: Fetcher
  timeoutMs?: number
}

export class SelectedGatewayRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'SelectedGatewayRequestError'
  }
}

export function statusForSelectedSkillsGatewayError(error: unknown): number {
  return error instanceof SelectedGatewayRequestError ? 503 : 500
}

export function buildSkillsGatewayErrorPayload(
  scope: SkillsGatewayScope,
  error: unknown,
  fallbackError: string,
) {
  return {
    ok: false,
    error: error instanceof Error ? error.message : fallbackError,
    scope: buildSkillsScopePayload(scope),
  }
}

const BEARER_TOKEN = process.env.HERMES_API_TOKEN || ''
const DEFAULT_TIMEOUT_MS = 30_000

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

function scopeUrl(scope: SkillsGatewayScope, endpoint: string): string {
  const base = scope.gatewayUrl.replace(/\/+$/, '')
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${base}${path}`
}

function parseJsonOrObject(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true }
  return JSON.parse(trimmed)
}

function redactedErrorMessage(message: string): string {
  return redactProfileFileError(message)
}

function selectedGatewayRequestError(
  scope: SkillsGatewayScope,
  operation: string,
  statusCode: number,
  body: string,
): SelectedGatewayRequestError {
  const detail = body.trim()
  const message = detail
    ? `Hermes ${scope.instance} ${operation} failed (${statusCode}): ${detail}`
    : `Hermes ${scope.instance} ${operation} failed (${statusCode})`
  return new SelectedGatewayRequestError(
    redactedErrorMessage(message),
    statusCode,
  )
}

async function readResponseText(response: Response): Promise<string> {
  return response.text().catch(() => '')
}

function getFetcher(options: SkillsGatewayOptions): Fetcher {
  return options.fetcher ?? fetch
}

export function buildSkillsScopeForInstance(
  instance: Pick<
    HermesInstance,
    'id' | 'label' | 'profileName' | 'profilePath' | 'gatewayUrl' | 'isDefault'
  >,
): SkillsGatewayScope {
  const isDefault = instance.isDefault || instance.id === 'default'
  return {
    instance: isDefault ? 'default' : instance.id,
    label: instance.label || (isDefault ? 'Hermes 1' : instance.id),
    profile: instance.profileName || (isDefault ? 'default' : instance.id),
    profilePath: instance.profilePath,
    gatewayUrl: instance.gatewayUrl,
    kind: isDefault ? 'legacy-default' : 'selected-instance',
  }
}

export function buildSkillsScopePayload(
  scope: SkillsGatewayScope,
): SkillsScopePayload {
  return {
    instance: scope.instance,
    label: scope.label,
    profile: scope.profile,
    profilePath: scope.profilePath,
    kind: scope.kind,
    transport:
      scope.kind === 'legacy-default' ? 'default-gateway' : 'selected-gateway',
  }
}

export function isLegacyDefaultSkillsScope(scope: SkillsGatewayScope): boolean {
  return scope.kind === 'legacy-default'
}

export async function fetchSkillsFromSelectedInstance(
  scope: SkillsGatewayScope,
  options: SkillsGatewayOptions = {},
): Promise<unknown> {
  try {
    const response = await getFetcher(options)(scopeUrl(scope, '/api/skills'), {
      headers: authHeaders(),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })

    if (!response.ok) {
      const body = await readResponseText(response)
      throw selectedGatewayRequestError(
        scope,
        'skills request',
        response.status,
        body,
      )
    }

    return parseJsonOrObject(await readResponseText(response))
  } catch (error) {
    if (error instanceof SelectedGatewayRequestError) {
      throw error
    }
    if (error instanceof Error) {
      throw new Error(redactedErrorMessage(error.message))
    }
    throw new Error('Failed to fetch skills from selected Hermes instance')
  }
}

export async function postSkillActionToSelectedInstance(
  scope: SkillsGatewayScope,
  endpoint: string,
  payload: Record<string, unknown>,
  options: SkillsGatewayOptions = {},
): Promise<unknown> {
  try {
    const response = await getFetcher(options)(scopeUrl(scope, endpoint), {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })

    if (!response.ok) {
      const body = await readResponseText(response)
      throw selectedGatewayRequestError(
        scope,
        'skill action',
        response.status,
        body,
      )
    }

    return parseJsonOrObject(await readResponseText(response))
  } catch (error) {
    if (error instanceof SelectedGatewayRequestError) {
      throw error
    }
    if (error instanceof Error) {
      throw new Error(redactedErrorMessage(error.message))
    }
    throw new Error('Failed to run skill action on selected Hermes instance')
  }
}
