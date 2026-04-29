import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { HermesInstance } from './hermes-instances'

export type MemoryFileMeta = {
  path: string
  name: string
  size: number
  modified: string
}

export type MemorySearchMatch = {
  path: string
  line: number
  text: string
}

export type MemoryBrowserScopeKind =
  | 'workspace-local'
  | 'wsl-profile'
  | 'unsupported-profile'

export type MemoryBrowserScope = {
  instance: string
  label: string
  profile: string
  profilePath: string
  root: string
  kind: MemoryBrowserScopeKind
}

export type MemoryScopePayload = {
  instance: string
  label: string
  profile: string
  profilePath: string
  kind: 'instance-scoped' | 'profile-files-unavailable'
  storage: MemoryBrowserScopeKind
}

export type MemoryProfileFileOperation =
  | { operation: 'list'; root: string }
  | { operation: 'read'; root: string; path: string }
  | { operation: 'search'; root: string; query: string }
  | { operation: 'write'; root: string; path: string; content: string }

export type MemoryProfileFileExecutor = (
  operation: MemoryProfileFileOperation,
) => Promise<unknown>

type MemoryScopeOptions = {
  executor?: MemoryProfileFileExecutor
}

const MEMORY_WSL_TIMEOUT_MS = 5_000

function isBrowserMemoryPath(relativePath: string): boolean {
  return (
    relativePath === 'MEMORY.md' ||
    relativePath.startsWith('memory/') ||
    relativePath.startsWith('memories/')
  )
}

function normalizeWorkspaceRoot(): string {
  // Honor HERMES_HOME when set (e.g. ~/.hermes-vanilla for running alongside prod).
  // Fall back to ~/.hermes for the default install location.
  const envHome = process.env.HERMES_HOME?.trim()
  const resolved = envHome ? path.resolve(envHome) : path.resolve(path.join(os.homedir(), '.hermes'))
  return resolved
}

export function getMemoryWorkspaceRoot(): string {
  return path.resolve(normalizeWorkspaceRoot())
}

function normalizeRelativeMemoryPath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim()
  if (!normalized) throw new Error('Path is required')
  if (normalized.startsWith('/'))
    throw new Error('Absolute paths are not allowed')
  if (normalized.includes('..'))
    throw new Error('Path traversal is not allowed')
  if (!normalized.toLowerCase().endsWith('.md'))
    throw new Error('Only Markdown files are allowed')
  return normalized
}

export function redactMemoryFileError(message: string): string {
  return message
    .replace(
      /\b(Authorization)\s*[:=]\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
      '$1: Bearer <redacted>',
    )
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 <redacted>')
    .replace(
      /\b((?!Authorization\b)[A-Z0-9_]*(?:API[A-Z0-9_]*KEY|KEY|TOKEN|SECRET|PASSWORD|AUTH)[A-Z0-9_]*)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1=<redacted>',
    )
    .replace(
      /\b(api[A-Z0-9_-]*key|key|token|secret|password)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1=<redacted>',
    )
}

export function buildMemoryScopeForInstance(
  instance: Pick<
    HermesInstance,
    'id' | 'label' | 'profileName' | 'profilePath' | 'source' | 'isDefault'
  >,
): MemoryBrowserScope {
  if (instance.isDefault || instance.id === 'default') {
    const root = getMemoryWorkspaceRoot()
    return {
      instance: 'default',
      label: instance.label || 'Hermes 1',
      profile: instance.profileName || 'default',
      profilePath: instance.profilePath || root,
      root,
      kind: 'workspace-local',
    }
  }

  if (instance.source === 'wsl') {
    return {
      instance: instance.id,
      label: instance.label,
      profile: instance.profileName || instance.id,
      profilePath: instance.profilePath,
      root: instance.profilePath,
      kind: 'wsl-profile',
    }
  }

  return {
    instance: instance.id,
    label: instance.label,
    profile: instance.profileName || instance.id,
    profilePath: instance.profilePath,
    root: instance.profilePath,
    kind: 'unsupported-profile',
  }
}

