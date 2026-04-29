import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  buildKnowledgeScopeForInstance,
  buildKnowledgeScopePayload,
  searchKnowledgePagesForScope,
} from '../../../server/knowledge-browser'

export const Route = createFileRoute('/api/knowledge/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const query = url.searchParams.get('q') || ''
        const instance = await resolveRequestHermesInstance(request)
        const scope = buildKnowledgeScopeForInstance(instance)

        try {
          return json({
            results: await searchKnowledgePagesForScope(query, scope),
            scope: buildKnowledgeScopePayload(scope),
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to search knowledge pages'
          const status = /unavailable/i.test(message) ? 503 : 500
          return json(
            {
              error: message,
              scope: buildKnowledgeScopePayload(scope),
            },
            { status },
          )
        }
      },
    },
  },
})
