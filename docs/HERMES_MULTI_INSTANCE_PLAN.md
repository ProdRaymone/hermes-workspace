# Hermes Workspace Multi-Instance Plan

Last updated: 2026-04-29

## Purpose

This file is the project compass for Hermes Workspace V1/V1.1 multi-instance work. New Codex windows should read this file before continuing, then inspect `git status --short` and the current diff.

The goal is to make Hermes Workspace safely operate across the existing WSL Hermes profiles:

- Hermes 1 / `default` on `8642`
- Hermes 2 / `hermes2` on `8643`
- Hermes 3 / `hermes3` on `8644`

## Non-Negotiable Constraints

- Do not output or copy API keys.
- Do not kill or restart Hermes1 unless the user explicitly approves it.
- Do not automatically start Hermes2 or Hermes3 until V1.1 Start work is reached and the user confirms it.
- Treat WSL `~/.hermes` profiles as the source of truth for Hermes1/2/3.
- Keep changes incremental and verifiable; avoid broad rewrites.

## Current State

- `/api/instances` exists and reads WSL Hermes profiles.
- Latest verified runtime:
  - Hermes1/default -> `8642` -> running
  - Hermes2 -> `8643` -> running after V1.1 smoke
  - Hermes3 -> `8644` -> running after V1.1 smoke
- Core chat/API paths are instance-aware:
  - models
  - status
  - sessions
  - history
  - session status
  - send stream
- Chat page has a Hermes 1/2/3 switcher.
- Profiles page has a read-only Hermes Agents / Instances section.
- Portable Main chat history is isolated per instance while default keeps the legacy key.
- Pending send / optimistic message recovery / recent session local state is isolated per instance.
- Session title cache, thinking-level sessionStorage, last-session recovery, pinned sessions, and the persistent desktop sidebar session query are isolated per active Hermes instance while the default instance keeps legacy keys.
- Active-run polling and persisted run lookup are scoped per active Hermes instance; default keeps the legacy run directory while Hermes2/3 use `runs/instances/<instance>/<session>`.
- Sidebar `StatusDot` and the reconnect banner read the active instance status; reconnect/startup silent auto-start is disabled by default for V1.
- Global search session results follow the active instance; Skills search and the direct Skills page are hidden for non-default instances until `/api/skills*` becomes instance-scoped.
- `/api/auth-check` is instance-aware for startup checks; stopped Hermes2/3 no longer trap the Workspace behind the startup overlay, while default/Hermes1 keeps the legacy unreachable-backend blocking behavior.
- Onboarding/setup checks are explicitly Workspace-level and pinned to Hermes1/default for V1; non-default instance status cannot auto-complete first-run setup.
- Dashboard, Knowledge, and Memory now show read-only scope banners so stopped Hermes2/3 are not presented as live Hermes1-backed state.
- V1 smoke checks confirm stopped Hermes2/3 return expected 503 for `/api/ping`, structured disconnected state for status/auth checks, and UI scope banners remain visible on Dashboard/Memory/Knowledge/Skills without starting Hermes2/3.
- Temporary updated Workspace is available at `http://127.0.0.1:16061/chat/new`.
- `16060` may still be an older Workspace process.

## V1 Completion Checkpoint

V1 is considered complete for the read-only safety boundary as of 2026-04-29:

- Chat correctness surfaces listed in the audit are instance-aware.
- Visual status surfaces no longer present stopped Hermes2/Hermes3 as Hermes1-backed live state.
- Knowledge and Memory are intentionally display-only / Workspace-shared in V1.
- Skills are hidden outside the default profile until the skills API is instance-scoped.
- Startup/reconnect behavior does not silently auto-start Hermes2/Hermes3, and does not treat stopped non-default instances as a Workspace-blocking failure.
- Latest known verification: fresh `pnpm test` passed 30 files / 91 tests and fresh `pnpm build` passed with existing warnings on 2026-04-29; browser and API smoke checks passed on the listed V1 surfaces plus the Hermes2/Hermes3 V1.1 start paths.

