import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { readProfileFile, writeProfileFile } from './profile-files'
import { redactSecretValues } from './secret-redaction'
import type { HermesInstance } from './hermes-instances'
import type { ProfileFileOptions } from './profile-files'

export type HermesConfigScopeKind =
  | 'workspace-local'
  | 'wsl-profile'
  | 'unsupported-profile'

export type HermesConfigScope = {
  instance: string
  label: string
  profile: string
  profilePath: string
  root: string
  configPath: string
  envPath: string
  kind: HermesConfigScopeKind
}

export type HermesConfigScopePayload = {
  instance: string
  label: string
  profile: string
  profilePath: string
  kind: 'legacy-default' | 'instance-scoped' | 'profile-files-unavailable'
  storage: HermesConfigScopeKind
}

type HermesConfigScopeOptions = Pick<ProfileFileOptions, 'executor'>

type HermesProvider = {
  id: string
  name: string
  authType: 'oauth' | 'api_key' | 'none'
  envKeys: Array<string>
}

export type HermesProviderStatus = HermesProvider & {
  configured: boolean
  authSource: string
  maskedKeys: Record<string, string>
}

export type HermesConfigState = {
  config: Record<string, unknown>
  providers: Array<HermesProviderStatus>
  activeProvider: string
  activeModel: string
  hermesHome: string
  scope: HermesConfigScopePayload
}

