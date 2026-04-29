import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  buildKnowledgeScopeForInstance,
  buildKnowledgeScopePayload,
  readKnowledgeBaseConfigForScope,
  syncKnowledgeSourceForScope,
  writeKnowledgeBaseConfigForScope,
} from '../../../server/knowledge-browser'
import type { KnowledgeBaseConfig } from '../../../server/knowledge-config'

export const Route = createFileRoute('/api/knowledge/sync')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const instance = await resolveRequestHermesInstance(request)
        const scope = buildKnowledgeScopeForInstance(instance)

        // Optional: allow body to override source temporarily for one-shot use
        let config: Partial<KnowledgeBaseConfig> | null = null
        try {
          const text = await request.text()
          if (text) {
            config = JSON.parse(text)
          }
        } catch {
          // ignore parse errors, use stored config
        }

        try {
          if (config) {
            const current = await readKnowledgeBaseConfigForScope(scope)
            await writeKnowledgeBaseConfigForScope(scope, {
              source: config.source ?? current.source,
            })
          }

          const result = await syncKnowledgeSourceForScope(scope)
          return json({ ...result, scope: buildKnowledgeScopePayload(scope) })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to sync knowledge source'
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
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const instance = await resolveRequestHermesInstance(request)
        const scope = buildKnowledgeScopeForInstance(instance)
        try {
          const config = await readKnowledgeBaseConfigForScope(scope)
          return json({
            source: config.source,
            scope: buildKnowledgeScopePayload(scope),
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to read knowledge source'
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
