import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  redactHermesStartMessage,
  startHermesInstance,
} from '../../../server/hermes-instance-start'

export const Route = createFileRoute('/api/instances/start')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const instance = await resolveRequestHermesInstance(request)
          const result = await startHermesInstance(instance)
          return json(result, {
            status: result.ok ? 202 : instance.isDefault ? 403 : 400,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? redactHermesStartMessage(error.message)
                  : 'Failed to start Hermes instance',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