## V1.1 Start Checkpoint

Hermes2 and Hermes3 Start are implemented and smoke-tested as of 2026-04-29:

- Start controls are visible only for stopped non-default instances and require an explicit confirmation dialog.
- `POST /api/instances/start?instance=<id>` rejects default/Hermes1, targets only the selected non-default instance, uses WSL `~/.hermes` profile facts, and does not print API keys.
- The WSL start runner now sends the generated script through stdin rather than `sh -lc <script>`, writes instance start output to the selected profile's `logs/workspace-start.log`, and detects immediate tmux exits before reporting success.
- Start now re-probes unknown instance status before launching; repeated Hermes2 start calls return `already-running` without dispatching another WSL start.
- Hermes2 smoke result: Hermes1 stayed on `8642` with pid `1112`; Hermes2 is running on `8643` with pid `74688`; `/api/connection-status?instance=hermes2` is `connected`, `/api/ping?instance=hermes2` returns HTTP 200, and `/profiles` shows Hermes2 as `live`.
- Hermes3 smoke result: Hermes1 and Hermes2 stayed running; Hermes3 is running on `8644`; `/api/connection-status?instance=hermes3` is `connected`, `/api/ping?instance=hermes3` returns HTTP 200, `/api/models?instance=hermes3` returns models, `/profiles` shows Hermes3 as `live`, and the chat switcher exposes Hermes1/Hermes2/Hermes3 with no stopped state.

## V1.2 Runtime Hardening Checkpoint

The first V1.2 hardening slice is implemented and smoke-tested as of 2026-04-29:

- Profiles instance cards now expose an explicit refresh action plus a visible last-checked freshness label, so the live/stopped state is not presented as timeless.
- Start failures now return structured, redacted diagnostics for known failure classes including port conflicts, immediate exits, missing tmux, duplicate Telegram token refusal, timeout, and unknown failures.
- The WSL start script checks whether the selected instance port is already bound before dispatching a new tmux session, which improves port-conflict diagnosis when `/health` is not reachable.
- `GET /api/instances/start-log?instance=<id>` returns a redacted, tail-limited summary of the selected non-default profile's `logs/workspace-start.log`; Hermes1/default log summaries are intentionally rejected from this route.
- Profiles surfaces redacted start failure details and can refresh the redacted per-instance start-log summary without adding Stop or Restart controls.
- Duplicate-start protection remains: running instances still render as `live` with no Start action, and repeated Start API calls for already-running non-default instances keep returning `already-running`.

Latest V1.2 verification:

- `pnpm test` passed 30 files / 98 tests on 2026-04-29.
- `pnpm build` passed on 2026-04-29 with the existing sourcemap, dynamic-import, and chunk-size warnings.
- Existing Workspace `16061` smoke passed for `/api/instances`, `/api/connection-status`, `/api/ping`, `/api/models`, `/profiles`, and `/chat/new` across default/Hermes2/Hermes3.
- A separate built Workspace smoke on `16062` verified the new `start-log` route and built `/profiles` plus `/chat/new` switcher UI without restarting Hermes1 or replacing the existing `16061` process. The ad-hoc `16062` process was stopped after smoke; it was not used for `/api/models` because it did not inherit the existing Workspace gateway-auth environment.

## Version Roadmap

The roadmap distinguishes runtime parallelism from full product-level isolation:

- **V1 - Read-only safety boundary:** completed for the core chat and visual-status surfaces. Stopped Hermes2/Hermes3 are not presented as Hermes1-backed live state, and shared Workspace surfaces are labeled honestly.
- **V1.1 - Parallel runtime start flow:** explicit Start controls can bring Hermes2/Hermes3 online without disturbing Hermes1. This is the stage where all three Hermes gateways run in parallel for chat; Hermes2 and Hermes3 both passed smoke on 2026-04-29.
- **V1.2 - Parallel runtime hardening:** improve the operational layer around three running gateways: status refresh, start failure diagnosis, redacted per-instance logs, duplicate-start protection, port-conflict handling, and any future Stop/Restart design. This stage still treats Knowledge/Memory/Skills as shared or default-scoped unless explicitly upgraded.
- **V2 - Full per-instance Workspace semantics:** make Hermes1/Hermes2/Hermes3 feel like three genuinely independent workspaces, not only three chat backends. V2 owns per-instance Knowledge, Memory, Skills, Hermes config, MCP/config helpers, and related APIs so each profile can carry its own agent identity, tools, memory surface, and workspace behavior.

