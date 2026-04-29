import type { ChatAttachment, ChatMessage } from './types'

export type StickyStreamingTextState = {
  runId: string | null
  text: string
}

function normalizeInstanceId(instanceId?: string): string {
  const trimmed = instanceId?.trim()
  return trimmed || 'default'
}

function normalizeSessionId(sessionId?: string): string {
  const trimmed = sessionId?.trim()
  return trimmed || 'new'
}

export function getLastSessionStorageKey(instanceId?: string): string {
  const normalizedInstanceId = normalizeInstanceId(instanceId)
  if (normalizedInstanceId === 'default') return 'hermes-last-session'
  return `hermes-last-session-${normalizedInstanceId}`
}

export function getThinkingLevelStorageKey(
  sessionId?: string,
  instanceId?: string,
): string {
  const normalizedSessionId = normalizeSessionId(sessionId)
  const normalizedInstanceId = normalizeInstanceId(instanceId)
  if (normalizedInstanceId === 'default') {
    return `hermes-thinking-${normalizedSessionId}`
  }
  return `hermes-thinking-${normalizedInstanceId}-${normalizedSessionId}`
}

export function advanceStickyStreamingText(params: {
  isStreaming: boolean
  runId: string | null
  rawText: string
  smoothedText: string
  previousState: StickyStreamingTextState
}): StickyStreamingTextState {
  const { isStreaming, runId, rawText, smoothedText, previousState } = params

  if (!isStreaming) {
    return { runId: null, text: '' }
  }

  const nextRunId = runId ?? previousState.runId ?? 'streaming'
  const isNewRun = nextRunId !== previousState.runId
  const candidateText = smoothedText || rawText
  const nextText = candidateText.length > 0
    ? candidateText
    : isNewRun
      ? ''
      : previousState.text

  return {
    runId: nextRunId,
    text: nextText,
  }
}

type InstanceModelSource = {
  model?: string | null
}

export function resolveGatewayModel(
  statusModel: string | null | undefined,
  activeInstance: InstanceModelSource | null | undefined,
): string {
  return statusModel || activeInstance?.model || ''
}

type OptimisticMessagePayload = {
  clientId: string
  optimisticId: string
  optimisticMessage: ChatMessage
}

export function createOptimisticMessage(
  body: string,
  attachments: Array<ChatAttachment> = [],
): OptimisticMessagePayload {
  const clientId = crypto.randomUUID()
  const optimisticId = `opt-${clientId}`
  const timestamp = Date.now()
  const textContent =
    body.length > 0 ? [{ type: 'text' as const, text: body }] : []

  const optimisticMessage: ChatMessage = {
    role: 'user',
    content: textContent.length > 0 ? textContent : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    __optimisticId: optimisticId,
    __createdAt: timestamp,
    clientId,
    client_id: clientId,
    status: 'sending',
    timestamp,
  }

  return { clientId, optimisticId, optimisticMessage }
}
