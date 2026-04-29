import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  SESSIONS_API_UNAVAILABLE_MESSAGE,
  toSessionSummary,
} from '../../../server/hermes-api'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  getInstanceSession,
  probeInstanceCapabilities,
} from '../../../server/hermes-instance-api'

export const Route = createFileRoute('/api/sessions/$sessionKey/status')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const instance = await resolveRequestHermesInstance(request)
        const capabilities = await probeInstanceCapabilities(instance)
        if (!capabilities.sessions) {
          return json(
            { ok: false, error: SESSIONS_API_UNAVAILABLE_MESSAGE },
            { status: 503 },
          )
        }

        const { sessionKey } = params

        if (!sessionKey || sessionKey.trim().length === 0) {
          return json(
            { ok: false, error: 'sessionKey required' },
            { status: 400 },
          )
        }

        try {
          const session = await getInstanceSession(instance, sessionKey)
          const result = toSessionSummary(session)
          return json({
            ok: true,
            status: result.status ?? 'idle',
            instance: instance.id,
            ...result,
          })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
