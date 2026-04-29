import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildHermesConfigScopeForInstance,
  buildHermesConfigScopePayload,
  patchHermesConfigForScope,
  readHermesConfigStateForScope,
} from './hermes-config-scope'
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

describe('Hermes config instance scope', () => {
  let tempHome: string

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-config-'))
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('keeps default config on the legacy local Hermes home', async () => {
    const hermesHome = path.join(tempHome, '.hermes')
    fs.mkdirSync(hermesHome, { recursive: true })
    fs.writeFileSync(
      path.join(hermesHome, 'config.yaml'),
      YAML.stringify({
        provider: 'openai-codex',
        model: { default: 'gpt-5.4', provider: 'openai-codex' },
      }),
      'utf-8',
    )
    fs.writeFileSync(
      path.join(hermesHome, '.env'),
      'ANTHROPIC_API_KEY=legacy-secret\n',
      'utf-8',
    )
    const executor = vi.fn()

    const scope = buildHermesConfigScopeForInstance(
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
    const state = await readHermesConfigStateForScope(scope, { executor })

    expect(buildHermesConfigScopePayload(scope)).toMatchObject({
      instance: 'default',
      kind: 'legacy-default',
      storage: 'workspace-local',
    })
    expect(state.hermesHome).toBe(hermesHome)
    expect(state.activeProvider).toBe('openai-codex')
    expect(state.activeModel).toBe('gpt-5.4')
    expect(
      state.providers.find((provider) => provider.id === 'anthropic')
        ?.maskedKeys,
    ).toEqual({ ANTHROPIC_API_KEY: 'lega...cret' })
    expect(executor).not.toHaveBeenCalled()
  })

  it('reads non-default config and env from the selected WSL profile', async () => {
    const executor = vi.fn((operation: ProfileFileOperation) => {
      if (operation.operation === 'read' && operation.path === 'config.yaml') {
        return Promise.resolve({
          path: 'config.yaml',
          content: YAML.stringify({
            provider: 'anthropic',
            model: { default: 'claude-sonnet-4-5', provider: 'anthropic' },
          }),
        })
      }
      if (operation.operation === 'read' && operation.path === '.env') {
        return Promise.resolve({
          path: '.env',
          content: 'ANTHROPIC_API_KEY=profile-secret\n',
        })
      }
      return Promise.reject(new Error(`Unexpected operation ${operation}`))
    }) satisfies ProfileFileExecutor

    const scope = buildHermesConfigScopeForInstance(instance())
    const state = await readHermesConfigStateForScope(scope, { executor })

    expect(buildHermesConfigScopePayload(scope)).toMatchObject({
      instance: 'hermes2',
      kind: 'instance-scoped',
      storage: 'wsl-profile',
      profilePath: '/home/Raymone-Linux/.hermes/profiles/hermes2',
    })
    expect(state.activeProvider).toBe('anthropic')
    expect(state.activeModel).toBe('claude-sonnet-4-5')
    expect(state.hermesHome).toBe(
      '/home/Raymone-Linux/.hermes/profiles/hermes2',
    )
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'read',
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2',
        path: 'config.yaml',
        extension: '.yaml',
      }),
    )
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'read',
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2',
        path: '.env',
        extension: '.env',
      }),
    )
  })

  it('patches only the selected WSL profile config and env', async () => {
    const writes: Array<Extract<ProfileFileOperation, { operation: 'write' }>> =
      []
    const files = new Map<string, string>([
      [
        'config.yaml',
        YAML.stringify({
          provider: 'openrouter',
          model: { default: 'qwen/qwen3-coder', provider: 'openrouter' },
          keep: true,
        }),
      ],
      ['.env', 'OPENROUTER_API_KEY=old-profile-secret\nREMOVE_ME=delete\n'],
    ])
    const executor = vi.fn((operation: ProfileFileOperation) => {
      if (operation.operation === 'read') {
        return Promise.resolve({
          path: operation.path,
          content: files.get(operation.path) ?? '',
        })
      }
      if (operation.operation === 'write') {
        writes.push(operation)
        files.set(operation.path, operation.content)
        return Promise.resolve({ path: operation.path })
      }
      return Promise.reject(
        new Error(`Unexpected operation: ${operation.operation}`),
      )
    }) satisfies ProfileFileExecutor

    await patchHermesConfigForScope(
      buildHermesConfigScopeForInstance(instance()),
      {
        config: {
          provider: 'anthropic',
          model: { default: 'claude-sonnet-4-5', provider: 'anthropic' },
          keep: null,
        },
        env: {
          ANTHROPIC_API_KEY: 'new-profile-secret',
          REMOVE_ME: null,
        },
      },
      { executor },
    )

    expect(writes).toEqual([
      expect.objectContaining({
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2',
        path: 'config.yaml',
        extension: '.yaml',
      }),
      expect.objectContaining({
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2',
        path: '.env',
        extension: '.env',
      }),
    ])
    expect(YAML.parse(files.get('config.yaml') || '{}')).toEqual({
      provider: 'anthropic',
      model: { default: 'claude-sonnet-4-5', provider: 'anthropic' },
    })
    expect(files.get('.env')).toBe(
      'OPENROUTER_API_KEY=old-profile-secret\nANTHROPIC_API_KEY=new-profile-secret\n',
    )
    expect(executor).not.toHaveBeenCalledWith(
      expect.objectContaining({ root: expect.stringContaining(tempHome) }),
    )
  })

  it('treats missing selected profile config files as empty state', async () => {
    const executor = vi.fn(() =>
      Promise.reject(new Error('ENOENT: no such file or directory')),
    ) satisfies ProfileFileExecutor

    const state = await readHermesConfigStateForScope(
      buildHermesConfigScopeForInstance(instance()),
      { executor },
    )

    expect(state.config).toEqual({})
    expect(state.activeProvider).toBe('')
    expect(state.activeModel).toBe('')
  })

  it('treats malformed selected profile config as empty without echoing file content', async () => {
    const rawSecret = ['broken', 'config', 'secret'].join('-')
    const executor = vi.fn((operation: ProfileFileOperation) => {
      if (operation.operation === 'read' && operation.path === 'config.yaml') {
        return Promise.resolve({
          path: 'config.yaml',
          content: `provider: [${rawSecret}`,
        })
      }
      if (operation.operation === 'read' && operation.path === '.env') {
        return Promise.resolve({ path: '.env', content: '' })
      }
      return Promise.reject(
        new Error(`Unexpected operation: ${operation.operation}`),
      )
    }) satisfies ProfileFileExecutor

    const state = await readHermesConfigStateForScope(
      buildHermesConfigScopeForInstance(instance()),
      { executor },
    )

    expect(state.config).toEqual({})
    expect(JSON.stringify(state)).not.toContain(rawSecret)
  })

  it('redacts secret-like values from returned config state', async () => {
    const rawSecret = ['profile', 'config', 'secret'].join('-')
    const executor = vi.fn((operation: ProfileFileOperation) => {
      if (operation.operation === 'read' && operation.path === 'config.yaml') {
        return Promise.resolve({
          path: 'config.yaml',
          content: YAML.stringify({
            model: {
              default: 'gpt-5.4',
              provider: 'custom',
              api_key: rawSecret,
            },
            auth: {
              profiles: {
                'anthropic:default': {
                  provider: 'anthropic',
                  apiKey: rawSecret,
                },
              },
            },
          }),
        })
      }
      if (operation.operation === 'read' && operation.path === '.env') {
        return Promise.resolve({ path: '.env', content: '' })
      }
      return Promise.reject(
        new Error(`Unexpected operation: ${operation.operation}`),
      )
    }) satisfies ProfileFileExecutor

    const state = await readHermesConfigStateForScope(
      buildHermesConfigScopeForInstance(instance()),
      { executor },
    )

    expect(JSON.stringify(state.config)).not.toContain(rawSecret)
    expect(state.config).toMatchObject({
      model: { api_key: '<redacted>' },
      auth: {
        profiles: {
          'anthropic:default': {
            apiKey: '<redacted>',
          },
        },
      },
    })
  })

  it('redacts profile-file adapter errors before surfacing them', async () => {
    const keyName = ['ANTHROPIC', 'API', 'KEY'].join('_')
    const executor = vi.fn(() => {
      const error = new Error(`${keyName}=config-secret`) as Error & {
        stdout?: string
        stderr?: string
      }
      error.stdout = 'raw config.yaml content'
      error.stderr = 'Authorization: Bearer profile-token'
      return Promise.reject(error)
    }) satisfies ProfileFileExecutor

    await expect(
      readHermesConfigStateForScope(
        buildHermesConfigScopeForInstance(instance()),
        {
          executor,
        },
      ),
    ).rejects.toThrow(/<redacted>/)
    await expect(
      readHermesConfigStateForScope(
        buildHermesConfigScopeForInstance(instance()),
        {
          executor,
        },
      ),
    ).rejects.not.toThrow(/config-secret|profile-token|raw config/)
  })
})
