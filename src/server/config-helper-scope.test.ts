import YAML from 'yaml'
import { describe, expect, it, vi } from 'vitest'

import {
  normalizeConfigPatchBody,
  patchConfigHelperForInstance,
  readConfigHelperForInstance,
} from './config-helper-scope'
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

describe('config helper instance scope', () => {
  it('normalizes path/value patches into a nested config patch', () => {
    expect(
      normalizeConfigPatchBody({
        path: 'agents.defaults.model.primary',
        value: 'anthropic/claude-sonnet-4-5',
      }),
    ).toEqual({
      config: {
        agents: {
          defaults: {
            model: {
              primary: 'anthropic/claude-sonnet-4-5',
            },
          },
        },
      },
    })
  })

  it('reads config-get from the selected WSL profile', async () => {
    const executor = vi.fn((operation: ProfileFileOperation) => {
      if (operation.operation === 'read' && operation.path === 'config.yaml') {
        return Promise.resolve({
          path: 'config.yaml',
          content: YAML.stringify({
            agents: { defaults: { contextTokens: 128000 } },
          }),
        })
      }
      return Promise.reject(new Error('ENOENT: no such file or directory'))
    }) satisfies ProfileFileExecutor

    const result = await readConfigHelperForInstance(instance(), { executor })

    expect(result).toMatchObject({
      ok: true,
      instance: 'hermes2',
      payload: {
        agents: { defaults: { contextTokens: 128000 } },
      },
    })
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'read',
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2',
        path: 'config.yaml',
        extension: '.yaml',
      }),
    )
  })

  it('redacts secret-like values from config-get payloads', async () => {
    const rawSecret = ['helper', 'config', 'secret'].join('-')
    const executor = vi.fn((operation: ProfileFileOperation) => {
      if (operation.operation === 'read' && operation.path === 'config.yaml') {
        return Promise.resolve({
          path: 'config.yaml',
          content: YAML.stringify({
            model: {
              default: 'gpt-5.4',
              api_key: rawSecret,
            },
          }),
        })
      }
      return Promise.reject(new Error('ENOENT: no such file or directory'))
    }) satisfies ProfileFileExecutor

    const result = await readConfigHelperForInstance(instance(), { executor })

    expect(JSON.stringify(result.payload)).not.toContain(rawSecret)
    expect(result.payload).toMatchObject({
      model: { api_key: '<redacted>' },
    })
  })

  it('patches raw JSON into only the selected WSL profile config', async () => {
    const files = new Map<string, string>([
      [
        'config.yaml',
        YAML.stringify({
          agents: { defaults: { contextTokens: 64000 } },
          keep: true,
        }),
      ],
    ])
    const executor = vi.fn((operation: ProfileFileOperation) => {
      if (operation.operation === 'read') {
        return Promise.resolve({
          path: operation.path,
          content: files.get(operation.path) ?? '',
        })
      }
      if (operation.operation === 'write') {
        files.set(operation.path, operation.content)
        return Promise.resolve({ path: operation.path })
      }
      return Promise.reject(
        new Error(`Unexpected operation: ${operation.operation}`),
      )
    }) satisfies ProfileFileExecutor

    await patchConfigHelperForInstance(
      instance(),
      {
        raw: JSON.stringify({
          agents: { defaults: { contextTokens: 128000 } },
          auth: {
            profiles: {
              'anthropic:default': {
                provider: 'anthropic',
                apiKey: 'profile-key',
              },
            },
          },
        }),
      },
      { executor },
    )

    expect(YAML.parse(files.get('config.yaml') || '{}')).toEqual({
      agents: { defaults: { contextTokens: 128000 } },
      auth: {
        profiles: {
          'anthropic:default': {
            provider: 'anthropic',
            apiKey: 'profile-key',
          },
        },
      },
      keep: true,
    })
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'write',
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2',
        path: 'config.yaml',
        extension: '.yaml',
      }),
    )
  })
})
