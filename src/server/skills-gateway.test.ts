import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SelectedGatewayRequestError,
  buildSkillsGatewayErrorPayload,
  buildSkillsScopeForInstance,
  buildSkillsScopePayload,
  fetchSkillsFromSelectedInstance,
  postSkillActionToSelectedInstance,
  statusForSelectedSkillsGatewayError,
} from './skills-gateway'
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
    status: 'running',
    ...overrides,
  }
}

describe('skills gateway instance scope', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('describes default skills as legacy default gateway scoped', () => {
    const scope = buildSkillsScopeForInstance(
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

    expect(buildSkillsScopePayload(scope)).toMatchObject({
      instance: 'default',
      kind: 'legacy-default',
      transport: 'default-gateway',
    })
  })

  it('fetches non-default skills from the selected instance gateway only', async () => {
    const fetchMock = vi.fn(() =>
      Response.json({
        skills: [{ id: 'profile-skill', name: 'Profile Skill' }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const payload = await fetchSkillsFromSelectedInstance(
      buildSkillsScopeForInstance(instance()),
    )

    expect(payload).toEqual({
      skills: [{ id: 'profile-skill', name: 'Profile Skill' }],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8643/api/skills',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('8642'),
      expect.anything(),
    )
  })

  it('posts non-default skill mutations to the selected instance gateway only', async () => {
    const fetchMock = vi.fn(() => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await postSkillActionToSelectedInstance(
      buildSkillsScopeForInstance(instance()),
      '/api/skills/toggle',
      { name: 'profile-skill', enabled: false },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8643/api/skills/toggle',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'profile-skill', enabled: false }),
      }),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('8642'),
      expect.anything(),
    )
  })

  it('redacts selected gateway errors before surfacing them', async () => {
    const tokenName = ['OPENAI', 'API', 'KEY'].join('_')
    const rawSecret = ['skill', 'gateway', 'secret'].join('-')
    const fetchMock = vi.fn(
      () => new Response(`${tokenName}=${rawSecret}`, { status: 500 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchSkillsFromSelectedInstance(buildSkillsScopeForInstance(instance())),
    ).rejects.toThrow(/<redacted>/)

    await expect(
      fetchSkillsFromSelectedInstance(buildSkillsScopeForInstance(instance())),
    ).rejects.not.toThrow(rawSecret)
  })

  it('preserves selected gateway HTTP failures for unavailable handling', async () => {
    const fetchMock = vi.fn(
      () => new Response('404: Not Found', { status: 404 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchSkillsFromSelectedInstance(buildSkillsScopeForInstance(instance())),
    ).rejects.toMatchObject({
      statusCode: 404,
    })

    await expect(
      fetchSkillsFromSelectedInstance(buildSkillsScopeForInstance(instance())),
    ).rejects.toThrow(SelectedGatewayRequestError)

    await expect(
      fetchSkillsFromSelectedInstance(buildSkillsScopeForInstance(instance())),
    ).rejects.toThrow(/skills request failed \(404\): 404: Not Found/)
  })

  it('maps selected gateway request failures to unavailable status', () => {
    expect(
      statusForSelectedSkillsGatewayError(
        new SelectedGatewayRequestError('missing endpoint', 404),
      ),
    ).toBe(503)

    expect(statusForSelectedSkillsGatewayError(new Error('default bug'))).toBe(
      500,
    )
  })

  it('keeps selected scope on direct mutation error payloads', () => {
    expect(
      buildSkillsGatewayErrorPayload(
        buildSkillsScopeForInstance(instance()),
        new SelectedGatewayRequestError('missing endpoint', 404),
        'Failed to toggle skill',
      ),
    ).toMatchObject({
      ok: false,
      error: 'missing endpoint',
      scope: {
        instance: 'hermes2',
        kind: 'selected-instance',
        transport: 'selected-gateway',
      },
    })
  })
})