export function buildMemoryScopePayload(
  scope: MemoryBrowserScope,
): MemoryScopePayload {
  return {
    instance: scope.instance,
    label: scope.label,
    profile: scope.profile,
    profilePath: scope.profilePath,
    kind:
      scope.kind === 'unsupported-profile'
        ? 'profile-files-unavailable'
        : 'instance-scoped',
    storage: scope.kind,
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function buildWslMemoryScript(operation: MemoryProfileFileOperation): string {
  const payload = Buffer.from(JSON.stringify(operation), 'utf-8').toString(
    'base64',
  )

  return [
    'set -eu',
    `PAYLOAD_B64=${shellQuote(payload)}`,
    'python3 - "$PAYLOAD_B64" <<\'PY\'',
    'import base64',
    'import datetime',
    'import json',
    'import os',
    'import sys',
    'import tempfile',
    '',
    'payload = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))',
    'root = os.path.realpath(str(payload.get("root") or ""))',
    'operation = payload.get("operation")',
    'if not root:',
    '    raise ValueError("Profile root is required")',
    '',
    'def is_memory_path(relative_path):',
    '    return relative_path == "MEMORY.md" or relative_path.startswith("memory/") or relative_path.startswith("memories/")',
    '',
    'def normalize_relative(value):',
    '    raw = str(value or "").replace("\\\\", "/").strip()',
    '    if not raw:',
    '        raise ValueError("Path is required")',
    '    if raw.startswith("/") or os.path.isabs(raw):',
    '        raise ValueError("Absolute paths are not allowed")',
    '    parts = [part for part in raw.split("/") if part]',
    '    if any(part in (".", "..") for part in parts):',
    '        raise ValueError("Path traversal is not allowed")',
    '    if not raw.lower().endswith(".md"):',
    '        raise ValueError("Only Markdown files are allowed")',
    '    return "/".join(parts)',
    '',
    'def safe_path(relative_path):',
    '    full_path = os.path.realpath(os.path.join(root, relative_path))',
    '    if os.path.commonpath([root, full_path]) != root:',
    '        raise ValueError("Resolved path is outside profile")',
    '    return full_path',
    '',
    'def iso_timestamp(timestamp):',
    '    return datetime.datetime.fromtimestamp(timestamp, datetime.timezone.utc).isoformat().replace("+00:00", "Z")',
    '',
    'def file_meta(full_path):',
    '    if not full_path.lower().endswith(".md"):',
    '        return None',
    '    if not os.path.isfile(full_path):',
    '        return None',
    '    relative_path = os.path.relpath(full_path, root).replace(os.sep, "/")',
    '    if not is_memory_path(relative_path):',
    '        return None',
    '    stat = os.stat(full_path)',
    '    return {',
    '        "path": relative_path,',
    '        "name": os.path.basename(full_path),',
    '        "size": stat.st_size,',
    '        "modified": iso_timestamp(stat.st_mtime),',
    '    }',
    '',
    'def list_files():',
    '    results = []',
    '    root_file = os.path.join(root, "MEMORY.md")',
    '    meta = file_meta(root_file)',
    '    if meta:',
    '        results.append(meta)',
    '    for dirname in ("memory", "memories"):',
    '        base = os.path.join(root, dirname)',
    '        if not os.path.isdir(base):',
    '            continue',
    '        for current, dirs, files in os.walk(base):',
    '            dirs[:] = [name for name in dirs if name not in (".git", "node_modules")]',
    '            for name in files:',
    '                meta = file_meta(os.path.join(current, name))',
    '                if meta:',
    '                    results.append(meta)',
    '    return {"files": results}',
    '',
    'def read_file():',
    '    relative_path = normalize_relative(payload.get("path"))',
    '    with open(safe_path(relative_path), "r", encoding="utf-8") as handle:',
    '        return {"path": relative_path, "content": handle.read()}',
    '',
    'def search_files():',
    '    query = str(payload.get("query") or "").strip()',
    '    if not query:',
    '        return {"results": []}',
    '    needle = query.lower()',
    '    matches = []',
    '    for item in list_files()["files"]:',
    '        try:',
    '            with open(safe_path(item["path"]), "r", encoding="utf-8") as handle:',
    '                lines = handle.read().splitlines()',
    '        except OSError:',
    '            continue',
    '        for index, text in enumerate(lines, start=1):',
    '            if needle in text.lower():',
    '                matches.append({"path": item["path"], "line": index, "text": text})',
    '                if len(matches) >= 200:',
    '                    return {"results": matches}',
    '    return {"results": matches}',
    '',
    'def write_file():',
    '    relative_path = normalize_relative(payload.get("path"))',
    '    full_path = safe_path(relative_path)',
    '    os.makedirs(os.path.dirname(full_path), exist_ok=True)',
    '    content = str(payload.get("content") or "")',
    '    fd, temp_path = tempfile.mkstemp(prefix=".memory-write-", dir=os.path.dirname(full_path), text=True)',
    '    try:',
    '        with os.fdopen(fd, "w", encoding="utf-8") as handle:',
    '            handle.write(content)',
    '        os.replace(temp_path, full_path)',
    '    finally:',
    '        if os.path.exists(temp_path):',
    '            os.unlink(temp_path)',
    '    return {"path": relative_path}',
    '',
    'if operation == "list":',
    '    result = list_files()',
    'elif operation == "read":',
    '    result = read_file()',
    'elif operation == "search":',
    '    result = search_files()',
    'elif operation == "write":',
    '    result = write_file()',
    'else:',
    '    raise ValueError("Unsupported memory operation")',
    '',
    'print(json.dumps(result, ensure_ascii=False))',
    'PY',
  ].join('\n')
}

async function executeWslMemoryOperation(
  operation: MemoryProfileFileOperation,
): Promise<unknown> {
  const script = buildWslMemoryScript(operation)

  return new Promise((resolve, reject) => {
    const child = spawn('wsl.exe', ['sh', '-s'], {
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      const error = new Error(
        'Hermes memory profile read timed out',
      ) as Error & {
        stdout?: string
        stderr?: string
      }
      error.stdout = stdout
      error.stderr = stderr
      reject(error)
    }, MEMORY_WSL_TIMEOUT_MS)

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
        const error = new Error(
          `Hermes memory WSL adapter exited with code ${code}`,
        ) as Error & {
          stdout?: string
          stderr?: string
        }
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }

      try {
        resolve(JSON.parse(stdout || '{}'))
      } catch (error) {
        const err = error as Error & { stdout?: string; stderr?: string }
        err.stdout = stdout
        err.stderr = stderr
        reject(err)
      }
    })

    child.stdin.end(script)
  })
}

