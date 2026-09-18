# Phase 3 implementation status

**Date:** 2026-09-18

**Result:** Phase 3 is COMPLETE for the approved Codex CLI + Antigravity CLI path. Phase 3B passed real production-wrapper normal completion and Ctrl+C interruption on agy 1.2.6, in addition to its durable/privacy/regression checks. Antigravity IDE remains BLOCKED / unsupported and was explicitly excluded from Phase 3B. Core v1, Hub UI and Codex behavior are unchanged.

## Final real production-wrapper validation

Core observed Antigravity working/1 → idle/0/completed at 08:54 UTC, then a fresh wrapped session working/1 → idle/0/interrupted-or-abandoned at 08:56–08:57 UTC. The preceding completed operation was preserved. Store inspection confirms distinct hashed operation/session correlation, chronological timestamps, zero active operations/open sessions/owners, no pending payload or reporter lease, no last failure, and sequence 51. After session end, Core and Hub both derived offline through the existing 30-second heartbeat expiry. Both independent agent identities remain present; Codex's heartbeat/outcome was unchanged. See [the full Phase 3B result](antigravity-cli-status-adapter.md).

## Current Phase 3B checkpoint

The dedicated `antigravity-cli/antigravity-local-1` producer credential is provisioned through Core's existing CLI and secured outside Git with CurrentUser DPAPI. The production wrapper, neutral named workspace hooks, service-bound durable store and separate worker reuse the established reporter without modifying Codex, Core v1 or Hub UI. The named status hook is installed only in the previously trusted scratch workspace for production validation.

28 Antigravity/deployment tests and all 39 existing Phase 3 tests pass (67 total). The 20 Core status tests, eight Hub tests, focused lint and Hub build pass. Controlled production callbacks reached idle/working/idle with correct normal and interrupted-or-abandoned outcomes. Core contains both independent agent identities; headless Chrome confirmed generic Hub rendering. Real production-wrapper normal and Ctrl+C tests subsequently passed. See [the Phase 3B report](antigravity-cli-status-adapter.md).

The initial AppData credential/config deployment was virtualized into Codex desktop's private package cache and invisible to the IDE terminal. Its existing encrypted credential and consistent SQLite state have been exported to `D:\ascend-status-adapters\antigravity-cli\antigravity-local-1`. The credential bytes and binding are unchanged, the original deployment is preserved, and wrapper/provisioning defaults now use this host directory. Host preflight/config/decryption/ACL checks pass. Use only the host deployment for reporting.

First real host-wrapper sessions opened normally and heartbeated, but production operation transitions were absent. The original scratch hook recorded the actual tasks. A native Windows command reproduction found unnecessary embedded hook-path quotes broke callback execution. Only the Ascend-generated command and its exact known workspace entry were corrected; command tests now exercise ordinary native Windows escaping. Controlled checks now invoke the same command boundary. Both real production-wrapper tasks subsequently passed after that fix.

The sections below retain earlier probe checkpoints as history; the current result above supersedes their earlier pending/blocker statements.

## Antigravity CLI live result (2026-09-18)

- Installed: **YES** — `agy 1.2.5` at `C:\Users\Cyrill Gerard\AppData\Local\agy\bin\agy.exe`; it is installed but was absent from the invoking terminal's `PATH`.
- Authentication: an already authenticated CLI TUI opened successfully; no account identifier or authentication material was recorded.
- Hook/config source: a disposable workspace-local `.agents/hooks.json`, as documented for Antigravity CLI. `/hooks` displayed the named `ascend-phase3-agy-probe` entries for `PreInvocation`, `PostInvocation`, and `Stop`.
- Temporary probe: local-only Node handler and JSONL output under a disposable `%TEMP%` workspace. It allowlisted only fixed event metadata, hashes, bounded counters, booleans, and safe termination categories. It contained no network/Core/Hub/credential logic.
- Start and normal completion: **emitted**. A later live session produced 284 safe `invocation-start`, 283 safe `invocation-finished`, and seven `stopped` records across two hashed sessions, in chronological order. `Stop.fullyIdle: true` was observed; the safe-mapped raw termination category remained `other`.
- Interruption: **partially observed**. A fresh interrupted no-tool poem emitted a correlated `invocation-start` but no matching `invocation-finished` or `stopped` record before CLI exit.
- Session/turn/tool signal: hashed session/turn correlation was present on emitted invocation records. One harmless `run_command` produced one `PostToolUse` / `tool-finished` record. The interrupted operation remained unclosed.
- Privacy: preserved. No prompts, responses, transcript data, source code, tool I/O, terminal output, raw errors, logs with content, or credentials were stored or inspected.
- Classification: **PARTIALLY SUPPORTED** for this installed `agy 1.2.5` workspace-hook execution path. `/hooks` registration now has live dispatch evidence, but it does not guarantee an interruption terminal callback.
- Files changed: this status document and `phase-3-local-ai-status-adapter-audit.md`; temporary disposable probe files exist only under `%TEMP%` and are not a production adapter.
- Production hooks changed: **NO**. Credentials changed: **NO**. Core changed: **NO**. Hub changed: **NO**.

