import { useCallback, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { chatQueryKeys } from '../chat-queries'
import { readError } from '../utils'
import { updateSessionTitleState } from '../session-title-store'
import { getActiveHermesInstanceId } from '@/hooks/use-hermes-instances'

export type RenameSessionResult = {
  renameSession: (
    sessionKey: string,
    friendlyId: string | null,
    newTitle: string,
  ) => Promise<void>
  renaming: boolean
  error: string | null
}

type RenameSessionPayload = {
  sessionKey: string
  friendlyId?: string | null
  newTitle: string
}

export function useRenameSession(): RenameSessionResult {
  const queryClient = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async function renameSessionRequest(
      payload: RenameSessionPayload,
    ) {
      const instanceId = getActiveHermesInstanceId()
      const query = new URLSearchParams({ instance: instanceId })
      const res = await fetch(`/api/sessions?${query.toString()}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: payload.sessionKey,
          friendlyId: payload.friendlyId ?? undefined,
          label: payload.newTitle,
        }),
      })
      if (!res.ok) throw new Error(await readError(res))
      return payload
    },
    onMutate: async function onMutate(payload) {
      setError(null)
      const instanceId = getActiveHermesInstanceId()
      const sessionsKey = chatQueryKeys.sessionsFor(instanceId)
      await queryClient.cancelQueries({ queryKey: sessionsKey })
      const previousSessions = queryClient.getQueryData(sessionsKey)

      const targetId = payload.friendlyId || payload.sessionKey
      // Optimistically update the session title in cache
      queryClient.setQueryData(sessionsKey, function update(sessions: unknown) {
        if (!Array.isArray(sessions)) return sessions
        return (sessions as Array<Record<string, unknown>>).map((session) => {
          const key = typeof session.key === 'string' ? session.key : ''
          const friendlyId =
            typeof session.friendlyId === 'string' ? session.friendlyId : ''
          if (key !== payload.sessionKey && friendlyId !== targetId)
            return session
          return {
            ...session,
            label: payload.newTitle,
            title: payload.newTitle,
            derivedTitle: payload.newTitle,
            titleStatus: 'ready',
            titleSource: 'manual',
            titleError: null,
          }
        })
      })

      return { previousSessions, sessionsKey, targetId, instanceId }
    },
    onError: function onError(err, _payload, context) {
      if (context?.previousSessions) {
        queryClient.setQueryData(context.sessionsKey, context.previousSessions)
      }
      setError(err instanceof Error ? err.message : String(err))
    },
    onSuccess: function onSuccess(payload, _variables, context) {
      const targetId = payload.friendlyId || payload.sessionKey
      updateSessionTitleState(
        targetId,
        {
          title: payload.newTitle,
          source: 'manual',
          status: 'ready',
          error: null,
        },
        context.instanceId,
      )
      // Invalidate to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.sessions })
    },
    onSettled: function onSettled() {
      setRenaming(false)
    },
  })

  const renameSession = useCallback(
    async (sessionKey: string, friendlyId: string | null, newTitle: string) => {
      if (!sessionKey || !newTitle.trim()) return
      setRenaming(true)
      await mutation.mutateAsync({
        sessionKey,
        friendlyId: friendlyId ?? undefined,
        newTitle: newTitle.trim(),
      })
    },
    [mutation],
  )

  return { renameSession, renaming, error }
}
