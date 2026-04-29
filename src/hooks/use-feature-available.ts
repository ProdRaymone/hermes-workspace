import { useQuery } from '@tanstack/react-query'
import type { EnhancedFeature } from '@/lib/feature-gates'

interface GatewayStatus {
  capabilities: Record<string, boolean>
  hermesUrl: string
}

export function useFeatureAvailable(
  feature: EnhancedFeature,
  instanceId = 'default',
): boolean {
  const { data } = useQuery({
    queryKey: ['gateway-status', instanceId],
    queryFn: async () => {
      const query = new URLSearchParams({ instance: instanceId })
      const res = await fetch(`/api/gateway-status?${query.toString()}`)
      if (!res.ok) return null
      return (await res.json()) as GatewayStatus
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  return data?.capabilities?.[feature] === true
}
