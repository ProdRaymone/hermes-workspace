import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import {
  readKnowledgeBaseConfig,
  writeKnowledgeBaseConfig,
} from './knowledge-config'
import {
  listProfileFiles,
  readProfileFile,
  writeProfileFile,
} from './profile-files'
import type { HermesInstance } from './hermes-instances'
import type {
  KnowledgeBaseConfig,
  KnowledgeBaseSource,
} from './knowledge-config'
import type { ProfileFileEntry, ProfileFileOptions } from './profile-files'

export type WikiPageMeta = {
  path: string
  name: string
  title: string
  type?: string
  domain?: string
  status?: string
  tags: Array<string>
  summary?: string
  created?: string
  updated?: string
  size: number
  modified: string
  wikilinks: Array<string>
}

export type WikiLink = {
  source: string
  target: string
}

export type KnowledgeGraph = {
  nodes: Array<{
    id: string
    title: string
    type?: string
    tags: Array<string>
  }>
  edges: Array<{ source: string; target: string }>
}

type FrontmatterData = {
  title?: string
  type?: string
  domain?: string
  status?: string
  tags?: unknown
  summary?: string
  created?: string
  updated?: string
}

type ParsedKnowledgePage = {
  meta: WikiPageMeta
  content: string
  raw: string
}

export type KnowledgeBrowserScopeKind =
  | 'workspace-local'
  | 'wsl-profile'
  | 'unsupported-profile'

export type KnowledgeBrowserScope = {
  instance: string
  label: string
  profile: string
  profilePath: string
  kind: KnowledgeBrowserScopeKind
  configRoot: string
  configPath: string
  fallbackRoot: string
  cacheRoot: string
}

export type KnowledgeScopePayload = {
  instance: string
  label: string
  profile: string
  profilePath: string
  kind: 'instance-scoped' | 'profile-files-unavailable'
  storage: KnowledgeBrowserScopeKind
}

type KnowledgeScopeOptions = Pick<ProfileFileOptions, 'executor'>

type KnowledgeSyncResult = {
  source: KnowledgeBaseSource
  success: boolean
  error?: string
}

const DEFAULT_KNOWLEDGE_CONFIG: KnowledgeBaseConfig = {
  source: { type: 'local', path: '' },
}

function shouldSkipDirectory(name: string): boolean {
  return name === '.git' || name === 'node_modules'
}

function normalizeTitle(name: string): string {
  return name.replace(/\.md$/i, '')
}

function normalizeTagList(input: unknown): Array<string> {
  if (Array.isArray(input)) {
    return input.map((value) => String(value).trim()).filter(Boolean)
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeFrontmatterValue(input: unknown): string | undefined {
  if (input == null) return undefined
  const value = String(input).trim()
  return value || undefined
}

function parseFrontmatter(raw: string): {
  data: FrontmatterData
  content: string
} {
  if (!raw.startsWith('---')) {
    return { data: {}, content: raw }
  }

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    return { data: {}, content: raw }
  }

  try {
    const parsed = YAML.parse(match[1])
    return {
      data:
        parsed && typeof parsed === 'object' ? (parsed as FrontmatterData) : {},
      content: match[2] || '',
    }
  } catch {
    return { data: {}, content: match[2] || raw }
  }
}

function cleanWikilinkTarget(input: string): string {
  return input.split('|')[0]?.split('#')[0]?.trim() || ''
}

function extractWikilinks(content: string): Array<string> {
  const links = new Set<string>()
  const regex = /\[\[([^\]]+)\]\]/g
  let match: RegExpExecArray | null = null
  while ((match = regex.exec(content)) !== null) {
    const target = cleanWikilinkTarget(match[1] || '')
    if (target) links.add(target)
  }
  return Array.from(links)
}

// ─── Legacy env-var fallback ──────────────────────────────────────────────────

