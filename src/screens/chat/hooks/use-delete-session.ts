import { useCallback, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  chatQueryKeys,
  clearHistoryMessages,
  removeSessionFromCache,
} from '../chat-queries'
import { clearPendingSendForSession, resetPendingSend } from '../pending-send'
import { clearSessionDeleted, markSessionDeleted } from '../session-tombstones'
import { readError } from '../utils'
import { clearSessionTitleState } from '../session-title-store'
import { getActiveHermesInstanceId } from '@/hooks/use-hermes-instances'

export type DeleteSessionResult = {
  deleteSession: (
    sessionKey: string,
    friendlyId: string,
    isActive: boolean,
  ) => Promise<void>
  deleting: boolean
  error: string | null
}

export function useDeleteSession(): DeleteSessionResult {
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async function deleteSessionRequest(payload: {
      sessionKey: string
      friendlyId: string
      isActive: boolean
    }) {
      const query = new URLSearchParams()
      query.set('instance', getActiveHermesInstanceId())
      if (payload.sessionKey) query.set('sessionKey', payload.sessionKey)
      if (payload.friendlyId) query.set('friendlyId', payload.friendlyId)
      const res = await fetch(`/api/sessions?${query.toString()}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await readError(res))
      return payload
    },
    onMutate: async function onMutate(payload) {
      setError(null)
      markSessionDeleted(payload.sessionKey || payload.friendlyId)
      const instanceId = getActiveHermesInstanceId()
      clearPendingSendForSession(
        payload.sessionKey,
        payload.friendlyId,
        instanceId,
      )
      const sessionsKey = chatQueryKeys.sessionsFor(instanceId)
      await queryClient.cancelQueries({ queryKey: sessionsKey })
      const previousSessions = queryClient.getQueryData(sessionsKey)
      removeSessionFromCache(
        queryClient,
        payload.sessionKey,
        payload.friendlyId,
        instanceId,
      )
      if (payload.isActive && (payload.sessionKey || payload.friendlyId)) {
        clearHistoryMessages(
          queryClient,
          payload.friendlyId || payload.sessionKey,
          payload.sessionKey || payload.friendlyId,
          instanceId,
        )
      }
      return {
        previousSessions,
        sessionsKey,
        isActive: payload.isActive,
        instanceId,
      }
    },
    onError: function onError(err, _payload, context) {
      if (context?.previousSessions) {
        queryClient.setQueryData(context.sessionsKey, context.previousSessions)
      }
      clearSessionDeleted(_payload.sessionKey || _payload.friendlyId)
      setError(err instanceof Error ? err.message : String(err))
    },
    onSuccess: function onSuccess(payload, _variables, context) {
      if (payload.isActive) {
        resetPendingSend(context?.instanceId)
      }
      clearSessionTitleState(
        payload.friendlyId || payload.sessionKey,
        context?.instanceId,
      )
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.sessions })
    },
    onSettled: function onSettled() {
      setDeleting(false)
    },
  })

  const deleteSession = useCallback(
    async (sessionKey: string, friendlyId: string, isActive: boolean) => {
      if (!sessionKey && !friendlyId) return
      setDeleting(true)
      await mutation.mutateAsync({ sessionKey, friendlyId, isActive })
    },
    [mutation],
  )

  return { deleteSession, deleting, error }
}
