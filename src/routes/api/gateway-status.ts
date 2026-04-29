import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../server/hermes-instances'
import {
  getInstanceChatMode,
  probeInstanceCapabilities,
} from '../../server/hermes-instance-api'

export const Route = createFileRoute('/api/gateway-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const instance = await resolveRequestHermesInstance(request)
        const capabilities = await probeInstanceCapabilities(instance)
        const chatMode = getInstanceChatMode(capabilities)
        return json({
          capabilities,
          mode:
            chatMode === 'enhanced-hermes'
              ? 'enhanced-fork'
              : chatMode === 'portable'
                ? 'portable'
                : 'disconnected',
          hermesUrl: instance.gatewayUrl,
          dashboardUrl: '',
          instance: instance.id,
          gateway: {
            available: capabilities.health || capabilities.chatCompletions,
            url: instance.gatewayUrl,
          },
          dashboard: {
            available: false,
            url: '',
          },
        })
      },
    },
  },
})
