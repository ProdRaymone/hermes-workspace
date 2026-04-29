import { describe, expect, it } from 'vitest'

import {
  buildSearchSessionsPath,
  shouldFetchDefaultScopedSkills,
} from './use-search-data'

describe('search data instance scope', () => {
  it('keeps default session search on the legacy sessions endpoint', () => {
    expect(buildSearchSessionsPath('default')).toBe('/api/sessions')
  })

  it('scopes non-default session search to the selected Hermes instance', () => {
    expect(buildSearchSessionsPath('hermes2')).toBe(
      '/api/sessions?instance=hermes2',
    )
  })

  it('only fetches singleton skills inventory for the default instance', () => {
    expect(shouldFetchDefaultScopedSkills('default')).toBe(true)
    expect(shouldFetchDefaultScopedSkills('hermes2')).toBe(false)
  })
})
