import type { ChatAttachment, ChatMessage } from './types'

export type PendingSendPayload = {
  sessionKey: string
  friendlyId: string
  message: string
  attachments: Array<ChatAttachment>
  optimisticMessage: ChatMessage
}

let pendingSend: PendingSendPayload | null = null
let pendingSendInstanceId = 'default'
let pendingGeneration = false
let recentSession: {
  friendlyId: string
  instanceId: string
  at: number
} | null = null

const PENDING_MESSAGE_STORAGE_PREFIX = 'hermes_pending_msg_'
const PENDING_MESSAGE_MAX_AGE_MS = 5 * 60 * 1000

type PersistedPendingSendPayload = PendingSendPayload & {
  instanceId?: string
  storedAt: number
}

function canUseLocalStorage() {
  return (
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  )
}

function normalizeInstanceId(instanceId?: string) {
  const trimmed = instanceId?.trim()
  return trimmed || 'default'
}

function isSameInstance(left?: string, right?: string) {
  return normalizeInstanceId(left) === normalizeInstanceId(right)
}

export function getPendingMessageStorageKey(
  sessionKey: string,
  instanceId?: string,
) {
  const normalizedSessionKey = sessionKey || 'main'
  const normalizedInstanceId = normalizeInstanceId(instanceId)
  if (normalizedInstanceId === 'default') {
    return `${PENDING_MESSAGE_STORAGE_PREFIX}${normalizedSessionKey}`
  }
  return `${PENDING_MESSAGE_STORAGE_PREFIX}${normalizedInstanceId}_${normalizedSessionKey}`
}

function isExpiredPendingPayload(payload: { storedAt?: unknown }) {
  if (
    typeof payload.storedAt !== 'number' ||
    !Number.isFinite(payload.storedAt)
  ) {
    return true
  }
  return Date.now() - payload.storedAt > PENDING_MESSAGE_MAX_AGE_MS
}

function writePendingSendToStorage(
  payload: PendingSendPayload,
  instanceId?: string,
) {
  if (!canUseLocalStorage()) return

  cleanupExpiredPendingSends()

  const record: PersistedPendingSendPayload = {
    ...payload,
    instanceId: normalizeInstanceId(instanceId),
    storedAt: Date.now(),
  }

  try {
    window.localStorage.setItem(
      getPendingMessageStorageKey(payload.sessionKey, instanceId),
      JSON.stringify(record),
    )
  } catch {
    // Ignore storage write failures.
  }
}

function removePendingSendFromStorageByFriendlyId(
  friendlyId: string,
  instanceId?: string,
) {
  if (!canUseLocalStorage() || !friendlyId) return

  try {
    const keysToDelete: Array<string> = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith(PENDING_MESSAGE_STORAGE_PREFIX)) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as PersistedPendingSendPayload
        if (instanceId && !isSameInstance(parsed.instanceId, instanceId)) {
          continue
        }
        if (parsed.friendlyId === friendlyId) {
          keysToDelete.push(key)
        }
      } catch {
        keysToDelete.push(key)
      }
    }
    for (const key of keysToDelete) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function cleanupExpiredPendingSends() {
  if (!canUseLocalStorage()) return

  try {
    const keysToDelete: Array<string> = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith(PENDING_MESSAGE_STORAGE_PREFIX)) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) {
        keysToDelete.push(key)
        continue
      }
      try {
        const parsed = JSON.parse(raw) as PersistedPendingSendPayload
        if (isExpiredPendingPayload(parsed)) {
          keysToDelete.push(key)
        }
      } catch {
        keysToDelete.push(key)
      }
    }
    for (const key of keysToDelete) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function persistPendingMessage(
  payload: PendingSendPayload,
  instanceId?: string,
) {
  writePendingSendToStorage(payload, instanceId)
}

