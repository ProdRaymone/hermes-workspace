import { buildInstanceApiPath } from './hermes-instance-scope'

export interface AuthStatus {
  authenticated: boolean
  authRequired: boolean
  backendReachable?: boolean
  instance?: string
  error?: string
}

export function buildHermesAuthCheckPath(instanceId?: string | null): string {
  return buildInstanceApiPath('/api/auth-check', instanceId)
}

export async function fetchHermesAuthStatus(
  instanceIdOrTimeoutMs?: string | number,
  timeoutMs = 5_000,
): Promise<AuthStatus> {
  const instanceId =
    typeof instanceIdOrTimeoutMs === 'string' ? instanceIdOrTimeoutMs : undefined
  const resolvedTimeoutMs =
    typeof instanceIdOrTimeoutMs === 'number' ? instanceIdOrTimeoutMs : timeoutMs
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    resolvedTimeoutMs,
  )

  let res: Response
  try {
    res = await fetch(buildHermesAuthCheckPath(instanceId), {
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out after 5 seconds')
    }

    throw error instanceof Error
      ? error
      : new Error('Failed to connect to Hermes Agent')
  } finally {
    globalThis.clearTimeout(timeout)
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  return (await res.json()) as AuthStatus
}
