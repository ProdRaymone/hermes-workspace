import { describe, expect, it } from 'vitest'

import type { HermesInstanceSummary } from '@/hooks/use-hermes-instances'
import {
  buildHermesInstanceStartPath,
  getHermesInstanceStartButtonState,
} from './profiles-instance-start'

function instance(
  overrides: Partial<HermesInstanceSummary> = {},
): HermesInstanceSummary {
  return {
    id: 'hermes2',
    label: 'Hermes 2',
    profileName: 'hermes2',
    profilePath: '/home/Raymone-Linux/.hermes/profiles/hermes2',
    gatewayUrl: 'http://127.0.0.1:8643',
    port: 8643,
    isDefault: false,
    status: 'stopped',
    ...overrides,
  }
}

describe('profiles instance start helpers', () => {
  it('offers Start only for stopped non-default instances', () => {
    expect(getHermesInstanceStartButtonState(instance())).toEqual({
      visible: true,
      disabled: false,
      label: 'Start',
    })
    expect(
      getHermesInstanceStartButtonState(
        instance({ id: 'default', isDefault: true, status: 'stopped' }),
      ).visible,
    ).toBe(false)
    expect(
      getHermesInstanceStartButtonState(instance({ status: 'running' })).visible,
    ).toBe(false)
    expect(
      getHermesInstanceStartButtonState(instance({ status: 'unknown' })).visible,
    ).toBe(false)
  })

  it('keeps the selected instance in the explicit start path', () => {
    expect(buildHermesInstanceStartPath('hermes2')).toBe(
      '/api/instances/start?instance=hermes2',
    )
    expect(buildHermesInstanceStartPath('default')).toBe(
      '/api/instances/start?instance=default',
    )
  })
})
