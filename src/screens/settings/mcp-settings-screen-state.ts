import type { HermesInstanceSummary } from '@/hooks/use-hermes-instances'

export function getMcpSettingsInstanceLabel(
  activeInstance: HermesInstanceSummary | undefined,
  activeInstanceId: string,
) {
  return activeInstance?.label || activeInstanceId || 'selected Hermes instance'
}
