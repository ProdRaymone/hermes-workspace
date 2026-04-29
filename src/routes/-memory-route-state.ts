import { isDefaultHermesInstance } from '@/lib/hermes-instance-scope'

export function shouldRenderMemoryBrowser(
  activeInstanceId: string,
  defaultMemoryAvailable: boolean,
): boolean {
  if (!isDefaultHermesInstance(activeInstanceId)) return true
  return defaultMemoryAvailable
}
