import { spawn } from 'node:child_process'
import {
  probeHermesInstance,
  type HermesInstance,
} from './hermes-instances'
import { isDefaultHermesInstance } from '../lib/hermes-instance-scope'

const START_SCRIPT_TIMEOUT_MS = 12_000

type ExecutorResult = {
  stdout?: string
  stderr?: string
}

type StartExecutor = (script: string) => Promise<ExecutorResult>

export type StartHermesInstanceResult =
  | {
      ok: true
      instance: string
      port: number
      status: 'already-running' | 'starting'
      message: string
    }
  | {
      ok: false
      instance: string
      port: number
      error: string
    }

type StartHermesInstanceOptions = {
  executor?: StartExecutor
  probeInstance?: (instance: HermesInstance) => Promise<HermesInstance>
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function getStartProfileName(instance: HermesInstance): string {
  return instance.profileName || instance.id
}

function getStartSessionName(instance: HermesInstance): string {
  const safeId = instance.id.replace(/[^a-z0-9_-]+/gi, '-')
  return `hermes-${safeId}-gateway`
}

export function redactHermesStartMessage(message: string): string {
  return message
    .replace(
      /\b(Authorization)\s*[:=]\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
      '$1: Bearer <redacted>',
    )
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 <redacted>')
    .replace(
      /\b([A-Z0-9_]*(?:API[A-Z0-9_]*KEY|KEY|TOKEN|SECRET|PASSWORD|AUTH)[A-Z0-9_]*)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1=<redacted>',
    )
    .replace(
      /\b(api[A-Z0-9_-]*key|key|token|secret|password)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1=<redacted>',
    )
}

export function buildHermesInstanceStartScript(
  instance: HermesInstance,
): string {
  const profile = getStartProfileName(instance)
  const session = getStartSessionName(instance)
  const port = String(instance.port)

  return [
    'set -eu',
    `PROFILE=${shellQuote(profile)}`,
    `SESSION=${shellQuote(session)}`,
    `API_SERVER_PORT=${shellQuote(port)}`,
    'export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$PATH"',
    'LOG_DIR="$HOME/.hermes/profiles/$PROFILE/logs"',
    'START_LOG="$LOG_DIR/workspace-start.log"',
    'mkdir -p "$LOG_DIR"',
    'rm -f "$START_LOG"',
    'TOKEN_CHECK="$(python3 - "$PROFILE" <<\'PY\'',
    'import os',
    'import sys',
    '',
    'profile = sys.argv[1]',
    'root = os.path.join(os.path.expanduser("~"), ".hermes")',
    '',
    'def read_env_value(path, key):',
    '    try:',
    '        with open(path, "r", encoding="utf-8", errors="replace") as handle:',
    '            for raw_line in handle:',
    '                line = raw_line.strip()',
    '                if not line or line.startswith("#") or "=" not in line:',
    '                    continue',
    '                raw_key, value = line.split("=", 1)',
    '                if raw_key.strip() == key:',
    '                    return value.strip().strip("\\\'\\"")',
    '    except OSError:',
    '        return ""',
    '    return ""',
    '',
    'default_token = read_env_value(os.path.join(root, ".env"), "TELEGRAM_BOT_TOKEN")',
    'profile_env = os.path.join(root, "profiles", profile, ".env")',
    'profile_token = read_env_value(profile_env, "TELEGRAM_BOT_TOKEN")',
    'if default_token and profile_token and default_token == profile_token:',
    '    print("duplicate-telegram-token")',
    'PY',
    ')"',
    'if [ "$TOKEN_CHECK" = "duplicate-telegram-token" ]; then',
    '  echo "Selected profile uses the same Telegram bot token as Hermes1; refusing to start." >&2',
    '  exit 42',
    'fi',
    'if ! command -v tmux >/dev/null 2>&1; then',
    '  echo "tmux is required to start a detached Hermes instance from Workspace." >&2',
    '  exit 43',
    'fi',
    'if tmux has-session -t "$SESSION" 2>/dev/null; then',
    '  echo "STARTING"',
    '  exit 0',
    'fi',
    'LAUNCH_CMD="API_SERVER_ENABLED=true API_SERVER_HOST=127.0.0.1 API_SERVER_PORT=$API_SERVER_PORT HERMES_WORKSPACE_INSTANCE=$PROFILE exec hermes -p \\"$PROFILE\\" gateway run --replace > \\"$START_LOG\\" 2>&1"',
    'tmux new-session -d -s "$SESSION" "$LAUNCH_CMD"',
    'for _ in 1 2 3 4 5; do',
    '  if ! tmux has-session -t "$SESSION" 2>/dev/null; then',
    '    echo "Hermes instance exited before the gateway became ready; check $START_LOG." >&2',
    '    exit 44',
    '  fi',
    '  if ss -ltn 2>/dev/null | grep -q ":$API_SERVER_PORT "; then',
    '    echo "STARTING"',
    '    exit 0',
    '  fi',
    '  sleep 1',
    'done',
    'echo "STARTING"',
  ].join('\n')
}

function executeWslStartScript(script: string): Promise<ExecutorResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'wsl.exe',
      ['sh', '-s'],
      {
        windowsHide: true,
      },
    )

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      const error = new Error('Hermes instance start timed out') as Error & {
        stdout?: string
        stderr?: string
      }
      error.stdout = stdout
      error.stderr = stderr
      reject(error)
    }, START_SCRIPT_TIMEOUT_MS)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      const err = error as Error & { stdout?: string; stderr?: string }
      err.stdout = stdout
      err.stderr = stderr
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code && code !== 0) {
        const error = new Error(`Hermes instance start exited with code ${code}`) as Error & {
          stdout?: string
          stderr?: string
        }
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })

    child.stdin.end(script)
  })
}

