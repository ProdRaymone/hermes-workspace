/**
 * Reactive capability hook — reads from the /api/gateway-status query.
 * Use this instead of the synchronous isFeatureAvailable() in React components.
 * Returns null while loading (use to show a spinner), false if unavailable,
 * true if available.
 */
import { useQuery } from '@tanstack/react-query'

interface GatewayStatus {
  capabilities: Record<string, boolean>
  hermesUrl: string
}

function useGatewayStatus(instanceId = 'default') {
  return useQuery<GatewayStatus>({
    queryKey: ['gateway-status', instanceId],
    queryFn: async () => {
      const query = new URLSearchParams({ instance: instanceId })
      const res = await fetch(`/api/gateway-status?${query.toString()}`)
      if (!res.ok) throw new Error('gateway-status fetch failed')
      return res.json()
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

export function useIsFeatureAvailable(
  feature: string,
  instanceId = 'default',
): boolean | null {
  const { data, isLoading } = useGatewayStatus(instanceId)
  if (isLoading || !data) return null
  return data.capabilities[feature] === true
}
