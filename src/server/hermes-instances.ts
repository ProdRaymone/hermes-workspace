import { execFileSync } from 'node:child_process'

export type HermesInstanceSource = 'wsl' | 'fallback'
export type HermesInstanceStatus = 'running' | 'stopped' | 'unknown'

export type HermesProfileSnapshot = {
  name: string
  path: string
  model?: string
  provider?: string
}

export type HermesProfilesSnapshot = {
  root: string
  source: HermesInstanceSource
  profiles: Array<HermesProfileSnapshot>
}

export type HermesInstance = {
  id: string
  profileName: string
  label: string
  profilePath: string
  gatewayUrl: string
  port: number
  source: HermesInstanceSource
  isDefault: boolean
  model?: string
  provider?: string
  status: HermesInstanceStatus
}

const DEFAULT_GATEWAY_PORT = 8642
const INSTANCE_PROBE_TIMEOUT_MS = 1_000

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

export function normalizeHermesProfileName(name: string): string {
  const pathSafe = trimSlashes(name.trim().replace(/\\/g, '/'))
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('-')

  const normalized = pathSafe
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'default'
}

function toInstanceLabel(profileName: string): string {
  const normalized = normalizeHermesProfileName(profileName)
  if (normalized === 'default' || normalized === 'hermes1') return 'Hermes 1'
  const numbered = normalized.match(/^hermes-?(\d+)$/)
  if (numbered) return `Hermes ${numbered[1]}`
  return normalized
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function parsePortOverride(profileName: string): number | null {
  const normalized = normalizeHermesProfileName(profileName)
  const rawMap = process.env.HERMES_INSTANCE_PORTS || ''
  for (const entry of rawMap.split(',')) {
    const [rawKey, rawValue] = entry.split('=')
    const key = normalizeHermesProfileName(rawKey || '')
    const value = Number((rawValue || '').trim())
    if (key === normalized && Number.isInteger(value) && value > 0) {
      return value
    }
  }

  const envKey = `HERMES_INSTANCE_${normalized
    .replace(/-/g, '_')
    .toUpperCase()}_PORT`
  const direct = Number(process.env[envKey] || '')
  return Number.isInteger(direct) && direct > 0 ? direct : null
}

export function getDefaultGatewayPort(
  profileName: string,
  profileIndex: number,
): number {
  const override = parsePortOverride(profileName)
  if (override !== null) return override

  const normalized = normalizeHermesProfileName(profileName)
  if (normalized === 'default' || normalized === 'hermes1') {
    return DEFAULT_GATEWAY_PORT
  }

  const numbered = normalized.match(/^hermes-?(\d+)$/)
  if (numbered) {
    const profileNumber = Number(numbered[1])
    if (Number.isInteger(profileNumber) && profileNumber > 0) {
      return DEFAULT_GATEWAY_PORT + profileNumber - 1
    }
  }

  return DEFAULT_GATEWAY_PORT + Math.max(profileIndex, 0)
}

function sortProfiles(
  profiles: Array<HermesProfileSnapshot>,
): Array<HermesProfileSnapshot> {
  return [...profiles].sort((a, b) => {
    const aId = normalizeHermesProfileName(a.name)
    const bId = normalizeHermesProfileName(b.name)
    if (aId === 'default') return -1
    if (bId === 'default') return 1
    return aId.localeCompare(bId)
  })
}

export function buildHermesInstances(
  snapshot: HermesProfilesSnapshot,
): Array<HermesInstance> {
  const profiles = sortProfiles(snapshot.profiles)
  const seen = new Set<string>()
  const instances: Array<HermesInstance> = []

  profiles.forEach((profile, index) => {
    const id = normalizeHermesProfileName(profile.name)
    if (seen.has(id)) return
    seen.add(id)

    const port = getDefaultGatewayPort(profile.name, index)
    instances.push({
      id,
      profileName: profile.name,
      label: toInstanceLabel(profile.name),
      profilePath: profile.path,
      gatewayUrl: `http://127.0.0.1:${port}`,
      port,
      source: snapshot.source,
      isDefault: id === 'default',
      model: profile.model,
      provider: profile.provider,
      status: 'unknown',
    })
  })

  if (!seen.has('default')) {
    const port = getDefaultGatewayPort('default', 0)
    instances.unshift({
      id: 'default',
      profileName: 'default',
      label: 'Hermes 1',
      profilePath: snapshot.root,
      gatewayUrl: `http://127.0.0.1:${port}`,
      port,
      source: snapshot.source,
      isDefault: true,
      status: 'unknown',
    })
  }

  return instances
}

export function resolveHermesInstance(
  instances: Array<HermesInstance>,
  requestedId?: string | null,
): HermesInstance {
  const normalized = normalizeHermesProfileName(requestedId || 'default')
  const exact = instances.find((instance) => instance.id === normalized)
  if (exact) return exact
  const defaultInstance = instances.find((instance) => instance.isDefault)
  if (defaultInstance) return defaultInstance
  return instances[0]
}

function readWslHermesSnapshot(): HermesProfilesSnapshot | null {
  const script = String.raw`
python3 - <<'PY'
import json
import os
import re

try:
    import yaml
except Exception:
    yaml = None

root = os.environ.get("HERMES_HOME") or os.path.join(os.path.expanduser("~"), ".hermes")

def clean(value):
    return value.strip().strip("\"'")

def clean_model(value):
    value = clean(str(value))
    return re.sub(r"^default:\s*", "", value).strip()

def first_string(*values):
    for value in values:
        if isinstance(value, str) and clean(value):
            return clean(value)
    return None

def read_structured_config(raw):
    if yaml is None:
        return {}
    try:
        data = yaml.safe_load(raw) or {}
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}

    result = {}
    provider = first_string(data.get("provider"))
    if provider:
        result["provider"] = provider

    model = data.get("model")
    model_value = None
    if isinstance(model, dict):
        model_value = first_string(
            model.get("default"),
            model.get("id"),
            model.get("name"),
            model.get("model"),
        )
    elif isinstance(model, str):
        model_value = clean_model(model)

    if not model_value:
        default_model = first_string(data.get("default"))
        if default_model:
            model_value = clean_model(default_model)

    if model_value:
        result["model"] = model_value
    return result

def read_config(config_path):
    result = {}
    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            raw = handle.read()
    except Exception:
        return result

    result.update(read_structured_config(raw))
    if "provider" in result and "model" in result:
        return result

    provider = re.search(r"^\s*provider:\s*(.+?)\s*$", raw, re.M)
    if provider and "provider" not in result:
        result["provider"] = clean(provider.group(1))

    model = re.search(r"^\s*model:\s*(.+?)\s*$", raw, re.M)
    if model and clean(model.group(1)) and "model" not in result:
        result["model"] = clean_model(model.group(1))
    elif "model" not in result:
        default_model = re.search(r"^\s*default:\s*(.+?)\s*$", raw, re.M)
        if default_model:
            result["model"] = clean_model(default_model.group(1))

    return result

def profile_entry(name, profile_path):
    entry = {
        "name": name,
        "path": profile_path,
    }
    entry.update(read_config(os.path.join(profile_path, "config.yaml")))
    return entry

profiles = [profile_entry("default", root)]
profiles_root = os.path.join(root, "profiles")
if os.path.isdir(profiles_root):
    for name in sorted(os.listdir(profiles_root)):
        profile_path = os.path.join(profiles_root, name)
        if os.path.isdir(profile_path):
            profiles.append(profile_entry(name, profile_path))

print(json.dumps({"root": root, "source": "wsl", "profiles": profiles}, ensure_ascii=False))
PY
`.trim()

  try {
    const raw = execFileSync('wsl.exe', ['sh', '-lc', script], {
      encoding: 'utf-8',
      timeout: 3_000,
      windowsHide: true,
    })
    const parsed = JSON.parse(raw) as {
      root?: unknown
      source?: unknown
      profiles?: Array<Partial<HermesProfileSnapshot> | null>
    }
    if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
      return null
    }
    const root = typeof parsed.root === 'string' ? parsed.root : '~/.hermes'
    return {
      root,
      source: 'wsl',
      profiles: parsed.profiles
        .filter(
          (
            profile,
          ): profile is Partial<HermesProfileSnapshot> & { name: string } =>
            Boolean(profile) && typeof profile.name === 'string',
        )
        .map((profile) => ({
          name: profile.name,
          path: typeof profile.path === 'string' ? profile.path : root,
          model: typeof profile.model === 'string' ? profile.model : undefined,
          provider:
            typeof profile.provider === 'string' ? profile.provider : undefined,
        })),
    }
  } catch {
    return null
  }
}

