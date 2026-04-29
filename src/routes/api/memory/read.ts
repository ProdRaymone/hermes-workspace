import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  buildMemoryScopeForInstance,
  buildMemoryScopePayload,
  readMemoryFileForScope,
} from '../../../server/memory-browser'

export const Route = createFileRoute('/api/memory/read')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const pathParam = url.searchParams.get('path') || ''
        const instance = await resolveRequestHermesInstance(request)
        const scope = buildMemoryScopeForInstance(instance)

        try {
          const content = await readMemoryFileForScope(pathParam, scope)
          return json({
            path: pathParam,
            content,
            scope: buildMemoryScopePayload(scope),
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to read memory file'
          const status =
            /not allowed|outside workspace|outside profile|required|traversal/i.test(
              message,
            )
              ? 400
              : /ENOENT|no such file/i.test(message)
                ? 404
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
