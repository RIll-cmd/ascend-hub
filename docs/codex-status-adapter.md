# Codex CLI status adapter — implementation and operational result

Date: 2026-09-18. Scope: Codex CLI 0.153.4 only.

**Result: Codex adapter implementation and real production-wrapper validation complete. Authorized Core serialization fix and controlled live Core/Hub transitions pass. Packaged-app storage visibility mismatch corrected with an explicit private host path. Antigravity remains BLOCKED and untouched. Overall Phase 3 is incomplete.**

## Verified gate and current deployment evidence

The user's interactive probe produced six real sanitized callbacks in one hashed session:

`SessionStart → UserPromptSubmit → Stop → UserPromptSubmit → Interrupt → SessionEnd`.

The normal and interrupted turns had distinct hashed turn IDs; Stop/Interrupt matched their respective submissions and timestamps were chronological. Four earlier headless events were excluded from the interactive result. The gate is passed for explicit session overrides; automatic project hook discovery remains unverified.

The production wrapper was subsequently launched with the explicit private host configuration. The operator completed a no-tools `2 + 2` task, then interrupted an actively generating long response with Ctrl+C and returned to PowerShell. Its durable store contains one new hashed session with two distinct hashed turns in chronological order: `completed`, then `interrupted`. No raw task content is stored. There are zero active operations, open sessions, and live owners after exit.

Core and Hub both returned the same service after this real run. At the time of verification the service had correctly expired to `offline`, with `activeOperationCount: 0` and `lastOutcome: interrupted`; that is expected after SessionEnd stops heartbeats. The earlier controlled live checks independently observed the interim idle/working states and generic working CRT rendering. Together, these establish the Codex portion of Phase 3.

The new adapter was then exercised using explicitly controlled lifecycle metadata through its actual hook subprocesses, not through a real Codex agent task. These checks used the dedicated Codex producer and existing live Core/Hub APIs:

- Before the separately authorized Core fix, idle succeeded but working returned HTTP 500 at the datetime serialization boundary described below.
- After the fix, both existing Shelf endpoints reflected idle, working, heartbeat advancement, durable reopen, overlapping turns, Stop while another turn remained working, Interrupt to idle with outcome interrupted, and normal Stop to idle with outcome completed. Service identity remained `codex-cli / codex-local-1`, `serviceType: agent`, TTL 30 seconds.
- Fresh headless Chrome rendered the unchanged generic Codex CRT while working. After heartbeats ceased, both APIs derived offline as before.
- These are controlled actual adapter-hook integrations, not a new real Codex task. The earlier real interactive lifecycle gate remains distinct evidence.
- Production hooks, Core contract, Hub UI, Vision configuration, and existing credential bindings are unchanged. Only the authorized Core serialization line and its regression test changed in Core. No Prisma schema push/generation was run.

## Precise Core serialization defect — resolved by authorized narrow fix

`D:/ascend-core/server/services/status_service.py:45` uses `event.activity.model_dump(by_alias=True)`. A valid `activity.startedAt` is therefore a Python `datetime` in the stored dictionary. `D:/ascend-core/server/services/status_repository.py:193` uses `json.dumps(value.activity)`, which cannot serialize that datetime.

Confirmed with a valid v1 event passed through the actual schema and StatusService, then the actual Postgres repository: TypeError occurred before any database access. The existing in-memory Core tests do not exercise that serialization boundary and still pass.

The authorized correction changed that activity dump to `model_dump(mode="json", by_alias=True)`. The adapter keeps its valid `activity.startedAt`; the v1 contract is unchanged. Three Postgres-boundary regression cases exercise UTC, fractional seconds, and a non-UTC offset, then read back through the existing v1 Shelf service. The original 17 Core status tests plus these three cases pass.

## File manifest

New production adapter files, all under `D:/ascend_hub/scripts/status-adapters/`:

| File | Responsibility |
| --- | --- |
| `codex-lifecycle.mjs` | Explicit input allowlist, hashed session/turn correlation, normalized lifecycle mapping. |
| `local-store.mjs` | SQLite WAL transactions, active turns, terminal tombstones, supervised owner leases, persistent aggregate/emitter state. |
| `reporter.mjs` | Leased emission, v1 payload construction, coalescing, bounded delivery/retry and local write budget. |
| `config.mjs` | Non-repository configuration validation, user-bound DPAPI credential read, removal of Ascend secrets from inherited environment. |
| `codex-hook.mjs` | Short neutral command hook; local storage only, no network or credential access. |
| `worker.mjs` | Out-of-band reporter loop and final-state drain. |
| `codex-launch.mjs` | Native explicit-session override arguments, ordinary hook trust, supervised reporter restart, Codex version check. |
| `codex-status.ps1` | Operator launcher compatible with Windows PowerShell path quoting. |
| `provision-codex.ps1` | Captures the existing Core credential CLI's one-time output and protects it outside Git; no second generator. |
| `live-smoke.mjs` | Opt-in controlled hook/Core/Hub/browser validation; clearly distinguishes injected lifecycle from a real Codex task. |

