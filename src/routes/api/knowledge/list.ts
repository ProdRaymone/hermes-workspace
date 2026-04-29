import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  buildKnowledgeScopeForInstance,
  buildKnowledgeScopePayload,
  getKnowledgeRootForScope,
  knowledgeRootExists,
  listKnowledgePagesForScope,
  readKnowledgeBaseConfigForScope,
} from '../../../server/knowledge-browser'

export const Route = createFileRoute('/api/knowledge/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const instance = await resolveRequestHermesInstance(request)
        const scope = buildKnowledgeScopeForInstance(instance)

        try {
          const config = await readKnowledgeBaseConfigForScope(scope)
          const source = config.source
          const pages = await listKnowledgePagesForScope(scope)
          const exists =
            scope.kind === 'workspace-local' ? knowledgeRootExists() : true
          return json({
            pages,
            exists,
            source,
            knowledgeRoot: await getKnowledgeRootForScope(scope),
            scope: buildKnowledgeScopePayload(scope),
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to list knowledge pages'
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
