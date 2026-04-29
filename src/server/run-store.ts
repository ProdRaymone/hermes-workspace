import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  isDefaultHermesInstance,
  normalizeHermesInstanceId,
} from '../lib/hermes-instance-scope'

export type PersistedRunToolCall = {
  id: string
  name: string
  phase: string
  args?: unknown
  preview?: string
  result?: string
}

export type PersistedRunLifecycleEvent = {
  text: string
  emoji: string
  timestamp: number
  isError: boolean
}

export type PersistedRunState = {
  runId: string
  sessionKey: string
  instanceId?: string
  friendlyId: string
  status: 'accepted' | 'active' | 'handoff' | 'stalled' | 'complete' | 'error'
  createdAt: number
  updatedAt: number
  lastEventAt: number
  assistantText: string
  thinkingText: string
  toolCalls: Array<PersistedRunToolCall>
  lifecycleEvents: Array<PersistedRunLifecycleEvent>
  errorMessage?: string
}

const RUNS_ROOT = path.join(homedir(), '.hermes', 'webui-mvp', 'runs')

function encodeSessionKey(sessionKey: string): string {
  return encodeURIComponent(sessionKey || 'main')
}

function encodeInstanceId(instanceId?: string | null): string {
  return encodeURIComponent(normalizeHermesInstanceId(instanceId))
}

export function getRunStoreSessionDir(
  sessionKey: string,
  instanceId?: string | null,
): string {
  if (isDefaultHermesInstance(instanceId)) {
    return path.join(RUNS_ROOT, encodeSessionKey(sessionKey))
  }
  return path.join(
    RUNS_ROOT,
    'instances',
    encodeInstanceId(instanceId),
    encodeSessionKey(sessionKey),
  )
}

function sessionDir(sessionKey: string, instanceId?: string | null): string {
  return getRunStoreSessionDir(sessionKey, instanceId)
}

function runPath(
  sessionKey: string,
  runId: string,
  instanceId?: string | null,
): string {
  return path.join(sessionDir(sessionKey, instanceId), `${runId}.json`)
}

function legacySessionDir(sessionKey: string): string {
  return path.join(RUNS_ROOT, encodeSessionKey(sessionKey))
}

function legacyRunPath(sessionKey: string, runId: string): string {
  return path.join(legacySessionDir(sessionKey), `${runId}.json`)
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

async function writeRun(run: PersistedRunState): Promise<void> {
  const dir = sessionDir(run.sessionKey, run.instanceId)
  await ensureDir(dir)
  await writeFile(
    runPath(run.sessionKey, run.runId, run.instanceId),
    `${JSON.stringify(run, null, 2)}\n`,
    'utf8',
  )
}

export async function createPersistedRun(input: {
  runId: string
  sessionKey: string
  instanceId?: string
  friendlyId?: string
}): Promise<PersistedRunState> {
  const now = Date.now()
  const run: PersistedRunState = {
    runId: input.runId,
    sessionKey: input.sessionKey,
    ...(isDefaultHermesInstance(input.instanceId)
      ? {}
      : { instanceId: normalizeHermesInstanceId(input.instanceId) }),
    friendlyId: input.friendlyId || input.sessionKey,
    status: 'accepted',
    createdAt: now,
    updatedAt: now,
    lastEventAt: now,
    assistantText: '',
    thinkingText: '',
    toolCalls: [],
    lifecycleEvents: [],
  }
  await writeRun(run)
  return run
}

export async function getPersistedRun(
  sessionKey: string,
  runId: string,
  instanceId?: string | null,
): Promise<PersistedRunState | null> {
  try {
    const raw = await readFile(runPath(sessionKey, runId, instanceId), 'utf8')
    return JSON.parse(raw) as PersistedRunState
  } catch {
    if (!isDefaultHermesInstance(instanceId)) return null
    try {
      const raw = await readFile(legacyRunPath(sessionKey, runId), 'utf8')
      return JSON.parse(raw) as PersistedRunState
    } catch {
      return null
    }
  }
}

async function readRunsFromDir(dir: string): Promise<Array<PersistedRunState>> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json'))
  if (files.length === 0) return []
  const runs = await Promise.all(
    files.map(async (name) => {
      try {
        const raw = await readFile(path.join(dir, name), 'utf8')
        return JSON.parse(raw) as PersistedRunState
      } catch {
        return null
      }
    }),
  )
  return runs.filter((run): run is PersistedRunState => Boolean(run))
}

function latestActiveRun(
  runs: Array<PersistedRunState>,
): PersistedRunState | null {
  const candidates = runs
    .filter((run): run is PersistedRunState => Boolean(run))
    .filter((run) => !['complete', 'error'].includes(run.status))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return candidates[0] ?? null
}

async function getActiveRunFromDir(
  dir: string,
): Promise<PersistedRunState | null> {
  try {
    return latestActiveRun(await readRunsFromDir(dir))
  } catch {
    return null
  }
}

export async function updatePersistedRun(
  sessionKey: string,
  runId: string,
  updater: (run: PersistedRunState) => PersistedRunState,
  instanceId?: string | null,
): Promise<PersistedRunState | null> {
  const current = await getPersistedRun(sessionKey, runId, instanceId)
  if (!current) return null
  const next = updater(current)
  next.updatedAt = Date.now()
  await writeRun(next)
  return next
}

export async function appendRunText(
  sessionKey: string,
  runId: string,
  text: string,
  options?: { replace?: boolean },
  instanceId?: string | null,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status: 'active',
    lastEventAt: Date.now(),
    assistantText: options?.replace ? text : `${run.assistantText}${text}`,
  }), instanceId)
}

export async function setRunThinking(
  sessionKey: string,
  runId: string,
  thinkingText: string,
  instanceId?: string | null,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status: 'active',
    lastEventAt: Date.now(),
    thinkingText,
  }), instanceId)
}

export async function upsertRunToolCall(
  sessionKey: string,
  runId: string,
  toolCall: PersistedRunToolCall,
  instanceId?: string | null,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => {
    const nextToolCalls = [...run.toolCalls]
    const idx = nextToolCalls.findIndex((entry) => entry.id === toolCall.id)
    if (idx >= 0) nextToolCalls[idx] = { ...nextToolCalls[idx], ...toolCall }
    else nextToolCalls.push(toolCall)
    return {
      ...run,
      status: toolCall.phase === 'error' ? 'error' : 'active',
      lastEventAt: Date.now(),
      toolCalls: nextToolCalls,
      ...(toolCall.phase === 'error' && toolCall.result
        ? { errorMessage: toolCall.result }
        : {}),
    }
  }, instanceId)
}

export async function addRunLifecycleEvent(
  sessionKey: string,
  runId: string,
  event: PersistedRunLifecycleEvent,
  instanceId?: string | null,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    lastEventAt: Date.now(),
    lifecycleEvents: [...run.lifecycleEvents, event].slice(-40),
  }), instanceId)
}

export async function markRunStatus(
  sessionKey: string,
  runId: string,
  status: PersistedRunState['status'],
  errorMessage?: string,
  instanceId?: string | null,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status,
    lastEventAt: Date.now(),
    ...(errorMessage ? { errorMessage } : {}),
  }), instanceId)
}

export async function getActiveRunForSession(
  sessionKey: string,
  instanceId?: string | null,
): Promise<PersistedRunState | null> {
  return getActiveRunFromDir(sessionDir(sessionKey, instanceId))
}
