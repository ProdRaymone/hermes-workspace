'use client'

import { useSyncExternalStore } from 'react'

type TitleSource = 'auto' | 'manual'

type SessionTitleStatus = 'idle' | 'generating' | 'ready' | 'error'

type PersistedTitle = {
  title?: string
  source?: TitleSource
  updatedAt?: number
}

type RuntimeState = {
  status?: SessionTitleStatus
  error?: string | null
}

export type SessionTitleInfo = {
  title?: string
  source?: TitleSource
  updatedAt?: number
  status: SessionTitleStatus
  error?: string | null
}

const DEFAULT_STORAGE_KEY = 'hermes.sessionTitles.v1'

const persistedTitlesByStorageKey: Record<string, Record<string, PersistedTitle>> =
  {}
const runtimeStates = new Map<string, RuntimeState>()
const listeners = new Set<() => void>()
const loadedStorageKeys = new Set<string>()

// Cached snapshot to prevent infinite re-renders
const cachedSnapshots = new Map<string, Record<string, SessionTitleInfo>>()

function normalizeInstanceId(instanceId?: string): string {
  const trimmed = instanceId?.trim()
  return trimmed || 'default'
}

function getRuntimeStateKey(friendlyId: string, instanceId?: string): string {
  return `${normalizeInstanceId(instanceId)}:${friendlyId}`
}

export function getSessionTitleStorageKey(instanceId?: string): string {
  const normalized = normalizeInstanceId(instanceId)
  if (normalized === 'default') return DEFAULT_STORAGE_KEY
  return `${DEFAULT_STORAGE_KEY}.${normalized}`
}

function getPersistedTitles(instanceId?: string): Record<string, PersistedTitle> {
  const storageKey = getSessionTitleStorageKey(instanceId)
  return persistedTitlesByStorageKey[storageKey] ?? {}
}

function setPersistedTitles(
  instanceId: string | undefined,
  titles: Record<string, PersistedTitle>,
) {
  const storageKey = getSessionTitleStorageKey(instanceId)
  persistedTitlesByStorageKey[storageKey] = titles
}

function ensureLoaded(instanceId?: string) {
  const storageKey = getSessionTitleStorageKey(instanceId)
  if (loadedStorageKeys.has(storageKey) || typeof window === 'undefined') return
  loadedStorageKeys.add(storageKey)
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object') {
        persistedTitlesByStorageKey[storageKey] = Object.fromEntries(
          Object.entries(parsed as Record<string, PersistedTitle>).map(
            ([key, value]) => {
              const normalized: PersistedTitle = {}
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
              if (value && typeof value === 'object') {
                if (
                  typeof value.title === 'string' &&
                  value.title.trim().length > 0
                ) {
                  normalized.title = value.title.trim()
                }
                if (value.source === 'auto' || value.source === 'manual') {
                  normalized.source = value.source
                }
                if (typeof value.updatedAt === 'number') {
                  normalized.updatedAt = value.updatedAt
                }
              }
              return [key, normalized]
            },
          ),
        )
        cachedSnapshots.delete(storageKey)
      }
    }
  } catch {
    // ignore
  }
}

function persist(instanceId?: string) {
  if (typeof window === 'undefined') return
  const storageKey = getSessionTitleStorageKey(instanceId)
  const persistedTitles = getPersistedTitles(instanceId)
  try {
    const serializable = Object.fromEntries(
      Object.entries(persistedTitles).filter(([, value]) => {
        return Boolean(value.title) || Boolean(value.source)
      }),
    )
    window.localStorage.setItem(storageKey, JSON.stringify(serializable))
  } catch {
    // ignore storage failures
  }
}

function notify() {
  cachedSnapshots.clear()
  for (const listener of listeners) listener()
}

function buildInfo(friendlyId: string, instanceId?: string): SessionTitleInfo {
  ensureLoaded(instanceId)
  const persistedTitles = getPersistedTitles(instanceId)
  const persisted = persistedTitles[friendlyId] ?? {}
  const runtime = runtimeStates.get(getRuntimeStateKey(friendlyId, instanceId)) ?? {}
  const title = persisted.title
  const source = persisted.source
  const status: SessionTitleStatus = runtime.status
    ? runtime.status
    : title
      ? 'ready'
      : 'idle'
  const error = runtime.error ?? null
  return {
    title,
    source,
    updatedAt: persisted.updatedAt,
    status,
    error,
  }
}

