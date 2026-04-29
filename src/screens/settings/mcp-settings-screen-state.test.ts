import { describe, expect, it } from 'vitest'

import { getMcpSettingsInstanceLabel } from './mcp-settings-screen-state'

describe('MCP settings screen state', () => {
  it('falls back to the active instance id while instance metadata is loading', () => {
    expect(getMcpSettingsInstanceLabel(undefined, 'hermes3')).toBe('hermes3')
  })
})