function getLegacyKnowledgeRoot(): string {
  if (process.env.KNOWLEDGE_DIR) return path.resolve(process.env.KNOWLEDGE_DIR)
  const hermesHome = path.join(os.homedir(), '.hermes')
  const hermesKnowledge = path.join(hermesHome, 'knowledge')
  if (fs.existsSync(hermesKnowledge)) return hermesKnowledge
  const homeKnowledge = path.join(os.homedir(), 'knowledge', 'wiki')
  if (fs.existsSync(homeKnowledge)) return homeKnowledge
  return hermesKnowledge
}

function getLegacyKnowledgeConfigRoot(): string {
  return path.join(os.homedir(), '.hermes')
}

function getLegacyKnowledgeConfigPath(): string {
  return path.join(getLegacyKnowledgeConfigRoot(), 'knowledge-config.json')
}

function getLegacyKnowledgeCacheRoot(): string {
  return path.join(os.homedir(), '.hermes', 'knowledge-cache')
}

function joinWslPath(...parts: Array<string>): string {
  return path.posix.join(...parts.filter(Boolean))
}

function getWslHomeFromProfilePath(profilePath: string): string {
  const marker = '/.hermes'
  const markerIndex = profilePath.indexOf(marker)
  if (markerIndex > 0) return profilePath.slice(0, markerIndex)
  return profilePath
}

function resolveWslSourcePath(
  rawPath: string,
  scope: KnowledgeBrowserScope,
): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return scope.fallbackRoot
  if (trimmed.startsWith('~/')) {
    return joinWslPath(
      getWslHomeFromProfilePath(scope.profilePath),
      trimmed.slice(2),
    )
  }
  if (trimmed.startsWith('/')) return path.posix.normalize(trimmed)
  return joinWslPath(scope.profilePath, trimmed)
}

function getGithubCacheRootForScope(
  source: Extract<KnowledgeBaseSource, { type: 'github' }>,
  scope: KnowledgeBrowserScope,
): string {
  const safeRepo = source.repo.replace('/', '_')
  const safePath = source.path.replace(/^\//, '').replace(/\//g, '_')
  if (scope.kind === 'workspace-local') {
    return path.join(
      getLegacyKnowledgeCacheRoot(),
      'github',
      safeRepo,
      source.branch,
      safePath,
    )
  }
  return joinWslPath(
    scope.cacheRoot,
    'github',
    safeRepo,
    source.branch,
    safePath,
  )
}

function normalizeGithubRepoPath(input: string): string {
  return input
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\/+|\/+$/g, '')
}

function getGithubContentsUrl(
  source: Extract<KnowledgeBaseSource, { type: 'github' }>,
  repoPath: string,
): string {
  const safePath = normalizeGithubRepoPath(repoPath)
  const pathSuffix = safePath ? `/${safePath}` : ''
  return `https://api.github.com/repos/${source.repo}/contents${pathSuffix}?ref=${source.branch}`
}

function getGithubEntryRelativePath(
  baseRepoPath: string,
  entryPath: string,
): string {
  const base = normalizeGithubRepoPath(baseRepoPath)
  const entry = normalizeGithubRepoPath(entryPath)
  const relativePath = base ? path.posix.relative(base, entry) : entry
  const parts = relativePath.split('/').filter(Boolean)
  if (
    !parts.length ||
    relativePath.startsWith('..') ||
    path.posix.isAbsolute(relativePath) ||
    parts.some((part) => part === '.' || part === '..')
  ) {
    throw new Error('GitHub entry path is outside knowledge source path')
  }
  return parts.join('/')
}