function fallbackSnapshot(): HermesProfilesSnapshot {
  return {
    root: '~/.hermes',
    source: 'fallback',
    profiles: [
      {
        name: 'default',
        path: '~/.hermes',
        model: process.env.HERMES_DEFAULT_MODEL || undefined,
      },
    ],
  }
}

export function listHermesInstances(): Array<HermesInstance> {
  return buildHermesInstances(readWslHermesSnapshot() ?? fallbackSnapshot())
}

export async function probeHermesInstance(
  instance: HermesInstance,
): Promise<HermesInstance> {
  try {
    const response = await fetch(`${instance.gatewayUrl}/health`, {
      signal: AbortSignal.timeout(INSTANCE_PROBE_TIMEOUT_MS),
    })
    return {
      ...instance,
      status: response.ok ? 'running' : 'stopped',
    }
  } catch {
    return {
      ...instance,
      status: 'stopped',
    }
  }
}

export async function listHermesInstancesWithStatus(): Promise<
  Array<HermesInstance>
> {
  const instances = listHermesInstances()
  return Promise.all(instances.map((instance) => probeHermesInstance(instance)))
}

export function getRequestInstanceId(request: Request): string {
  const url = new URL(request.url)
  return (
    url.searchParams.get('instance') ||
    request.headers.get('x-hermes-instance') ||
    'default'
  )
}

export async function resolveRequestHermesInstance(
  request: Request,
): Promise<HermesInstance> {
  const instances = listHermesInstances()
  return resolveHermesInstance(instances, getRequestInstanceId(request))
}
