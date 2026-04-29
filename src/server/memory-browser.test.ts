import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildMemoryScopeForInstance,
  listMemoryFilesForScope,
  readMemoryFileForScope,
  redactMemoryFileError,
  searchMemoryFilesForScope,
} from './memory-browser'
import type { HermesInstance } from './hermes-instances'

function instance(overrides: Partial<HermesInstance> = {}): HermesInstance {
  return {
    id: 'hermes2',
    profileName: 'hermes2',
    label: 'Hermes 2',
    profilePath: '/home/Raymone-Linux/.hermes/profiles/hermes2',
    gatewayUrl: 'http://127.0.0.1:8643',
    port: 8643,
    source: 'wsl',
    isDefault: false,
    status: 'stopped',
    ...overrides,
  }
}

describe('memory browser instance scopes', () => {
  let tempHome: string

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-memory-'))
    vi.stubEnv('HERMES_HOME', tempHome)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('keeps default memory on the legacy local HERMES_HOME root', async () => {
    fs.writeFileSync(path.join(tempHome, 'MEMORY.md'), '# default\n', 'utf-8')
    const executor = vi.fn()
    const scope = buildMemoryScopeForInstance(
      instance({
        id: 'default',
        profileName: 'default',
        label: 'Hermes 1',
        profilePath: '/home/Raymone-Linux/.hermes',
        gatewayUrl: 'http://127.0.0.1:8642',
        port: 8642,
        isDefault: true,
      }),
    )

    const files = await listMemoryFilesForScope(scope, { executor })

    expect(scope).toMatchObject({
      instance: 'default',
      kind: 'workspace-local',
      root: tempHome,
    })
    expect(files.map((file) => file.path)).toEqual(['MEMORY.md'])
    expect(executor).not.toHaveBeenCalled()
  })

  it('lists non-default memory from the selected WSL profile path only', async () => {
    const executor = vi.fn(async () => ({
      files: [
        {
          path: 'memory/hermes2.md',
          name: 'hermes2.md',
          size: 12,
          modified: '2026-04-29T00:00:00.000Z',
        },
      ],
    }))
    const scope = buildMemoryScopeForInstance(instance())

    const files = await listMemoryFilesForScope(scope, { executor })

    expect(scope).toMatchObject({
      instance: 'hermes2',
      kind: 'wsl-profile',
      root: '/home/Raymone-Linux/.hermes/profiles/hermes2',
    })
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'list',
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2',
      }),
    )
    expect(files).toEqual([
      {
        path: 'memory/hermes2.md',
        name: 'hermes2.md',
        size: 12,
        modified: '2026-04-29T00:00:00.000Z',
      },
    ])
  })

  it('rejects unsafe non-default paths before invoking WSL', async () => {
    const executor = vi.fn()
    const scope = buildMemoryScopeForInstance(instance())

    await expect(
      readMemoryFileForScope('../MEMORY.md', scope, { executor }),
    ).rejects.toThrow(/traversal/i)

    expect(executor).not.toHaveBeenCalled()
  })

  it('searches non-default memory through the selected WSL profile adapter', async () => {
    const executor = vi.fn(async () => ({
      results: [{ path: 'MEMORY.md', line: 2, text: 'Hermes2 only' }],
    }))

    const results = await searchMemoryFilesForScope(
      'Hermes2',
      buildMemoryScopeForInstance(instance()),
      {
        executor,
      },
    )

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'search',
        query: 'Hermes2',
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2',
      }),
    )
    expect(results).toEqual([
      { path: 'MEMORY.md', line: 2, text: 'Hermes2 only' },
    ])
  })

  it('redacts secret-like WSL adapter failures before returning them', async () => {
    const keyName = ['OPENAI', 'API', 'KEY'].join('_')
    const rawSecret = ['profile', 'secret', 'value'].join('-')
    const bearerSecret = ['bearer', 'secret', 'value'].join('-')
    const executor = vi.fn(async () => {
      const error = new Error(`${keyName}=${rawSecret}`) as Error & {
        stderr?: string
      }
      error.stderr = `Authorization: Bearer ${bearerSecret}`
      throw error
    })

    await expect(
      listMemoryFilesForScope(buildMemoryScopeForInstance(instance()), {
        executor,
      }),
    ).rejects.toThrow(/<redacted>/)

    let redacted = ''
    try {
      await listMemoryFilesForScope(buildMemoryScopeForInstance(instance()), {
        executor,
      })
    } catch (error) {
      redacted = error instanceof Error ? error.message : String(error)
    }

    expect(redacted).not.toContain(rawSecret)
    expect(redacted).not.toContain(bearerSecret)
    expect(redactMemoryFileError(`${keyName}=${rawSecret}`)).not.toContain(
      rawSecret,
    )
  })

  it('does not echo adapter stdout when reporting memory access errors', async () => {
    const privateMemoryText = 'private memory line'
    const executor = vi.fn(async () => {
      const error = new Error('adapter failed') as Error & {
        stdout?: string
      }
      error.stdout = privateMemoryText
      throw error
    })

    let message = ''
    try {
      await listMemoryFilesForScope(buildMemoryScopeForInstance(instance()), {
        executor,
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message).toContain('adapter failed')
    expect(message).not.toContain(privateMemoryText)
  })
})