Practical rule: three Hermes processes running side by side for chat is the V1.1 target and is now smoke-tested; three complete Hermes workspaces with independent Knowledge/Memory/Skills semantics is a V2 target.

## Next Execution Plan

Use this order for the next Codex window:

### 0. Clean Working Tree Boundaries

Before starting V1.2 implementation, resolve the two remaining working-tree boundary files:

- Done: `pnpm-workspace.yaml` is committed as package-manager metadata for pnpm 10 dependency build-script approvals.
- Done: `start-hermes-workspace.cmd` is separately reviewed as a Windows Workspace-only launcher. It may build/start/open the Workspace, and it may probe Hermes1/default health, but it must not start, stop, restart, or kill any Hermes gateway.

Do not delete either file blindly; decide based on content and current repo conventions.

### 1. V1.2 Runtime Hardening - First Slice

Make the three-running-gateway setup easier to diagnose and safer to operate:

- Done: add clearer per-instance refresh behavior on the Profiles instance cards, including a last-checked freshness signal.
- Done: keep duplicate Start protection obvious in the UI: running instances show live state, not a Start action; repeated Start API calls keep returning `already-running`.
- Done: surface start failures with concise, redacted messages. Do not print API keys, full environment variables, `.env` contents, or raw profile files.
- Done: add a redacted per-instance start-log summary path from the selected profile's `logs/workspace-start.log`, with a non-default-only API boundary.
- Done: add port-conflict and immediate-exit diagnostics to the Start failure path so the user can tell whether a gateway failed to bind, exited, or never became reachable.
- Still out of scope: Stop/Restart controls. Never add Hermes1/default restart controls without separate user approval.

Suggested acceptance:

- Three running instances still show `live` on `/profiles`.
- Stopped or failed non-default instances show a clear, non-blocking failure state.
- No secrets appear in API responses, UI, logs copied into UI, tests, or docs.
- `pnpm test` and `pnpm build` pass after changes.

### 2. Three-Instance Runtime Smoke

After V1.2 changes, run a short smoke against all three instances:

- `/api/instances`
- `/api/connection-status?instance=default|hermes2|hermes3`
- `/api/ping?instance=default|hermes2|hermes3`
- `/api/models?instance=default|hermes2|hermes3`
- `/profiles`
- `/chat/new` with the Hermes switcher opened

For Playwright browser smoke, prefer `domcontentloaded` plus visible-selector checks instead of `networkidle`; chat pages may keep background requests open.

### 3. V2 Design Entry

Start V2 only after the runtime layer feels boring and debuggable. V2 should be a design-first slice covering how these become truly separate workspaces:

- V2 entry design doc: `docs/HERMES_V2_INSTANCE_SEMANTICS_DESIGN.md`
- per-instance Knowledge config and browsing
- per-instance Memory APIs and UI
- per-instance Skills APIs and visibility
- per-instance Hermes config and profile editing
- MCP/config helpers scoped to the selected WSL profile
- migration/compatibility rules for Hermes1/default legacy paths

V2 should begin with a written design before code changes because it changes product semantics, not only process/runtime behavior.

## Execution Order

### 1. Multi-Instance Impact Audit

Find remaining state, cache, localStorage, and API surfaces that still assume one Hermes instance.

Known candidates:

- `session-title-store.ts` uses global `hermes.sessionTitles.v1`.
- `thinkingLevel` in `chat-screen.tsx` uses `hermes-thinking-${activeFriendlyId || 'new'}`.
- `hermes-last-session` is global in route/session item code.
- `usePinnedSessions` uses global persisted store name `pinned-sessions`.
- Knowledge/Memory config screens may still assume a single default backend.
- Main dashboard/status areas may still show singleton gateway state.

Audit snapshot:

| Risk | Surface | Status | Notes |
| --- | --- | --- | --- |
| Chat correctness | Core chat API routes: models/status/sessions/history/session status/send stream | Done | Instance param resolves through WSL `~/.hermes` profile facts. |
| Chat correctness | Persistent desktop sidebar sessions query | Done | Uses `chatQueryKeys.sessionsFor(activeInstanceId)` and `/api/sessions?instance=...`. |
| Chat correctness | `session-title-store.ts` | Done | Default keeps `hermes.sessionTitles.v1`; Hermes2/3 use `hermes.sessionTitles.v1.<instance>`. |
| Chat correctness | `thinkingLevel` sessionStorage | Done | Default keeps `hermes-thinking-<session>`; Hermes2/3 use `hermes-thinking-<instance>-<session>`. |
| Chat correctness | `hermes-last-session` | Done | Default keeps `hermes-last-session`; Hermes2/3 use `hermes-last-session-<instance>`. |
| Chat correctness | `usePinnedSessions` | Done | Persist store name stays `pinned-sessions`; default list is legacy, non-default pins live under `pinnedSessionKeysByInstance`. |
| Chat correctness | Active-run polling and persisted run store | Done | Client polling passes `?instance=...`; default keeps legacy run paths and Hermes2/3 use `runs/instances/<instance>/<session>`. Waiting-state keys are also scoped for non-default instances. |
| Knowledge/Memory isolation | Knowledge browser/config | V1 display-only | UI now labels Knowledge as Workspace-shared; config still lives in default `~/.hermes/knowledge-config.json`. |
| Knowledge/Memory isolation | Memory browser | V1 display-only | UI now labels Memory as Workspace-shared; browser reads Workspace server `HERMES_HOME`/`~/.hermes` files, not WSL profile-specific memory. Non-default instances render the Workspace-shared browser rather than gating on stopped Hermes2/3 backend capability. |
| Knowledge/Memory isolation | `/api/memory`, `/api/hermes-config`, `/api/skills*`, MCP/config helpers | Remaining | These still use legacy singleton gateway/config helpers or default local paths. Dashboard, direct Skills, and global search hide non-default skills rather than implying Hermes2/3 shares Hermes1 skills. |
| Visual-only status | Dashboard | Done | Dashboard sessions/status follow active instance; model card reads WSL profile metadata; non-default skills are explicitly hidden for V1. Browser smoke confirmed Hermes2 stopped is shown as stopped and does not inherit Hermes1 state. |
| Visual-only status | Sidebar `StatusDot`, reconnect banner | Done | Both use active instance status. Reconnect no longer treats HTTP 200 + disconnected payload as connected, and silent auto-start is gated off by default. |
| Visual-only status | `auth-check` and startup overlay | Done | Client passes active instance to `/api/auth-check`; non-default unreachable instances return structured state without blocking the Shell, default keeps legacy blocking behavior. |
| Visual-only status | Onboarding setup wizard/status widgets | Done | V1 keeps setup Workspace-level/default. `/api/auth-check`, `/api/gateway-status`, `/api/hermes-config`, `/api/models`, and setup chat test paths are built through onboarding scope helpers; non-default status payloads do not auto-complete onboarding. |
| Start flow | Hermes2/Hermes3 controls | V1.1 three-instance smoke done | Start controls are implemented with confirmation and default/Hermes1 rejection. Hermes2 and Hermes3 have both passed smoke; all three Hermes gateways are running for chat. |

Acceptance:

- Produce a concrete checklist of remaining singleton assumptions.
- Sort items by risk: chat correctness, Knowledge/Memory isolation, visual-only status, Start flow.
- V1 checkpoint: met for chat correctness and visual-only status; remaining singleton assumptions are intentionally scoped to V1 display-only/shared surfaces or future V1.1+ work.

