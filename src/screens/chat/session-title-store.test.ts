import { afterEach, describe, expect, it, vi } from 'vitest'

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

async function loadStore() {
  vi.resetModules()
  return import('./session-title-store')
}

describe('session title store instance scoping', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps default titles on the legacy storage key', async () => {
    const { getSessionTitleStorageKey } = await loadStore()

    expect(getSessionTitleStorageKey('default')).toBe(
      'hermes.sessionTitles.v1',
    )
    expect(getSessionTitleStorageKey('')).toBe('hermes.sessionTitles.v1')
  })

  it('scopes non-default session titles by Hermes instance', async () => {
    const { getSessionTitleStorageKey } = await loadStore()

    expect(getSessionTitleStorageKey('hermes2')).toBe(
      'hermes.sessionTitles.v1.hermes2',
    )
    expect(getSessionTitleStorageKey('hermes3')).toBe(
      'hermes.sessionTitles.v1.hermes3',
    )
  })

  it('reads, writes, and clears titles without crossing instances', async () => {
    const localStorage = new FakeStorage()
    vi.stubGlobal('window', { localStorage })
    const {
      clearSessionTitleState,
      getSessionTitleStorageKey,
      updateSessionTitleState,
    } = await loadStore()

    updateSessionTitleState(
      'same-friendly-id',
      { title: 'Default title', source: 'manual', status: 'ready' },
      'default',
    )
    updateSessionTitleState(
      'same-friendly-id',
      { title: 'Hermes 2 title', source: 'manual', status: 'ready' },
      'hermes2',
    )

    expect(
      JSON.parse(
        localStorage.getItem(getSessionTitleStorageKey('default')) || '{}',
      ),
    ).toMatchObject({
      'same-friendly-id': { title: 'Default title' },
    })
    expect(
      JSON.parse(
        localStorage.getItem(getSessionTitleStorageKey('hermes2')) || '{}',
      ),
    ).toMatchObject({
      'same-friendly-id': { title: 'Hermes 2 title' },
    })

    clearSessionTitleState('same-friendly-id', 'hermes2')

    expect(
      JSON.parse(
        localStorage.getItem(getSessionTitleStorageKey('default')) || '{}',
      ),
    ).toMatchObject({
      'same-friendly-id': { title: 'Default title' },
    })
    expect(
      JSON.parse(
        localStorage.getItem(getSessionTitleStorageKey('hermes2')) || '{}',
      ),
    ).toEqual({})
  })
})