Recommended next action: leave the CLI adapter unimplemented until its durable reporter design explicitly handles CLI-process exit/abandoned active operations when interruption lacks a terminal callback. Do not create a producer credential or work around the missing lifecycle callback with transcript/log/UI scraping. Antigravity IDE remains separately BLOCKED.

## Current Codex-only implementation checkpoint

The interactive evidence now contains six actual callbacks in one session: `SessionStart → UserPromptSubmit → Stop → UserPromptSubmit → Interrupt → SessionEnd`. Correlation and order checks pass. Automatic project-hook discovery remains unverified and unused by the implementation.

Implemented the shared SQLite operation store, leased reporter, neutral Codex hook handler, and explicit-session native launcher under `scripts/status-adapters/`. Provisioned only a new dedicated `codex-cli/codex-local-1` credential with Core's existing CLI, protected in Windows CurrentUser DPAPI outside the repository. Existing hooks/credentials, Core source/contract, Hub UI and Antigravity are unchanged.

36 Phase 3 tests, 17 Core status tests, eight Hub Phase 2 tests, focused lint and Hub production build pass. Repo-wide lint remains failing with 18 errors/107 warnings in existing UI/vendor files, not the new adapter/tests.

Controlled actual adapter hooks reached live Core/Hub idle with HTTP 202. Working returned HTTP 500. Actual Core schema/service/repository reproduction confirms `activity.startedAt` stays a Python datetime through `StatusService.ingest_event` (`status_service.py:45`) and fails `json.dumps(value.activity)` (`status_repository.py:193`) before database access. Core was not changed and the valid field was not removed to bypass the bug. Further live transitions are blocked until a separately authorized backend bugfix.

Headless Chrome confirmed the unchanged Hub renders Codex generically with an offline state after Core heartbeat expiry. No real production-wrapper Codex task has been claimed successful. The complete current manifest/design/operator commands/evidence/limitations are in [codex-status-adapter.md](codex-status-adapter.md). The remaining sections below retain the earlier probe checkpoint as history.

## Verified mismatch

The implementation prompt targets `Antigravity IDE 2.12.2`. This machine instead has two distinct products:

- `Antigravity 2.12.2` at `C:\Users\Cyrill Gerard\AppData\Local\Programs\antigravity\Antigravity.exe`: the separate desktop application.
- `Antigravity IDE 2.5.5` at `D:\Antigravity IDE\Antigravity IDE.exe`: the requested IDE. The uninstall registry, Start Menu shortcut, and executable file/product metadata agree on this identification.

The audit's version claim was incorrect and has been corrected in [the audit report](phase-3-local-ai-status-adapter-audit.md). Its public Code platform manifest version `1.107.0` is separate from the IDE product version `2.5.5`.

The resume prompt explicitly authorized the corrected IDE `2.5.5` target. The version mismatch is resolved. The compatibility findings below are the current blockers; no adapter mapping was changed to work around them.

## Actual progress

- Read the complete implementation prompt and audit report.
- Inspected the existing Core v1 producer route/schema and current Codex hook configuration. Existing `PostToolUse`/`Stop` hooks run design checks and must be preserved when status hooks are eventually installed.
- Verified the installed product identities using registry, shortcut, executable, and manifest metadata without reading agent content or secrets.
- Corrected the audit and wrote this implementation status record.
- Independently reconfirmed IDE executable product/version `Antigravity IDE / 2.5.5` and CLI version `0.153.4`.
- Added a temporary callback and six focused privacy/failure-handling tests in Hub's scripts/tests folders. These files do not implement a status producer or change the app.
- Installed only scratch-workspace probe files under `C:\Users\Cyrill Gerard\AppData\Local\Temp\ascend-phase3-ide-probe-599b143a57994a29816aeb11ff12c729`.
- Opened the actual IDE using its supported command line. The user confirmed CLI editor chat did not exercise the built-in agent, then separately confirmed a built-in agent task completed.
- Observed no IDE callbacks after that actual task. Stopped before an IDE production adapter or cancellation/failure probe.
- Independently validated real Codex `exec` callbacks using explicit temporary session hooks. Interactive terminal/interruption validation remains pending.

## Antigravity IDE live result

