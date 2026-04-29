import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  readdirSync,
  resolveRequestHermesInstance,
  probeInstanceCapabilities,
  fetchInstanceModels,
} = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn().mockImplementation(() => {}),
  mkdirSync: vi.fn().mockImplementation(() => {}),
  statSync: vi.fn().mockReturnValue({ isFile: () => false, mtimeMs: 0 }),
  readdirSync: vi.fn().mockReturnValue([]),
  resolveRequestHermesInstance: vi.fn(),
  probeInstanceCapabilities: vi.fn(),
  fetchInstanceModels: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync },
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  readdirSync,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: any) => opts,
}))

vi.mock('@tanstack/react-start', () => ({
  json: (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      ...(init || {}),
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    }),
}))

vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
}))

vi.mock('../../../server/gateway-capabilities', () => ({
  BEARER_TOKEN: '',
  HERMES_API: 'http://127.0.0.1:8642',
}))

vi.mock('../../../server/hermes-instances', () => ({
  resolveRequestHermesInstance,
}))

vi.mock('../../../server/hermes-instance-api', () => ({
  probeInstanceCapabilities,
  fetchInstanceModels,
}))

vi.mock('../../../server/local-provider-discovery', () => ({
  ensureDiscovery: vi.fn(),
  getDiscoveredModels: () => [],
  ensureProviderInConfig: () => false,
}))

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.HERMES_HOME
  resolveRequestHermesInstance.mockResolvedValue({
    id: 'default',
    profileName: 'default',
    label: 'Hermes 1',
    profilePath: '~/.hermes',
    gatewayUrl: 'http://127.0.0.1:8642',
    port: 8642,
    source: 'fallback',
    isDefault: true,
    status: 'unknown',
  })
  probeInstanceCapabilities.mockResolvedValue({ models: false })
  fetchInstanceModels.mockResolvedValue([])
})

describe('models route', () => {
  async function importModels() {
    vi.resetModules()
    const mod = await import('../models')
    return mod
  }

  async function getHandler() {
    const mod = await importModels()
    const get = (mod as any).Route.server.handlers.GET
    return get
  }

  it('GET returns ok:true and empty models without config', async () => {
    const get = await getHandler()
    expect(typeof get).toBe('function')
    const request = new Request('http://localhost/api/models')
    const res = await get({ request })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.data).toEqual([])
  })

  it('reads default model from HERMES_HOME config using YAML.parse', async () => {
    const envHome = '/mock/profiles/jarvis'
    process.env.HERMES_HOME = envHome

    const configYaml = 'model: jarvis-model\nprovider: nous\n'
    const modelsJson = '[{"model":"x","provider":"y"}]'
    const modelsPath = path.join(envHome, 'models.json')
    const configPath = path.join(envHome, 'config.yaml')
    existsSync.mockImplementation((p: string) => {
      return p === modelsPath || p === configPath
    })
    readFileSync.mockImplementation((p: string) => {
      if (p === configPath) return configYaml
      if (p === modelsPath) return modelsJson
      return ''
    })

    const get = await getHandler()
    const request = new Request('http://localhost/api/models')
    const res = await get({ request })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.models[0].id).toBe('jarvis-model')
    expect(json.models[0].provider).toBe('nous')
  })

  it('reads nested model object syntax from config using YAML.parse', async () => {
    const envHome = '/mock/profiles/jarvis'
    process.env.HERMES_HOME = envHome

    const configYaml = 'model:\n  default: nest-model\n  provider: anthropic\n'
    const configPath = path.join(envHome, 'config.yaml')
    existsSync.mockImplementation((p: string) => p === configPath)
    readFileSync.mockImplementation((p: string) => {
      if (p === configPath) return configYaml
      return ''
    })

    const get = await getHandler()
    const request = new Request('http://localhost/api/models')
    const res = await get({ request })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.models[0].id).toBe('nest-model')
    expect(json.models[0].provider).toBe('anthropic')
  })
})
