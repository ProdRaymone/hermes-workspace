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
  const storage = new FakeStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { localStorage: storage })
  return import('./use-pinned-sessions')
}

describe('pinned session store instance scoping', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps default pinned sessions on the legacy list', async () => {
    const { usePinnedSessionsStore } = await loadStore()
    const store = usePinnedSessionsStore.getState()

    store.pinSession('same-session', 'default')

    expect(usePinnedSessionsStore.getState().pinnedSessionKeys).toEqual([
      'same-session',
    ])
    expect(
      usePinnedSessionsStore.getState().getPinnedSessionKeys('default'),
    ).toEqual(['same-session'])
  })

  it('scopes non-default pinned sessions independently', async () => {
    const { usePinnedSessionsStore } = await loadStore()
    const store = usePinnedSessionsStore.getState()

    store.pinSession('same-session', 'default')
    store.pinSession('same-session', 'hermes2')
    store.pinSession('other-session', 'hermes2')
    store.unpinSession('same-session', 'default')

    expect(
      usePinnedSessionsStore.getState().getPinnedSessionKeys('default'),
    ).toEqual([])
    expect(
      usePinnedSessionsStore.getState().getPinnedSessionKeys('hermes2'),
    ).toEqual(['same-session', 'other-session'])
  })
})