- Executable: `D:\Antigravity IDE\Antigravity IDE.exe`.
- Product/version: `Antigravity IDE / 2.5.5`, from local executable metadata.
- User configuration: `AppData\Roaming\Antigravity IDE\User`; documented user hook candidate `~/.gemini/config/hooks.json` was not changed.
- Workspace configuration: temporary `.agents/hooks.json` in the scratch workspace, using the documented named-hook schema for `PreInvocation`, `PostInvocation`, `PostToolUse`, and `Stop`.
- Probe mechanism: stdin JSON callback that explicitly allowlists metadata and writes only local sanitized JSONL. No Core transport or credentials exist in the callback.
- Actual task: user-confirmed normal completion in the built-in agent pane. The earlier editor-chat CLI launch was excluded from evidence.
- Start/completion/cancellation/failure/correlation: **unverified** because no `events.jsonl` file was created after the real task. No cancellation or artificial failure was attempted after this gate failed.
- Privacy: no UI scraping or transcript/log/session content inspection. Only filenames/directories were inspected for data locations. Callback privacy and fail-open behavior passed six tests against controlled inputs.
- Classification: **BLOCKED at the compatibility gate**. The cause could be configuration recognition or callback execution; this does not establish that the IDE lacks hooks in every supported configuration location. Production adapter implementation is prohibited until this is resolved.

## Codex CLI live result

- Version: `codex-cli 0.153.4`, installed npm binary.
- Real live mode tested: ephemeral non-interactive `exec`, read-only sandbox, ignoring user configuration and using explicit temporary session hook overrides, including `commandWindows`.
- Hook trust: the reviewed local-only script used Codex's documented one-invocation automation flag for that isolated headless run. No stored trust, authentication, or producer credential was changed.
- Sanitized callback ordering: **SessionStart → UserPromptSubmit → Stop → SessionEnd**, exactly one record each in that successful run.
- Correlation: the same hashed session ID across four events; the same hashed turn ID across submission and completion. `stop_hook_active` was false.
- Project hook discovery: earlier scratch project-file-only `exec` runs produced no callbacks. The successful explicit session overrides do not establish project-local discovery.
- Structured output: only allowlisted event-type counts were processed; assistant response, tool data, and raw errors were discarded without recording.
- `Interrupt`, normal interactive terminal reuse/new sessions: **pending**, not claimed successful. An attempted interactive launch through the available terminal-control tool failed at its control interface; it was not counted as a Codex runtime result.
- The user's interactive launch screenshot showed Windows PowerShell splitting the quoted hook configuration at the space in `Cyrill Gerard`; Codex never started. `/hooks` was consequently interpreted as a PowerShell command. This is a launcher issue, not evidence of an authentication or hook-trust failure.
- Reproduced that argument split using Windows PowerShell and a local Node argument receiver. The scratch-only `probe-codex.ps1` now delegates native argument handling to `scripts/phase3-codex-launcher.mjs` with no shell interpolation. Its Windows PowerShell `-Check` invocation reaches Codex help successfully; this checks launch arguments, not interactive hook behavior. Normal hook review/trust, read-only sandboxing, and temporary inline hooks remain intact; production hooks are unchanged.
- Classification: **PARTIALLY SUPPORTED**, with a real non-interactive start/completion boundary proven. No production adapter has been implemented.

## Probe files and checks

Repository files added:

- `scripts/phase3-hook-probe.mjs`: temporary local-only callback, with no network code or secret persistence.
- `tests/phase3/probe.test.mjs`: six tests for privacy, stable hashed correlation, invalid metadata, neutral hook output, malformed/oversized input, and filesystem failure behavior.
- `scripts/phase3-codex-launcher.mjs`: shell-free temporary Codex launcher; no credentials, transport, or trust bypass.
- `tests/phase3/launcher.test.mjs`: native argument round-trip regression and invalid hook-definition rejection.

Temporary scratch files: `.agents/hooks.json`, `.codex/config.toml`, `codex-probe-hooks.json`, `probe-codex.ps1`, `README.md`, and the real sanitized `codex-events.jsonl` evidence. A temporary `.git` directory identifies the scratch workspace for CLI configuration discovery. The IDE evidence file remains absent. Test fixtures were written only to separate test directories and never mixed with live evidence.

`node --test tests/phase3/launcher.test.mjs tests/phase3/probe.test.mjs`: **8 passed**. Focused ESLint on the callback, launcher, and tests: **passed**. Windows PowerShell scratch launcher `-Check`: **passed** (Codex help, no agent task). No production integration or schema deployment was performed.

## Live validation and deployment

| Deliverable | Actual status |
| --- | --- |
| Antigravity live hook probe | Built-in agent task completed; zero callback records. Compatibility gate blocked with cause unresolved. |
| Codex `UserPromptSubmit` / `Stop` | Verified in ephemeral `exec` with explicit temporary session hooks; interactive path pending. |
| Codex `Interrupt` | Pending; not claimed verified. |
| Shared durable reporter / adapters / tests | Not implemented; dependent on the probes. |
| New producer credentials | None created or configured. |
| Core v1 contract | Unchanged. |
| Hub UI | Unchanged. |
| End-to-end Shelf integration | Not run. |

## Next action

Resolve why the documented IDE workspace hook did not produce callbacks, using supported configuration/normal IDE hook controls. Do not implement an IDE adapter from documentation alone or infer unsupported behavior from the empty log. Complete Codex's interactive/interruption checks independently using the prepared scratch launcher. Only a passed compatibility gate permits that adapter's durable reporter implementation; no producer credentials or Core/Hub changes are justified by the current results.
