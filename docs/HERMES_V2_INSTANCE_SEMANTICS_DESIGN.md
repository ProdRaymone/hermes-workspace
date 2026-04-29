# Hermes Workspace V2 Instance Semantics Design

Last updated: 2026-04-29

## Purpose

V1/V1.1 made chat runtime parallel: Hermes1/default, Hermes2, and Hermes3 can run side by side, and chat/session/status surfaces follow the selected instance. V2 makes the Workspace semantics match that runtime reality: Knowledge, Memory, Skills, Hermes config, and MCP helpers should belong to the selected Hermes profile instead of silently falling back to Workspace/default state.

This design is intentionally design-first. It does not add Stop or Restart controls, does not auto-start Hermes1, and does not expose API keys.

## Goals

- Make every user-facing data surface declare whether it is `Instance-scoped`, `Workspace-shared`, or `Gateway-backed`.
- Preserve Hermes1/default compatibility with existing storage paths and localStorage/query-key conventions.
- Make Hermes2/Hermes3 read and write their own profile-scoped Knowledge, Memory, Skills, config, and MCP state.
- Keep stopped non-default instances honest: file-backed profile data may remain readable, but gateway-backed operations must show stopped/unavailable state.
- Keep all profile and log responses redacted; never return raw `.env`, auth stores, API keys, tokens, secrets, or full command environments.

## Non-Goals

- No Stop or Restart UX in this V2 entry slice.
- No automatic migration or copying of Hermes1 Knowledge/Memory/Skills into Hermes2/Hermes3.
- No Windows-side creation of fake WSL profiles through `profiles-browser.ts`.
- No broad rework of chat/session runtime that already passed V1/V1.1 smoke.

## Current Singleton Surfaces

The following surfaces are still singleton or default-oriented:

- `/api/hermes-config` reads and writes `C:\Users\<user>\.hermes\config.yaml` and `.env` through Windows Node.
- `/api/memory/*` reads and writes `$HERMES_HOME` or `os.homedir()/.hermes`, not the selected WSL profile.
- `/api/knowledge/*` reads `~/.hermes/knowledge-config.json`, `KNOWLEDGE_DIR`, or `~/.hermes/knowledge`.
- `/api/skills*` uses `gateway-capabilities` singletons and global `HERMES_API`, so it is still pinned to the configured default gateway.
- `/api/mcp/*` reads gateway config through global `HERMES_API`.
- `profiles-browser.ts` is a Windows-local profile browser and is not the source of truth for WSL Hermes1/2/3.

## Scope Model

V2 should introduce a shared server-side scope object:

```ts
type HermesInstanceScope = {
  instanceId: string
  label: string
  profileName: string
  profilePath: string
  gatewayUrl: string
  isDefault: boolean
  source: 'wsl' | 'fallback'
  status: 'running' | 'stopped' | 'unknown'
}
```

Request resolution should keep the V1 convention:

- Browser calls pass `?instance=<id>`.
- Server routes also accept `x-hermes-instance`.
- Missing or unknown instance falls back to default.
- Default keeps legacy paths and legacy client storage keys.
- Non-default instances use the selected WSL profile path as the semantic root.

Responses from scoped APIs should include a small `scope` block:

```json
{
  "scope": {
    "instance": "hermes2",
    "label": "Hermes 2",
    "profile": "hermes2",
    "profilePath": "/home/Raymone-Linux/.hermes/profiles/hermes2",
    "kind": "instance-scoped"
  }
}
```

## Server Access Pattern

Use two access paths, chosen per surface:

- Gateway-backed APIs call the selected instance gateway URL. Examples: sessions, `/api/skills`, `/api/config`, MCP reload, jobs.
- File-backed APIs read or write the selected WSL profile filesystem. Examples: Memory Markdown, Knowledge config/cache, profile `.env` metadata.

File-backed WSL access must use a small adapter rather than ad hoc command strings. The adapter should:

- Send scripts through `wsl.exe sh -s` stdin or `wsl.exe python3 -` stdin.
- Pass structured JSON arguments where possible.
- Whitelist roots to the selected profile path.
- Reject absolute/path traversal from user input.
- Redact known secret shapes before returning any error text.
- Prefer read-only operations before enabling writes.

Do not reuse `profiles-browser.ts` as the WSL profile source. It can remain for legacy Windows-local profiles, but V2 Hermes1/2/3 should resolve through `hermes-instances.ts`.

## Surface Design

### Memory

Default instance keeps current legacy behavior:

- Root: `$HERMES_HOME` if set, otherwise Windows `~/.hermes`.
- Paths: `MEMORY.md`, `memory/`, `memories/`.

Non-default instances should use:

- Root: selected WSL profile path, for example `/home/Raymone-Linux/.hermes/profiles/hermes2`.
- Paths: `MEMORY.md`, `memory/`, `memories/`.

Routes:

- `GET /api/memory/list?instance=hermes2`
- `GET /api/memory/read?instance=hermes2&path=...`
- `GET /api/memory/search?instance=hermes2&q=...`
- `POST /api/memory/write?instance=hermes2`

Reads may work even when the gateway is stopped if WSL profile files are reachable. Writes should be atomic and should create parent directories only inside the scoped memory root.

### Knowledge

Default instance keeps current legacy config:

- Config: `~/.hermes/knowledge-config.json`
- Fallback root: `KNOWLEDGE_DIR`, then `~/.hermes/knowledge`

Non-default instances should use:

- Config: `<profilePath>/knowledge-config.json`
- Local root fallback: `<profilePath>/knowledge`
- GitHub cache: `<profilePath>/knowledge-cache/github/...`

