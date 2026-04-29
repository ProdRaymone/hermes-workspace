import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { resolveRequestHermesInstance } from '../../server/hermes-instances'
import { patchConfigHelperForInstance } from '../../server/config-helper-scope'

export const Route = createFileRoute('/api/config-patch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const instance = await resolveRequestHermesInstance(request)
          const body = (await request.json().catch(() => ({}))) as unknown
          return json(await patchConfigHelperForInstance(instance, body))
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
