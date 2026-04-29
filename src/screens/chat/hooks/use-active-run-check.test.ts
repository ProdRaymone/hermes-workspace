import { describe, expect, it } from 'vitest'

import { buildActiveRunUrl } from './use-active-run-check'

describe('active run check URLs', () => {
  it('keeps default active-run polling on the legacy URL', () => {
    expect(buildActiveRunUrl('main', 'default')).toBe(
      '/api/sessions/main/active-run',
    )
  })

  it('scopes non-default active-run polling by Hermes instance', () => {
    expect(buildActiveRunUrl('session/key with spaces', 'hermes2')).toBe(
      '/api/sessions/session%2Fkey%20with%20spaces/active-run?instance=hermes2',
    )
  })
})
