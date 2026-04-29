import { describe, expect, it, vi } from 'vitest'

import {
  buildHermesInstanceStartScript,
  diagnoseHermesStartFailure,
  readHermesInstanceStartLogSummary,
  redactHermesStartMessage,
  startHermesInstance,
  summarizeHermesStartLog,
} from './hermes-instance-start'
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

describe('hermes instance start', () => {
  it('refuses to start the default Hermes instance', async () => {
    const executor = vi.fn()

    const result = await startHermesInstance(
      instance({
        id: 'default',
        profileName: 'default',
        label: 'Hermes 1',
        profilePath: '/home/Raymone-Linux/.hermes',
        gatewayUrl: 'http://127.0.0.1:8642',
        port: 8642,
        isDefault: true,
      }),
      { executor },
    )

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('Hermes1'),
      diagnostic: {
        title: 'Hermes1/default start is blocked',
      },
    })
    expect(executor).not.toHaveBeenCalled()
  })

  it('builds a WSL launch script for only the selected profile and port', () => {
    const script = buildHermesInstanceStartScript(instance())

    expect(script).toContain("PROFILE='hermes2'")
    expect(script).toContain("API_SERVER_PORT='8643'")
    expect(script).toContain('workspace-start.log')
    expect(script).toContain('already in use before starting')
    expect(script).toContain('exited before the gateway became ready')
    expect(script).toContain('hermes -p \\"$PROFILE\\" gateway run --replace')
    expect(script).not.toContain('8642')
  })

  it('summarizes start logs with redaction and tail limits', () => {
    const apiKeyName = ['OPENAI', 'API', 'KEY'].join('_')
    const summary = summarizeHermesStartLog(
      [
        'line 1',
        `${apiKeyName}=super-secret`,
        'Authorization: Bearer live-token',
        'Hermes gateway failed to bind on 8643',
      ].join('\n'),
      { maxLines: 2 },
    )

    expect(summary.available).toBe(true)
    expect(summary.truncated).toBe(true)
    expect(summary.lines).toEqual([
      'Authorization: Bearer <redacted>',
      'Hermes gateway failed to bind on 8643',
    ])
    expect(JSON.stringify(summary)).not.toContain('super-secret')
    expect(JSON.stringify(summary)).not.toContain('live-token')
  })

  it('reads a redacted start-log summary for the selected WSL profile', async () => {
    const executor = vi.fn(async () => ({
      stdout: 'TELEGRAM_BOT_TOKEN=bot-secret\nListening on 8643',
      stderr: '',
    }))

    const summary = await readHermesInstanceStartLogSummary(instance(), {
      executor,
      maxLines: 5,
    })

    expect(summary).toMatchObject({
      available: true,
      lines: ['TELEGRAM_BOT_TOKEN=<redacted>', 'Listening on 8643'],
    })
    expect(JSON.stringify(summary)).not.toContain('bot-secret')
    expect(executor).toHaveBeenCalledWith(
      expect.stringContaining("PROFILE='hermes2'"),
    )
  })

  it('classifies port-conflict and immediate-exit start failures', () => {
    expect(
      diagnoseHermesStartFailure(
        'Port 8643 is already in use before starting Hermes 2.',
        8643,
      ),
    ).toMatchObject({
      code: 'port-conflict',
      title: 'Port 8643 is already in use',
    })

    expect(
      diagnoseHermesStartFailure(
        'Hermes instance exited before the gateway became ready.',
        8643,
      ),
    ).toMatchObject({
      code: 'immediate-exit',
      title: 'Hermes exited before becoming reachable',
    })
  })

  it('redacts secrets from command output before returning errors', async () => {
    const executor = vi.fn(async () => ({
      stdout: '',
      stderr:
        'API_SERVER_KEY=server-secret TELEGRAM_BOT_TOKEN=bot-secret bearer live-secret',
    }))

    const result = await startHermesInstance(instance(), { executor })

    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('server-secret')
    expect(JSON.stringify(result)).not.toContain('bot-secret')
    expect(JSON.stringify(result)).not.toContain('live-secret')
    expect(JSON.stringify(result)).toContain('<redacted>')
  })

  it('reports a failed start when the launch script detects an immediate exit', async () => {
    const executor = vi.fn(async () => ({
      stdout: '',
      stderr: 'Hermes instance exited before the gateway became ready.',
    }))

    const result = await startHermesInstance(instance(), { executor })

    expect(result).toMatchObject({
      ok: false,
      instance: 'hermes2',
      port: 8643,
      error: expect.stringContaining('exited before'),
      diagnostic: {
        code: 'immediate-exit',
      },
    })
  })

  it('returns port-conflict diagnostics and an optional redacted log summary on failed starts', async () => {
    const executor = vi.fn(async () => ({
      stdout: '',
      stderr: 'Port 8643 is already in use before starting Hermes 2.',
    }))
    const readStartLogSummary = vi.fn(async () =>
      summarizeHermesStartLog('API_SERVER_KEY=server-secret\nbind failed', {
        maxLines: 5,
      }),
    )

    const result = await startHermesInstance(instance(), {
      executor,
      readStartLogSummary,
    })

    expect(result).toMatchObject({
      ok: false,
      instance: 'hermes2',
      port: 8643,
      diagnostic: {
        code: 'port-conflict',
      },
      logSummary: {
        available: true,
        lines: ['API_SERVER_KEY=<redacted>', 'bind failed'],
      },
    })
    expect(JSON.stringify(result)).not.toContain('server-secret')
    expect(readStartLogSummary).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hermes2' }),
    )
  })

  it('re-probes unknown status before attempting a start', async () => {
    const executor = vi.fn()
    const probeInstance = vi.fn(async (current: HermesInstance) => ({
      ...current,
      status: 'running' as const,
    }))

    const result = await startHermesInstance(instance({ status: 'unknown' }), {
      executor,
      probeInstance,
    })

    expect(result).toMatchObject({
      ok: true,
      status: 'already-running',
      instance: 'hermes2',
    })
    expect(probeInstance).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hermes2' }),
    )
    expect(executor).not.toHaveBeenCalled()
  })

  it('reports starting after dispatching the selected non-default instance', async () => {
    const executor = vi.fn(async () => ({ stdout: 'STARTING', stderr: '' }))

    const result = await startHermesInstance(instance(), { executor })

    expect(result).toMatchObject({
      ok: true,
      instance: 'hermes2',
      port: 8643,
      status: 'starting',
    })
    expect(executor).toHaveBeenCalledWith(
      expect.stringContaining("PROFILE='hermes2'"),
    )
  })

  it('redacts common secret shapes in standalone messages', () => {
    const redacted = redactHermesStartMessage(
      'api_key: abc123\nAuthorization: Bearer xyz789\nTOKEN=secret-token',
    )

    expect(redacted).not.toContain('abc123')
    expect(redacted).not.toContain('xyz789')
    expect(redacted).not.toContain('secret-token')
    expect(redacted.match(/<redacted>/g)?.length).toBeGreaterThanOrEqual(3)
  })
})
