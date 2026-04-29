import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isSyntheticSessionKey } from '../../server/session-utils'
import { isAuthenticated } from '@/server/auth-middleware'
import { resolveRequestHermesInstance } from '../../server/hermes-instances'
import {
  getInstanceConfig,
  getInstanceSession,
  listInstanceSessions,
  probeInstanceCapabilities,
} from '../../server/hermes-instance-api'

export const Route = createFileRoute('/api/session-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const instance = await resolveRequestHermesInstance(request)
          const capabilities = await probeInstanceCapabilities(instance)
          if (!capabilities.sessions) {
            return json({
              ok: true,
              payload: {
                status: 'idle',
                sessionKey: 'new',
                sessionLabel: '',
                model: instance.model || '',
                modelProvider: instance.provider || '',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                sessions: [],
                instance: instance.id,
              },
            })
          }
          const url = new URL(request.url)
          const requestedKey = url.searchParams.get('sessionKey')?.trim() || ''
          let sessionKey = requestedKey || 'new'

          if (sessionKey === 'new') {
            return json({
              ok: true,
              payload: {
                status: 'idle',
                sessionKey: 'new',
                sessionLabel: '',
                model: instance.model || '',
                modelProvider: instance.provider || '',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                sessions: [],
                instance: instance.id,
              },
            })
          }

          if (isSyntheticSessionKey(sessionKey)) {
            const sessions = await listInstanceSessions(instance, 1, 0)
            if (sessions.length === 0) {
              return json({
                ok: true,
                payload: {
                  status: 'idle',
                  sessionKey: 'new',
                  sessionLabel: '',
                  model: instance.model || '',
                  modelProvider: instance.provider || '',
                  inputTokens: 0,
                  outputTokens: 0,
                  totalTokens: 0,
                  sessions: [],
                  instance: instance.id,
                },
              })
            }
            sessionKey = sessions[0].id
          }

          const session = await getInstanceSession(instance, sessionKey)
          const config = capabilities.config
            ? await getInstanceConfig(instance)
            : ({
                model: instance.model || '',
                provider: instance.provider || '',
              } as const)

          const inputTokens = session.input_tokens ?? 0
          const outputTokens = session.output_tokens ?? 0

          return json({
            ok: true,
            payload: {
              status: session.ended_at ? 'ended' : 'idle',
              sessionKey: session.id,
              sessionLabel: session.title ?? '',
              model: session.model ?? config.model ?? '',
              modelProvider: config.provider ?? '',
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
              instance: instance.id,
              sessions: [
                {
                  key: session.id,
                  agentId: session.id,
                  label: session.title ?? session.id,
                  model: session.model ?? config.model ?? '',
                  modelProvider: config.provider ?? '',
                  updatedAt: session.last_active ?? session.started_at ?? 0,
                  usage: {
                    input: inputTokens,
                    output: outputTokens,
                  },
                },
              ],
            },
          })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