New tests: `tests/phase3/codex-status.test.mjs`, `codex-hook.test.mjs`, and `codex-config.test.mjs`.

New implementation checklist: `docs/superpowers/plans/2026-09-18-codex-status-adapter.md`. Updated records: `docs/phase-3-local-ai-status-adapter-audit.md`, `docs/phase-3-implementation-status.md`. Hub package/dependency/UI files were not edited for this task.

## Durable reporter design

The reporter/store are shared local primitives; only the Codex translator/launcher is enabled. SQLite holds hashed opaque identity, timestamps, owner liveness, terminal outcome, sequence, emitter lease, one latest pending event, and bounded transmission/retry metadata. It never stores raw hook input, workspace paths, tool content, or credentials.

State is instance-scoped. Opening the same file with another service/instance identity is rejected. `BEGIN IMMEDIATE`, WAL and FULL synchronous durability serialize writes across hook/worker processes. A 250ms SQLite busy timeout keeps hook contention bounded. Terminal records and closed-session tombstones are retained for 24 hours, then pruned; transmission budget records retain only the last minute. There is no indefinite heartbeat history or event queue.

Owner leases are renewed every five seconds by the supervised launcher and expire after 20 seconds. Expired owners' remaining operations are abandoned, not classified as successfully completed. A healthy reporter restart retains active operations. A single 15-second emitter lease prevents duplicate instance writers; clean shutdown releases it and crash takeover is bounded. The launcher retries starting an exited/signaled reporter at five-second intervals while Codex runs. Status failures do not terminate Codex.

## Exact lifecycle mapping

| Codex hook | Internal action | Aggregate result |
| --- | --- | --- |
| SessionStart | Open correlated session. | Idle/ready only if no active turn exists. A launcher alone is not a ready signal. |
| UserPromptSubmit | Insert correlated active turn once. | Working while any turn remains active. |
| PreToolUse / PostToolUse | Refresh an already-active matching turn's progress timestamp. | Coalesced progress; no tool details are inspected or emitted. These optional progress hooks are documented but were not exercised by the no-tools live probe. |
| Stop | Complete only the matching session/turn. | Idle only after the last active turn; outcome completed. |
| Interrupt | Interrupt only the matching session/turn. | Idle only after the last active turn; outcome interrupted, never implied success or stuck. |
| SessionEnd | Close that session and clear its remaining turns. | Other sessions remain working; final reporter absence expires through Core. |

Duplicate starts do not increment a Boolean/counter or fabricate progress. Terminal tombstones reject late starts/progress. Interrupt remains distinct and takes precedence if a Stop races it. Session closure is idempotent. Unknown/malformed identity is ignored with neutral hook output.

## Heartbeats, stuck and delivery bounds

Aggregate transitions are eligible on the next out-of-band worker tick (approximately 200ms), not inside a Codex hook. Repeated tool progress is coalesced; unchanged active/ready sessions emit presence about every 10 seconds. Idle presence continues only for an open, supervised session. Periodic writes cease after the final session/launcher exits; the final latest state may be drained with bounded retries.

An active operation with 90 seconds of safe lifecycle silence becomes stuck only when a healthy reporter is evaluating it. Fixed issue: `lifecycle-timeout`, "No lifecycle progress observed for 90 seconds." Heartbeats/lease renewals do not count as operation progress. Later verified progress recovers working; completion/interruption clears the operation. Long work with regular progress remains working indefinitely.

This is an observation-gap warning, not proof of a model failure. The verified hooks cannot distinguish silent long generation from a blocked operation or identify approval waits. No transcript/UI/error scraping was added to invent that distinction.

Network: two-second fetch deadline; at most three attempts per event with two/four-second retry spacing. Retries retain eventId/sequence. Newer aggregate state supersedes an unavailable old pending event; the queue is one slot. A durable rolling 55-attempt/minute budget reserves headroom under Core's 60/minute limit. Saturated transitions coalesce to the newest state. HTTPS is required except loopback HTTP; redirects, URL credentials and query secrets are rejected. Response bodies and raw errors are not used as status signals.

## Credential and launch setup

A new dedicated credential was provisioned for `codex-cli / codex-local-1` through `server.cli.status_credentials create`. No Core/AIRA, Vision, or read credential was reused/rotated. Local configuration:

`D:/ascend-status-adapters/codex-local-1/config.json` — only schemaVersion/instanceId/coreEventsUrl.

The original AppData deployment was redirected by Codex desktop's packaged-app filesystem into its private package `LocalCache`. Native `realpathSync` established the physical location. Both PowerShell and Node in the user's IDE terminal returned false for the apparent AppData config path; launcher diagnostics correctly reported `CONFIGURATION_NOT_FOUND`. This was a deployment visibility mismatch, not a version, lifecycle, or credential-binding defect.

The existing config and DPAPI-protected credential bytes were exported to the private D: directory, outside Git. A consistent SQLite backup preserved sequence 21 and operation state; no active owners/operations existed during the copy. The encrypted credential bytes are unchanged, no credential was created/rotated, and originals remain preserved. Target inheritance is disabled with one operator-only access rule. Use only the new host deployment for reporting; the original retained store is not another live writer.

Host-path configuration validation, credential decryption, physical-path verification, and wrapper `--version` pass from the coding agent. Controlled actual hook integration was rerun from the host deployment and passed live Core/Hub idle, working, concurrent completion, interruption, heartbeat advancement, durable reopen, and generic browser rendering. The operator's real interactive wrapper task is also verified above. Always pass the explicit `-ConfigPath` below: the unchanged profile-based wrapper default must not select the old virtualized deployment.

The adjacent `credential.dpapi` is encrypted with Windows CurrentUser DPAPI. Directory inheritance is disabled and write/read access granted to the operator. The SQLite `status.sqlite` is adjacent but contains no credential. Producer material is not passed in argv/hooks, persisted in Git, or inherited by the Codex child; legitimate Codex/OpenAI account auth remains unchanged.

**Do not reprovision the existing instance.** Validate the already-provisioned host deployment:

```powershell
cd D:\ascend_hub
node --no-warnings .\scripts\status-adapters\live-smoke.mjs --live `
  'D:\ascend-status-adapters\codex-local-1\config.json'
```

This is controlled integration validation, not a real agent task. Then, from the actual target workspace, launch a real interactive session:

```powershell
cd D:\ascend-core
& 'D:\ascend_hub\scripts\status-adapters\codex-status.ps1' `
  -ConfigPath 'D:\ascend-status-adapters\codex-local-1\config.json'
```

The wrapper checks CLI 0.153.4 and passes explicit `-c hooks.<event>` definitions with Windows command overrides using native argument arrays. It never edits `.codex/hooks.json`; normal configuration sources/unrelated hooks remain intact. Review the exact added commands through Codex's normal hook-trust interface, if requested. No trust bypass is used by the production launcher. Automatic project-hook discovery is neither required nor claimed proven. New script definitions require their own ordinary trust review.

## Tests and limitations

Phase 3 tests cover lifecycle correlation, overlap/duplicates/order, distinct terminal outcomes, session/owner cleanup, durable reopen and lease takeover/release, signaled worker restart eligibility, presence readiness, heartbeat coalescing/stable stateSince, stale pending supersession, write budget, real local HTTP failures/timeouts, actual neutral hook subprocesses, contention/input limits, stored/outgoing privacy, invalid durable outcome filtering, configuration isolation/quoting, and DPAPI roundtrip.

Commands:

```powershell
node --disable-warning=ExperimentalWarning --test tests/phase3/*.test.mjs
node node_modules/eslint/bin/eslint.js scripts/status-adapters tests/phase3 --max-warnings 0
npm run test:status
npm run build
cd D:\ascend-core\server
.\.venv\Scripts\python.exe -m pytest tests/test_status_service.py tests/test_status_credentials.py tests/test_status_read_credentials.py -q
```

Results: 39 Phase 3 tests (including safe preflight diagnostics), 20 Core status tests (17 existing plus three serialization regression cases), eight Hub Phase 2 tests. Focused lint and production build passed in the associated verification runs. The repo-wide lint baseline had 18 errors and 107 warnings in pre-existing UI/vendor files; a later bounded full-lint retry timed out. These unrelated files were not changed. Core tests have two existing dependency deprecation warnings; build has informational plugin-timing/route-classification notices.

Remaining limitations: optional tool-progress hooks were not locally live-probed; no resumed-session/remote/alternate CLI-mode support; observation gaps cannot prove model failure; terminal tombstone protection is bounded to 24 hours; status hook metadata can be lost during local disk/lock failures, without affecting Codex. Owner expiry closes abandoned sessions, so a fresh launch is required after an expired owner rather than resurrecting stale work. Windows CurrentUser DPAPI and the installed Node 24.14.1 are the verified runtime.

**Antigravity remains BLOCKED. Phase 3 remains incomplete.**