export function buildKnowledgeScopeForInstance(
  instance: Pick<
    HermesInstance,
    'id' | 'label' | 'profileName' | 'profilePath' | 'source' | 'isDefault'
  >,
): KnowledgeBrowserScope {
  if (instance.isDefault || instance.id === 'default') {
    const configRoot = getLegacyKnowledgeConfigRoot()
    return {
      instance: 'default',
      label: instance.label || 'Hermes 1',
      profile: instance.profileName || 'default',
      profilePath: instance.profilePath || configRoot,
      kind: 'workspace-local',
      configRoot,
      configPath: getLegacyKnowledgeConfigPath(),
      fallbackRoot: getLegacyKnowledgeRoot(),
      cacheRoot: getLegacyKnowledgeCacheRoot(),
    }
  }

  if (instance.source === 'wsl') {
    const profilePath = instance.profilePath
    return {
      instance: instance.id,
      label: instance.label,
      profile: instance.profileName || instance.id,
      profilePath,
      kind: 'wsl-profile',
      configRoot: profilePath,
      configPath: joinWslPath(profilePath, 'knowledge-config.json'),
      fallbackRoot: joinWslPath(profilePath, 'knowledge'),
      cacheRoot: joinWslPath(profilePath, 'knowledge-cache'),
    }
  }

  return {
    instance: instance.id,
    label: instance.label,
    profile: instance.profileName || instance.id,
    profilePath: instance.profilePath,
    kind: 'unsupported-profile',
    configRoot: instance.profilePath,
    configPath: joinWslPath(instance.profilePath, 'knowledge-config.json'),
    fallbackRoot: joinWslPath(instance.profilePath, 'knowledge'),
    cacheRoot: joinWslPath(instance.profilePath, 'knowledge-cache'),
  }
}

