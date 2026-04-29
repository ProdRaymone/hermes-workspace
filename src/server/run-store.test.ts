import { describe, expect, it } from 'vitest'

import { getRunStoreSessionDir } from './run-store'

describe('run store instance scope', () => {
  it('keeps default runs in the legacy session directory', () => {
    expect(getRunStoreSessionDir('main', 'default')).toMatch(
      /webui-mvp[\\/]+runs[\\/]+main$/,
    )
  })

  it('stores non-default instance runs under an instance namespace', () => {
    const hermes2Dir = getRunStoreSessionDir('main', 'hermes2')
    const hermes3Dir = getRunStoreSessionDir('main', 'hermes3')

    expect(hermes2Dir).toMatch(
      /webui-mvp[\\/]+runs[\\/]+instances[\\/]+hermes2[\\/]+main$/,
    )
    expect(hermes3Dir).toMatch(
      /webui-mvp[\\/]+runs[\\/]+instances[\\/]+hermes3[\\/]+main$/,
    )
    expect(hermes2Dir).not.toBe(hermes3Dir)
  })
})