function getMemoryProfileExecutor(
  options: MemoryScopeOptions,
): MemoryProfileFileExecutor {
  return options.executor ?? executeWslMemoryOperation
}

function ensureWslMemoryScope(scope: MemoryBrowserScope) {
  if (scope.kind === 'unsupported-profile') {
    throw new Error(
      'Profile memory files are unavailable for non-WSL Hermes profiles.',
    )
  }
  if (scope.kind !== 'wsl-profile') {
    throw new Error('WSL memory scope is required')
  }
}

function throwRedactedMemoryError(error: unknown): never {
  const err = error as Error & { stdout?: string; stderr?: string }
  const message = redactMemoryFileError(
    [err.message, err.stderr].filter(Boolean).join('\n') ||
      'Failed to access memory files',
  )
  throw new Error(message)
}

function coerceMemoryFiles(payload: unknown): Array<MemoryFileMeta> {
  const files =
    payload && typeof payload === 'object' && 'files' in payload
      ? (payload as { files?: unknown }).files
      : []
  if (!Array.isArray(files)) return []

  return files
    .filter((file): file is MemoryFileMeta => {
      if (!file || typeof file !== 'object') return false
      const current = file as Partial<MemoryFileMeta>
      return (
        typeof current.path === 'string' &&
        typeof current.name === 'string' &&
        typeof current.size === 'number' &&
        typeof current.modified === 'string'
      )
    })
    .sort(compareMemoryFiles)
}

function coerceMemoryContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const content = (payload as { content?: unknown }).content
  return typeof content === 'string' ? content : ''
}

function coerceSearchResults(payload: unknown): Array<MemorySearchMatch> {
  const results =
    payload && typeof payload === 'object' && 'results' in payload
      ? (payload as { results?: unknown }).results
      : []
  if (!Array.isArray(results)) return []

  return results.filter((result): result is MemorySearchMatch => {
    if (!result || typeof result !== 'object') return false
    const current = result as Partial<MemorySearchMatch>
    return (
      typeof current.path === 'string' &&
      typeof current.line === 'number' &&
      typeof current.text === 'string'
    )
  })
}

export function resolveMemoryFilePath(relativePath: string): {
  fullPath: string
  relativePath: string
} {
  const safeRelativePath = normalizeRelativeMemoryPath(relativePath)
  const workspaceRoot = getMemoryWorkspaceRoot()
  const fullPath = path.resolve(workspaceRoot, safeRelativePath)
  if (!fullPath.startsWith(workspaceRoot)) {
    throw new Error('Resolved path is outside workspace')
  }
  return { fullPath, relativePath: safeRelativePath }
}

function pushIfMarkdownFile(
  entries: Array<MemoryFileMeta>,
  workspaceRoot: string,
  fullPath: string,
) {
  if (!fullPath.toLowerCase().endsWith('.md')) return
  let stats: fs.Stats
  try {
    stats = fs.statSync(fullPath)
  } catch {
    return
  }
  if (!stats.isFile()) return

  const relativePath = path
    .relative(workspaceRoot, fullPath)
    .replace(/\\/g, '/')
  if (!isBrowserMemoryPath(relativePath)) return

  entries.push({
    path: relativePath,
    name: path.basename(fullPath),
    size: stats.size,
    modified: stats.mtime.toISOString(),
  })
}

function shouldSkipDirectory(name: string): boolean {
  return name === '.git' || name === 'node_modules'
}

function walkWorkspaceDir(
  entries: Array<MemoryFileMeta>,
  workspaceRoot: string,
  dirPath: string,
) {
  let dirEntries: Array<string>
  try {
    dirEntries = fs.readdirSync(dirPath)
  } catch {
    return
  }

  for (const name of dirEntries) {
    const fullPath = path.join(dirPath, name)
    let stats: fs.Stats
    try {
      stats = fs.statSync(fullPath)
    } catch {
      continue
    }
    if (stats.isDirectory()) {
      if (shouldSkipDirectory(name)) continue
      walkWorkspaceDir(entries, workspaceRoot, fullPath)
      continue
    }
    pushIfMarkdownFile(entries, workspaceRoot, fullPath)
  }
}

function compareMemoryFiles(a: MemoryFileMeta, b: MemoryFileMeta): number {
  if (a.path === 'MEMORY.md' && b.path !== 'MEMORY.md') return -1
  if (b.path === 'MEMORY.md' && a.path !== 'MEMORY.md') return 1

  const aIsDaily = /^memories?\/\d{4}-\d{2}-\d{2}\.md$/.test(a.path)
  const bIsDaily = /^memories?\/\d{4}-\d{2}-\d{2}\.md$/.test(b.path)
  if (aIsDaily && bIsDaily) return b.path.localeCompare(a.path)

  const modifiedDiff = Date.parse(b.modified) - Date.parse(a.modified)
  if (modifiedDiff !== 0) return modifiedDiff
  return a.path.localeCompare(b.path)
}

