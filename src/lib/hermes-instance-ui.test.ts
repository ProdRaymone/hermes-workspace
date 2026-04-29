import { describe, expect, it } from 'vitest'

import {
  buildHermesInstanceMenuItems,
  buildHermesScopeSummary,
  getHermesInstanceStatusLabel,
  getHermesInstanceStatusToneClassName,
  summarizeHermesInstances,
} from './hermes-instance-ui'
import type { HermesInstanceSummary } from '@/hooks/use-hermes-instances'

function instance(
  overrides: Partial<HermesInstanceSummary>,
): HermesInstanceSummary {
  return {
    id: 'default',
    label: 'Hermes 1',
    profileName: 'default',
    profilePath: '/home/Raymone-Linux/.hermes',
    gatewayUrl: 'http://127.0.0.1:8642',
    port: 8642,
    isDefault: true,
    status: 'running',
    ...overrides,
  }
}

describe('Hermes instance UI helpers', () => {
  it('uses explicit, high-contrast status labels for agent switchers', () => {
    expect(getHermesInstanceStatusLabel('running')).toBe('live')
    expect(getHermesInstanceStatusLabel('stopped')).toBe('stopped')
    expect(getHermesInstanceStatusLabel('unknown')).toBe('checking')
  })

  it('does not style stopped instances as disabled text', () => {
    const stoppedTone = getHermesInstanceStatusToneClassName('stopped')

    expect(stoppedTone).toContain('amber')
    expect(stoppedTone).not.toContain('opacity')
  })

  it('builds readable switcher items with selected state and endpoint metadata', () => {
    const items = buildHermesInstanceMenuItems(
      [
        instance({ id: 'default', label: 'Hermes 1', port: 8642 }),
        instance({
          id: 'hermes2',
          label: 'Hermes 2',
          profileName: 'hermes2',
          profilePath: '/home/Raymone-Linux/.hermes/profiles/hermes2',
          gatewayUrl: 'http://127.0.0.1:8643',
          port: 8643,
          isDefault: false,
          status: 'stopped',
          model: 'openai/gpt-5.5',
        }),
      ],
      'hermes2',
    )

    expect(items[1]).toMatchObject({
      id: 'hermes2',
      selected: true,
      statusLabel: 'stopped',
      endpointLabel: ':8643',
    })
    expect(items[1].description).toContain('openai/gpt-5.5')
  })

  it('summarizes Profiles read-only instance counts', () => {
    expect(
      summarizeHermesInstances([
        instance({ status: 'running' }),
        instance({ id: 'hermes2', status: 'stopped' }),
        instance({ id: 'hermes3', status: 'unknown' }),
      ]),
    ).toEqual({
      total: 3,
      running: 1,
      stopped: 1,
      unknown: 1,
    })
  })

  it('builds honest read-only scope labels for stopped non-default instances', () => {
    expect(
      buildHermesScopeSummary(
        instance({
          id: 'hermes2',
          label: 'Hermes 2',
          profileName: 'hermes2',
          profilePath: '/home/Raymone-Linux/.hermes/profiles/hermes2',
          gatewayUrl: 'http://127.0.0.1:8643',
          port: 8643,
          isDefault: false,
          status: 'stopped',
        }),
        'workspace-shared',
      ),
    ).toMatchObject({
      instanceLabel: 'Hermes 2',
      statusLabel: 'stopped',
      endpointLabel: ':8643',
      scopeLabel: 'Workspace-shared',
    })
  })
})
