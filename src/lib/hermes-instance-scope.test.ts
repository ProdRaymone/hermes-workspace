import { describe, expect, it } from 'vitest'

import {
  buildInstanceApiPath,
  getInstanceScopedSessionKey,
  isConnectionStatusReachable,
  shouldAttemptHermesAutoStart,
} from './hermes-instance-scope'

describe('Hermes instance scoped client helpers', () => {
  it('keeps default API paths legacy-compatible', () => {
    expect(buildInstanceApiPath('/api/connection-status', 'default')).toBe(
      '/api/connection-status',
    )
    expect(buildInstanceApiPath('/api/connection-status', '')).toBe(
      '/api/connection-status',
    )
  })

  it('adds the selected instance to non-default API paths', () => {
    expect(buildInstanceApiPath('/api/connection-status', 'hermes2')).toBe(
      '/api/connection-status?instance=hermes2',
    )
    expect(
      buildInstanceApiPath('/api/sessions/main/active-run?poll=1', 'hermes3'),
    ).toBe('/api/sessions/main/active-run?poll=1&instance=hermes3')
  })

  it('does not treat disconnected status payloads as reachable just because HTTP returned ok', () => {
    expect(
      isConnectionStatusReachable({
        status: 'disconnected',
        health: false,
        chatReady: false,
      }),
    ).toBe(false)

    expect(
      isConnectionStatusReachable({
        status: 'enhanced',
        health: true,
        chatReady: true,
      }),
    ).toBe(true)
  })

  it('only permits auto-start for default when explicitly enabled', () => {
    expect(shouldAttemptHermesAutoStart('default', true)).toBe(true)
    expect(shouldAttemptHermesAutoStart('default', false)).toBe(false)
    expect(shouldAttemptHermesAutoStart('hermes2', true)).toBe(false)
  })

  it('keeps default session state keys legacy-compatible while scoping non-default instances', () => {
    expect(getInstanceScopedSessionKey('main', 'default')).toBe('main')
    expect(getInstanceScopedSessionKey('main', 'hermes2')).toBe(
      'hermes2:main',
    )
  })
})
