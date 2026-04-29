import { describe, expect, it } from 'vitest'

import { buildSettingsModelsPath } from './index'

describe('settings models instance scope', () => {
  it('keeps default settings model loading on the legacy endpoint', () => {
    expect(buildSettingsModelsPath('default')).toBe('/api/models')
  })

  it('loads settings models from the selected Hermes instance', () => {
    expect(buildSettingsModelsPath('hermes3')).toBe(
      '/api/models?instance=hermes3',
    )
  })
})
