import { describe, expect, it } from 'vitest'

import {
  buildHermesInstances,
  getDefaultGatewayPort,
  normalizeHermesProfileName,
  resolveHermesInstance,
} from './hermes-instances'

describe('hermes instances', () => {
  it('normalizes WSL Hermes profile names into stable instance ids', () => {
    expect(normalizeHermesProfileName(' default ')).toBe('default')
    expect(normalizeHermesProfileName('Hermes 2')).toBe('hermes-2')
    expect(normalizeHermesProfileName('../bad\\name')).toBe('bad-name')
  })

  it('maps default Hermes profiles to deterministic gateway ports', () => {
    expect(getDefaultGatewayPort('default', 0)).toBe(8642)
    expect(getDefaultGatewayPort('hermes2', 1)).toBe(8643)
    expect(getDefaultGatewayPort('hermes3', 2)).toBe(8644)
    expect(getDefaultGatewayPort('research', 3)).toBe(8645)
  })

  it('builds instances from WSL profiles without exposing raw config values', () => {
    const instances = buildHermesInstances({
      root: '/home/Raymone-Linux/.hermes',
      source: 'wsl',
      profiles: [
        {
          name: 'default',
          path: '/home/Raymone-Linux/.hermes',
          model: 'openai/gpt-5.5',
          provider: 'openai',
        },
        {
          name: 'hermes2',
          path: '/home/Raymone-Linux/.hermes/profiles/hermes2',
          model: 'anthropic/claude',
          provider: 'anthropic',
        },
        {
          name: 'hermes3',
          path: '/home/Raymone-Linux/.hermes/profiles/hermes3',
        },
      ],
    })

    expect(instances.map((instance) => instance.id)).toEqual([
      'default',
      'hermes2',
      'hermes3',
    ])
    expect(instances.map((instance) => instance.gatewayUrl)).toEqual([
      'http://127.0.0.1:8642',
      'http://127.0.0.1:8643',
      'http://127.0.0.1:8644',
    ])
    expect(instances[1]).toMatchObject({
      label: 'Hermes 2',
      model: 'anthropic/claude',
      profilePath: '/home/Raymone-Linux/.hermes/profiles/hermes2',
      source: 'wsl',
      status: 'unknown',
    })
    expect(JSON.stringify(instances)).not.toContain('api_key')
  })

  it('resolves requested instances with a default fallback', () => {
    const instances = buildHermesInstances({
      root: '/home/Raymone-Linux/.hermes',
      source: 'wsl',
      profiles: [
        { name: 'default', path: '/home/Raymone-Linux/.hermes' },
        {
          name: 'hermes2',
          path: '/home/Raymone-Linux/.hermes/profiles/hermes2',
        },
      ],
    })

    expect(resolveHermesInstance(instances, 'hermes2').id).toBe('hermes2')
    expect(resolveHermesInstance(instances, 'missing').id).toBe('default')
    expect(resolveHermesInstance(instances, '').id).toBe('default')
  })
})
