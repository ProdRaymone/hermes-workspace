import { useEffect, useRef } from 'react'
import {
  buildInstanceApiPath,
  getInstanceScopedSessionKey,
} from '@/lib/hermes-instance-scope'
import { useChatStore } from '../../../stores/chat-store'

type ActiveRunStatus =
  | 'accepted'
  | 'active'
  | 'handoff'
  | 'stalled'
  | 'complete'
  | 'error'

type ActiveRunResponse = {
  ok: boolean
  run: {
    runId: string
    status: ActiveRunStatus
    sessionKey: string
    startedAt: number
  } | null
}

const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  'accepted',
  'active',
  'handoff',
])

export function buildActiveRunUrl(
  sessionKey: string,
  instanceId?: string | null,
): string {
  return buildInstanceApiPath(
    `/api/sessions/${encodeURIComponent(sessionKey)}/active-run`,
    instanceId,
  )
}

/**
 * On mount, checks whether the server has an active run for this session.
 * If so, marks the session as waiting in the persistent Zustand store.
 * If the server says the run is done, clears the stale waiting state.
 *
 * This closes the gap where a user navigates away during streaming,
 * the component unmounts (losing local state), and on remount the UI
 * doesn't know a run was in progress.
 */
export function useActiveRunCheck({
  sessionKey,
  enabled,
  instanceId,
}: {
  sessionKey: string
  enabled: boolean
  instanceId?: string
}): void {
  const hasCheckedRef = useRef(false)
  const sessionKeyRef = useRef(sessionKey)
  sessionKeyRef.current = sessionKey

  useEffect(() => {
    if (!enabled || !sessionKey || sessionKey === 'new') return
    if (hasCheckedRef.current) return
    hasCheckedRef.current = true

    const controller = new AbortController()

    async function check() {
      try {
        const response = await fetch(buildActiveRunUrl(sessionKey, instanceId), {
          signal: controller.signal,
        })
        if (!response.ok) return

        const data = (await response.json()) as ActiveRunResponse
        if (!data.ok) return

        const store = useChatStore.getState()
        const scopedSessionKey = getInstanceScopedSessionKey(
          sessionKey,
          instanceId,
        )
        if (data.run && ACTIVE_STATUSES.has(data.run.status)) {
          store.setSessionWaiting(scopedSessionKey, data.run.runId)
        } else if (store.isSessionWaiting(scopedSessionKey)) {
          // Server says run is done but we still have stale waiting state
          store.clearSessionWaiting(scopedSessionKey)
        }
      } catch {
        // Network error or abort — ignore
      }
    }

    void check()

    return () => {
      controller.abort()
    }
  }, [sessionKey, enabled, instanceId])

  // Reset check flag when session or selected instance changes
  useEffect(() => {
    hasCheckedRef.current = false
  }, [sessionKey, instanceId])
}