### 2. Main / Knowledge / Memory Isolation Design

Define scope rules before adding more UI:

- Main chat state must be per Hermes instance.
- Knowledge configuration should clearly show which Hermes profile/backend it belongs to.
- Memory/skills status should not imply Hermes2/3 shares Hermes1 state unless that is actually true.
- Default instance may keep legacy storage keys for compatibility, but Hermes2/3 should use scoped keys.

Acceptance:

- Decide exact storage key and query key conventions.
- Decide read-only labels for scope: instance id, profile path, gateway port, model/provider, status.
- Identify whether Knowledge/Memory scope is display-only in V1 or configurable in V1.1.

Decisions:

- Query keys: chat sessions use `['chat', 'sessions', instanceId]`; chat history uses `['chat', 'history', instanceId, friendlyId, sessionKey]`; dashboard sessions use `['dashboard', 'sessions', instanceId]`; gateway status uses `['gateway-status', instanceId]`.
- URL convention: browser-to-Workspace API calls use `?instance=<id>`; server routes resolve that against WSL Hermes profiles.
- Storage convention: default/Hermes1 keeps legacy keys for compatibility; Hermes2/3 append the normalized instance id before the scoped session suffix.
- Scope labels: `Instance-scoped` means the visible data follows the selected Hermes profile/gateway; `Workspace-shared` means the page is showing Workspace-level local data while naming the selected Hermes agent for context.
- Knowledge and Memory are display-only scoped in V1. Per-profile Knowledge/Memory configuration is V1.1+ work and must not be implied by the V1 UI.

### 3. Read-Only Scope Display

Add clear read-only UI so the user can see what is scoped to which instance before any Start buttons exist.

Suggested surfaces:

- Profiles: extend Hermes Agents / Instances with scope details if needed.
- Chat header: keep instance switcher clear and high contrast.
- Knowledge/Memory: show current active Hermes instance and whether the backing data is instance-scoped or shared.
- Main/dashboard: show which Hermes instance the visible status belongs to.

Acceptance:

- UI never suggests stopped Hermes2/3 are live.
- Switching instances does not display stale Hermes1-only state as Hermes2/3 state.
- Stopped instance `/api/ping` returning 503 is treated as expected.

### 4. Hermes2 / Hermes3 Start Buttons

Only after the audit and read-only scope display are stable, add explicit Start controls for stopped instances.

Rules:

- Ask for user confirmation before starting Hermes2 or Hermes3.
- Start Hermes2 on `8643`; start Hermes3 on `8644`.
- Do not disturb Hermes1/default on `8642`.
- Do not reuse singleton gateway helpers that pin requests back to `8642`.
- Surface start progress and failure clearly.

Acceptance:

- Hermes2/3 can be started independently.
- Chat switcher reflects status transitions.
- API routes target the selected instance after start.
- No API keys are printed in logs or UI.

#### V1.1 Draft Design

Start flow should be implemented as an explicit, instance-scoped user action:

- API shape: add a new instance-scoped start endpoint such as `POST /api/instances/:instanceId/start`, or `POST /api/instances/start` with a required `instance` body field. Avoid extending the legacy `/api/start-hermes` route directly because it is default/8642-oriented.
- Server behavior: resolve the requested instance from WSL `~/.hermes` profiles, reject `default` unless a separate Hermes1-specific flow is explicitly approved, and launch only the selected profile/port. The command runner must redact known secret keys from errors/logs and must not echo environment contents.
- Process model: use the WSL profile as source of truth, set the profile/home/port environment required by Hermes for that instance, and probe only the selected instance health URL (`8643` for Hermes2, `8644` for Hermes3) after launch.
- UI placement: add Start controls on the Profiles Hermes Agents / Instances cards first, then optionally expose a compact action from the chat switcher for stopped non-default instances.
- Confirmation: clicking Start opens a confirmation dialog naming the instance, profile path, and port. The actual POST happens only after the user confirms.
- State refresh: on accepted start, show a per-instance starting state, refetch `/api/instances`, `/api/connection-status?instance=...`, `/api/auth-check?instance=...`, and active chat status until the instance reports running or times out.
- Failure display: show concise, redacted failure messages with the target instance and port. Do not print API keys, `.env` contents, or full command environments.
- Safety tests: cover request validation, default/Hermes1 rejection, port targeting, redaction, and UI confirmation gating before any manual start smoke.

