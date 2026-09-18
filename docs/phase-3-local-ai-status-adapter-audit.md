# Phase 3 local AI status-adapter audit

**Audited:** 2026-09-18

**Scope:** the installed Antigravity IDE agent, Antigravity CLI, and the independent Codex CLI used from its terminal. This is an audit only: no adapter, credential, Hub UI, or Core v1 contract was changed.

## Antigravity CLI live-probe result (2026-09-18)

**Latest wrapper follow-up:** The external wrapper probe and production Phase 3B live gate both passed on the subsequently installed agy 1.2.6. Real production normal work reached Core working → idle/completed. Real Ctrl+C child exit reached working → idle/interrupted-or-abandoned, with zero active operations and prior normal completion preserved. Classification is **SUPPORTED FOR WRAPPED CLI EXECUTION**. The approved Codex CLI + Antigravity CLI Phase 3 path is complete. See [the implementation report](antigravity-cli-status-adapter.md) for sanitized real-agent evidence and remaining limitations. The 1.2.5 hook-only classification below is historical. Antigravity IDE remains BLOCKED / unsupported and out of Phase 3B scope.

**Classification: PARTIALLY SUPPORTED.** The installed Antigravity CLI was found at `C:\Users\Cyrill Gerard\AppData\Local\agy\bin\agy.exe`, reports version `1.2.5`, and opened an already authenticated interactive session. No account identifier, prompts, responses, transcripts, tool inputs/outputs, terminal output, errors, or credential material were retained in the probe evidence.

The official CLI hook source was used exactly as documented: a disposable workspace-local `.agents/hooks.json`, launched from a disposable `%TEMP%` workspace. The TUI's `/hooks` screen displayed the named `ascend-phase3-agy-probe` handlers for `PreInvocation`, `PostInvocation`, and `Stop`. The probe handler allowlisted only a local timestamp, fixed event name, hashed `conversationId`/derived turn correlation when present, bounded counters, `fullyIdle`, a fixed termination category, and booleans indicating whether a payload was received/usable. It had no network, Core, Hub, or credential access.

The initial no-tool attempts produced no records. A later live CLI investigation session established that the same scratch configuration does dispatch hooks: 284 `invocation-start`, 283 `invocation-finished`, and seven `stopped` records across two hashed sessions, with chronological ordering and no unexpected fields. A documented `PostToolUse` hook was then enabled in the scratch configuration; one harmless `run_command` invocation produced one safe `tool-finished` record. A direct synthetic, content-free handler check also proved the local handler can write its allowlisted record; that synthetic record was removed before the live checks.

The fresh interrupted no-tool poem turn produced one correlated `invocation-start` record but no matching `invocation-finished` or `stopped` record before the CLI returned to PowerShell. Therefore the observed CLI hook stream does not provide reliable interruption cleanup. Normal `Stop` records contained `fullyIdle: true`, but their safe-mapped termination category was `other`, so normal completion must not be inferred from unobserved raw reason text.

| Probe property | Result |
| --- | --- |
| Start signal | `PreInvocation` emitted with hashed session/turn correlation |
| Normal-completion signal | `PostInvocation` and `Stop` emitted; `Stop.fullyIdle` observed true |
| Interruption signal | Start emitted, but no matching terminal callback observed |
| Session/turn correlation | Verified for emitted invocation records; interruption remains unclosed |
| Tool lifecycle signal | One `PostToolUse` callback emitted for a harmless `run_command` |
| Privacy boundary | Preserved; no prohibited content was stored or inspected |

