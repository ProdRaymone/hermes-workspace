import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  buildKnowledgeScopeForInstance,
  buildKnowledgeScopePayload,
  readKnowledgePageForScope,
} from '../../../server/knowledge-browser'

export const Route = createFileRoute('/api/knowledge/read')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const pathParam = url.searchParams.get('path') || ''
        const instance = await resolveRequestHermesInstance(request)
        const scope = buildKnowledgeScopeForInstance(instance)

        try {
          const { meta, content, backlinks } = await readKnowledgePageForScope(
            pathParam,
            scope,
          )
          return json({
            page: meta,
            content,
            backlinks,
            scope: buildKnowledgeScopePayload(scope),
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to read knowledge page'
          const status =
            /not allowed|outside knowledge root|required|traversal/i.test(
              message,
            )
              ? 400
              : /ENOENT/.test(message)
                ? 404
                : /unavailable/i.test(message)
                  ? 503
                  : 500
          return json(
            { error: message, scope: buildKnowledgeScopePayload(scope) },
            { status },
          )
        }
      },
    },
  },
})
