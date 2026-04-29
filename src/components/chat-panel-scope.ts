import { buildInstanceApiPath } from '@/lib/hermes-instance-scope'
import { chatQueryKeys } from '@/screens/chat/chat-queries'

export function buildChatPanelSessionsPath(instanceId = 'default') {
  return buildInstanceApiPath('/api/sessions', instanceId)
}

export function buildChatPanelSessionsQueryKey(instanceId = 'default') {
  return chatQueryKeys.sessionsFor(instanceId)
}
