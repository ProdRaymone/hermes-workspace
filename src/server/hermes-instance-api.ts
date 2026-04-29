import type { HermesInstance } from './hermes-instances'
import type { HermesConfig, HermesMessage, HermesSession } from './hermes-api'
import type { OpenAICompatMessage, StreamChunkType } from './openai-compat-api'

export type InstanceCapabilities = {
  health: boolean
  chatCompletions: boolean
  models: boolean
  streaming: boolean
  sessions: boolean
  skills: boolean
  config: boolean
  jobs: boolean
  memory: boolean
  dashboard: {
    available: boolean
    url: string
  }
}

export type InstanceModelEntry = {
  provider?: string
  id?: string
  name?: string
  [key: string]: unknown
}

type OpenAIChatOptions = {
  model?: string
  stream?: boolean
  temperature?: number
  signal?: AbortSignal
  sessionId?: string
}

const BEARER_TOKEN = process.env.HERMES_API_TOKEN || ''
const PROBE_TIMEOUT_MS = 1_500

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

function getResponseBody(
  response: Response,
): ReadableStream<Uint8Array> | null {
  return (response as { body?: ReadableStream<Uint8Array> | null }).body ?? null
}

function instanceUrl(instance: HermesInstance, path: string): string {
  return `${instance.gatewayUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeModel(entry: unknown): InstanceModelEntry | null {
  if (typeof entry === 'string') {
    const id = entry.trim()
    if (!id) return null
    return {
      id,
      name: id,
      provider: id.includes('/') ? id.split('/')[0] : 'unknown',
    }
  }

  const record = asRecord(entry)
  const id =
    readString(record.id) || readString(record.name) || readString(record.model)
  if (!id) return null

  return {
    ...record,
    id,
    name:
      readString(record.name) ||
      readString(record.display_name) ||
      readString(record.label) ||
      id,
    provider:
      readString(record.provider) ||
      readString(record.owned_by) ||
      (id.includes('/') ? id.split('/')[0] : 'unknown'),
  }
}

async function probe(instance: HermesInstance, path: string): Promise<boolean> {
  try {
    const response = await fetch(instanceUrl(instance, path), {
      headers: authHeaders(),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (response.status === 404 || response.status === 403) return false
    return true
  } catch {
    return false
  }
}

async function probeChatCompletions(
  instance: HermesInstance,
): Promise<boolean> {
  try {
    const response = await fetch(
      instanceUrl(instance, '/v1/chat/completions'),
      {
        method: 'GET',
        headers: authHeaders(),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      },
    )
    if (response.status === 405) return true
    if (response.status === 400 || response.status === 422) return true
    if (response.status === 404 || response.status === 403) return false
    return response.ok || response.status < 500
  } catch {
    return false
  }
}

export async function probeInstanceCapabilities(
  instance: HermesInstance,
): Promise<InstanceCapabilities> {
  const [health, chatCompletions, models, sessions, skills, config, jobs] =
    await Promise.all([
      probe(instance, '/health'),
      probeChatCompletions(instance),
      probe(instance, '/v1/models'),
      probe(instance, '/api/sessions'),
      probe(instance, '/api/skills'),
      probe(instance, '/api/config'),
      probe(instance, '/api/jobs'),
    ])

  return {
    health,
    chatCompletions,
    models,
    streaming: chatCompletions,
    sessions,
    skills,
    config,
    jobs,
    memory: true,
    dashboard: {
      available: false,
      url: '',
    },
  }
}

async function instanceJson<T>(
  instance: HermesInstance,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  for (const [key, value] of Object.entries(authHeaders())) {
    headers.set(key, value)
  }
  const response = await fetch(instanceUrl(instance, path), {
    ...init,
    headers,
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Hermes ${instance.id} ${path}: ${response.status} ${body}`)
  }
  return response.json() as Promise<T>
}

