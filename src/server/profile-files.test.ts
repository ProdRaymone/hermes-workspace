import { describe, expect, it, vi } from 'vitest'

import {
  listProfileFiles,
  readProfileFile,
  redactProfileFileError,
} from './profile-files'
import type { ProfileFileExecutor } from './profile-files'

describe('profile file adapter', () => {
  it('passes structured list operations to the injected executor', async () => {
    const executor = vi.fn(() =>
      Promise.resolve({
        files: [
          {
            path: 'knowledge/page.md',
            name: 'page.md',
            size: 12,
            modified: '2026-04-29T00:00:00.000Z',
            content: '# Page',
          },
        ],
      }),
    ) satisfies ProfileFileExecutor

    const files = await listProfileFiles(
      '/home/user/.hermes/profiles/hermes2/knowledge',
      {
        executor,
        extension: '.md',
        includeContent: true,
      },
    )

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'list',
        root: '/home/user/.hermes/profiles/hermes2/knowledge',
        extension: '.md',
        includeContent: true,
      }),
    )
    expect(files).toEqual([
      {
        path: 'knowledge/page.md',
        name: 'page.md',
        size: 12,
        modified: '2026-04-29T00:00:00.000Z',
        content: '# Page',
      },
    ])
  })

  it('rejects unsafe reads before invoking the executor', async () => {
    const executor = vi.fn()

    await expect(
      readProfileFile('/home/user/.hermes/profiles/hermes2', '../config.yaml', {
        executor,
        extension: '.yaml',
      }),
    ).rejects.toThrow(/traversal/i)

    expect(executor).not.toHaveBeenCalled()
  })

  it('redacts secret-like adapter failures without echoing stdout', async () => {
    const keyName = ['OPENAI', 'API', 'KEY'].join('_')
    const rawSecret = ['profile', 'secret', 'value'].join('-')
    const privateStdout = 'private file content'
    const executor = vi.fn(() => {
      const error = new Error(`${keyName}=${rawSecret}`) as Error & {
        stdout?: string
        stderr?: string
      }
      error.stdout = privateStdout
      error.stderr = 'Authorization: Bearer live-profile-token'
      return Promise.reject(error)
    }) satisfies ProfileFileExecutor

    let message = ''
    try {
      await listProfileFiles('/home/user/.hermes/profiles/hermes2', {
        executor,
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message).toContain('<redacted>')
    expect(message).not.toContain(rawSecret)
    expect(message).not.toContain('live-profile-token')
    expect(message).not.toContain(privateStdout)
    expect(redactProfileFileError(`${keyName}=${rawSecret}`)).not.toContain(
      rawSecret,
    )
  })
})
