import type {
  HermesInstanceStatus,
  HermesInstanceSummary,
} from '@/hooks/use-hermes-instances'

export type HermesInstanceMenuItem = HermesInstanceSummary & {
  selected: boolean
  statusLabel: string
  endpointLabel: string
  description: string
}

export type HermesInstancesSummary = {
  total: number
  running: number
  stopped: number
  unknown: number
}

export type HermesScopeKind = 'instance-scoped' | 'workspace-shared'

export type HermesScopeSummary = {
  instanceLabel: string
  statusLabel: string
  endpointLabel: string
  profileLabel: string
  modelLabel: string
  scopeLabel: string
}

export function getHermesInstanceStatusLabel(
  status?: HermesInstanceStatus,
): string {
  if (status === 'running') return 'live'
  if (status === 'stopped') return 'stopped'
  return 'checking'
}

export function getHermesInstanceStatusToneClassName(
  status?: HermesInstanceStatus,
): string {
  if (status === 'running') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
  }
  if (status === 'stopped') {
    return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'
  }
  return 'border-primary-200 bg-primary-100 text-primary-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300'
}

export function getHermesInstanceDotClassName(
  status?: HermesInstanceStatus,
): string {
  if (status === 'running') return 'bg-emerald-500'
  if (status === 'stopped') return 'bg-amber-500'
  return 'bg-primary-400'
}

function getEndpointLabel(instance: Pick<HermesInstanceSummary, 'port'>) {
  return `:${instance.port}`
}

function getDescription(instance: HermesInstanceSummary): string {
  const parts = [
    getEndpointLabel(instance),
    instance.model,
    instance.provider && !instance.model ? instance.provider : undefined,
  ].filter(Boolean)

  return parts.join(' · ')
}

export function buildHermesInstanceMenuItems(
  instances: Array<HermesInstanceSummary>,
  activeInstanceId: string,
): Array<HermesInstanceMenuItem> {
  const normalizedActive = activeInstanceId.trim() || 'default'
  return instances.map((instance) => ({
    ...instance,
    selected: instance.id === normalizedActive,
    statusLabel: getHermesInstanceStatusLabel(instance.status),
    endpointLabel: getEndpointLabel(instance),
    description: getDescription(instance),
  }))
}

export function summarizeHermesInstances(
  instances: Array<Pick<HermesInstanceSummary, 'status'>>,
): HermesInstancesSummary {
  return instances.reduce<HermesInstancesSummary>(
    (summary, instance) => {
      summary.total += 1
      if (instance.status === 'running') summary.running += 1
      else if (instance.status === 'stopped') summary.stopped += 1
      else summary.unknown += 1
      return summary
    },
    { total: 0, running: 0, stopped: 0, unknown: 0 },
  )
}

export function buildHermesScopeSummary(
  instance: HermesInstanceSummary | undefined,
  scopeKind: HermesScopeKind,
): HermesScopeSummary {
  return {
    instanceLabel: instance?.label || 'Hermes agent',
    statusLabel: getHermesInstanceStatusLabel(instance?.status),
    endpointLabel:
      typeof instance?.port === 'number'
        ? `:${instance.port}`
        : instance?.gatewayUrl || 'Gateway unknown',
    profileLabel: instance?.profilePath || instance?.profileName || 'Unknown profile',
    modelLabel:
      instance?.model ||
      instance?.provider ||
      (instance ? 'Model not set' : 'Model unknown'),
    scopeLabel:
      scopeKind === 'instance-scoped'
        ? 'Instance-scoped'
        : 'Workspace-shared',
  }
}