export async function fetchInstanceModels(
  instance: HermesInstance,
): Promise<Array<InstanceModelEntry>> {
  const response = await fetch(instanceUrl(instance, '/v1/models'), {
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Hermes models request failed (${response.status})`)
  }

  const payload = asRecord(await response.json())
  const rawModels = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : []

  return rawModels
    .map(normalizeModel)
    .filter((entry): entry is InstanceModelEntry => entry !== null)
}

export async function getInstanceConfig(
  instance: HermesInstance,
): Promise<HermesConfig> {
  return instanceJson<HermesConfig>(instance, '/api/config')
}

export async function listInstanceSessions(
  instance: HermesInstance,
  limit = 50,
  offset = 0,
): Promise<Array<HermesSession>> {
  const response = await instanceJson<{
    items?: Array<HermesSession>
    sessions?: Array<HermesSession>
  }>(instance, `/api/sessions?limit=${limit}&offset=${offset}`)
  return Array.isArray(response.items)
    ? response.items
    : Array.isArray(response.sessions)
      ? response.sessions
      : []
}

export async function getInstanceSession(
  instance: HermesInstance,
  sessionId: string,
): Promise<HermesSession> {
  const response = await instanceJson<{ session?: HermesSession }>(
    instance,
    `/api/sessions/${encodeURIComponent(sessionId)}`,
  )
  return response.session ?? (response as unknown as HermesSession)
}

export async function createInstanceSession(
  instance: HermesInstance,
  opts?: {
    id?: string
    title?: string
    model?: string
  },
): Promise<HermesSession> {
  const response = await instanceJson<{ session: HermesSession }>(
    instance,
    '/api/sessions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts || {}),
    },
  )
  return response.session
}

export async function updateInstanceSession(
  instance: HermesInstance,
  sessionId: string,
  updates: { title?: string },
): Promise<HermesSession> {
  const response = await instanceJson<{ session: HermesSession }>(
    instance,
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    },
  )
  return response.session
}

export async function deleteInstanceSession(
  instance: HermesInstance,
  sessionId: string,
): Promise<void> {
  await instanceJson(
    instance,
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
    },
  )
}

export async function getInstanceMessages(
  instance: HermesInstance,
  sessionId: string,
): Promise<Array<HermesMessage>> {
  const response = await instanceJson<{
    items?: Array<HermesMessage>
    messages?: Array<HermesMessage>
  }>(instance, `/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  return Array.isArray(response.items)
    ? response.items
    : Array.isArray(response.messages)
      ? response.messages
      : []
}

export async function streamInstanceChat(
  instance: HermesInstance,
  sessionId: string,
  body: {
    message: string
    model?: string
    system_message?: string
    attachments?: Array<Record<string, unknown>>
  },
  opts: {
    signal?: AbortSignal
    onEvent: (payload: { event: string; data: Record<string, unknown> }) => void
  },
): Promise<void> {
  const response = await fetch(
    instanceUrl(
      instance,
      `/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`,
    ),
    {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    },
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Hermes ${instance.id} chat stream: ${response.status} ${text}`,
    )
  }

  const responseBody = getResponseBody(response)
  const reader = responseBody?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  let readResult = await reader.read()
  while (!readResult.done) {
    const { value } = readResult

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        const dataStr = line.slice(6)
        if (dataStr === '[DONE]') continue
        try {
          const data = JSON.parse(dataStr) as Record<string, unknown>
          opts.onEvent({ event: currentEvent || 'message', data })
        } catch {
          // skip malformed JSON
        }
      }
    }

    readResult = await reader.read()
  }
}

export function getInstanceChatMode(
  capabilities: InstanceCapabilities,
): 'enhanced-hermes' | 'portable' | 'disconnected' {
  if (capabilities.sessions) return 'enhanced-hermes'
  if (capabilities.chatCompletions || capabilities.health) return 'portable'
  return 'disconnected'
}

function buildOpenAIRequestBody(
  instance: HermesInstance,
  messages: Array<OpenAICompatMessage>,
  options: OpenAIChatOptions,
) {
  const model =
    options.model && options.model !== 'default'
      ? options.model
      : instance.model || process.env.HERMES_DEFAULT_MODEL || 'default'
  return {
    model,
    messages,
    stream: options.stream === true,
    temperature: options.temperature,
  }
}

async function* parseInstanceOpenAIStream(
  response: Response,
): AsyncGenerator<StreamChunkType, void, void> {
  const responseBody = getResponseBody(response)
  const reader = responseBody?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  let readResult = await reader.read()
  while (!readResult.done) {
    const { value } = readResult

    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      let eventName = ''
      const dataLines: Array<string> = []

      for (const line of rawEvent.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('event:')) {
          eventName = trimmed.slice(6).trim()
          continue
        }
        if (trimmed.startsWith('data:')) {
          dataLines.push(trimmed.slice(5).trim())
        }
      }

      for (const payload of dataLines) {
        if (!payload || payload === '[DONE]') continue

        if (eventName === 'hermes.tool.progress') {
          const toolChunk = parseHermesToolProgressChunk(payload)
          if (toolChunk) yield toolChunk
          continue
        }

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string | null
                reasoning?: string | null
                reasoning_content?: string | null
              }
            }>
          }
          const delta = parsed.choices?.[0]?.delta
          const content = delta?.content || ''
          const reasoning = delta?.reasoning || delta?.reasoning_content || ''
          if (content) yield { type: 'content', text: content }
          else if (reasoning) yield { type: 'reasoning', text: reasoning }
        } catch {
          // Ignore malformed chunks.
        }
      }

      boundary = buffer.indexOf('\n\n')
    }

    readResult = await reader.read()
  }
}

function parseHermesToolProgressChunk(payload: string): StreamChunkType | null {
  try {
    const parsed = JSON.parse(payload) as unknown
    const record =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    if (!record) return null
    const name = readString(record.tool) || readString(record.name) || 'tool'
    const emoji = readString(record.emoji)
    const labelText = readString(record.label)
    const label = [emoji, labelText].filter(Boolean).join(' ').trim()
    if (!label) return null
    return {
      type: 'tool',
      name,
      label,
    }
  } catch {
    return null
  }
}

export function openaiInstanceChat(
  instance: HermesInstance,
  messages: Array<OpenAICompatMessage>,
  options: OpenAIChatOptions & { stream: true },
): Promise<AsyncGenerator<StreamChunkType, void, void>>
export function openaiInstanceChat(
  instance: HermesInstance,
  messages: Array<OpenAICompatMessage>,
  options?: OpenAIChatOptions & { stream?: false },
): Promise<string>
export async function openaiInstanceChat(
  instance: HermesInstance,
  messages: Array<OpenAICompatMessage>,
  options: OpenAIChatOptions = {},
): Promise<string | AsyncGenerator<StreamChunkType, void, void>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  for (const [key, value] of Object.entries(authHeaders())) {
    headers[key] = value
  }
  if (options.sessionId && BEARER_TOKEN) {
    headers['X-Hermes-Session-Id'] = options.sessionId
  }

  const response = await fetch(instanceUrl(instance, '/v1/chat/completions'), {
    method: 'POST',
    headers,
    body: JSON.stringify(buildOpenAIRequestBody(instance, messages, options)),
    signal: options.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`OpenAI-compatible chat: ${response.status} ${text}`)
  }

  if (options.stream) {
    return parseInstanceOpenAIStream(response)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  return data.choices?.[0]?.message?.content ?? ''
}
