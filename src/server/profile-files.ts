import { spawn } from 'node:child_process'

export type ProfileFileEntry = {
  path: string
  name: string
  size: number
  modified: string
  content?: string
}

export type ProfileFileMatch = {
  path: string
  line: number
  text: string
}

export type ProfileFileOperation =
  | {
      operation: 'list'
      root: string
      extension?: string
      allowedPaths?: Array<string>
      includeContent?: boolean
    }
  | {
      operation: 'read'
      root: string
      path: string
      extension?: string
      allowedPaths?: Array<string>
    }
  | {
      operation: 'search'
      root: string
      query: string
      extension?: string
      allowedPaths?: Array<string>
    }
  | {
      operation: 'write'
      root: string
      path: string
      content: string
      extension?: string
      allowedPaths?: Array<string>
    }

export type ProfileFileExecutor = (
  operation: ProfileFileOperation,
) => Promise<unknown>

export type ProfileFileOptions = {
  executor?: ProfileFileExecutor
  extension?: string
  allowedPaths?: Array<string>
  includeContent?: boolean
}

const PROFILE_FILE_TIMEOUT_MS = 5_000

export function redactProfileFileError(message: string): string {
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

export function normalizeProfileRelativePath(
  input: string,
  options: Pick<ProfileFileOptions, 'extension'> = {},
): string {
  const normalized = input.replace(/\\/g, '/').trim()
  if (!normalized) throw new Error('Path is required')
  if (normalized.startsWith('/'))
    throw new Error('Absolute paths are not allowed')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Path traversal is not allowed')
  }
  const safeRelativePath = parts.join('/')
  const extension = options.extension
  if (extension && !safeRelativePath.toLowerCase().endsWith(extension)) {
    throw new Error(`Only ${extension} files are allowed`)
  }
  return safeRelativePath
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function buildProfileFileScript(operation: ProfileFileOperation): string {
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
    'extension = str(payload.get("extension") or ".md").lower()',
    'allowed_paths = payload.get("allowedPaths") or []',
    'include_content = bool(payload.get("includeContent"))',
    'if not root:',
    '    raise ValueError("Profile file root is required")',
    '',
    'def clean_relative(value, require_extension=True):',
    '    raw = str(value or "").replace("\\\\", "/").strip().strip("/")',
    '    if not raw:',
    '        raise ValueError("Path is required")',
    '    if raw.startswith("/") or os.path.isabs(raw):',
    '        raise ValueError("Absolute paths are not allowed")',
    '    parts = [part for part in raw.split("/") if part]',
    '    if any(part in (".", "..") for part in parts):',
    '        raise ValueError("Path traversal is not allowed")',
    '    cleaned = "/".join(parts)',
    '    if require_extension and extension and not cleaned.lower().endswith(extension):',
    '        raise ValueError(f"Only {extension} files are allowed")',
    '    return cleaned',
    '',
    'allowed = [clean_relative(item, False).rstrip("/") for item in allowed_paths if str(item or "").strip()]',
    '',
    'def is_allowed(relative_path):',
    '    if not allowed:',
    '        return True',
    '    for item in allowed:',
    '        if relative_path == item or relative_path.startswith(item + "/"):',
    '            return True',
    '    return False',
    '',
    'def safe_path(relative_path):',
    '    full_path = os.path.realpath(os.path.join(root, relative_path))',
    '    if os.path.commonpath([root, full_path]) != root:',
    '        raise ValueError("Resolved path is outside profile root")',
    '    if not is_allowed(relative_path):',
    '        raise ValueError("Path is outside the allowed profile file roots")',
    '    return full_path',
    '',
    'def iso_timestamp(timestamp):',
    '    return datetime.datetime.fromtimestamp(timestamp, datetime.timezone.utc).isoformat().replace("+00:00", "Z")',
    '',
    'def file_meta(full_path):',
    '    if extension and not full_path.lower().endswith(extension):',
    '        return None',
    '    if not os.path.isfile(full_path):',
    '        return None',
    '    relative_path = os.path.relpath(full_path, root).replace(os.sep, "/")',
    '    if not is_allowed(relative_path):',
    '        return None',
    '    stat = os.stat(full_path)',
    '    entry = {',
    '        "path": relative_path,',
    '        "name": os.path.basename(full_path),',
    '        "size": stat.st_size,',
    '        "modified": iso_timestamp(stat.st_mtime),',
    '    }',
    '    if include_content:',
    '        with open(full_path, "r", encoding="utf-8") as handle:',
    '            entry["content"] = handle.read()',
    '    return entry',
    '',
    'def list_files():',
    '    results = []',
    '    if not os.path.isdir(root):',
    '        return {"files": results}',
    '    for current, dirs, files in os.walk(root):',
    '        dirs[:] = [name for name in dirs if name not in (".git", "node_modules")]',
    '        for name in files:',
    '            meta = file_meta(os.path.join(current, name))',
    '            if meta:',
    '                results.append(meta)',
    '    return {"files": results}',
    '',
    'def read_file():',
    '    relative_path = clean_relative(payload.get("path"))',
    '    full_path = safe_path(relative_path)',
    '    with open(full_path, "r", encoding="utf-8") as handle:',
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
    '    relative_path = clean_relative(payload.get("path"))',
    '    full_path = safe_path(relative_path)',
    '    os.makedirs(os.path.dirname(full_path), exist_ok=True)',
    '    content = str(payload.get("content") or "")',
    '    fd, temp_path = tempfile.mkstemp(prefix=".profile-write-", dir=os.path.dirname(full_path), text=True)',
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
    '    raise ValueError("Unsupported profile file operation")',
    '',
    'print(json.dumps(result, ensure_ascii=False))',
    'PY',
  ].join('\n')
}

