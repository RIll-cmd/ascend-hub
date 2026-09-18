# Codex Status Adapter Implementation Plan

> Execute inline with test-first checkpoints. The user approved the existing audited design and explicitly authorized Codex-only implementation; no further architecture approval or unrelated agent work is needed.

**Goal:** Connect verified Codex CLI 0.153.4 lifecycle hooks to the existing Core v1 status authority without changing Core or Hub UI.

**Architecture:** Short, neutral local hook handlers update a transaction-protected SQLite operation store. An independently leased reporter sends immediate aggregate transitions and 10-second coalesced presence heartbeats. A native Node launcher supplies explicit session hook overrides and supervises local reporter recovery without changing persisted production hooks.

**Tech stack:** Installed Node 24.14.1, built-in SQLite/crypto/fetch/child_process; node:test; existing Core credential CLI and Hub Phase 2 tests/build.

**Spec:** `future ai implementation.md`, `docs/phase-3-local-ai-status-adapter-audit.md`, and the user's Codex-only scope/verified interactive probe.

**Execution checkpoint:** Tasks 1–3 implemented and locally verified; 36 Phase 3 tests pass. Task 4 provisioning/regressions/documentation finished, but live integration stopped at Core's existing `activity.startedAt` datetime serialization failure (working HTTP 500). Live idle and generic offline browser rendering are verified. No Core fix/workaround or real production-wrapper task is claimed. Detailed evidence: `docs/codex-status-adapter.md`.

## Global constraints

- `serviceId: codex-cli`, `serviceType: agent`; separate instance-bound credential.
- Core v1 contract, Core/Vision semantics, and Hub UI remain unchanged.
- Antigravity remains BLOCKED and untouched; overall Phase 3 remains incomplete.
- Explicit session overrides only; ordinary hook trust remains required.
- Persist only hashed lifecycle identity, timestamps, terminal outcomes, sequence, latest pending event, emitter lease, and delivery/recovery metadata.
- No prompts, responses, transcripts, tool arguments/output, errors/logs/code, or credentials in SQLite or outgoing JSON.
- Core derives offline after 30 seconds; active lifecycle silence of 90 seconds while reporter healthy derives local stuck.

## Task 1: Durable local operation store and privacy boundary

Files: create `scripts/status-adapters/codex-lifecycle.mjs`, `scripts/status-adapters/local-store.mjs`, and `tests/phase3/codex-status.test.mjs`.

- [x] Write and run failing tests for start/Stop/Interrupt, correlation, duplicates, terminal-before-start, overlapping turns, session closure, restart, and progress-driven stuck recovery.
- [x] Implement explicit field allowlisting and SHA-256 hashed session/turn IDs.
- [x] Implement WAL SQLite transactions, owner liveness leases, terminal tombstones, and bounded retention.
- [x] Run tests; inspect persisted records to prove private marker strings were dropped.

Interfaces: `sanitizeCodexLifecycle(event, input)` returns only event/sessionId/turnId or null. `LocalStatusStore(path, instanceId)` exposes owner registration/renewal/release, `apply(event, ownerId, now)`, and aggregate `snapshot(now, healthy)`.

## Task 2: Leased reporter and bounded delivery

Files: create `scripts/status-adapters/reporter.mjs`, extend `tests/phase3/codex-status.test.mjs`.

- [x] Write failing tests for one emitter, 10-second coalescing, transition immediacy, persistent sequence/eventId retries, stale pending supersession, rolling write-budget enforcement, bounded retry/timeout, and healthy reporter not fabricating lifecycle progress.
- [x] Implement single-slot durable pending events; at most three attempts per event, two-second request timeout, sanitized failure codes, redirects rejected.
- [x] Keep idle presence only while supervised Codex launchers remain alive; close expired owners and cease periodic writes after the final launcher/session exits.
- [x] Run focused tests with a controlled local HTTP server and failure cases.

Interfaces: `StatusReporter(store, {endpoint, credential, emitterId, fetchImpl})` exposes `tick(now)`; retries never execute in a hook handler.

## Task 3: Neutral hook command and explicit Codex launcher

Files: create `scripts/status-adapters/codex-hook.mjs`, `scripts/status-adapters/worker.mjs`, `scripts/status-adapters/codex-launch.mjs`, and `scripts/status-adapters/codex-status.ps1`.

- [x] Test actual hook subprocess neutral output, input limits/deadline, SQLite contention, and safe failure behavior.
- [x] Build native argument arrays with literal TOML hook overrides for SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop/Interrupt/SessionEnd.
- [x] Preserve existing hooks through Codex's merged configuration sources; never edit production hooks. Reject caller arguments that override adapter identity/hooks or bypass trust.
- [x] Supervise reporter restarts while Codex runs, renew durable owner liveness, and remove producer credentials from Codex's inherited environment.
- [x] Test launcher quoting and configuration rejection; run focused lint.

## Task 4: Operator setup, live integration, and regression report

Files: update audit/status documentation and create `docs/codex-status-adapter.md`; add focused end-to-end tests as needed.

- [x] Only after durable concurrency tests pass, provision a distinct `codex-cli/codex-local-1` credential using the existing Core service/CLI, if the running deployment permits it. Never rotate/reuse existing producers or push schemas.
- [x] Keep any local credential outside the repository; do not print it during validation.
- [ ] Verify actual Core services[] and Hub same-origin proxy/generic presentation with sanitized lifecycle metadata; distinguish injected validation events from a real Codex task.
- [x] Run new Phase 3 tests, existing Core status tests, Hub Phase 2 tests, lint, build, and whitespace checks. Full lint reports pre-existing errors; focused lint passes.
- [x] Document exact evidence and remaining live/manual limitations; do not mark Antigravity or overall Phase 3 complete.
