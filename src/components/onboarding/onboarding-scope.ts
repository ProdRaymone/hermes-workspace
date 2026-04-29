import { buildInstanceApiPath } from '@/lib/hermes-instance-scope'

export const ONBOARDING_HERMES_INSTANCE_ID = 'default' as const

export type OnboardingBackendScope = {
  instanceId: typeof ONBOARDING_HERMES_INSTANCE_ID
  scope: 'workspace-default'
  label: string
  description: string
}

export function getOnboardingBackendScope(): OnboardingBackendScope {
  return {
    instanceId: ONBOARDING_HERMES_INSTANCE_ID,
    scope: 'workspace-default',
    label: 'Hermes 1 / default',
    description:
      'Initial setup checks the Workspace default Hermes backend; Hermes2 and Hermes3 are switched after setup.',
  }
}

export function buildOnboardingApiPath(path: string): string {
  return buildInstanceApiPath(path, ONBOARDING_HERMES_INSTANCE_ID)
}
