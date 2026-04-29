import type { ChatMessage, HistoryResponse } from './types'

const DEFAULT_PORTABLE_HISTORY_STORAGE_KEY = 'hermes_portable_chat_main'
const PORTABLE_HISTORY_LIMIT = 100

function normalizeInstanceId(instanceId?: string): string {
  const trimmed = instanceId?.trim()
  return trimmed || 'default'
}

export function getPortableHistoryStorageKey(instanceId?: string): string {
  const normalized = normalizeInstanceId(instanceId)
  if (normalized === 'default') return DEFAULT_PORTABLE_HISTORY_STORAGE_KEY
  return `hermes_portable_chat_${normalized}_main`
}

export function readPortableHistory(instanceId?: string): HistoryResponse {
  if (typeof window === 'undefined') {
    return { sessionKey: 'main', messages: [] }
  }

  try {
    const raw = window.localStorage.getItem(
      getPortableHistoryStorageKey(instanceId),
    )
    if (!raw) return { sessionKey: 'main', messages: [] }
    const parsed = JSON.parse(raw) as { messages?: Array<ChatMessage> } | null
    const messages = Array.isArray(parsed?.messages) ? parsed.messages : []
    return {
      sessionKey: 'main',
      messages: messages.slice(-PORTABLE_HISTORY_LIMIT),
    }
  } catch {
    return { sessionKey: 'main', messages: [] }
  }
}

export function persistPortableHistory(
  messages: Array<ChatMessage>,
  instanceId?: string,
) {
  if (typeof window === 'undefined') return

  const persistedMessages = messages
    .filter((message) => message.__streamingStatus !== 'streaming')
    .slice(-PORTABLE_HISTORY_LIMIT)

  try {
    window.localStorage.setItem(
      getPortableHistoryStorageKey(instanceId),
      JSON.stringify({
        messages: persistedMessages,
        updatedAt: Date.now(),
      }),
    )
  } catch {
    // Ignore persistence failures (quota, private mode, malformed messages).
  }
}
