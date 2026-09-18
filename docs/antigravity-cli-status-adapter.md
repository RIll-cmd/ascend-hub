# Phase 3B: Antigravity CLI status adapter

Date: 2026-09-18. Production implementation and real interactive production-wrapper validation are complete. Phase 3 is complete for the approved Codex CLI + Antigravity CLI path. Antigravity IDE remains unsupported / BLOCKED and was explicitly excluded from Phase 3B.

## Production live gate: passed

The operator ran the actual production PowerShell wrapper with installed agy 1.2.6, completed a harmless no-tool task and exited normally, then launched a fresh wrapped session and interrupted an actively generating no-tool response with Ctrl+C. Only sanitized store and shelf evidence was inspected:

- Normal: Core observed idle/0 → working/1 at `2026-09-18T08:54:36.633Z` → idle/0/completed at `08:54:57.503Z`.
- Interruption: Core observed idle/0 → working/1 at `08:56:47.429Z` → idle/0/interrupted-or-abandoned at `08:57:17.546Z`.
- The two operations have different hashed session/turn correlation and chronological timestamps. The interrupted operation has no progress/terminal hook after its start; wrapper exit closed it durably. The preceding completed operation remains completed.
- After both exits: zero active operations, open sessions and owners. Reporter lease is released, pending payload is null, last failure is null, and durable sequence reached 51.
- Core and Hub return schemaVersion 1 and both independent agent entries. After the normal 30-second expiry, Antigravity is offline with zero active operations and its interrupted-or-abandoned outcome preserved. Codex's last heartbeat/outcome remained unchanged.
- The failed earlier launches and all controlled synthetic callbacks are excluded from this real-agent success evidence. No prompts, responses, transcript/tool/terminal content, errors, exit codes, account identity or secret material were added to the evidence.

No further credential provisioning or database commands are required for this instance.

## Evidence and supported scope

The hook audit ran on agy 1.2.5. The external wrapper probe ran on the subsequently installed 1.2.6 and passed both controls: normal exit preserved `completed`, and Ctrl+C exit closed an orphan as `interrupted-or-abandoned`, with zero active operations. Installed `agy --version` now returns 1.2.6. Production preflight accepts only these two verified versions.

This adapter supports supervised, interactive CLI execution. It does not use IDE events, transcripts, terminal parsing, vendor internals, exit codes or raw termination reasons. Resume/conversation overrides, plugins, alternate workspace arguments and permission/trust bypasses are excluded from this launch path. Type tasks in the CLI after it opens.

## Files

- `scripts/status-adapters/antigravity-status.ps1`: operator launcher and explicit workspace-hook installation switch.
- `scripts/status-adapters/antigravity-launch.mjs`: version/config preflight, named hook merge, child supervision and durable exit cleanup.
- `scripts/status-adapters/antigravity-lifecycle.mjs`: bounded, explicit lifecycle allowlist and hashed identifiers.
- `scripts/status-adapters/antigravity-store.mjs`: service-bound extension of the existing shared SQLite store.
- `scripts/status-adapters/antigravity-hook.mjs`: neutral hook callback with a one-second input deadline and 1 MiB input cap.
- `scripts/status-adapters/antigravity-worker.mjs`: supervised reporter worker using the existing StatusReporter.
- `scripts/status-adapters/provision-antigravity.ps1`: existing Core credential CLI to separate, operator-only DPAPI storage.
- `scripts/status-adapters/antigravity-deployment.mjs`: export an inactive deployment and SQLite backup to a host-visible private directory, preserving encrypted credential bytes and originals.
- `scripts/status-adapters/antigravity-live-check.mjs`: controlled integration checks or sanitized shelf observation; controlled checks explicitly report `realAgentTask: false`.
- `tests/phase3/antigravity-status.test.mjs`, `antigravity-launch.test.mjs` and `antigravity-deployment.test.mjs`: lifecycle, persistence, supervision, privacy, failure and safe deployment-export checks.

Existing Codex adapter/store/reporter/config source is unchanged. Core API/source and Hub UI source are unchanged.

## Hook configuration and wrapper

Install only the `ascend-status-antigravity-cli` entry in the selected workspace's documented `.agents/hooks.json`. The installer preserves unrelated hooks, rejects conflicting named entries and malformed JSON, uses an installation lock and atomic replacement, and rejects symbolic hook paths. Ordinary vendor workspace/hook trust is still required. Global vendor settings are unchanged.

