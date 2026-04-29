import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const EMPTY_PINNED_KEYS: Array<string> = []

type PinnedSessionsState = {
  pinnedSessionKeysByInstance: Record<string, Array<string>>
  pinnedSessionKeys: Array<string>
  getPinnedSessionKeys: (instanceId?: string) => Array<string>
  pinSession: (key: string, instanceId?: string) => void
  unpinSession: (key: string, instanceId?: string) => void
  togglePinnedSession: (key: string, instanceId?: string) => void
  isSessionPinned: (key: string, instanceId?: string) => boolean
}

function normalizeInstanceId(instanceId?: string): string {
  const trimmed = instanceId?.trim()
  return trimmed || 'default'
}

function updateScopedPinnedKeys(
  state: PinnedSessionsState,
  instanceId: string | undefined,
  updater: (keys: Array<string>) => Array<string>,
): Partial<PinnedSessionsState> {
  const normalized = normalizeInstanceId(instanceId)
  if (normalized === 'default') {
    return { pinnedSessionKeys: updater(state.pinnedSessionKeys) }
  }

  return {
    pinnedSessionKeysByInstance: {
      ...state.pinnedSessionKeysByInstance,
      [normalized]: updater(
        state.pinnedSessionKeysByInstance[normalized] ?? [],
      ),
    },
  }
}

export const usePinnedSessionsStore = create<PinnedSessionsState>()(
  persist(
    (set, get) => ({
      pinnedSessionKeys: [],
      pinnedSessionKeysByInstance: {},
      getPinnedSessionKeys: (instanceId = 'default') => {
        const normalized = normalizeInstanceId(instanceId)
        if (normalized === 'default') return get().pinnedSessionKeys
        return get().pinnedSessionKeysByInstance[normalized] ?? EMPTY_PINNED_KEYS
      },
      pinSession: (key, instanceId = 'default') =>
        set((state) => {
          return updateScopedPinnedKeys(state, instanceId, (keys) => {
            if (keys.includes(key)) return keys
            return [...keys, key]
          })
        }),
      unpinSession: (key, instanceId = 'default') =>
        set((state) =>
          updateScopedPinnedKeys(state, instanceId, (keys) =>
            keys.filter((pinnedKey) => pinnedKey !== key),
          ),
        ),
      togglePinnedSession: (key, instanceId = 'default') => {
        if (get().isSessionPinned(key, instanceId)) {
          get().unpinSession(key, instanceId)
          return
        }
        get().pinSession(key, instanceId)
      },
      isSessionPinned: (key, instanceId = 'default') =>
        get().getPinnedSessionKeys(instanceId).includes(key),
    }),
    {
      name: 'pinned-sessions',
      partialize: (state) => ({
        pinnedSessionKeys: state.pinnedSessionKeys,
        pinnedSessionKeysByInstance: state.pinnedSessionKeysByInstance,
      }),
    },
  ),
)

export function usePinnedSessions(instanceId = 'default') {
  const pinnedSessionKeys = usePinnedSessionsStore((s) =>
    s.getPinnedSessionKeys(instanceId),
  )
  const togglePinnedSession = usePinnedSessionsStore(
    (s) => s.togglePinnedSession,
  )
  return { pinnedSessionKeys, togglePinnedSession }
}
