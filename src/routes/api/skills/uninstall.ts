import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { resolveRequestHermesInstance } from '../../../server/hermes-instances'
import {
  BEARER_TOKEN,
  HERMES_API,
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

export const Route = createFileRoute('/api/skills/uninstall')({
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
          }
          const name = (body.name || body.skillId || '').trim()
          if (!name) {
            return json(
              { ok: false, error: 'name or skillId required' },
              { status: 400 },
            )
          }

          const instance = await resolveRequestHermesInstance(request)
          scope = buildSkillsScopeForInstance(instance)
          if (!isLegacyDefaultSkillsScope(scope)) {
            const result = await postSkillActionToSelectedInstance(
              scope,
              '/api/skills/uninstall',
              { name },
            )
            return json(result as Record<string, unknown>)
          }

          const capabilities = await ensureGatewayProbed()
          if (capabilities.dashboard.available) {
            return json(
              {
                ok: false,
                error:
                  'Skill uninstall is only available on the legacy enhanced fork right now.',
              },
              { status: 501 },
            )
          }

          const response = await fetch(`${HERMES_API}/api/skills/uninstall`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders(),
            },
            body: JSON.stringify({ name }),
            signal: AbortSignal.timeout(30_000),
          })

          const result = await response.json()
          return json(result, { status: response.status })
        } catch (error) {
          return json(
            scope
              ? buildSkillsGatewayErrorPayload(
                  scope,
                  error,
                  'Failed to uninstall skill',
                )
              : {
                  ok: false,
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Failed to uninstall skill',
                },
            { status: statusForSelectedSkillsGatewayError(error) },
          )
        }
      },
    },
  },
})