## Working Tree Grouping

Snapshot from 2026-04-29 after the Hermes2 V1.1 smoke:

- **Docs / project compass:** `docs/HERMES_MULTI_INSTANCE_PLAN.md`.
- **Instance registry and server API:** WSL profile discovery, instance resolution, scoped API helpers, `/api/instances`, and `/api/instances/start`.
- **Profiles Start flow:** Profiles instance cards, confirmation-gated Start UI, and Hermes2 start tests.
- **Chat isolation:** instance switcher, scoped chat queries, session/history/send/model/ping routes, local state keys, pending-send recovery, session titles, pins, active-run polling, and run-store paths.
- **Startup / status / onboarding:** startup overlay, reconnect banner, status dot, root layout state, auth-check, connection-status, gateway-status, and onboarding scope helpers.
- **Dashboard / Memory / Knowledge / Skills display:** V1 scope banners and hidden/default-scoped Skills behavior for non-default instances.
- **Tests:** 20 focused new/updated test files cover instance discovery, auth/status semantics, chat local state isolation, run-store isolation, Start safety, and V1 display-only behavior.
- **Generated/config:** `src/routeTree.gen.ts` is expected because new routes were added; `vite.config.ts` intentionally lets the real `/api/connection-status` route handle that endpoint instead of the Vite proxy shim; `pnpm-workspace.yaml` is committed package-manager metadata for pnpm 10 dependency build-script approvals.
- **Windows launcher:** `start-hermes-workspace.cmd` is a Workspace-only convenience launcher. It probes Hermes1/default health and prints guidance if unreachable, but it intentionally never auto-starts or restarts Hermes gateways. Keep it out of any future multi-instance gateway control story unless redesigned.

Lightweight safety checks from the grouping pass:

- `git diff --check` exits cleanly; only Windows LF-to-CRLF warnings are printed.
- Secret-like scan over changed and untracked files found no matching files. Do not replace this with printing raw diffs from profile or environment files.

## Verification Commands

Run these after meaningful code changes:

```powershell
pnpm test
pnpm build
```

For focused chat isolation changes, also run:

```powershell
pnpm test src/screens/chat/pending-send.test.ts src/screens/chat/portable-history.test.ts src/screens/chat/chat-queries.test.ts src/screens/chat/chat-screen-utils.test.ts
```

Browser smoke target:

```text
http://127.0.0.1:16061/chat/new
http://127.0.0.1:16061/profiles
```

## Handoff Template

```text
Project: D:\Agent\hermes-workspace

First read:
- docs/HERMES_MULTI_INSTANCE_PLAN.md
- git status --short
- current git diff

Constraints:
- Do not output/copy API keys.
- Do not kill/restart Hermes1 without explicit user approval.
- Do not auto-start Hermes2/Hermes3 until Start-button work and user confirmation.

Current verified baseline:
- `pnpm test` passed 30 files / 91 tests on 2026-04-29
- `pnpm build` passed on 2026-04-29 with existing warnings
- Hermes1/default running on 8642
- Hermes2 running on 8643
- Hermes3 running on 8644
- V1.1 three-instance API and browser smoke passed

Next recommended slice:
- First resolve untracked `pnpm-workspace.yaml` and `start-hermes-workspace.cmd`.
- Then start V1.2 Runtime Hardening from the `Next Execution Plan` section.

Recent local commits:
- d0cd6e5 Document Hermes3 start smoke
- 286821f Add Hermes multi-instance safety and start flow
```
