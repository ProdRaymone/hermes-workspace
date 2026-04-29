import { describe, expect, it } from 'vitest'

import { buildHermesAuthCheckPath } from './hermes-auth'

describe('Hermes auth status paths', () => {
  it('keeps default auth checks on the legacy endpoint', () => {
    expect(buildHermesAuthCheckPath('default')).toBe('/api/auth-check')
  })

  it('scopes non-default auth checks to the selected Hermes instance', () => {
    expect(buildHermesAuthCheckPath('hermes2')).toBe(
      '/api/auth-check?instance=hermes2',
    )
  })
})
