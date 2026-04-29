import { describe, expect, it } from 'vitest'

import { shouldRenderMemoryBrowser } from './-memory-route-state'

describe('memory route scope state', () => {
  it('uses the normal feature gate for the default Hermes instance', () => {
    expect(shouldRenderMemoryBrowser('default', true)).toBe(true)
    expect(shouldRenderMemoryBrowser('default', false)).toBe(false)
  })

  it('keeps non-default instances on the workspace-shared memory browser in V1', () => {
    expect(shouldRenderMemoryBrowser('hermes2', false)).toBe(true)
    expect(shouldRenderMemoryBrowser('hermes3', false)).toBe(true)
  })
})