Routes:

- `GET/PATCH /api/knowledge/config?instance=hermes2`
- `GET /api/knowledge/list?instance=hermes2`
- `GET /api/knowledge/read?instance=hermes2&path=...`
- `GET /api/knowledge/search?instance=hermes2&q=...`
- `GET /api/knowledge/graph?instance=hermes2`
- `POST /api/knowledge/sync?instance=hermes2`

The UI should change the V1 banner from `Workspace-shared` to `Instance-scoped` only after these routes actually use the selected profile.

### Skills

Skills should prefer the selected gateway when it is running and supports `/api/skills`.

Routes:

- `GET /api/skills?instance=hermes2`
- `POST /api/skills?instance=hermes2`
- `POST /api/skills/install?instance=hermes2`
- `POST /api/skills/toggle?instance=hermes2`
- `POST /api/skills/uninstall?instance=hermes2`
- `GET /api/skills/hub-search?instance=hermes2`

Rules:

- Installed/toggle/install/uninstall target the selected instance gateway.
- Marketplace or hub search may remain Workspace-shared, but the response must label it as such.
- If the selected gateway is stopped, gateway-backed mutations return a structured unavailable payload; do not fall back to Hermes1.
- Direct Skills page and global search can unhide non-default skills only after `GET /api/skills?instance=...` is scoped.

### Hermes Config And Provider Settings

`/api/hermes-config` should become instance-aware in stages:

1. `GET` returns a redacted selected-profile config summary.
2. `PATCH` writes only to the selected profile config and `.env`.
3. Provider screens pass `?instance=<id>` and show the target profile before saving.

Default keeps current legacy paths. Non-default writes target `<profilePath>/config.yaml` and `<profilePath>/.env` through the WSL file adapter.

Safety rules:

- Return masked provider status, never raw keys.
- Do not return raw `.env`.
- Back up `config.yaml`/`.env` before writes.
- Validate provider/model fields structurally.
- Saving config does not restart any Hermes gateway; the UI should say that restart/reload is separate future work.

### MCP Helpers

MCP server list should read selected instance config:

- Running gateway: prefer selected gateway `/api/config`.
- Stopped gateway with WSL profile available: read `<profilePath>/config.yaml` file-backed and parse `mcp_servers`.

MCP reload is gateway-backed:

- `POST /api/mcp/reload?instance=hermes2` calls selected gateway reload endpoints.
- If stopped, return `unavailable`, not Hermes1 fallback.

### Profiles

The WSL Hermes1/2/3 registry remains source of truth for multi-instance runtime.

V2 may keep Windows-local profile CRUD separate, but it must not be presented as managing the WSL Hermes runtime profiles unless rewritten to use the same WSL source. Any profile editing UI should name the source explicitly:

- `WSL Hermes profile`
- `Windows Workspace profile`

## Client Data Flow

All scoped surfaces should follow the current chat convention:

- Query keys include `activeInstanceId`.
- Browser fetches include `?instance=${activeInstanceId}`.
- Default keeps legacy localStorage/sessionStorage keys.
- Non-default storage keys append normalized instance id.

Examples:

- `['memory', 'list', activeInstanceId]`
- `['knowledge', 'config', activeInstanceId]`
- `['skills', 'installed', activeInstanceId, filters]`
- `['hermes-config', activeInstanceId]`
- `['mcp', 'servers', activeInstanceId]`

## Migration And Compatibility

- Existing Hermes1/default data remains in place.
- Hermes2/Hermes3 start empty unless their WSL profile already contains matching files.
- V2 should not copy data automatically.
- Optional copy/import workflows can be designed later and should require explicit confirmation.
- Existing URLs without `instance` continue to target default.

## Error Handling

Use structured states instead of silent fallback:

- `instance-unavailable`: selected gateway stopped or unreachable.
- `capability-unavailable`: selected gateway lacks the endpoint.
- `profile-files-unavailable`: WSL profile path cannot be read.
- `unsafe-path`: requested file path escapes the scoped root.
- `write-blocked`: mutation requires explicit support or confirmation.

Every error payload should include redacted `scope` metadata and avoid command stderr unless redacted and tail-limited.

## Implementation Slices

1. Scope foundation:
   - Add shared scope helper and WSL profile file adapter.
   - Add tests for default compatibility, non-default root resolution, path traversal, and redaction.
2. Memory:
   - Make `/api/memory/*` instance-aware.
   - Update Memory screen query keys and banner.
3. Knowledge:
   - Make Knowledge config/browser/sync instance-aware.
   - Update Knowledge screen query keys and banner.
4. Skills:
   - Route `/api/skills*` through selected instance gateway.
   - Unhide non-default Skills only when scoped GET is implemented.
5. Config and MCP:
   - Make `/api/hermes-config` and `/api/mcp/*` instance-aware.
   - Keep writes guarded and redacted.
6. Final smoke:
   - Verify default/Hermes2/Hermes3 across Memory, Knowledge, Skills, config read, MCP read, and chat.

## Acceptance Criteria

- Switching active instance changes Memory, Knowledge, Skills, config, and MCP data sources.
- Default instance preserves legacy data and legacy storage behavior.
- Hermes2/Hermes3 never silently display or mutate Hermes1 data.
- Stopped gateways do not block file-backed profile reads, but gateway-backed operations clearly show unavailable.
- No API key, token, `.env` content, raw auth store, or full command environment appears in API responses, UI, tests, docs, or logs copied into UI.
- `pnpm test`, `pnpm build`, and three-instance smoke pass after each implementation slice.
