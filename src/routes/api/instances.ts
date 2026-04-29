import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  getRequestInstanceId,
  listHermesInstancesWithStatus,
  resolveHermesInstance,
} from '../../server/hermes-instances'

export const Route = createFileRoute('/api/instances')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const instances = await listHermesInstancesWithStatus()
          const activeInstance = resolveHermesInstance(
            instances,
            getRequestInstanceId(request),
          )

          return json({
            ok: true,
            instances,
            activeInstance: activeInstance.id,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to list Hermes instances',
              instances: [],
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
