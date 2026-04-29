import { describe, expect, it } from 'vitest'

import {
  ONBOARDING_HERMES_INSTANCE_ID,
  buildOnboardingApiPath,
  getOnboardingBackendScope,
} from './onboarding-scope'

describe('onboarding backend scope', () => {
  it('keeps setup checks pinned to the default Hermes instance', () => {
    expect(ONBOARDING_HERMES_INSTANCE_ID).toBe('default')
    expect(buildOnboardingApiPath('/api/auth-check')).toBe('/api/auth-check')
    expect(buildOnboardingApiPath('/api/gateway-status')).toBe(
      '/api/gateway-status',
    )
    expect(buildOnboardingApiPath('/api/models?limit=20')).toBe(
      '/api/models?limit=20',
    )
  })

  it('labels setup as workspace-level default readiness', () => {
    expect(getOnboardingBackendScope()).toMatchObject({
      instanceId: 'default',
      scope: 'workspace-default',
    })
    expect(getOnboardingBackendScope().label).toContain('Hermes 1')
  })
})
