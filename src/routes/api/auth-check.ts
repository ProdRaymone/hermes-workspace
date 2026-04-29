import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthenticated,
  isPasswordProtectionEnabled,
} from '../../server/auth-middleware'
import type { InstanceCapabilities } from '../../server/hermes-instance-api'
import {
  getRequestInstanceId,
  resolveRequestHermesInstance,
} from '../../server/hermes-instances'
import { probeInstanceCapabilities } from '../../server/hermes-instance-api'
import { isDefaultHermesInstance } from '../../lib/hermes-instance-scope'

type AuthReachabilityCaps = Pick<
  InstanceCapabilities,
  'health' | 'chatCompletions' | 'models'
>

export function isAuthBackendReachable(caps: AuthReachabilityCaps): boolean {
  return caps.health || caps.chatCompletions || caps.models
}

export function shouldBlockWorkspaceForUnreachableAuthBackend(
  instanceId: string,
  reachable: boolean,
): boolean {
  return !reachable && isDefaultHermesInstance(instanceId)
}

export const Route = createFileRoute('/api/auth-check')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestedInstanceId = getRequestInstanceId(request)
        const authRequired = isPasswordProtectionEnabled()
        const authenticated = isAuthenticated(request)

        try {
          const instance = await resolveRequestHermesInstance(request)
          const caps = await probeInstanceCapabilities(instance)
          const reachable = isAuthBackendReachable(caps)

          if (
            shouldBlockWorkspaceForUnreachableAuthBackend(
              instance.id,
              reachable,
            )
          ) {
            return json(
              {
                authenticated: false,
                authRequired: false,
                backendReachable: false,
                instance: instance.id,
                error: 'hermes_agent_unreachable',
              },
              { status: 503 },
            )
          }

          return json({
            authenticated,
            authRequired,
            backendReachable: reachable,
            instance: instance.id,
            ...(reachable ? {} : { error: 'hermes_agent_unreachable' }),
          })
        } catch (error) {
          if (!isDefaultHermesInstance(requestedInstanceId)) {
            return json({
              authenticated,
              authRequired,
              backendReachable: false,
              instance: requestedInstanceId,
              error:
                error instanceof DOMException && error.name === 'AbortError'
                  ? 'hermes_agent_timeout'
                  : 'hermes_agent_unreachable',
            })
          }

          return json(
            {
              authenticated: false,
              authRequired: false,
              backendReachable: false,
              instance: requestedInstanceId,
              error:
                error instanceof DOMException && error.name === 'AbortError'
                  ? 'hermes_agent_timeout'
                  : 'hermes_agent_unreachable',
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
