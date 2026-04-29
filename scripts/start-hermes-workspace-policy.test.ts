import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const launcherPath = resolve(process.cwd(), 'start-hermes-workspace.cmd')

describe('Windows workspace launcher policy', () => {
  it('does not auto-start any Hermes gateway process', () => {
    const launcher = readFileSync(launcherPath, 'utf8')

    expect(launcher).toContain('GATEWAY_HEALTH_URL')
    expect(launcher).not.toMatch(/gateway\s+run/i)
    expect(launcher).not.toMatch(/wsl\.exe[\s\S]*gateway/i)
    expect(launcher).not.toContain('HERMES_GATEWAY_CMD')
  })
})