function executeWslProfileFileOperation(
  operation: ProfileFileOperation,
): Promise<unknown> {
  const script = buildProfileFileScript(operation)

  return new Promise((resolve, reject) => {
    const child = spawn('wsl.exe', ['sh', '-s'], {
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      const error = new Error(
        'Hermes profile file operation timed out',
      ) as Error & {
        stdout?: string
        stderr?: string
      }
      error.stdout = stdout
      error.stderr = stderr
      reject(error)
    }, PROFILE_FILE_TIMEOUT_MS)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
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
          `Hermes profile file adapter exited with code ${code}`,
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

function getProfileFileExecutor(
  options: ProfileFileOptions,
): ProfileFileExecutor {
  return options.executor ?? executeWslProfileFileOperation
}

function throwRedactedProfileFileError(error: unknown): never {
  const err = error as Error & { stderr?: string }
  const message = redactProfileFileError(
    [err.message, err.stderr].filter(Boolean).join('\n') ||
      'Failed to access profile files',
  )
  throw new Error(message)
}

function coerceProfileFiles(payload: unknown): Array<ProfileFileEntry> {
  const files =
    payload && typeof payload === 'object' && 'files' in payload
      ? (payload as { files?: unknown }).files
      : []
  if (!Array.isArray(files)) return []

  return files
    .filter((file): file is ProfileFileEntry => {
      if (!file || typeof file !== 'object') return false
      const current = file as Partial<ProfileFileEntry>
      return (
        typeof current.path === 'string' &&
        typeof current.name === 'string' &&
        typeof current.size === 'number' &&
        typeof current.modified === 'string' &&
        (current.content == null || typeof current.content === 'string')
      )
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

function coerceProfileFileContent(
  payload: unknown,
  fallbackPath: string,
): { path: string; content: string } {
  if (!payload || typeof payload !== 'object') {
    return { path: fallbackPath, content: '' }
  }
  const current = payload as { path?: unknown; content?: unknown }
  return {
    path: typeof current.path === 'string' ? current.path : fallbackPath,
    content: typeof current.content === 'string' ? current.content : '',
  }
}

function coerceProfileFileMatches(payload: unknown): Array<ProfileFileMatch> {
  const results =
    payload && typeof payload === 'object' && 'results' in payload
      ? (payload as { results?: unknown }).results
      : []
  if (!Array.isArray(results)) return []

  return results.filter((result): result is ProfileFileMatch => {
    if (!result || typeof result !== 'object') return false
    const current = result as Partial<ProfileFileMatch>
    return (
      typeof current.path === 'string' &&
      typeof current.line === 'number' &&
      typeof current.text === 'string'
    )
  })
}

export async function listProfileFiles(
  root: string,
  options: ProfileFileOptions = {},
): Promise<Array<ProfileFileEntry>> {
  const operation: ProfileFileOperation = {
    operation: 'list',
    root,
    extension: options.extension ?? '.md',
    allowedPaths: options.allowedPaths,
    includeContent: options.includeContent,
  }

  try {
    return coerceProfileFiles(await getProfileFileExecutor(options)(operation))
  } catch (error) {
    throwRedactedProfileFileError(error)
  }
}

export async function readProfileFile(
  root: string,
  relativePath: string,
  options: ProfileFileOptions = {},
): Promise<{ path: string; content: string }> {
  const safeRelativePath = normalizeProfileRelativePath(relativePath, {
    extension: options.extension ?? '.md',
  })
  const operation: ProfileFileOperation = {
    operation: 'read',
    root,
    path: safeRelativePath,
    extension: options.extension ?? '.md',
    allowedPaths: options.allowedPaths,
  }

  try {
    return coerceProfileFileContent(
      await getProfileFileExecutor(options)(operation),
      safeRelativePath,
    )
  } catch (error) {
    throwRedactedProfileFileError(error)
  }
}

export async function searchProfileFiles(
  root: string,
  query: string,
  options: ProfileFileOptions = {},
): Promise<Array<ProfileFileMatch>> {
  const operation: ProfileFileOperation = {
    operation: 'search',
    root,
    query,
    extension: options.extension ?? '.md',
    allowedPaths: options.allowedPaths,
  }

  try {
    return coerceProfileFileMatches(
      await getProfileFileExecutor(options)(operation),
    )
  } catch (error) {
    throwRedactedProfileFileError(error)
  }
}

export async function writeProfileFile(
  root: string,
  relativePath: string,
  content: string,
  options: ProfileFileOptions = {},
): Promise<{ path: string }> {
  const safeRelativePath = normalizeProfileRelativePath(relativePath, {
    extension: options.extension ?? '.md',
  })
  const operation: ProfileFileOperation = {
    operation: 'write',
    root,
    path: safeRelativePath,
    content,
    extension: options.extension ?? '.md',
    allowedPaths: options.allowedPaths,
  }

  try {
    await getProfileFileExecutor(options)(operation)
    return { path: safeRelativePath }
  } catch (error) {
    throwRedactedProfileFileError(error)
  }
}