function getSnapshotForInstance(
  instanceId?: string,
): Record<string, SessionTitleInfo> {
  ensureLoaded(instanceId)
  const storageKey = getSessionTitleStorageKey(instanceId)
  // Return cached snapshot if available (prevents infinite re-renders)
  const cachedSnapshot = cachedSnapshots.get(storageKey)
  if (cachedSnapshot) {
    return cachedSnapshot
  }
  const normalizedInstanceId = normalizeInstanceId(instanceId)
  const persistedTitles = getPersistedTitles(instanceId)
  const keys = new Set([
    ...Object.keys(persistedTitles),
    ...Array.from(runtimeStates.keys())
      .filter((key) => key.startsWith(`${normalizedInstanceId}:`))
      .map((key) => key.slice(normalizedInstanceId.length + 1)),
  ])
  const result: Record<string, SessionTitleInfo> = {}
  for (const key of keys) {
    result[key] = buildInfo(key, instanceId)
  }
  cachedSnapshots.set(storageKey, result)
  return result
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSessionTitles(instanceId = 'default') {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshotForInstance(instanceId),
    () => getSnapshotForInstance(instanceId),
  )
}

export function useSessionTitleInfo(
  friendlyId: string,
  instanceId = 'default',
): SessionTitleInfo {
  const map = useSessionTitles(instanceId)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
  return friendlyId && map[friendlyId]
    ? map[friendlyId]
    : { status: 'idle', error: null }
}

type SessionTitleUpdate = Partial<SessionTitleInfo>

export function updateSessionTitleState(
  friendlyId: string,
  patch: SessionTitleUpdate,
  instanceId = 'default',
) {
  if (!friendlyId) return
  ensureLoaded(instanceId)
  const persistedTitles = getPersistedTitles(instanceId)
  const prevPersisted = persistedTitles[friendlyId] ?? {}
  const runtimeStateKey = getRuntimeStateKey(friendlyId, instanceId)
  const prevRuntime = runtimeStates.get(runtimeStateKey) ?? {}
  let nextPersisted: PersistedTitle = { ...prevPersisted }
  const nextRuntime: RuntimeState = { ...prevRuntime }

  if ('title' in patch) {
    const nextTitle = patch.title?.trim() ?? ''
    if (nextTitle.length > 0) {
      nextPersisted = {
        ...nextPersisted,
        title: nextTitle,
        source: patch.source ?? nextPersisted.source ?? 'auto',
        updatedAt: patch.updatedAt ?? nextPersisted.updatedAt ?? Date.now(),
      }
      nextRuntime.status = patch.status ?? 'ready'
      nextRuntime.error = null
    } else {
      nextPersisted = {}
      nextRuntime.status = patch.status ?? 'idle'
      nextRuntime.error = patch.error ?? null
    }
  }

  if ('source' in patch && patch.source) {
    nextPersisted = {
      ...nextPersisted,
      source: patch.source,
    }
  }

  if ('updatedAt' in patch && patch.updatedAt) {
    nextPersisted = {
      ...nextPersisted,
      updatedAt: patch.updatedAt,
    }
  }

  if ('status' in patch && !('title' in patch)) {
    nextRuntime.status = patch.status ?? nextRuntime.status
  }

  if ('error' in patch) {
    nextRuntime.error = patch.error ?? null
  }

  const hasPersistedData = Boolean(nextPersisted.title || nextPersisted.source)
  if (hasPersistedData) {
    setPersistedTitles(instanceId, {
      ...persistedTitles,
      [friendlyId]: nextPersisted,
    })
  } else if (friendlyId in persistedTitles) {
    const { [friendlyId]: _removed, ...rest } = persistedTitles
    setPersistedTitles(instanceId, rest)
  }

  if (nextRuntime.status || nextRuntime.error) {
    runtimeStates.set(runtimeStateKey, nextRuntime)
  } else {
    runtimeStates.delete(runtimeStateKey)
  }

  persist(instanceId)
  notify()
}

export function clearSessionTitleState(
  friendlyId: string,
  instanceId = 'default',
) {
  if (!friendlyId) return
  ensureLoaded(instanceId)
  const persistedTitles = getPersistedTitles(instanceId)
  if (friendlyId in persistedTitles) {
    const { [friendlyId]: _removed, ...rest } = persistedTitles
    setPersistedTitles(instanceId, rest)
  }
  runtimeStates.delete(getRuntimeStateKey(friendlyId, instanceId))
  persist(instanceId)
  notify()
}