Commands invoke the absolute Node and production hook path from the hook directory. Wrapper-only environment contains the local store path, instance ID and random hashed-format owner ID. It contains no producer credential. Hooks outside a wrapped session return neutral JSON and do nothing.

The first real production sessions launched and heartbeated but recorded no operation transitions. The old scratch probe did record their start/normal-stop/interrupted-start boundaries; those records were excluded from production success evidence. A native Windows `cmd /c` reproduction found that unnecessary embedded quotes around the absolute hook path prevented module execution. The command now uses shell-safe absolute Node/repository paths without whitespace or embedded quotes; unsupported executable/repository paths fail preflight. Workspace/config paths may still contain spaces because they are passed through native arguments/environment. Only the exact prior Ascend-generated named entry is upgraded; unrelated hooks and unknown conflicting entries are preserved. The command regression test now uses ordinary native Windows escaping, and controlled checks execute this same command boundary. Both real interactive production tasks subsequently passed after this fix.

The child inherits its terminal and normal account/configuration environment. Ascend credential/token/secret environment is stripped. No streams are captured or parsed. The parent leaves Ctrl+C to the real child, observes only child termination and releases its durable owner. It does not persist or forward the child's exit code. Each wrapper renews a 20-second owner lease every five seconds. A separate hidden worker handles network I/O, restarts at most every five seconds if necessary, and flushes the final aggregate status with bounded retries before exiting.

## Lifecycle and persistence

| Input | Durable action | Shelf behavior |
| --- | --- | --- |
| Supervised child starts | Open a wrapper-owned presence session | idle if no operations |
| PreInvocation | Add an owner/conversation/generation-scoped invocation | working while any operation remains |
| PostInvocation | Refresh only an existing matching invocation | Progress; not proof the agent loop ended |
| PostToolUse | Refresh active operations only in its owning conversation | Safe progress without tool data |
| Stop with fullyIdle false | Preserve active operations | working/stuck as derived |
| Stop with fullyIdle true | Close active operations in that conversation's current generation | completed lifecycle outcome; idle only at aggregate zero |
| Child exit or expired owner lease | Close only that owner's remaining active operations | interrupted-or-abandoned; never completed |

`completed` describes a fully idle hook boundary, not independently verified task success. Raw termination reasons are ignored. Cleanup uses conditional updates on nonterminal rows; it cannot overwrite terminal Stop results or another owner's operations.

The existing WAL/FULL SQLite transactions, persistent emitter sequence, event ID/retry state and reporter lease are reused. Identity is fixed to `agent / antigravity-cli` and the configured instance. Opening a Codex-owned database fails identity validation. Store files live outside Git. Operation keys and local conversation/session identifiers are hashed; content is never stored. Terminal tombstones expire after 24 hours. New starts are bounded at 4096 operations/sessions; excess observations are dropped without failing the CLI. There is one coalesced pending status payload and a bounded rolling request budget, not an indefinite heartbeat log.

Vendor counters reset across turns. The adapter opens a new durable generation on invocation zero after a fully idle Stop, preserves prior terminal generations, rejects duplicate/older starts and ignores late progress for closed scopes. Because observed hooks provide no immutable turn UUID, a delayed invocation-zero callback across that boundary is indistinguishable from a genuine new turn. The supported CLI's serialized hook dispatch is required; arbitrary replay across turns, asynchronous background/subagent callbacks and resumed conversations are not claimed supported.

## Reporter and privacy

The existing StatusReporter sends immediate changed aggregates and coalesced ten-second heartbeats. Healthy reporter presence does not refresh operation progress. An active operation with 90 seconds of lifecycle silence derives `stuck` using the existing fixed `lifecycle-timeout` issue. Later valid progress recovers working. This is observed lifecycle silence, not proof of a model deadlock; the stream has no validated approval-wait signal.

Network attempts time out after two seconds, never follow redirects or inspect response bodies, and retry an identical event ID at most three times with two/four-second backoff. New aggregates replace the single pending event. Shared write budgeting allows at most 55 attempts/minute, below Core's unchanged 60/minute limit. Heartbeats cease after the final owner exits and final delivery succeeds or exhausts bounded attempts. Core derives offline at its existing 30-second expiry.

Only hashed IDs, bounded counters, lifecycle timestamps, fixed states/outcomes, lease/sequence information and the allowlisted v1 status payload enter durable state. Prompt/response/transcript/source/tool/terminal/error/log/account/exit-code content is discarded. The producer secret exists only in worker memory and the authorization header; encrypted DPAPI storage is separate from status data. No raw errors or server responses are logged.