This is partial live compatibility for `agy 1.2.5`, not a complete adapter gate. The documented workspace hook path does dispatch start, progress, stop, and tool signals, but interruption cleanup is unverified/absent. Do not provision an `antigravity-cli` producer credential or implement an adapter until its durable reporter design explicitly handles the missing interruption terminal callback without falsely reporting completion. The Antigravity IDE remains separately blocked and untouched; the Codex portion is documented separately as complete. Google documents the workspace hook location and supported CLI lifecycle events at [Antigravity Hooks](https://antigravity.google/docs/hooks).

## Codex-only implementation follow-up (2026-09-18)

The subsequent interactive gate passed: six actual sanitized events in one hashed session were `SessionStart → UserPromptSubmit → Stop → UserPromptSubmit → Interrupt → SessionEnd`. Both terminal events matched their respective distinct turn IDs; ordering was chronological and no unexpected fields were found. This validates explicit session overrides only. The earlier pending Codex gate statements below describe the prior audit checkpoint, not the current result.

Codex-only durable adapter implementation and a distinct `codex-cli/codex-local-1` producer credential now exist; production hook files and Hub UI/Core contract remain unchanged. Controlled actual hook subprocesses reached live Core/Hub idle, but working received HTTP 500 because Core converts `activity.startedAt` to a datetime and then passes it to `json.dumps` in the Postgres repository. No backend workaround/fix was made. Hub's unchanged generic browser rendering was confirmed offline after expiry. See [the implementation report](codex-status-adapter.md) for exact evidence, files/tests/setup and limitations.

Antigravity IDE and Antigravity CLI remain BLOCKED and untouched. Overall Phase 3 is still incomplete.

## Correction found when starting implementation

**2026-09-18:** The original audit assigned the separate Antigravity desktop application's version (`2.12.2`) to the IDE. That was an audit error. The Windows uninstall registry and Start Menu shortcut distinguish two installed products, and their own executable/manifest metadata confirms it:

| Product | Actual product version | Executable | Evidence |
| --- | --- | --- | --- |
| Antigravity desktop application | `2.12.2` | `C:\Users\Cyrill Gerard\AppData\Local\Programs\antigravity\Antigravity.exe` | Uninstall entry `Antigravity 2.12.2`; packaged manifest `productName = Antigravity`, `version = 2.12.2`. |
| Antigravity IDE | `2.5.5` | `D:\Antigravity IDE\Antigravity IDE.exe` | Uninstall entry `Antigravity IDE (User)` with install location `D:\Antigravity IDE\`; executable `ProductName = Antigravity IDE`, file/product version `2.5.5`; IDE shortcut points to this executable. |

The IDE's public application manifest contains a Code platform version of `1.107.0`; that is distinct from its product version `2.5.5`. The local `~/.gemini/antigravity-ide` directory supports the IDE identification but never proved that `2.12.2` was its version.

The original implementation prompt targeted IDE `2.12.2`, so implementation paused. The subsequent resume prompt explicitly corrected and authorized the target to IDE `2.5.5`. The version blocker is resolved. The live compatibility findings below are the current gate; the earlier pause is retained as history.

## Decision

Documentation establishes candidate hook interfaces, not successful local operation. The current IDE probe did not produce callbacks after a user-confirmed built-in agent task. Codex's non-interactive `exec` path did emit hooks when configured as explicit temporary session overrides; its interactive terminal and interruption gates remain pending. Neither adapter is enabled against Core. Hook input must remain ephemeral and no transcript, prompt, tool arguments/output, screenshots, or artifacts may be read as lifecycle signals.

| Target | Local evidence | Classification | Phase-3 recommendation |
| --- | --- | --- | --- |
| Antigravity IDE | Corrected version `2.5.5`; temporary documented workspace hooks were configured in a scratch workspace. A user-confirmed built-in agent task completed but no callback records appeared. | **BLOCKED at the live compatibility gate.** This does not prove hooks are absent: configuration recognition and callback execution remain undistinguished. | Resolve the supported workspace hook recognition/execution path before implementing an adapter. No alternative mapping was invented. |
| Codex CLI | `0.153.4`; explicit temporary session hook overrides produced `SessionStart`, `UserPromptSubmit`, `Stop`, and `SessionEnd` from a real ephemeral `exec` turn. | **PARTIALLY SUPPORTED.** Non-interactive start/completion verified; interactive workflow, project-source recognition, and `Interrupt` pending. | Validate the remaining interactive gate independently. Existing production hooks remain unchanged. |

## Live compatibility probe findings

The scratch workspace is `C:\Users\Cyrill Gerard\AppData\Local\Temp\ascend-phase3-ide-probe-599b143a57994a29816aeb11ff12c729`. Its `.agents/hooks.json` configures `PreInvocation`, `PostInvocation`, `PostToolUse`, and `Stop` using the documented IDE schema. No user or production workspace hook file was changed. `PreToolUse` was deliberately excluded because it controls permission decisions and is unnecessary for this initial start/completion gate.

The shared temporary callback is `D:\ascend_hub\scripts\phase3-hook-probe.mjs`. It creates a fresh record from allowed fields, hashes opaque correlation IDs, retains only bounded numeric counters/boolean flags/allowlisted termination categories, drops unknown reason text, returns neutral JSON, and has a 1.25-second input deadline. Tests write to separate test directories; no synthetic callback was written into the IDE's real evidence file. All six privacy/failure-handling tests pass.

The supported editor `chat` CLI opened editor chat, which the user confirmed did not run the built-in Antigravity agent. That launch was not counted as a live agent test. The user then separately confirmed the harmless `2 + 2` task completed through the built-in Antigravity pane in the scratch workspace. No `events.jsonl` file appeared afterward, so start, normal completion, ordering, identity stability, duplicates, cancellation, and failure could not be verified. The normal gate failed; no cancellation/failure task or production adapter was attempted. This is a gate failure with an unresolved cause, not evidence that every supported configuration location fails.

Configuration locations inspected without reading content: editor settings under `C:\Users\Cyrill Gerard\AppData\Roaming\Antigravity IDE\User`; documented user customization candidate `~/.gemini/config`; documented workspace customization candidate `.agents`; logs under `AppData\Roaming\Antigravity IDE\logs`; session/brain metadata under `~/.gemini/antigravity-ide`. Only directory/filename metadata was inspected for logs and sessions; their content was not read. Runtime recognition of the workspace hook candidate remains unverified.

Codex was tested with its installed npm-distributed `0.153.4` binary, `exec --ephemeral --ignore-user-config --sandbox read-only`, and temporary explicit `[hooks]` session overrides with the documented Windows command override. The reviewed probe used the documented one-invocation hook-trust automation flag; no persisted trust or Core auth was changed. Standard output was processed only for allowlisted structured envelope types and then discarded; responses, tool data, and error content were never recorded.

One real Codex turn produced exactly `SessionStart → UserPromptSubmit → Stop → SessionEnd`. Session correlation stayed identical across all four callbacks, and turn correlation matched across submission/completion. `Stop` reported `stop_hook_active = false`. Earlier `exec` trials using only a scratch project hook file produced no callbacks; the explicit override result therefore does not establish that project-local hook discovery works in this launch path. Interactive `Interrupt`, terminal reuse, and new interactive sessions still require their own probe. A scratch-only `probe-codex.ps1` launcher is prepared for that check using normal hook review/trust; it does not edit production files or report to Core.

## Existing Status Shelf constraints verified

Core's v1 producer endpoint is `POST /api/status/events`. It accepts only producer states `idle`, `working`, and `stuck`; Core derives `offline` after heartbeat expiry. Producer credentials are bound to an exact `(serviceId, instanceId)`, reject cross-instance writes, and are limited to 60 requests per minute. The schema rejects prompts, code, patches, terminal output, tokens, screenshots, and related user-content fields.

The v1 `serviceType` enum is deliberately limited to `agent`, `assistant`, `bot`, `vision`, and `provider`. Therefore the Phase 3 identities must use:

| Tool | `serviceId` | `serviceType` | `instanceId` |
| --- | --- | --- | --- |
| Antigravity IDE | `antigravity-ide` | `agent` | a stable, lowercase machine-specific ID such as `<host>-ide-1` |
| Codex CLI | `codex-cli` | `agent` | a separate stable ID such as `<host>-codex-1` |

`antigravity_ide` and `codex_cli` are not valid v1 `serviceType` values. Their product identity belongs in the stable `serviceId` and safe, fixed metadata—not in a Core contract change. Each identity needs its own producer credential only after its adapter passes the live probe. No reader, AIRA, or Vision credential may be reused.

Hub already renders unknown service IDs through its generic TV/card fallback, so no Hub change is required for either identity.

## Antigravity IDE findings

The documented IDE hook locations are `.agents/hooks.json` in a workspace and `~/.gemini/config/hooks.json`. Its stable lifecycle events are `PreInvocation`, `PostInvocation`, `PreToolUse`, `PostToolUse`, and `Stop`; handlers receive JSON via stdin and return JSON to stdout. Relevant safe identifiers are `conversationId`, `invocationNum`, `executionNum`, and `fullyIdle`. `transcriptPath`, workspace paths, artifacts, tool arguments, and detailed errors must be ignored.

| Lifecycle need | Candidate signal | Reliability and payload rule | Status mapping |
| --- | --- | --- | --- |
| Start / progress | `PreInvocation` | Supported. Use only `conversationId` plus `invocationNum`; never inspect prompt or transcript. | Add/update a durable active operation; report `working`. |
| Progress refresh | `PostInvocation` or `PostToolUse` | Supported. A `PostToolUse` error string is not safe status content. | Refresh only the operation timestamp; do not send the error or tool data. |
| Successful finish | `Stop` where `terminationReason = model_stop` and `fullyIdle = true` | Supported. `fullyIdle` protects against marking idle while background work remains. | Remove that operation; emit `idle` only when no operations remain. |
| Failure finish | `Stop` where reason is `error` or `max_steps_exceeded` and the operation is fully idle | Supported outcome fields, but the raw error is unsafe. | Emit `stuck` with a fixed safe issue code/message, then retain the failure state until a later valid operation changes it. |
| Cancellation | No explicit cancellation mapping was verified in the IDE hook reference. | Do not guess from UI state or parse transcripts. | Validate the actual termination reason in the local probe; until then, treat it as unclassified and preserve the last known state rather than falsely declaring success or stuck. |

The actual installed IDE product version is `2.5.5`, corrected above. A local probe against that executable remains mandatory before this is classified as production-ready; neither the desktop application's `2.12.2` version nor documentation alone establishes IDE event firing.

## Codex CLI findings

Codex officially supports `hooks.json` next to an active configuration layer, including `<repo>/.codex/hooks.json`; non-managed hooks require review and trust. The installed CLI marks hooks stable and the current Core workspace already has a project-local hook file with `PostToolUse` and `Stop` handlers. It does not yet establish the start signal needed for status reporting.

| Lifecycle need | Candidate signal | Reliability and payload rule | Status mapping |
| --- | --- | --- | --- |
| Start | `UserPromptSubmit` | Supported; includes `turn_id`, but also includes the prompt. Discard the prompt immediately. | Add/update a durable active turn; report `working`. |
| Progress refresh | `PreToolUse` / `PostToolUse` | Supported for local tools. Never forward `tool_input`, command text, tool result, or transcript path. | Refresh activity from `turn_id` only; coalesce updates. |
| Normal finish | `Stop` | Supported; includes `turn_id`. It does not itself provide a safe success/error discriminator. | Remove the matching active turn; report `idle` only when the count reaches zero. |
| User interruption | `Interrupt` | Supported for an active main-thread turn; it includes `turn_id` and is explicitly advisory. | Remove the matching active turn and return to `idle` if it was the last turn; an intentional interruption is not `stuck`. |
| Session closure | `SessionEnd` | Supported as a cleanup signal. | Clear any remaining turns for that session; Core derives `offline` if the reporter is gone. |

`Stop` must not read or forward `last_assistant_message`, and no adapter may use `transcript_path` as an integration API. Codex's own documentation calls transcript format unstable.

## Required adapter shape (for the subsequent implementation task)

Hooks alone are not enough: Core marks an instance offline after 30 seconds without a heartbeat, while a model call may run longer than a single hook callback. Each supported adapter therefore needs a small **local, durable reporter** rather than a process-local dictionary:

1. Store active operations/turns, last-progress timestamps, sequence state, and an emitter lease in a local durable store (for example, a locked SQLite file under a dedicated local application-data directory).
2. Key operations by the tool's opaque safe identifier (`conversationId` + invocation/execution identity for Antigravity; `session_id` + `turn_id` for Codex). Do not store text content.
3. Run exactly one lease-held heartbeat worker per `(serviceId, instanceId)` while work is active. Send coalesced heartbeats at roughly 10 seconds, which remains well inside Core's 30-second expiry without approaching the 60/minute producer limit.
4. Keep `working` while *any* durable active operation exists. A completed concurrent turn must never set the service to `idle` while another remains active.
5. Derive `stuck` locally when an active operation has no safe lifecycle progress for 90 seconds while the reporter is healthy. Use fixed, non-sensitive issue codes/messages only. If the reporter dies, send nothing; Core will correctly derive `offline`.
6. Use a persistent event sequence and fresh event IDs. Coalesce noisy tool events so fast tool loops cannot exhaust the producer rate limit.

The hook handler must return the tool's neutral expected JSON (`{}` or an allow/continue equivalent) and run status emission out of band. The shelf integration must never delay, gate, alter, or fail an agent operation because status reporting failed.

## Local live-probe gate

Before provisioning either credential or enabling an adapter, use a temporary, non-production hook that writes only the event name and opaque IDs to a temporary local file. Do not record prompts, text, command lines, transcripts, errors, or outputs.

Required observations:

1. Antigravity: run one harmless IDE agent action; verify `PreInvocation` followed by `Stop`, capture `terminationReason`/`fullyIdle` keys only, and verify no effect on the agent result.
2. Codex: trust the project hook in the interactive terminal and run one harmless turn; verify `UserPromptSubmit`, `Stop`, and `Interrupt` behavior. This specifically validates the installed `0.153.4` workflow rather than relying only on documentation.
3. Simulate or run two overlapping safe turns for each adapter before connecting to Core, proving durable active-operation counting preserves `working` until the final completion.

Only after each probe passes should an operator create that adapter's distinct Core credential and configure it in a local, non-repository secret store.

## Non-goals and guardrails confirmed

- No browser/UI scraping, terminal polling, transcript parsing, log scraping, vendor patching, or shell-history inspection.
- No prompts, code, diffs, screenshots, tool input/output, error text, auth tokens, cookies, or credentials in status payloads or debug logs.
- No Core v1 contract, AIRA/Vision behavior, Hub proxy, WebSocket/SSE, or future Hermes/Groq/Gemini integration changes.
- No status credential was created, read, rotated, or exposed during this audit.

## References

- [Antigravity IDE hook contract](https://antigravity.google/docs/ide/hooks/)
- [Codex hooks documentation](https://developers.openai.com/codex/hooks)
