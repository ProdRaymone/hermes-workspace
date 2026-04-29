import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearPendingMessage,
  consumePendingSend,
  getPendingMessageStorageKey,
  isRecentSession,
  persistPendingMessage,
  readPendingMessage,
  resetPendingSend,
  setRecentSession,
  stashPendingSend,
} from './pending-send'
import type { ChatMessage } from './types'

class FakeStorage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

function message(text: string): ChatMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    timestamp: Date.now(),
  }
}

function payload(messageText: string) {
  return {
    sessionKey: 'main',
    friendlyId: 'main',
    message: messageText,
    attachments: [],
    optimisticMessage: message(messageText),
  }
}

describe('pending send storage', () => {
  afterEach(() => {
    resetPendingSend()
    vi.unstubAllGlobals()
  })

  it('keeps default pending messages on the legacy storage key', () => {
    expect(getPendingMessageStorageKey('main', 'default')).toBe(
      'hermes_pending_msg_main',
    )
    expect(getPendingMessageStorageKey('', '')).toBe('hermes_pending_msg_main')
  })

  it('scopes non-default pending messages by Hermes instance', () => {
    expect(getPendingMessageStorageKey('main', 'hermes2')).toBe(
      'hermes_pending_msg_hermes2_main',
    )
    expect(getPendingMessageStorageKey('abc123', 'hermes3')).toBe(
      'hermes_pending_msg_hermes3_abc123',
    )
  })

  it('reads and clears each instance pending message independently', () => {
    vi.stubGlobal('window', { localStorage: new FakeStorage() })

    persistPendingMessage(payload('from default'), 'default')
    persistPendingMessage(payload('from hermes2'), 'hermes2')

    expect(readPendingMessage('main', 'main', 'default')?.message).toBe(
      'from default',
    )
    expect(readPendingMessage('main', 'main', 'hermes2')?.message).toBe(
      'from hermes2',
    )

    clearPendingMessage('main', 'hermes2')

    expect(readPendingMessage('main', 'main', 'hermes2')).toBeNull()
    expect(readPendingMessage('main', 'main', 'default')?.message).toBe(
      'from default',
    )
  })

  it('does not consume an in-memory pending send from another instance', () => {
    stashPendingSend(payload('from hermes2'), 'hermes2')

    expect(consumePendingSend('main', 'main', 'default')).toBeNull()
    expect(consumePendingSend('main', 'main', 'hermes2')?.message).toBe(
      'from hermes2',
    )
  })

  it('tracks recent sessions independently per instance', () => {
    setRecentSession('main', 'hermes2')

    expect(isRecentSession('main', 'default')).toBe(false)
    expect(isRecentSession('main', 'hermes2')).toBe(true)
  })
})
