import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import { readHermesInstanceStartLogSummary } from '../../../server/hermes-instance-start'
import { isDefaultHermesInstance } from '../../../lib/hermes-instance-scope'

export const Route = createFileRoute('/api/instances/start-log')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const instance = await resolveRequestHermesInstance(request)

          if (isDefaultHermesInstance(instance.id) || instance.isDefault) {
            return json(
              {
                ok: false,
                error:
                  'Start log summaries are only exposed for non-default Hermes profiles.',
              },
              { status: 403 },
            )
          }

          const summary = await readHermesInstanceStartLogSummary(instance)

          return json({
            ok: true,
            instance: instance.id,
            port: instance.port,
            logPath: `${instance.profilePath}/logs/workspace-start.log`,
            summary,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to read Hermes start log summary',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
