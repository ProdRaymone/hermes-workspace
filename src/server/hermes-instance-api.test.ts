import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchInstanceModels,
  openaiInstanceChat,
  probeInstanceCapabilities,
} from './hermes-instance-api'
import type { HermesInstance } from './hermes-instances'

const hermes2: HermesInstance = {
  id: 'hermes2',
  profileName: 'hermes2',
  label: 'Hermes 2',
  profilePath: '/home/Raymone-Linux/.hermes/profiles/hermes2',
  gatewayUrl: 'http://127.0.0.1:8643',
  port: 8643,
  source: 'wsl',
  isDefault: false,
  model: 'provider/hermes2-model',
  provider: 'provider',
  status: 'unknown',
}

describe('hermes instance API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches models from the selected instance gateway', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [{ id: 'provider/hermes2-model', object: 'model' }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const models = await fetchInstanceModels(hermes2)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8643/v1/models',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
    expect(models).toEqual([
      {
        id: 'provider/hermes2-model',
        name: 'provider/hermes2-model',
        object: 'model',
        provider: 'provider',
      },
    ])
  })

  it('probes capabilities against the selected instance only', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === 'http://127.0.0.1:8643/health')
          return Response.json({ ok: true })
        if (url === 'http://127.0.0.1:8643/v1/models') {
          return Response.json({ data: [] })
        }
        if (url === 'http://127.0.0.1:8643/v1/chat/completions') {
          return new Response('', {
            status: init?.method === 'GET' ? 405 : 200,
          })
        }
        if (url === 'http://127.0.0.1:8643/api/sessions') {
          return new Response('', { status: 404 })
        }
        if (url === 'http://127.0.0.1:8643/api/skills') {
          return Response.json({ skills: [] })
        }
        if (url === 'http://127.0.0.1:8643/api/config') {
          return Response.json({})
        }
        if (url === 'http://127.0.0.1:8643/api/jobs') {
          return Response.json({ jobs: [] })
        }
        return new Response('', { status: 404 })
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    const capabilities = await probeInstanceCapabilities(hermes2)

    expect(capabilities).toMatchObject({
      health: true,
      chatCompletions: true,
      models: true,
      sessions: false,
      skills: true,
      config: true,
      jobs: true,
    })
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('8642'),
      expect.anything(),
    )
  })

  it('posts OpenAI-compatible chat to the selected instance gateway', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: 'hello from hermes2' } }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await openaiInstanceChat(
      hermes2,
      [{ role: 'user', content: 'hello' }],
      {},
    )

    expect(response).toBe('hello from hermes2')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8643/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('provider/hermes2-model'),
      }),
    )
  })
})
