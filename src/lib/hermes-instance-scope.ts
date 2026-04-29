type ConnectionStatusLike = {
  status?: string
  health?: boolean
  chatReady?: boolean
}

export function normalizeHermesInstanceId(
  instanceId?: string | null,
): string {
  return instanceId?.trim() || 'default'
}

export function isDefaultHermesInstance(
  instanceId?: string | null,
): boolean {
  return normalizeHermesInstanceId(instanceId) === 'default'
}

export function buildInstanceApiPath(
  path: string,
  instanceId?: string | null,
): string {
  const normalized = normalizeHermesInstanceId(instanceId)
  if (isDefaultHermesInstance(normalized)) return path

  const [basePath, rawQuery = ''] = path.split('?')
  const params = new URLSearchParams(rawQuery)
  params.set('instance', normalized)
  return `${basePath}?${params.toString()}`
}

export function getInstanceScopedSessionKey(
  sessionKey: string,
  instanceId?: string | null,
): string {
  const normalizedSessionKey = sessionKey || 'main'
  if (isDefaultHermesInstance(instanceId)) return normalizedSessionKey
  return `${normalizeHermesInstanceId(instanceId)}:${normalizedSessionKey}`
}

export function isConnectionStatusReachable(
  status: ConnectionStatusLike | null | undefined,
): boolean {
  if (!status) return false
  if (status.status === 'connected' || status.status === 'enhanced') {
    return true
  }
  return status.health === true || status.chatReady === true
}

export function shouldAttemptHermesAutoStart(
  instanceId?: string | null,
  allowAutoStart = false,
): boolean {
  return allowAutoStart && isDefaultHermesInstance(instanceId)
}
