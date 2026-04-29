import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  buildMemoryScopeForInstance,
  buildMemoryScopePayload,
  writeMemoryFileForScope,
} from '../../../server/memory-browser'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/memory/write')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const instance = await resolveRequestHermesInstance(request)
        const scope = buildMemoryScopeForInstance(instance)

        try {
          const body = (await request.json().catch(() => ({}))) as {
            path?: unknown
            content?: unknown
          }
          if (typeof body.path !== 'string') {
            throw new Error('Path is required')
          }
          const content = typeof body.content === 'string' ? body.content : ''
          const result = await writeMemoryFileForScope(
            body.path,
            content,
            scope,
          )
          return json({
            success: true,
            path: result.path,
            scope: buildMemoryScopePayload(scope),
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to write memory file'
          const status =
            /required|absolute|traversal|outside workspace|outside profile|\.md/i.test(
              message,
            )
              ? 400
              : /unavailable/i.test(message)
                ? 503
                : 500
          return json(
            { error: message, scope: buildMemoryScopePayload(scope) },
            { status },
          )
        }
      },
    },
  },
})
