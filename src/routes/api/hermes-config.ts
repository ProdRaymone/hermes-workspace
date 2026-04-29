/**
 * Hermes Config API — read/write the active Hermes instance config.
 * Default Hermes keeps legacy Windows ~/.hermes semantics; non-default WSL
 * profiles read/write <profilePath>/config.yaml and <profilePath>/.env.
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureGatewayProbed,
  getCapabilities,
} from '../../server/gateway-capabilities'
import { resolveRequestHermesInstance } from '../../server/hermes-instances'
import {
  buildHermesConfigScopeForInstance,
  buildHermesConfigScopePayload,
  isLegacyDefaultHermesConfigScope,
  patchHermesConfigForScope,
  readHermesConfigStateForScope,
} from '../../server/hermes-config-scope'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'

type AuthResult = Response | true

export const Route = createFileRoute('/api/hermes-config')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authResult = isAuthenticated(request) as AuthResult
        if (authResult !== true) return authResult

        const instance = await resolveRequestHermesInstance(request)
        const scope = buildHermesConfigScopeForInstance(instance)

        if (isLegacyDefaultHermesConfigScope(scope)) {
          await ensureGatewayProbed()
          if (!getCapabilities().config) {
            return Response.json({
              ...createCapabilityUnavailablePayload('config'),
              config: {},
              providers: [],
              activeProvider: '',
              activeModel: '',
              hermesHome: scope.root,
              scope: buildHermesConfigScopePayload(scope),
            })
          }
        }

        try {
          return Response.json(await readHermesConfigStateForScope(scope))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const status =
            scope.kind === 'unsupported-profile' ||
            /unavailable|profile files/i.test(message)
              ? 503
              : 500
          return Response.json(
            { error: message, scope: buildHermesConfigScopePayload(scope) },
            { status },
          )
        }
      },

      PATCH: async ({ request }) => {
        const authResult = isAuthenticated(request) as AuthResult
        if (authResult !== true) return authResult

        const instance = await resolveRequestHermesInstance(request)
        const scope = buildHermesConfigScopeForInstance(instance)

        if (isLegacyDefaultHermesConfigScope(scope)) {
          await ensureGatewayProbed()
          if (!getCapabilities().config) {
            return new Response(
              JSON.stringify(
                createCapabilityUnavailablePayload('config', {
                  error:
                    'Configuration updates are unavailable on this backend.',
                  scope: buildHermesConfigScopePayload(scope),
                }),
              ),
              { status: 503, headers: { 'Content-Type': 'application/json' } },
            )
          }
        }

        try {
          const body = (await request.json()) as Record<string, unknown>
          await patchHermesConfigForScope(scope, body)
          return Response.json({
            ok: true,
            message: 'Config updated. Restart Hermes to apply changes.',
            scope: buildHermesConfigScopePayload(scope),
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const status =
            scope.kind === 'unsupported-profile' ||
            /unavailable|profile files/i.test(message)
              ? 503
              : 500
          return Response.json(
            {
              ok: false,
              error: message,
              scope: buildHermesConfigScopePayload(scope),
            },
            { status },
          )
        }
      },
    },
  },
})
