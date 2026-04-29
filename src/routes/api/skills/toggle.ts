import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  BEARER_TOKEN,
  HERMES_API,
  dashboardFetch,
  ensureGatewayProbed,
} from '../../../server/gateway-capabilities'
import {
  buildSkillsGatewayErrorPayload,
  buildSkillsScopeForInstance,
  isLegacyDefaultSkillsScope,
  postSkillActionToSelectedInstance,
  statusForSelectedSkillsGatewayError,
} from '../../../server/skills-gateway'

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

export const Route = createFileRoute('/api/skills/toggle')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let scope: ReturnType<typeof buildSkillsScopeForInstance> | null = null
        try {
          const body = (await request.json()) as {
            skillId?: string
            name?: string
            enabled?: boolean
          }
          const name = (body.name || body.skillId || '').trim()
          if (!name) {
            return json(
              { ok: false, error: 'name or skillId required' },
              { status: 400 },
            )
          }
          if (typeof body.enabled !== 'boolean') {
            return json(
              { ok: false, error: 'enabled (boolean) required' },
              { status: 400 },
            )
          }

          const instance = await resolveRequestHermesInstance(request)
          scope = buildSkillsScopeForInstance(instance)
          if (!isLegacyDefaultSkillsScope(scope)) {
            const result = await postSkillActionToSelectedInstance(
              scope,
              '/api/skills/toggle',
              {
                name,
                enabled: body.enabled,
              },
            )
            return json(result as Record<string, unknown>)
          }

          const capabilities = await ensureGatewayProbed()
          const response = capabilities.dashboard.available
            ? await dashboardFetch('/api/skills/toggle', {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  name,
                  enabled: body.enabled,
                }),
                signal: AbortSignal.timeout(15_000),
              })
            : await fetch(`${HERMES_API}/api/skills/toggle`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...authHeaders(),
                },
                body: JSON.stringify({
                  name,
                  enabled: body.enabled,
                }),
                signal: AbortSignal.timeout(15_000),
              })

          const result = await response.json()
          return json(result, { status: response.status })
        } catch (error) {
          return json(
            scope
              ? buildSkillsGatewayErrorPayload(
                  scope,
                  error,
                  'Failed to toggle skill',
                )
              : {
                  ok: false,
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Failed to toggle skill',
                },
            { status: statusForSelectedSkillsGatewayError(error) },
          )
        }
      },
    },
  },
})