## Credential and operator commands

Provisioned a dedicated `antigravity-cli / antigravity-local-1` producer through Core's existing `StatusService` CLI. It is separate from `codex-cli / codex-local-1`; no earlier credential was rotated/revoked. The current host deployment is `D:\ascend-status-adapters\antigravity-cli\antigravity-local-1\config.json`, outside Git. The directory ACL is limited to the current Windows user and the secret is CurrentUser DPAPI-protected. No secret is printed or documented.

The first AppData deployment was redirected into Codex desktop's private package LocalCache and was invisible to the user's IDE terminal (`CONFIGURATION_NOT_FOUND`). Native config realpath confirmed that redirection, as in the earlier Codex deployment issue. Existing ciphertext/config bytes and a consistent SQLite backup were exported to the host D: directory with the original emitter sequence intact; no credential was regenerated, rotated or rebound. Originals are preserved. An inactive-owner/pending-event check and an atomic staged export avoid deploying a concurrent writer or an incomplete target. Native CopyFile/realpath handling of protected virtualized secret files proved unreliable; byte-preserving read/write is used for encrypted material, without decryption. Only the host deployment should be used for future reporting. Wrapper and provisioning defaults now both use the host path.

For a new instance, provision once:

```powershell
& 'D:\ascend_hub\scripts\status-adapters\provision-antigravity.ps1' -InstanceId 'antigravity-local-2'
```

Then select its private config with `-ConfigPath`. Existing local config/secret files cause safe refusal, not rotation.

Install the named hook once per intended workspace, then launch from that workspace:

```powershell
& 'D:\ascend_hub\scripts\status-adapters\antigravity-status.ps1' -InstallHooks -Workspace 'D:\your-project'
& 'D:\ascend_hub\scripts\status-adapters\antigravity-status.ps1' -Workspace 'D:\your-project'
```

The live-validation installation currently targets only the previously trusted `%TEMP%\ascend-phase3-agy-probe-20260918-4c81e5` workspace. Its unrelated probe entry is preserved. No actual Core/Hub project customization or global vendor configuration was installed automatically.

## Verification

- Final full Phase 3 regression run after host deployment: 67 passed, including 28 Antigravity/deployment tests and all 39 existing Codex/probe tests.
- Core status/serialization/read/producer-credential tests: 20 passed, with two upstream deprecation warnings.
- Hub Phase 2 tests: eight passed. Production build passed with existing Vinext timing/classification notices.
- Focused ESLint and both PowerShell syntax checks passed. `git diff --check` passed, along with separate whitespace checks of each new untracked adapter/test/report file.
- Controlled real production callbacks reached live Core and Hub: idle/0 → working/1 → idle/0/completed → working/1 → idle/0/interrupted-or-abandoned.
- Core v1 services[] contains both independent `agent / codex-cli` and `agent / antigravity-cli` rows. Codex retained its existing heartbeat/outcome while Antigravity changed.
- Headless Chrome confirmed a working Antigravity service uses the unchanged generic TV glyph/card.
- Final headless Chrome verification after the real production sessions confirmed both Antigravity and Codex render as generic offline TV cards. Fresh production build, 67 Phase 3 tests, 20 Core status tests, eight Hub tests, focused lint and whitespace checks passed at closeout.
- Sanitized live monitoring confirmed Core subsequently derived offline after controlled-session heartbeat expiry, with zero active operations and the interrupted-or-abandoned outcome preserved.
- Host config read, unchanged ciphertext, DPAPI decryption, operator-only protected directory ACL, physical D: config path and actual wrapper `--version` preflight passed. This preflight does not count as a real agent task.
- Controlled production hook + live Core/Hub checks were rerun from the physical host deployment and passed all normal/cleanup transitions and generic browser rendering. The Codex row's heartbeat/outcome remained unchanged.
- Real normal-task and real Ctrl+C checks through this production wrapper: passed, with actual Core transitions and durable outcomes as recorded above. Scratch-wrapper results are not substituted for production evidence.

No database schema push/generation was needed. Antigravity IDE remains BLOCKED / unsupported and is out of scope. Phase 3 is COMPLETE for Codex CLI and Antigravity CLI through the approved supported wrappers; future Hermes/Groq/Gemini integrations remain separate work.