export function readPendingMessage(
  sessionKey: string,
  friendlyId?: string,
  instanceId?: string,
): PendingSendPayload | null {
  if (!canUseLocalStorage() || !sessionKey) return null

  cleanupExpiredPendingSends()

  try {
    const raw = window.localStorage.getItem(
      getPendingMessageStorageKey(sessionKey, instanceId),
    )
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedPendingSendPayload
    if (isExpiredPendingPayload(parsed)) {
      window.localStorage.removeItem(
        getPendingMessageStorageKey(sessionKey, instanceId),
      )
      return null
    }
    if (!isSameInstance(parsed.instanceId, instanceId)) return null
    if (friendlyId && parsed.friendlyId !== friendlyId) return null
    return {
      sessionKey: parsed.sessionKey,
      friendlyId: parsed.friendlyId,
      message: parsed.message,
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      optimisticMessage: parsed.optimisticMessage,
    }
  } catch {
    try {
      window.localStorage.removeItem(
        getPendingMessageStorageKey(sessionKey, instanceId),
      )
    } catch {
      // Ignore storage cleanup failures.
    }
    return null
  }
}

export function clearPendingMessage(sessionKey: string, instanceId?: string) {
  if (!canUseLocalStorage() || !sessionKey) return
  try {
    window.localStorage.removeItem(
      getPendingMessageStorageKey(sessionKey, instanceId),
    )
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function stashPendingSend(
  payload: PendingSendPayload,
  instanceId?: string,
) {
  pendingSend = payload
  pendingSendInstanceId = normalizeInstanceId(instanceId)
  writePendingSendToStorage(payload, instanceId)
}

export function hasPendingSend(instanceId?: string) {
  if (instanceId && !isSameInstance(pendingSendInstanceId, instanceId)) {
    return false
  }
  return pendingSend !== null
}

export function setPendingGeneration(value: boolean) {
  pendingGeneration = value
}

export function hasPendingGeneration() {
  return pendingGeneration
}

export function resetPendingSend(instanceId?: string) {
  if (
    pendingSend &&
    instanceId &&
    !isSameInstance(pendingSendInstanceId, instanceId)
  ) {
    return
  }
  if (pendingSend?.sessionKey) {
    clearPendingMessage(pendingSend.sessionKey, pendingSendInstanceId)
  }
  pendingSend = null
  pendingSendInstanceId = 'default'
  pendingGeneration = false
}

export function clearPendingSendForSession(
  sessionKey: string,
  friendlyId: string,
  instanceId?: string,
) {
  if (sessionKey) {
    clearPendingMessage(sessionKey, instanceId)
  } else if (friendlyId) {
    removePendingSendFromStorageByFriendlyId(friendlyId, instanceId)
  }

  if (!pendingSend) return
  if (instanceId && !isSameInstance(pendingSendInstanceId, instanceId)) return
  if (sessionKey && pendingSend.sessionKey === sessionKey) {
    resetPendingSend(pendingSendInstanceId)
    return
  }
  if (friendlyId && pendingSend.friendlyId === friendlyId) {
    resetPendingSend(pendingSendInstanceId)
  }
}

export function setRecentSession(friendlyId: string, instanceId?: string) {
  recentSession = {
    friendlyId,
    instanceId: normalizeInstanceId(instanceId),
    at: Date.now(),
  }
}

export function isRecentSession(
  friendlyId: string,
  instanceIdOrMaxAgeMs?: string | number,
  maxAgeMs = 15000,
) {
  if (!recentSession) return false
  const instanceId =
    typeof instanceIdOrMaxAgeMs === 'string' ? instanceIdOrMaxAgeMs : undefined
  const effectiveMaxAgeMs =
    typeof instanceIdOrMaxAgeMs === 'number' ? instanceIdOrMaxAgeMs : maxAgeMs
  if (recentSession.friendlyId !== friendlyId) return false
  if (!isSameInstance(recentSession.instanceId, instanceId)) return false
  if (Date.now() - recentSession.at > effectiveMaxAgeMs) return false
  return true
}

export function consumePendingSend(
  sessionKey: string,
  friendlyId?: string,
  instanceId?: string,
): PendingSendPayload | null {
  if (!pendingSend) return null
  if (instanceId && !isSameInstance(pendingSendInstanceId, instanceId))
    return null
  if (sessionKey && pendingSend.sessionKey === sessionKey) {
    const payload = pendingSend
    pendingSend = null
    pendingSendInstanceId = 'default'
    return payload
  }
  if (friendlyId && pendingSend.friendlyId === friendlyId) {
    const payload = pendingSend
    pendingSend = null
    pendingSendInstanceId = 'default'
    return payload
  }
  return null
}
