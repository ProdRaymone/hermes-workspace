import { createFileRoute } from '@tanstack/react-router'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../server/hermes-instances'
import { probeInstanceCapabilities } from '../../server/hermes-instance-api'

type PingResponse = {
  ok: boolean
  error?: string
  status?: number
  hermesUrl: string
}

export const Route = createFileRoute('/api/ping')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return Response.json(
            {
              ok: false,
              error: 'Authentication required',
              status: 401,
              hermesUrl: '',
            } satisfies PingResponse,
            { status: 401 },
          )
        }

        const instance = await resolveRequestHermesInstance(request)
        const caps = await probeInstanceCapabilities(instance)
        if (!caps.health) {
          return Response.json(
            {
              ok: false,
              error: 'Hermes unavailable',
              status: 503,
              hermesUrl: instance.gatewayUrl,
            } satisfies PingResponse,
            { status: 503 },
          )
        }

        return Response.json(
          {
            ok: true,
            status: 200,
            hermesUrl: instance.gatewayUrl,
          } satisfies PingResponse,
          { status: 200 },
        )
      },
    },
  },
})