export function buildKnowledgeScopePayload(
  scope: KnowledgeBrowserScope,
): KnowledgeScopePayload {
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

function ensureWslKnowledgeScope(scope: KnowledgeBrowserScope) {
  if (scope.kind === 'unsupported-profile') {
    throw new Error(
      'Profile knowledge files are unavailable for non-WSL Hermes profiles.',
    )
  }
  if (scope.kind !== 'wsl-profile') {
    throw new Error('WSL knowledge scope is required')
  }
}

function normalizeKnowledgeConfig(input: unknown): KnowledgeBaseConfig {
  if (!input || typeof input !== 'object') return DEFAULT_KNOWLEDGE_CONFIG
  const source = (input as { source?: Record<string, unknown> }).source
  if (!source || typeof source !== 'object') return DEFAULT_KNOWLEDGE_CONFIG
  if (source.type === 'local') {
    return {
      source: {
        type: 'local',
        path: typeof source.path === 'string' ? source.path : '',
      },
    }
  }
  if (source.type === 'github') {
    return {
      source: {
        type: 'github',
        repo: typeof source.repo === 'string' ? source.repo : '',
        branch: typeof source.branch === 'string' ? source.branch : 'main',
        path: typeof source.path === 'string' ? source.path : '',
      },
    }
  }
  return DEFAULT_KNOWLEDGE_CONFIG
}

export async function readKnowledgeBaseConfigForScope(
  scope: KnowledgeBrowserScope,
  options: KnowledgeScopeOptions = {},
): Promise<KnowledgeBaseConfig> {
  if (scope.kind === 'workspace-local') return readKnowledgeBaseConfig()
  ensureWslKnowledgeScope(scope)

  try {
    const file = await readProfileFile(
      scope.configRoot,
      'knowledge-config.json',
      {
        executor: options.executor,
        extension: '.json',
      },
    )
    return normalizeKnowledgeConfig(JSON.parse(file.content || '{}'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/ENOENT|no such file|not found/i.test(message)) {
      return DEFAULT_KNOWLEDGE_CONFIG
    }
    throw error
  }
}

export async function writeKnowledgeBaseConfigForScope(
  scope: KnowledgeBrowserScope,
  config: KnowledgeBaseConfig,
  options: KnowledgeScopeOptions = {},
): Promise<KnowledgeBaseConfig> {
  const normalized = normalizeKnowledgeConfig(config)
  if (scope.kind === 'workspace-local') {
    writeKnowledgeBaseConfig(normalized)
    return normalized
  }
  ensureWslKnowledgeScope(scope)
  await writeProfileFile(
    scope.configRoot,
    'knowledge-config.json',
    JSON.stringify(normalized, null, 2),
    {
      executor: options.executor,
      extension: '.json',
    },
  )
  return normalized
}

export async function getKnowledgeRootForScope(
  scope: KnowledgeBrowserScope,
  options: KnowledgeScopeOptions = {},
): Promise<string> {
  const config = await readKnowledgeBaseConfigForScope(scope, options)
  const source = config.source
  if (source.type === 'github') return getGithubCacheRootForScope(source, scope)

  const sourcePath = source.path.trim()
  if (!sourcePath) return scope.fallbackRoot
  if (scope.kind === 'workspace-local') {
    return path.resolve(sourcePath.replace(/^~\//, `${os.homedir()}/`))
  }
  return resolveWslSourcePath(sourcePath, scope)
}

// ─── GitHub Knowledge Provider ─────────────────────────────────────────────────

type GitHubEntry =
  | { type: 'file'; name: string; path: string; sha: string; content?: string }
  | { type: 'dir'; name: string; path: string; sha: string }

async function fetchGithubDirectory(
  source: Extract<KnowledgeBaseSource, { type: 'github' }>,
  repoPath: string,
): Promise<Array<GitHubEntry>> {
  const res = await fetch(getGithubContentsUrl(source, repoPath), {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'hermes-workspace',
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${repoPath || '/'}`)
  }
  const entries = await res.json()
  if (!Array.isArray(entries)) {
    throw new Error(
      `GitHub API returned a non-directory for ${repoPath || '/'}`,
    )
  }
  return entries as Array<GitHubEntry>
}

async function fetchGithubFileContent(
  source: Extract<KnowledgeBaseSource, { type: 'github' }>,
  entry: Extract<GitHubEntry, { type: 'file' }>,
): Promise<string> {
  const res = await fetch(getGithubContentsUrl(source, entry.path), {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'hermes-workspace',
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${entry.path}`)
  }
  const data = (await res.json()) as { content?: string; encoding?: string }
  if (!data.content) {
    throw new Error(`No content in GitHub response for ${entry.path}`)
  }
  if (data.encoding === 'base64') {
    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString(
      'utf-8',
    )
  }
  return data.content.replace(/\n/g, '')
}

async function syncGithubDirectoryToProfileCache(
  source: Extract<KnowledgeBaseSource, { type: 'github' }>,
  cacheRoot: string,
  baseRepoPath: string,
  currentRepoPath: string,
  options: KnowledgeScopeOptions,
): Promise<void> {
  const entries = await fetchGithubDirectory(source, currentRepoPath)

  for (const entry of entries) {
    if (shouldSkipDirectory(entry.name)) continue

    if (entry.type === 'dir') {
      await syncGithubDirectoryToProfileCache(
        source,
        cacheRoot,
        baseRepoPath,
        entry.path,
        options,
      )
      continue
    }

    if (!entry.name.toLowerCase().endsWith('.md')) continue

    const content = await fetchGithubFileContent(source, entry)
    const relativePath = getGithubEntryRelativePath(baseRepoPath, entry.path)
    await writeProfileFile(cacheRoot, relativePath, content, {
      executor: options.executor,
      extension: '.md',
    })
  }
}

async function syncGithubSourceToProfileCache(
  source: Extract<KnowledgeBaseSource, { type: 'github' }>,
  scope: KnowledgeBrowserScope,
  options: KnowledgeScopeOptions,
): Promise<void> {
  const sourcePath = normalizeGithubRepoPath(source.path)
  const cacheRoot = getGithubCacheRootForScope(source, scope)
  await syncGithubDirectoryToProfileCache(
    source,
    cacheRoot,
    sourcePath,
    sourcePath,
    options,
  )
}

class GitHubKnowledgeProvider {
  private readonly cacheDir: string
  private readonly branch: string

  constructor(
    private readonly repo: string,
    branch: string,
    private readonly repoPath: string,
  ) {
    const safeRepo = repo.replace('/', '_')
    const safePath = repoPath.replace(/^\//, '').replace(/\//g, '_')
    this.branch = branch
    const base = path.join(
      os.homedir(),
      '.hermes',
      'knowledge-cache',
      'github',
      safeRepo,
      branch,
      safePath,
    )
    this.cacheDir = base
  }

  private get cacheRoot(): string {
    return path.join(
      os.homedir(),
      '.hermes',
      'knowledge-cache',
      'github',
      this.repo.replace('/', '_'),
      this.branch,
    )
  }

  /** Fetch + decode the GitHub repo into the local cache directory. */
  async sync(): Promise<void> {
    try {
      await this.fetchDir(this.repoPath)
    } catch (err) {
      throw new Error(
        `GitHub sync failed for ${this.repo} (branch ${this.branch}): ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /** Check whether the local cache is present and non-empty. */
  isCached(): boolean {
    try {
      return (
        fs.existsSync(this.cacheDir) && fs.readdirSync(this.cacheDir).length > 0
      )
    } catch {
      return false
    }
  }

  get root(): string {
    return this.cacheDir
  }

  private async fetchDir(dirPath: string): Promise<void> {
    const url = `https://api.github.com/repos/${this.repo}/contents/${dirPath}?ref=${this.branch}`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'hermes-workspace',
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`GitHub API ${res.status}: ${body}`)
    }
    const entries = (await res.json()) as Array<GitHubEntry>

    for (const entry of entries) {
      if (entry.name === '.git') continue

      const fullPath = path.join(this.cacheDir, entry.name)
      const parentDir = path.dirname(fullPath)
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true })
      }

      if (entry.type === 'dir') {
        fs.mkdirSync(fullPath, { recursive: true })
        await this.fetchDir(entry.path)
      } else if (entry.name.toLowerCase().endsWith('.md')) {
        const content = await this.fetchFile(entry)
        fs.writeFileSync(fullPath, content, 'utf-8')
      }
    }
  }

  private async fetchFile(entry: {
    path: string
    sha: string
  }): Promise<string> {
    const url = `https://api.github.com/repos/${this.repo}/contents/${entry.path}?ref=${this.branch}`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'hermes-workspace',
      },
    })
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status} for ${entry.path}`)
    }
    const data = (await res.json()) as { content?: string; encoding?: string }
    if (!data.content)
      throw new Error(`No content in GitHub response for ${entry.path}`)
    if (data.encoding === 'base64') {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString(
        'utf-8',
      )
    }
    return data.content.replace(/\n/g, '')
  }
}

// ─── Config-aware root resolution ──────────────────────────────────────────────

function getKnowledgeRoot(): string {
  const config = readKnowledgeBaseConfig()
  const source = config.source

  if (source.type === 'github') {
    const provider = new GitHubKnowledgeProvider(
      source.repo,
      source.branch,
      source.path,
    )
    return provider.root
  }

  // local
  const p = source.path.trim()
  if (p) {
    return path.resolve(p.replace(/^~\//, `${os.homedir()}/`))
  }
  return getLegacyKnowledgeRoot()
}

export function knowledgeRootExists(): boolean {
  try {
    const root = getKnowledgeRoot()
    if (!root) return false
    // For GitHub, check cache; for local, check filesystem
    const config = readKnowledgeBaseConfig()
    if (config.source.type === 'github') {
      const provider = new GitHubKnowledgeProvider(
        config.source.repo,
        config.source.branch,
        config.source.path,
      )
      return provider.isCached()
    }
    return fs.existsSync(root)
  } catch {
    return false
  }
}

function getKnowledgeSource(): KnowledgeBaseSource {
  return readKnowledgeBaseConfig().source
}

export async function syncKnowledgeSource(): Promise<KnowledgeSyncResult> {
  const source = getKnowledgeSource()
  if (source.type !== 'github') {
    return { source, success: true }
  }
  try {
    const provider = new GitHubKnowledgeProvider(
      source.repo,
      source.branch,
      source.path,
    )
    await provider.sync()
    return { source, success: true }
  } catch (err) {
    return {
      source,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function syncKnowledgeSourceForScope(
  scope: KnowledgeBrowserScope,
  options: KnowledgeScopeOptions = {},
): Promise<KnowledgeSyncResult> {
  if (scope.kind === 'workspace-local') {
    return syncKnowledgeSource()
  }

  ensureWslKnowledgeScope(scope)
  const { source } = await readKnowledgeBaseConfigForScope(scope, options)
  if (source.type !== 'github') {
    return { source, success: true }
  }

  try {
    await syncGithubSourceToProfileCache(source, scope, options)
    return { source, success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      source,
      success: false,
      error: `GitHub sync failed for ${source.repo} (branch ${source.branch}): ${message}`,
    }
  }
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function normalizeRelativeKnowledgePath(input: string): string {
  const normalized = input.replace(/\\\\/g, '/').trim()
  if (!normalized) throw new Error('Path is required')
  if (normalized.startsWith('/'))
    throw new Error('Absolute paths are not allowed')
  if (normalized.includes('..'))
    throw new Error('Path traversal is not allowed')
  if (!normalized.toLowerCase().endsWith('.md'))
    throw new Error('Only Markdown files are allowed')
  return normalized
}

function resolveKnowledgeFilePath(relativePath: string): {
  fullPath: string
  relativePath: string
} {
  const safeRelativePath = normalizeRelativeKnowledgePath(relativePath)
  const knowledgeRoot = path.resolve(getKnowledgeRoot())
  const fullPath = path.resolve(knowledgeRoot, safeRelativePath)
  const relativeFromRoot = path.relative(knowledgeRoot, fullPath)
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    throw new Error('Resolved path is outside knowledge root')
  }
  return { fullPath, relativePath: safeRelativePath }
}

// ─── Page parsing ─────────────────────────────────────────────────────────────

function buildPageMetaFromRaw(
  relativePath: string,
  size: number,
  modifiedDate: Date,
  raw: string,
): ParsedKnowledgePage {
  const { data, content } = parseFrontmatter(raw)
  const modified = modifiedDate.toISOString()
  const name = path.basename(relativePath)
  const title = normalizeFrontmatterValue(data.title) || normalizeTitle(name)
  const updated = normalizeFrontmatterValue(data.updated) || modified

  return {
    meta: {
      path: relativePath,
      name,
      title,
      type: normalizeFrontmatterValue(data.type),
      domain: normalizeFrontmatterValue(data.domain),
      status: normalizeFrontmatterValue(data.status),
      tags: normalizeTagList(data.tags),
      summary: normalizeFrontmatterValue(data.summary),
      created: normalizeFrontmatterValue(data.created),
      updated,
      size,
      modified,
      wikilinks: extractWikilinks(content),
    },
    content,
    raw,
  }
}

function buildPageMeta(
  relativePath: string,
  stats: fs.Stats,
  raw: string,
): ParsedKnowledgePage {
  return buildPageMetaFromRaw(relativePath, stats.size, stats.mtime, raw)
}

function readParsedKnowledgeFile(
  fullPath: string,
  relativePath: string,
): ParsedKnowledgePage | null {
  try {
    const stats = fs.statSync(fullPath)
    if (!stats.isFile()) return null
    const raw = fs.readFileSync(fullPath, 'utf-8')
    return buildPageMeta(relativePath, stats, raw)
  } catch {
    return null
  }
}

function walkKnowledgeDir(
  results: Array<ParsedKnowledgePage>,
  knowledgeRoot: string,
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
      walkKnowledgeDir(results, knowledgeRoot, fullPath)
      continue
    }

    if (!name.toLowerCase().endsWith('.md')) continue

    const relativePath = path
      .relative(knowledgeRoot, fullPath)
      .replace(/\\\\/g, '/')
    if (
      !relativePath ||
      relativePath.startsWith('..') ||
      path.isAbsolute(relativePath)
    )
      continue

    const parsed = readParsedKnowledgeFile(fullPath, relativePath)
    if (parsed) results.push(parsed)
  }
}

function sortParsedKnowledgePages(
  pages: Array<ParsedKnowledgePage>,
): Array<ParsedKnowledgePage> {
  pages.sort((a, b) => {
    const updatedDiff =
      Date.parse(b.meta.updated || b.meta.modified) -
      Date.parse(a.meta.updated || a.meta.modified)
    if (updatedDiff !== 0) return updatedDiff
    return a.meta.path.localeCompare(b.meta.path)
  })
  return pages
}

function getParsedKnowledgePages(): Array<ParsedKnowledgePage> {
  const knowledgeRoot = path.resolve(getKnowledgeRoot())
  if (!fs.existsSync(knowledgeRoot)) return []

  const results: Array<ParsedKnowledgePage> = []
  walkKnowledgeDir(results, knowledgeRoot, knowledgeRoot)
  return sortParsedKnowledgePages(results)
}

function createWikilinkResolver(
  pages: Array<ParsedKnowledgePage>,
): (linkText: string) => string | null {
  const byPath = new Map<string, string>()
  const byName = new Map<string, string>()

  for (const page of pages) {
    byPath.set(
      page.meta.path.replace(/\.md$/i, '').toLowerCase(),
      page.meta.path,
    )
    byName.set(
      path.basename(page.meta.path, '.md').toLowerCase(),
      page.meta.path,
    )
    byName.set(page.meta.title.toLowerCase(), page.meta.path)
  }

  return (linkText: string) => {
    const cleaned = cleanWikilinkTarget(linkText)
    if (!cleaned) return null

    const normalized = cleaned
      .replace(/\\\\/g, '/')
      .trim()
      .replace(/\.md$/i, '')
      .toLowerCase()
    if (!normalized) return null

    return byPath.get(normalized) || byName.get(normalized) || null
  }
}

function parseProfileKnowledgeEntry(
  file: ProfileFileEntry,
): ParsedKnowledgePage | null {
  if (typeof file.content !== 'string') return null
  const modifiedDate = new Date(file.modified)
  const safeModifiedDate = Number.isNaN(modifiedDate.getTime())
    ? new Date(0)
    : modifiedDate
  return buildPageMetaFromRaw(
    file.path,
    file.size,
    safeModifiedDate,
    file.content,
  )
}

async function getParsedKnowledgePagesForScope(
  scope: KnowledgeBrowserScope,
  options: KnowledgeScopeOptions = {},
): Promise<Array<ParsedKnowledgePage>> {
  if (scope.kind === 'workspace-local') return getParsedKnowledgePages()
  ensureWslKnowledgeScope(scope)

  const root = await getKnowledgeRootForScope(scope, options)
  const files = await listProfileFiles(root, {
    executor: options.executor,
    extension: '.md',
    includeContent: true,
  })
  return sortParsedKnowledgePages(
    files
      .map((file) => parseProfileKnowledgeEntry(file))
      .filter((page): page is ParsedKnowledgePage => Boolean(page)),
  )
}

function buildKnowledgeGraphFromPages(
  pages: Array<ParsedKnowledgePage>,
): KnowledgeGraph {
  const resolveLink = createWikilinkResolver(pages)
  const edges = new Map<string, WikiLink>()

  for (const page of pages) {
    for (const wikilink of page.meta.wikilinks) {
      const target = resolveLink(wikilink)
      if (!target) continue
      const key = `${page.meta.path}=>${target}`
      if (!edges.has(key)) {
        edges.set(key, { source: page.meta.path, target })
      }
    }
  }

  return {
    nodes: pages.map((page) => ({
      id: page.meta.path,
      title: page.meta.title,
      type: page.meta.type,
      tags: page.meta.tags,
    })),
    edges: Array.from(edges.values()),
  }
}

export function listKnowledgePages(): Array<WikiPageMeta> {
  return getParsedKnowledgePages().map((page) => page.meta)
}

export async function listKnowledgePagesForScope(
  scope: KnowledgeBrowserScope,
  options: KnowledgeScopeOptions = {},
): Promise<Array<WikiPageMeta>> {
  return (await getParsedKnowledgePagesForScope(scope, options)).map(
    (page) => page.meta,
  )
}

export function resolveWikilink(linkText: string): string | null {
  return createWikilinkResolver(getParsedKnowledgePages())(linkText)
}

export function readKnowledgePage(relativePath: string): {
  meta: WikiPageMeta
  content: string
  backlinks: Array<string>
} {
  const { fullPath, relativePath: safeRelativePath } =
    resolveKnowledgeFilePath(relativePath)
  const parsed = readParsedKnowledgeFile(fullPath, safeRelativePath)
  if (!parsed) {
    throw new Error(`ENOENT: Knowledge page not found: ${safeRelativePath}`)
  }

  const pages = getParsedKnowledgePages()
  const resolveLink = createWikilinkResolver(pages)
  const backlinks = pages
    .filter((page) => page.meta.path !== safeRelativePath)
    .filter((page) =>
      page.meta.wikilinks.some(
        (link) => resolveLink(link) === safeRelativePath,
      ),
    )
    .map((page) => page.meta.path)

  return {
    meta: parsed.meta,
    content: parsed.content,
    backlinks,
  }
}

export async function readKnowledgePageForScope(
  relativePath: string,
  scope: KnowledgeBrowserScope,
  options: KnowledgeScopeOptions = {},
): Promise<{
  meta: WikiPageMeta
  content: string
  backlinks: Array<string>
}> {
  const safeRelativePath = normalizeRelativeKnowledgePath(relativePath)
  if (scope.kind === 'workspace-local') {
    return readKnowledgePage(safeRelativePath)
  }
  ensureWslKnowledgeScope(scope)

  const root = await getKnowledgeRootForScope(scope, options)
  const file = await readProfileFile(root, safeRelativePath, {
    executor: options.executor,
    extension: '.md',
  })
  const parsed = buildPageMetaFromRaw(
    safeRelativePath,
    Buffer.byteLength(file.content, 'utf-8'),
    new Date(),
    file.content,
  )

  const pages = await getParsedKnowledgePagesForScope(scope, options)
  const resolveLink = createWikilinkResolver(pages)
  const backlinks = pages
    .filter((page) => page.meta.path !== safeRelativePath)
    .filter((page) =>
      page.meta.wikilinks.some(
        (link) => resolveLink(link) === safeRelativePath,
      ),
    )
    .map((page) => page.meta.path)

  return {
    meta:
      pages.find((page) => page.meta.path === safeRelativePath)?.meta ??
      parsed.meta,
    content: parsed.content,
    backlinks,
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function searchParsedKnowledgePages(
  query: string,
  pages: Array<ParsedKnowledgePage>,
): Array<{ path: string; title: string; line: number; text: string }> {
  const needle = query.trim()
  if (!needle) return []

  const regex = new RegExp(`\\b${escapeRegex(needle)}`, 'i')
  const matches: Array<{
    path: string
    title: string
    line: number
    text: string
  }> = []

  for (const page of pages) {
    const lines = page.raw.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index] || ''
      if (!regex.test(text)) continue
      matches.push({
        path: page.meta.path,
        title: page.meta.title,
        line: index + 1,
        text,
      })
      if (matches.length >= 200) return matches
    }
  }

  return matches
}

export function searchKnowledgePages(
  query: string,
): Array<{ path: string; title: string; line: number; text: string }> {
  return searchParsedKnowledgePages(query, getParsedKnowledgePages())
}

export async function searchKnowledgePagesForScope(
  query: string,
  scope: KnowledgeBrowserScope,
  options: KnowledgeScopeOptions = {},
): Promise<Array<{ path: string; title: string; line: number; text: string }>> {
  return searchParsedKnowledgePages(
    query,
    await getParsedKnowledgePagesForScope(scope, options),
  )
}

export function buildKnowledgeGraph(): KnowledgeGraph {
  return buildKnowledgeGraphFromPages(getParsedKnowledgePages())
}

export async function buildKnowledgeGraphForScope(
  scope: KnowledgeBrowserScope,
  options: KnowledgeScopeOptions = {},
): Promise<KnowledgeGraph> {
  return buildKnowledgeGraphFromPages(
    await getParsedKnowledgePagesForScope(scope, options),
  )
}
