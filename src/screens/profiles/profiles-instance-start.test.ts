import { describe, expect, it } from 'vitest'

import {
  buildHermesInstanceFreshnessLabel,
  buildHermesInstanceStartFailureDisplay,
  buildHermesInstanceStartLogPath,
  buildHermesInstanceStartPath,
  getHermesInstanceStartButtonState,
} from './profiles-instance-start'
import type { HermesInstanceSummary } from '@/hooks/use-hermes-instances'

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
      getHermesInstanceStartButtonState(instance({ status: 'running' }))
        .visible,
    ).toBe(false)
    expect(
      getHermesInstanceStartButtonState(instance({ status: 'unknown' }))
        .visible,
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

  it('keeps the selected instance in the redacted start-log path', () => {
    expect(buildHermesInstanceStartLogPath('hermes2')).toBe(
      '/api/instances/start-log?instance=hermes2',
    )
  })

  it('formats instance freshness without pretending stale data is live', () => {
    expect(buildHermesInstanceFreshnessLabel(0, false)).toBe('Not checked yet')
    expect(
      buildHermesInstanceFreshnessLabel(
        new Date('2026-04-29T12:34:56Z').getTime(),
        false,
      ),
    ).toContain('Checked')
    expect(
      buildHermesInstanceFreshnessLabel(
        new Date('2026-04-29T12:34:56Z').getTime(),
        true,
      ),
    ).toContain('Refreshing')
  })

  it('builds concise redacted failure display text with diagnostics', () => {
    const display = buildHermesInstanceStartFailureDisplay({
      error: 'OPENAI_API_KEY=<redacted> failed',
      diagnostic: {
        code: 'port-conflict',
        title: 'Port 8643 is already in use',
        hint: 'Close the other process or choose a different profile port.',
      },
      logSummary: {
        available: true,
        truncated: false,
        lines: ['Authorization: Bearer <redacted>', 'bind failed'],
      },
    })

    expect(display.title).toBe('Port 8643 is already in use')
    expect(display.hint).toContain('different profile port')
    expect(display.logLines).toEqual([
      'Authorization: Bearer <redacted>',
      'bind failed',
    ])
    expect(JSON.stringify(display)).not.toContain('live-token')
  })
})
