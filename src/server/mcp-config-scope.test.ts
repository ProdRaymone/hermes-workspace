import YAML from 'yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildMcpConfigScopeForInstance,
  listMcpServersForScope,
  reloadMcpForScope,
} from './mcp-config-scope'
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
    status: 'running',
    ...overrides,
  }
}

describe('MCP config instance scope', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists MCP servers from the selected instance gateway only', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
        config: {
          mcp_servers: {
            profile_fs: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem'],
            },
          },
        },
      }),
      ),
    )

    const result = await listMcpServersForScope(
      buildMcpConfigScopeForInstance(instance()),
      { fetcher },
    )

    expect(result).toMatchObject({
      ok: true,
      source: 'selected-gateway',
      servers: [
        {
          name: 'profile_fs',
          transport: 'stdio',
          command: 'npx',
        },
      ],
    })
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:8643/api/config',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
    expect(fetcher).not.toHaveBeenCalledWith(
      expect.stringContaining('8642'),
      expect.anything(),
    )
  })

  it('falls back to selected WSL profile config when its gateway is stopped', async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')))
    const executor = vi.fn((operation: ProfileFileOperation) => {
      if (operation.operation === 'read' && operation.path === 'config.yaml') {
        return Promise.resolve({
          path: 'config.yaml',
          content: YAML.stringify({
            mcp_servers: {
              profile_http: {
                url: 'https://example.test/mcp',
                headers: { Authorization: 'Bearer ${TOKEN}' },
              },
            },
          }),
        })
      }
      return Promise.reject(
        new Error(`Unexpected operation: ${operation.operation}`),
      )
    }) satisfies ProfileFileExecutor

    const result = await listMcpServersForScope(
      buildMcpConfigScopeForInstance(
        instance({ status: 'stopped', gatewayUrl: 'http://127.0.0.1:8643' }),
      ),
      { executor, fetcher },
    )

    expect(result).toMatchObject({
      ok: true,
      source: 'profile-file',
      servers: [
        {
          name: 'profile_http',
          transport: 'http',
          url: 'https://example.test/mcp',
        },
      ],
    })
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'read',
        root: '/home/Raymone-Linux/.hermes/profiles/hermes2',
        path: 'config.yaml',
        extension: '.yaml',
      }),
    )
    expect(fetcher).not.toHaveBeenCalledWith(
      expect.stringContaining('8642'),
      expect.anything(),
    )
  })

  it('reloads MCP through the selected instance gateway only', async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json({ ok: true })))

    const result = await reloadMcpForScope(
      buildMcpConfigScopeForInstance(instance()),
      { fetcher },
    )

    expect(result).toMatchObject({
      ok: true,
      source: 'selected-gateway',
      instance: 'hermes2',
    })
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:8643/api/reload-mcp',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetcher).not.toHaveBeenCalledWith(
      expect.stringContaining('8642'),
      expect.anything(),
    )
  })

  it('redacts secret-like MCP server env and headers', async () => {
    const rawSecret = ['mcp', 'config', 'secret'].join('-')
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
          mcp_servers: {
            private_http: {
              url: 'https://example.test/mcp',
              headers: {
                Authorization: `Bearer ${rawSecret}`,
              },
              env: {
                MCP_API_KEY: rawSecret,
              },
            },
          },
        }),
      ),
    )

    const result = await listMcpServersForScope(
      buildMcpConfigScopeForInstance(instance()),
      { fetcher },
    )

    expect(JSON.stringify(result.servers)).not.toContain(rawSecret)
    expect(result.servers).toEqual([
      expect.objectContaining({
        headers: { Authorization: '<redacted>' },
        env: { MCP_API_KEY: '<redacted>' },
      }),
    ])
  })

  it('reports selected instance unavailable for reload without falling back', async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')))

    const result = await reloadMcpForScope(
      buildMcpConfigScopeForInstance(
        instance({ status: 'stopped', gatewayUrl: 'http://127.0.0.1:8643' }),
      ),
      { fetcher },
    )

    expect(result).toMatchObject({
      ok: false,
      code: 'instance_unavailable',
      instance: 'hermes2',
    })
    expect(fetcher).not.toHaveBeenCalledWith(
      expect.stringContaining('8642'),
      expect.anything(),
    )
  })
})
