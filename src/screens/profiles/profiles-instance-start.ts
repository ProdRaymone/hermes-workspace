import type { HermesInstanceSummary } from '@/hooks/use-hermes-instances'

export type HermesInstanceStartButtonState = {
  visible: boolean
  disabled: boolean
  label: 'Start' | 'Starting...'
}

export type HermesInstanceStartFailurePayload = {
  error?: string
  diagnostic?: {
    code?: string
    title?: string
    hint?: string
  }
  logSummary?: {
    available?: boolean
    lines?: Array<string>
    truncated?: boolean
  }
}

export type HermesInstanceStartFailureDisplay = {
  title: string
  message: string
  hint?: string
  logLines: Array<string>
  truncated: boolean
}

function buildInstanceQueryPath(path: string, instanceId: string): string {
  const query = new URLSearchParams({ instance: instanceId.trim() || 'default' })
  return `${path}?${query.toString()}`
}

export function buildHermesInstanceStartPath(instanceId: string): string {
  return buildInstanceQueryPath('/api/instances/start', instanceId)
}

export function buildHermesInstanceStartLogPath(instanceId: string): string {
  return buildInstanceQueryPath('/api/instances/start-log', instanceId)
}

export function getHermesInstanceStartButtonState(
  instance: HermesInstanceSummary,
  starting = false,
): HermesInstanceStartButtonState {
  if (instance.isDefault || instance.status !== 'stopped') {
    return { visible: false, disabled: true, label: 'Start' }
  }

  return {
    visible: true,
    disabled: starting || instance.status !== 'stopped',
    label: starting ? 'Starting...' : 'Start',
  }
}

export function buildHermesInstanceFreshnessLabel(
  dataUpdatedAt: number,
  isFetching: boolean,
): string {
  if (!dataUpdatedAt) return isFetching ? 'Refreshing...' : 'Not checked yet'

  const checkedAt = new Date(dataUpdatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return isFetching
    ? `Refreshing... last checked ${checkedAt}`
    : `Checked ${checkedAt}`
}

function redactStartDisplayText(value: string): string {
  return value
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 <redacted>')
    .replace(
      /\b((?!Authorization\b)[A-Z0-9_]*(?:API[A-Z0-9_]*KEY|KEY|TOKEN|SECRET|PASSWORD|AUTH)[A-Z0-9_]*)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1=<redacted>',
    )
}

export function buildHermesInstanceStartFailureDisplay(
  failure: HermesInstanceStartFailurePayload,
): HermesInstanceStartFailureDisplay {
  const title = failure.diagnostic?.title || 'Start failed'
  const message = redactStartDisplayText(
    failure.error || 'Hermes did not start successfully.',
  )
  const hint = failure.diagnostic?.hint
    ? redactStartDisplayText(failure.diagnostic.hint)
    : undefined
  const logLines = failure.logSummary?.available
    ? (failure.logSummary.lines || [])
        .slice(-8)
        .map((line) => redactStartDisplayText(line))
    : []

  return {
    title,
    message,
    hint,
    logLines,
    truncated: Boolean(failure.logSummary?.truncated),
  }
}
