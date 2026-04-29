import { describe, expect, it } from 'vitest'

import {
  buildSearchSessionsPath,
  buildSearchSkillsPath,
  shouldFetchScopedSkills,
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

  it('keeps default skill search on the legacy skills endpoint', () => {
    expect(buildSearchSkillsPath('default')).toBe(
      '/api/skills?summary=search&limit=120',
    )
  })

  it('scopes non-default skill search to the selected Hermes instance', () => {
    expect(buildSearchSkillsPath('hermes2')).toBe(
      '/api/skills?summary=search&limit=120&instance=hermes2',
    )
  })

  it('fetches skills for any selected instance once the skills API is scoped', () => {
    expect(shouldFetchScopedSkills('default')).toBe(true)
    expect(shouldFetchScopedSkills('hermes2')).toBe(true)
  })
})
