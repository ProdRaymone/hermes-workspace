import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildKnowledgeGraphForScope,
  buildKnowledgeScopeForInstance,
  listKnowledgePagesForScope,
  readKnowledgeBaseConfigForScope,
  readKnowledgePageForScope,
  searchKnowledgePagesForScope,
  syncKnowledgeSourceForScope,
} from './knowledge-browser'
import type { HermesInstance } from './hermes-instances'
import type { ProfileFileExecutor, ProfileFileOperation } from './profile-files'

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

describe('knowledge browser instance scopes', () => {
  let tempHome: string

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-knowledge-'))
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('keeps default knowledge on the legacy local root', async () => {
    const knowledgeRoot = path.join(tempHome, '.hermes', 'knowledge')
    fs.mkdirSync(knowledgeRoot, { recursive: true })
    fs.writeFileSync(
      path.join(knowledgeRoot, 'Default.md'),
      '---\ntitle: Default Page\ntags: [default]\n---\nDefault body',
      'utf-8',
    )
    const executor = vi.fn()
    const scope = buildKnowledgeScopeForInstance(
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

    const pages = await listKnowledgePagesForScope(scope, { executor })

    expect(scope).toMatchObject({
      instance: 'default',
      kind: 'workspace-local',
    })
    expect(pages.map((page) => page.title)).toEqual(['Default Page'])
    expect(executor).not.toHaveBeenCalled()
  })

  it('lists non-default knowledge from the selected WSL profile fallback root', async () => {
    const executor = vi.fn((operation) => {
      if (operation.operation === 'read') {
        return Promise.reject(new Error('ENOENT: no such file'))
      }
      return Promise.resolve({
        files: [
          {
            path: 'Agent.md',
            name: 'Agent.md',
            size: 58,
            modified: '2026-04-29T00:00:00.000Z',
            content:
              '---\ntitle: Hermes2 Agent\ntags: [agent]\n---\nHermes2 body',
          },
        ],
      })
    }) satisfies ProfileFileExecutor
    const scope = buildKnowledgeScopeForInstance(instance())

    const pages = await listKnowledgePagesForScope(scope, { executor })

    expect(scope).toMatchObject({
      instance: 'hermes2',
      kind: 'wsl-profile',
      fallbackRoot: '/home/Raymone-Linux/.hermes/profiles/hermes2/knowledge',
    })
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'list',
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2/knowledge',
        includeContent: true,
      }),
    )
    expect(pages).toEqual([
      expect.objectContaining({
        path: 'Agent.md',
        title: 'Hermes2 Agent',
        tags: ['agent'],
      }),
    ])
  })

  it('reads selected WSL profile config without falling back to default config', async () => {
    const executor = vi.fn(() =>
      Promise.resolve({
        path: 'knowledge-config.json',
        content: JSON.stringify({
          source: { type: 'local', path: '/home/Raymone-Linux/hermes2-wiki' },
        }),
      }),
    ) satisfies ProfileFileExecutor

    const config = await readKnowledgeBaseConfigForScope(
      buildKnowledgeScopeForInstance(instance()),
      { executor },
    )

    expect(config).toEqual({
      source: { type: 'local', path: '/home/Raymone-Linux/hermes2-wiki' },
    })
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'read',
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2',
        path: 'knowledge-config.json',
        extension: '.json',
      }),
    )
  })

  it('rejects unsafe non-default knowledge paths before invoking WSL', async () => {
    const executor = vi.fn()

    await expect(
      readKnowledgePageForScope(
        '../Secrets.md',
        buildKnowledgeScopeForInstance(instance()),
        { executor },
      ),
    ).rejects.toThrow(/traversal/i)

    expect(executor).not.toHaveBeenCalled()
  })

  it('searches and graphs non-default pages from WSL profile files', async () => {
    const executor = vi.fn((operation) => {
      if (operation.operation === 'read') {
        return Promise.reject(new Error('ENOENT: no config'))
      }
      return Promise.resolve({
        files: [
          {
            path: 'A.md',
            name: 'A.md',
            size: 30,
            modified: '2026-04-29T00:00:00.000Z',
            content: '---\ntitle: Alpha\n---\nHermes2 links [[Beta]]',
          },
          {
            path: 'B.md',
            name: 'B.md',
            size: 20,
            modified: '2026-04-29T00:00:00.000Z',
            content: '---\ntitle: Beta\n---\nTarget page',
          },
        ],
      })
    }) satisfies ProfileFileExecutor
    const scope = buildKnowledgeScopeForInstance(instance())

    const matches = await searchKnowledgePagesForScope('Hermes2', scope, {
      executor,
    })
    const graph = await buildKnowledgeGraphForScope(scope, { executor })

    expect(matches).toEqual([
      { path: 'A.md', title: 'Alpha', line: 4, text: 'Hermes2 links [[Beta]]' },
    ])
    expect(graph.edges).toEqual([{ source: 'A.md', target: 'B.md' }])
  })

  it('redacts adapter errors and does not echo stdout file content', async () => {
    const keyName = ['OPENAI', 'API', 'KEY'].join('_')
    const executor = vi.fn(() => {
      const error = new Error(`${keyName}=knowledge-secret`) as Error & {
        stdout?: string
        stderr?: string
      }
      error.stdout = 'private knowledge content'
      error.stderr = 'Authorization: Bearer knowledge-token'
      return Promise.reject(error)
    }) satisfies ProfileFileExecutor

    let message = ''
    try {
      await listKnowledgePagesForScope(
        buildKnowledgeScopeForInstance(instance()),
        {
          executor,
        },
      )
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message).toContain('<redacted>')
    expect(message).not.toContain('knowledge-secret')
    expect(message).not.toContain('knowledge-token')
    expect(message).not.toContain('private knowledge content')
  })

  it('syncs a selected WSL GitHub source into that profile cache', async () => {
    const executor = vi.fn((operation: ProfileFileOperation) => {
      if (operation.operation === 'read') {
        return Promise.resolve({
          path: 'knowledge-config.json',
          content: JSON.stringify({
            source: {
              type: 'github',
              repo: 'owner/wiki',
              branch: 'main',
              path: 'docs',
            },
          }),
        })
      }
      if (operation.operation === 'write') {
        return Promise.resolve({ path: operation.path })
      }
      return Promise.reject(
        new Error(`Unexpected operation: ${operation.operation}`),
      )
    }) satisfies ProfileFileExecutor
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (
        url === 'https://api.github.com/repos/owner/wiki/contents/docs?ref=main'
      ) {
        return Promise.resolve(
          Response.json([
            {
              type: 'file',
              name: 'Guide.md',
              path: 'docs/Guide.md',
              sha: 'guide-sha',
            },
            {
              type: 'file',
              name: 'Ignore.txt',
              path: 'docs/Ignore.txt',
              sha: 'ignore-sha',
            },
            {
              type: 'dir',
              name: 'Nested',
              path: 'docs/Nested',
              sha: 'nested-sha',
            },
          ]),
        )
      }
      if (
        url ===
        'https://api.github.com/repos/owner/wiki/contents/docs/Nested?ref=main'
      ) {
        return Promise.resolve(
          Response.json([
            {
              type: 'file',
              name: 'Notes.md',
              path: 'docs/Nested/Notes.md',
              sha: 'notes-sha',
            },
          ]),
        )
      }
      if (
        url ===
        'https://api.github.com/repos/owner/wiki/contents/docs/Guide.md?ref=main'
      ) {
        return Promise.resolve(
          Response.json({
            content: Buffer.from('# WSL Guide').toString('base64'),
            encoding: 'base64',
          }),
        )
      }
      if (
        url ===
        'https://api.github.com/repos/owner/wiki/contents/docs/Nested/Notes.md?ref=main'
      ) {
        return Promise.resolve(
          Response.json({
            content: Buffer.from('# Nested Notes').toString('base64'),
            encoding: 'base64',
          }),
        )
      }
      return Promise.resolve(new Response('', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const scope = buildKnowledgeScopeForInstance(instance())

    const result = await syncKnowledgeSourceForScope(scope, { executor })

    expect(result).toMatchObject({
      success: true,
      source: {
        type: 'github',
        repo: 'owner/wiki',
        branch: 'main',
        path: 'docs',
      },
    })
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'write',
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2/knowledge-cache/github/owner_wiki/main/docs',
        path: 'Guide.md',
        content: '# WSL Guide',
        extension: '.md',
      }),
    )
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'write',
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2/knowledge-cache/github/owner_wiki/main/docs',
        path: 'Nested/Notes.md',
        content: '# Nested Notes',
        extension: '.md',
      }),
    )
    expect(executor).not.toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'write',
        path: 'Ignore.txt',
      }),
    )
  })

  it('treats selected WSL local-source sync as a profile-scoped no-op', async () => {
    const executor = vi.fn((operation: ProfileFileOperation) => {
      if (operation.operation === 'read') {
        return Promise.resolve({
          path: 'knowledge-config.json',
          content: JSON.stringify({
            source: { type: 'local', path: '/home/Raymone-Linux/wiki' },
          }),
        })
      }
      return Promise.reject(
        new Error(`Unexpected operation: ${operation.operation}`),
      )
    }) satisfies ProfileFileExecutor
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncKnowledgeSourceForScope(
      buildKnowledgeScopeForInstance(instance()),
      { executor },
    )

    expect(result).toEqual({
      source: { type: 'local', path: '/home/Raymone-Linux/wiki' },
      success: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(executor).toHaveBeenCalledTimes(1)
  })

  it('redacts selected WSL GitHub sync write failures', async () => {
    const keyName = ['GITHUB', 'TOKEN'].join('_')
    const rawSecret = ['profile', 'sync', 'secret'].join('-')
    const bearerSecret = ['sync', 'bearer', 'secret'].join('-')
    const executor = vi.fn((operation: ProfileFileOperation) => {
      if (operation.operation === 'read') {
        return Promise.resolve({
          path: 'knowledge-config.json',
          content: JSON.stringify({
            source: {
              type: 'github',
              repo: 'owner/wiki',
              branch: 'main',
              path: 'docs',
            },
          }),
        })
      }
      if (operation.operation === 'write') {
        const error = new Error(`${keyName}=${rawSecret}`) as Error & {
          stdout?: string
          stderr?: string
        }
        error.stdout = 'private markdown body'
        error.stderr = `Authorization: Bearer ${bearerSecret}`
        return Promise.reject(error)
      }
      return Promise.reject(
        new Error(`Unexpected operation: ${operation.operation}`),
      )
    }) satisfies ProfileFileExecutor
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (
        url === 'https://api.github.com/repos/owner/wiki/contents/docs?ref=main'
      ) {
        return Promise.resolve(
          Response.json([
            {
              type: 'file',
              name: 'Guide.md',
              path: 'docs/Guide.md',
              sha: 'guide-sha',
            },
          ]),
        )
      }
      if (
        url ===
        'https://api.github.com/repos/owner/wiki/contents/docs/Guide.md?ref=main'
      ) {
        return Promise.resolve(
          Response.json({
            content: Buffer.from('# WSL Guide').toString('base64'),
            encoding: 'base64',
          }),
        )
      }
      return Promise.resolve(new Response('', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncKnowledgeSourceForScope(
      buildKnowledgeScopeForInstance(instance()),
      { executor },
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('<redacted>')
    expect(result.error).not.toContain(rawSecret)
    expect(result.error).not.toContain(bearerSecret)
    expect(result.error).not.toContain('private markdown body')
  })
})
