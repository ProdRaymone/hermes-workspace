import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  buildMcpConfigScopeForInstance,
  listMcpServersForScope,
} from '../../../server/mcp-config-scope'

export const Route = createFileRoute('/api/mcp/servers')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return Response.json({
            ok: false,
            error: 'Unauthorized',
          })
        }

        const instance = await resolveRequestHermesInstance(request)
        return Response.json(
          await listMcpServersForScope(
            buildMcpConfigScopeForInstance(instance),
          ),
        )
      },
    },
  },
})
