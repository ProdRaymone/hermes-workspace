import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  buildMemoryScopeForInstance,
  buildMemoryScopePayload,
  searchMemoryFilesForScope,
} from '../../../server/memory-browser'

export const Route = createFileRoute('/api/memory/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const query = url.searchParams.get('q') || ''
        const instance = await resolveRequestHermesInstance(request)
        const scope = buildMemoryScopeForInstance(instance)

        try {
          return json({
            results: await searchMemoryFilesForScope(query, scope),
            scope: buildMemoryScopePayload(scope),
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to search memory files'
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
