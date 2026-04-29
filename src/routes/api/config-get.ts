import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../server/hermes-instances'
import { readConfigHelperForInstance } from '../../server/config-helper-scope'

export const Route = createFileRoute('/api/config-get')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const instance = await resolveRequestHermesInstance(request)
          return json(await readConfigHelperForInstance(instance))
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
