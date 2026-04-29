import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

export type HermesInstanceStatus = 'running' | 'stopped' | 'unknown'

export type HermesInstanceSummary = {
  id: string
  label: string
  profileName: string
  profilePath: string
  gatewayUrl: string
  port: number
  isDefault: boolean
  model?: string
  provider?: string
  status: HermesInstanceStatus
}

type InstancesResponse = {
  ok: boolean
  instances?: Array<HermesInstanceSummary>
  activeInstance?: string
}

export const ACTIVE_HERMES_INSTANCE_KEY = 'hermes-active-instance'
export const HERMES_INSTANCE_CHANGED_EVENT = 'hermes:instance-changed'

function normalizeInstanceId(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed || 'default'
}

export function getActiveHermesInstanceId(): string {
  if (typeof window === 'undefined') return 'default'
  try {
    return normalizeInstanceId(
      window.localStorage.getItem(ACTIVE_HERMES_INSTANCE_KEY),
    )
  } catch {
    return 'default'
  }
}

export function setStoredActiveHermesInstanceId(instanceId: string) {
  if (typeof window === 'undefined') return
  const normalized = normalizeInstanceId(instanceId)
  try {
    window.localStorage.setItem(ACTIVE_HERMES_INSTANCE_KEY, normalized)
  } catch {
    // Ignore storage failures; in-memory state still updates in the hook.
  }
  window.dispatchEvent(
    new CustomEvent(HERMES_INSTANCE_CHANGED_EVENT, {
      detail: { instanceId: normalized },
    }),
  )
}

export function useHermesInstances() {
  const [activeInstanceId, setActiveInstanceIdState] = useState(
    getActiveHermesInstanceId,
  )

  useEffect(() => {
    const sync = () => setActiveInstanceIdState(getActiveHermesInstanceId())
    const handleInstanceChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ instanceId?: string }>).detail
      setActiveInstanceIdState(normalizeInstanceId(detail?.instanceId))
    }

    window.addEventListener('storage', sync)
    window.addEventListener(
      HERMES_INSTANCE_CHANGED_EVENT,
      handleInstanceChanged,
    )
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(
        HERMES_INSTANCE_CHANGED_EVENT,
        handleInstanceChanged,
      )
    }
  }, [])

  const instancesQuery = useQuery({
    queryKey: ['hermes', 'instances', activeInstanceId],
    queryFn: async () => {
      const query = new URLSearchParams({ instance: activeInstanceId })
      const response = await fetch(`/api/instances?${query.toString()}`)
      if (!response.ok) throw new Error('Failed to load Hermes instances')
      return (await response.json()) as InstancesResponse
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

  const instances = useMemo(
    () => instancesQuery.data?.instances ?? [],
    [instancesQuery.data?.instances],
  )

  useEffect(() => {
    if (!instances.length) return
    const exists = instances.some((instance) => instance.id === activeInstanceId)
    if (exists) return
    const fallback =
      instances.find((instance) => instance.isDefault)?.id ||
      instances[0]?.id ||
      'default'
    setStoredActiveHermesInstanceId(fallback)
  }, [activeInstanceId, instances])

  const setActiveInstanceId = useCallback((instanceId: string) => {
    const normalized = normalizeInstanceId(instanceId)
    setActiveInstanceIdState(normalized)
    setStoredActiveHermesInstanceId(normalized)
  }, [])

  return {
    activeInstanceId,
    setActiveInstanceId,
    instances,
    instancesQuery,
    activeInstance:
      instances.find((instance) => instance.id === activeInstanceId) ??
      instances.find((instance) => instance.isDefault) ??
      instances[0],
  }
}