export const HERMES_CONFIG_PROVIDERS: Array<HermesProvider> = [
  { id: 'nous', name: 'Nous Portal', authType: 'oauth', envKeys: [] },
  { id: 'openai-codex', name: 'OpenAI Codex', authType: 'oauth', envKeys: [] },
  {
    id: 'anthropic',
    name: 'Anthropic',
    authType: 'api_key',
    envKeys: ['ANTHROPIC_API_KEY'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    authType: 'api_key',
    envKeys: ['OPENROUTER_API_KEY'],
  },
  {
    id: 'zai',
    name: 'Z.AI / GLM',
    authType: 'api_key',
    envKeys: ['GLM_API_KEY'],
  },
  {
    id: 'kimi-coding',
    name: 'Kimi / Moonshot',
    authType: 'api_key',
    envKeys: ['KIMI_API_KEY'],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    authType: 'api_key',
    envKeys: ['MINIMAX_API_KEY'],
  },
  {
    id: 'minimax-cn',
    name: 'MiniMax (China)',
    authType: 'api_key',
    envKeys: ['MINIMAX_CN_API_KEY'],
  },
  {
    id: 'xiaomi',
    name: 'Xiaomi MiMo',
    authType: 'api_key',
    envKeys: ['XIAOMI_API_KEY'],
  },
  { id: 'ollama', name: 'Ollama (Local)', authType: 'none', envKeys: [] },
  {
    id: 'atomic-chat',
    name: 'Atomic Chat (Local)',
    authType: 'none',
    envKeys: [],
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-compatible',
    authType: 'api_key',
    envKeys: [],
  },
]

function getLegacyHermesHome(): string {
  return path.join(os.homedir(), '.hermes')
}

function joinWslPath(...parts: Array<string>): string {
  return path.posix.join(...parts.filter(Boolean))
}

export function buildHermesConfigScopeForInstance(
  instance: Pick<
    HermesInstance,
    'id' | 'label' | 'profileName' | 'profilePath' | 'source' | 'isDefault'
  >,
): HermesConfigScope {
  if (instance.isDefault || instance.id === 'default') {
    const root = getLegacyHermesHome()
    return {
      instance: 'default',
      label: instance.label || 'Hermes 1',
      profile: instance.profileName || 'default',
      profilePath: instance.profilePath || root,
      root,
      configPath: path.join(root, 'config.yaml'),
      envPath: path.join(root, '.env'),
      kind: 'workspace-local',
    }
  }

  if (instance.source === 'wsl') {
    const root = instance.profilePath
    return {
      instance: instance.id,
      label: instance.label,
      profile: instance.profileName || instance.id,
      profilePath: root,
      root,
      configPath: joinWslPath(root, 'config.yaml'),
      envPath: joinWslPath(root, '.env'),
      kind: 'wsl-profile',
    }
  }

  const root = instance.profilePath
  return {
    instance: instance.id,
    label: instance.label,
    profile: instance.profileName || instance.id,
    profilePath: root,
    root,
    configPath: joinWslPath(root, 'config.yaml'),
    envPath: joinWslPath(root, '.env'),
    kind: 'unsupported-profile',
  }
}

export function buildHermesConfigScopePayload(
  scope: HermesConfigScope,
): HermesConfigScopePayload {
  return {
    instance: scope.instance,
    label: scope.label,
    profile: scope.profile,
    profilePath: scope.profilePath,
    kind:
      scope.kind === 'workspace-local'
        ? 'legacy-default'
        : scope.kind === 'unsupported-profile'
          ? 'profile-files-unavailable'
          : 'instance-scoped',
    storage: scope.kind,
  }
}

export function isLegacyDefaultHermesConfigScope(
  scope: HermesConfigScope,
): boolean {
  return scope.kind === 'workspace-local'
}

function ensureWslHermesConfigScope(scope: HermesConfigScope) {
  if (scope.kind === 'unsupported-profile') {
    throw new Error(
      'Profile Hermes config files are unavailable for non-WSL Hermes profiles.',
    )
  }
  if (scope.kind !== 'wsl-profile') {
    throw new Error('WSL Hermes config scope is required')
  }
}

function parseConfigYaml(raw: string): Record<string, unknown> {
  try {
    const parsed = YAML.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function readLocalConfig(configPath: string): Record<string, unknown> {
  try {
    return parseConfigYaml(fs.readFileSync(configPath, 'utf-8'))
  } catch {
    return {}
  }
}

function writeLocalConfig(
  scope: HermesConfigScope,
  config: Record<string, unknown>,
) {
  fs.mkdirSync(scope.root, { recursive: true })
  fs.writeFileSync(scope.configPath, YAML.stringify(config), 'utf-8')
}

function parseEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx <= 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function readLocalEnv(envPath: string): Record<string, string> {
  try {
    return parseEnv(fs.readFileSync(envPath, 'utf-8'))
  } catch {
    return {}
  }
}

function serializeEnv(env: Record<string, string>): string {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`
}

function writeLocalEnv(scope: HermesConfigScope, env: Record<string, string>) {
  fs.mkdirSync(scope.root, { recursive: true })
  fs.writeFileSync(scope.envPath, serializeEnv(env), 'utf-8')
}

function isMissingProfileFileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /ENOENT|no such file|not found/i.test(message)
}

export async function readHermesConfigForScope(
  scope: HermesConfigScope,
  options: HermesConfigScopeOptions = {},
): Promise<Record<string, unknown>> {
  if (scope.kind === 'workspace-local') return readLocalConfig(scope.configPath)
  ensureWslHermesConfigScope(scope)

  try {
    const file = await readProfileFile(scope.root, 'config.yaml', {
      executor: options.executor,
      extension: '.yaml',
    })
    return parseConfigYaml(file.content || '')
  } catch (error) {
    if (isMissingProfileFileError(error)) return {}
    throw error
  }
}

export async function writeHermesConfigForScope(
  scope: HermesConfigScope,
  config: Record<string, unknown>,
  options: HermesConfigScopeOptions = {},
): Promise<void> {
  if (scope.kind === 'workspace-local') {
    writeLocalConfig(scope, config)
    return
  }
  ensureWslHermesConfigScope(scope)
  await writeProfileFile(scope.root, 'config.yaml', YAML.stringify(config), {
    executor: options.executor,
    extension: '.yaml',
  })
}

export async function readHermesEnvForScope(
  scope: HermesConfigScope,
  options: HermesConfigScopeOptions = {},
): Promise<Record<string, string>> {
  if (scope.kind === 'workspace-local') return readLocalEnv(scope.envPath)
  ensureWslHermesConfigScope(scope)

  try {
    const file = await readProfileFile(scope.root, '.env', {
      executor: options.executor,
      extension: '.env',
    })
    return parseEnv(file.content)
  } catch (error) {
    if (isMissingProfileFileError(error)) return {}
    throw error
  }
}

export async function writeHermesEnvForScope(
  scope: HermesConfigScope,
  env: Record<string, string>,
  options: HermesConfigScopeOptions = {},
): Promise<void> {
  if (scope.kind === 'workspace-local') {
    writeLocalEnv(scope, env)
    return
  }
  ensureWslHermesConfigScope(scope)
  await writeProfileFile(scope.root, '.env', serializeEnv(env), {
    executor: options.executor,
    extension: '.env',
  })
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return '***'
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

function checkAuthStore(
  scope: HermesConfigScope,
  providerId: string,
): { hasToken: boolean; source: string; maskedKey?: string } {
  if (scope.kind !== 'workspace-local') return { hasToken: false, source: '' }

  for (const storePath of [
    path.join(os.homedir(), '.hermes', 'auth-profiles.json'),
    path.join(
      os.homedir(),
      '.openclaw',
      'agents',
      'main',
      'agent',
      'auth-profiles.json',
    ),
  ]) {
    try {
      if (!fs.existsSync(storePath)) continue
      const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      const profiles = store?.profiles || {}
      for (const [key, value] of Object.entries(profiles)) {
        if (!key.startsWith(`${providerId}:`)) continue
        if (typeof value !== 'object' || value === null) continue
        const profile = value as Record<string, unknown>
        const token = String(
          profile.token || profile.key || profile.access || '',
        ).trim()
        if (token) {
          return {
            hasToken: true,
            source: storePath.includes('.hermes')
              ? 'hermes-auth-store'
              : 'openclaw-auth-store',
            maskedKey: maskKey(token),
          }
        }
      }
    } catch {
      // Ignore malformed local auth stores, matching legacy route behavior.
    }
  }
  return { hasToken: false, source: '' }
}

function buildProviderStatus(
  scope: HermesConfigScope,
  env: Record<string, string>,
): Array<HermesProviderStatus> {
  return HERMES_CONFIG_PROVIDERS.map((provider) => {
    const hasEnvKey =
      provider.envKeys.length === 0 ||
      provider.envKeys.some((key) => Boolean(env[key]))
    const authStoreCheck = checkAuthStore(scope, provider.id)
    const hasKey =
      hasEnvKey || authStoreCheck.hasToken || provider.authType === 'none'
    const maskedKeys: Record<string, string> = {}
    for (const key of provider.envKeys) {
      if (env[key]) maskedKeys[key] = maskKey(env[key])
    }
    if (authStoreCheck.hasToken && authStoreCheck.maskedKey) {
      maskedKeys['auth-store'] = authStoreCheck.maskedKey
    }
    return {
      ...provider,
      configured: hasKey,
      authSource: authStoreCheck.hasToken
        ? authStoreCheck.source
        : hasEnvKey
          ? 'env'
          : 'none',
      maskedKeys,
    }
  })
}

function getActiveModelConfig(config: Record<string, unknown>): {
  activeProvider: string
  activeModel: string
} {
  const modelField = config.model
  if (typeof modelField === 'string') {
    return {
      activeModel: modelField,
      activeProvider: (config.provider as string) || '',
    }
  }
  if (modelField && typeof modelField === 'object') {
    const modelObj = modelField as Record<string, unknown>
    return {
      activeModel: (modelObj.default as string) || '',
      activeProvider:
        (modelObj.provider as string) || (config.provider as string) || '',
    }
  }
  return { activeModel: '', activeProvider: '' }
}

export async function readHermesConfigStateForScope(
  scope: HermesConfigScope,
  options: HermesConfigScopeOptions = {},
): Promise<HermesConfigState> {
  const config = await readHermesConfigForScope(scope, options)
  const env = await readHermesEnvForScope(scope, options)
  const { activeProvider, activeModel } = getActiveModelConfig(config)

  return {
    config: redactSecretValues(config) as Record<string, unknown>,
    providers: buildProviderStatus(scope, env),
    activeProvider,
    activeModel,
    hermesHome: scope.root,
    scope: buildHermesConfigScopePayload(scope),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(source)) {
    if (isRecord(value) && isRecord(target[key])) {
      deepMerge(target[key], value)
    } else {
      target[key] = value
    }
  }
}

export async function patchHermesConfigForScope(
  scope: HermesConfigScope,
  body: Record<string, unknown>,
  options: HermesConfigScopeOptions = {},
): Promise<void> {
  if (isRecord(body.config)) {
    const current = await readHermesConfigForScope(scope, options)
    const updates = { ...body.config }

    for (const [key, value] of Object.entries(updates)) {
      if (value === null) {
        delete current[key]
        delete updates[key]
      }
    }

    deepMerge(current, updates)
    await writeHermesConfigForScope(scope, current, options)
  }

  if (isRecord(body.env)) {
    const currentEnv = await readHermesEnvForScope(scope, options)
    for (const [key, value] of Object.entries(body.env)) {
      if (value === '' || value === null) {
        delete currentEnv[key]
      } else {
        currentEnv[key] = String(value)
      }
    }
    await writeHermesEnvForScope(scope, currentEnv, options)
  }
}
