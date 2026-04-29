import type { HermesInstanceSummary } from '@/hooks/use-hermes-instances'

export type HermesInstanceStartButtonState = {
  visible: boolean
  disabled: boolean
  label: 'Start' | 'Starting...'
}

export function buildHermesInstanceStartPath(instanceId: string): string {
  const query = new URLSearchParams({ instance: instanceId.trim() || 'default' })
  return `/api/instances/start?${query.toString()}`
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
