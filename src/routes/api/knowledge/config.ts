import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  buildKnowledgeScopeForInstance,
  buildKnowledgeScopePayload,
  readKnowledgeBaseConfigForScope,
  writeKnowledgeBaseConfigForScope,
} from '../../../server/knowledge-browser'
import type { KnowledgeBaseConfig } from '../../../server/knowledge-config'

export const Route = createFileRoute('/api/knowledge/config')({
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
            config: await readKnowledgeBaseConfigForScope(scope),
            scope: buildKnowledgeScopePayload(scope),
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to read knowledge base config'
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
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const instance = await resolveRequestHermesInstance(request)
        const scope = buildKnowledgeScopeForInstance(instance)
        try {
          const body = (await request.json()) as Partial<KnowledgeBaseConfig>
          const current = await readKnowledgeBaseConfigForScope(scope)
          const next: KnowledgeBaseConfig = {
            source: body.source ?? current.source,
          }
          const config = await writeKnowledgeBaseConfigForScope(scope, next)
          return json({ config, scope: buildKnowledgeScopePayload(scope) })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to save knowledge base config'
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
