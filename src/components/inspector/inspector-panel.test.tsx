import { describe, expect, it } from 'vitest'

import { buildInspectorMemoryListPath } from './inspector-panel'

describe('inspector panel instance scope', () => {
  it('scopes memory file loading to the selected Hermes instance', () => {
    expect(buildInspectorMemoryListPath('hermes2')).toBe(
      '/api/memory/list?instance=hermes2',
    )
  })
})
