import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  buildKnowledgeGraphForScope,
  buildKnowledgeScopeForInstance,
  buildKnowledgeScopePayload,
} from '../../../server/knowledge-browser'

export const Route = createFileRoute('/api/knowledge/graph')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const instance = await resolveRequestHermesInstance(request)
        const scope = buildKnowledgeScopeForInstance(instance)

        try {
          return json({
            ...(await buildKnowledgeGraphForScope(scope)),
            scope: buildKnowledgeScopePayload(scope),
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to build knowledge graph'
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