function toResultError(
  instance: HermesInstance,
  message: string,
): StartHermesInstanceResult {
  return {
    ok: false,
    instance: instance.id,
    port: instance.port,
    error: redactHermesStartMessage(message || 'Failed to start Hermes instance'),
  }
}

export async function startHermesInstance(
  instance: HermesInstance,
  options: StartHermesInstanceOptions = {},
): Promise<StartHermesInstanceResult> {
  if (isDefaultHermesInstance(instance.id) || instance.isDefault) {
    return {
      ok: false,
      instance: instance.id,
      port: instance.port,
      error:
        'Hermes1/default start is intentionally blocked here; start controls are only for Hermes2/Hermes3.',
    }
  }

  if (instance.source !== 'wsl') {
    return {
      ok: false,
      instance: instance.id,
      port: instance.port,
      error: 'Only WSL Hermes profiles can be started from this control.',
    }
  }

  const currentInstance =
    instance.status === 'unknown'
      ? await (options.probeInstance ?? probeHermesInstance)(instance)
      : instance

  if (currentInstance.status === 'running') {
    return {
      ok: true,
      instance: currentInstance.id,
      port: currentInstance.port,
      status: 'already-running',
      message: `${currentInstance.label} is already running.`,
    }
  }

  const executor = options.executor ?? executeWslStartScript
  const script = buildHermesInstanceStartScript(currentInstance)

  try {
    const output = await executor(script)
    const combinedOutput = `${output.stdout || ''}\n${output.stderr || ''}`.trim()
    if (!String(output.stdout || '').includes('STARTING')) {
      return toResultError(instance, combinedOutput)
    }

    return {
      ok: true,
      instance: currentInstance.id,
      port: currentInstance.port,
      status: 'starting',
      message: `${currentInstance.label} start was dispatched on port ${currentInstance.port}.`,
    }
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string }
    return toResultError(
      instance,
      [err.message, err.stdout, err.stderr].filter(Boolean).join('\n'),
    )
  }
}
