import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  buildMemoryScopeForInstance,
  buildMemoryScopePayload,
  listMemoryFilesForScope,
} from '../../../server/memory-browser'

export const Route = createFileRoute('/api/memory/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const instance = await resolveRequestHermesInstance(request)
        const scope = buildMemoryScopeForInstance(instance)

        try {
          return json({
            files: await listMemoryFilesForScope(scope),
            scope: buildMemoryScopePayload(scope),
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to list memory files'
          const status = /unavailable/i.test(message) ? 503 : 500
          return json(
            {
              error: message,
              scope: buildMemoryScopePayload(scope),
            },
            { status },
          )
        }
      },
    },
  },
})
