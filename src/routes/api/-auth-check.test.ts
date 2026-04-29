import { describe, expect, it } from 'vitest'

import {
  isAuthBackendReachable,
  shouldBlockWorkspaceForUnreachableAuthBackend,
} from './auth-check'

describe('auth-check multi-instance behavior', () => {
  it('treats health, chat, or models capability as reachable', () => {
    expect(
      isAuthBackendReachable({
        health: false,
        chatCompletions: true,
        models: false,
      }),
    ).toBe(true)
    expect(
      isAuthBackendReachable({
        health: false,
        chatCompletions: false,
        models: true,
      }),
    ).toBe(true)
    expect(
      isAuthBackendReachable({
        health: false,
        chatCompletions: false,
        models: false,
      }),
    ).toBe(false)
  })

  it('blocks the startup shell only for unreachable default instance', () => {
    expect(
      shouldBlockWorkspaceForUnreachableAuthBackend('default', false),
    ).toBe(true)
    expect(
      shouldBlockWorkspaceForUnreachableAuthBackend('hermes2', false),
    ).toBe(false)
    expect(
      shouldBlockWorkspaceForUnreachableAuthBackend('default', true),
    ).toBe(false)
  })
})
