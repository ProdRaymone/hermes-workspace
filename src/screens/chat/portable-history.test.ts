import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getPortableHistoryStorageKey,
  persistPortableHistory,
  readPortableHistory,
} from './portable-history'
import type { ChatMessage } from './types'

class FakeStorage {
  private values = new Map<string, string>()

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

describe('portable chat history storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the default instance on the legacy storage key', () => {
    expect(getPortableHistoryStorageKey('default')).toBe(
      'hermes_portable_chat_main',
    )
    expect(getPortableHistoryStorageKey('')).toBe('hermes_portable_chat_main')
  })

  it('scopes non-default Main histories by Hermes instance', () => {
    expect(getPortableHistoryStorageKey('hermes2')).toBe(
      'hermes_portable_chat_hermes2_main',
    )
    expect(getPortableHistoryStorageKey('hermes3')).toBe(
      'hermes_portable_chat_hermes3_main',
    )
  })

  it('reads and writes each instance Main history independently', () => {
    vi.stubGlobal('window', { localStorage: new FakeStorage() })

    persistPortableHistory([message('from default')], 'default')
    persistPortableHistory([message('from hermes2')], 'hermes2')

    expect(readPortableHistory('default').messages[0]).toMatchObject({
      content: [{ type: 'text', text: 'from default' }],
    })
    expect(readPortableHistory('hermes2').messages[0]).toMatchObject({
      content: [{ type: 'text', text: 'from hermes2' }],
    })
  })

  it('does not persist in-flight streaming assistant messages', () => {
    vi.stubGlobal('window', { localStorage: new FakeStorage() })

    persistPortableHistory(
      [
        message('confirmed'),
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'still streaming' }],
          timestamp: Date.now(),
          __streamingStatus: 'streaming',
        },
      ],
      'hermes2',
    )

    expect(readPortableHistory('hermes2').messages).toHaveLength(1)
    expect(readPortableHistory('hermes2').messages[0]).toMatchObject({
      content: [{ type: 'text', text: 'confirmed' }],
    })
  })
})