export function listMemoryFiles(): Array<MemoryFileMeta> {
  const workspaceRoot = getMemoryWorkspaceRoot()
  const results: Array<MemoryFileMeta> = []

  pushIfMarkdownFile(results, workspaceRoot, path.join(workspaceRoot, 'MEMORY.md'))
  for (const subdir of ['memory', 'memories']) {
    walkWorkspaceDir(results, workspaceRoot, path.join(workspaceRoot, subdir))
  }

  results.sort(compareMemoryFiles)
  return results
}

export function readMemoryFile(relativePath: string): string {
  const { fullPath } = resolveMemoryFilePath(relativePath)
  return fs.readFileSync(fullPath, 'utf-8')
}

export function searchMemoryFiles(query: string): Array<MemorySearchMatch> {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const matches: Array<MemorySearchMatch> = []
  const files = listMemoryFiles()

  for (const file of files) {
    let content = ''
    try {
      content = readMemoryFile(file.path)
    } catch {
      continue
    }
    const lines = content.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index] || ''
      if (!text.toLowerCase().includes(needle)) continue
      matches.push({
        path: file.path,
        line: index + 1,
        text,
      })
      if (matches.length >= 200) return matches
    }
  }

  return matches
}

export async function listMemoryFilesForScope(
  scope: MemoryBrowserScope,
  options: MemoryScopeOptions = {},
): Promise<Array<MemoryFileMeta>> {
  if (scope.kind === 'workspace-local') return listMemoryFiles()
  ensureWslMemoryScope(scope)

  try {
    const payload = await getMemoryProfileExecutor(options)({
      operation: 'list',
      root: scope.root,
    })
    return coerceMemoryFiles(payload)
  } catch (error) {
    throwRedactedMemoryError(error)
  }
}

export async function readMemoryFileForScope(
  relativePath: string,
  scope: MemoryBrowserScope,
  options: MemoryScopeOptions = {},
): Promise<string> {
  const safeRelativePath = normalizeRelativeMemoryPath(relativePath)
  if (scope.kind === 'workspace-local') return readMemoryFile(safeRelativePath)
  ensureWslMemoryScope(scope)

  try {
    const payload = await getMemoryProfileExecutor(options)({
      operation: 'read',
      root: scope.root,
      path: safeRelativePath,
    })
    return coerceMemoryContent(payload)
  } catch (error) {
    throwRedactedMemoryError(error)
  }
}

export async function searchMemoryFilesForScope(
  query: string,
  scope: MemoryBrowserScope,
  options: MemoryScopeOptions = {},
): Promise<Array<MemorySearchMatch>> {
  const needle = query.trim()
  if (!needle) return []
  if (scope.kind === 'workspace-local') return searchMemoryFiles(needle)
  ensureWslMemoryScope(scope)

  try {
    const payload = await getMemoryProfileExecutor(options)({
      operation: 'search',
      root: scope.root,
      query: needle,
    })
    return coerceSearchResults(payload)
  } catch (error) {
    throwRedactedMemoryError(error)
  }
}

export async function writeMemoryFileForScope(
  relativePath: string,
  content: string,
  scope: MemoryBrowserScope,
  options: MemoryScopeOptions = {},
): Promise<{ path: string }> {
  const safeRelativePath = normalizeRelativeMemoryPath(relativePath)
  if (scope.kind === 'workspace-local') {
    const { fullPath } = resolveMemoryFilePath(safeRelativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    return { path: safeRelativePath }
  }
  ensureWslMemoryScope(scope)

  try {
    await getMemoryProfileExecutor(options)({
      operation: 'write',
      root: scope.root,
      path: safeRelativePath,
      content,
    })
    return { path: safeRelativePath }
  } catch (error) {
    throwRedactedMemoryError(error)
  }
}
