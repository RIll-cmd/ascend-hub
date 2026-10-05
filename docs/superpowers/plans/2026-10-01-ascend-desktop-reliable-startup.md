# Ascend Desktop Reliable Startup Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement one phase at a time. Checkboxes describe future work, not completed implementation. Recheck both repositories before editing and preserve unrelated work.

**Date:** 2026-10-01  
**Status:** Proposed; planning and read-only inspection completed. No applications were launched, dependencies installed, or runtime settings changed.  
**Goal:** Separate Windows launch buttons/shortcuts start Ascend Vision and Ascend Hub independently without freezing their startup controls, keep a useful window visible during failures, and provide precise recovery. Reliability takes priority over startup speed.  
**Architecture:** Two shortcuts use a shared lightweight Windows supervisor with independent Hub and Vision component state. Starting either product does not start or wait for the other. Vision exposes chat and its Fairy interface independently of camera/model availability; hardware work has a separate failure boundary. Readiness describes working capabilities rather than merely a running process.  
**Tech stack:** Existing Hub Node/Vinext stack; existing Vision Python 3.11/Flask/React stack; Windows PowerShell/WPF launcher with a small Windows process-management helper; existing test runners.  
**Spec:** The user's request in this conversation: plan first, reliable one-click startup. The owner's clarification is authoritative: startup freezes midway; Vision and Hub launch controls should be separate. Product behavior and acceptance conditions are defined below.

## 1. What success means

Click **Ascend Vision** or **Ascend Hub**. A small launcher window opens immediately and starts only the selected product. If a shared control window is used, it has separate **Start Vision** and **Start Hub** buttons, individual progress cards, and individual Cancel, Retry, Open, and Stop controls. A shared supervisor is an implementation detail; neither product requires the other to be started.

For Vision, progress reports host/chat, model loading, camera, microphone, and Core connection separately. For Hub, progress reports runtime startup, UI readiness, and Core shelf availability. Each card displays its current stage and elapsed time. A slow operation is allowed to take time; the controls must remain responsive throughout it.

If the camera is unavailable, the launcher remains open and Fairy offers typed chat. If Core is offline, Hub explains that its shelf is unavailable while local Vision remains usable. Missing Python packages produce a repair instruction instead of a disappearing console. A second click brings the existing selected product/launcher forward without starting another camera owner. Stopping Hub leaves Vision running, and stopping Vision leaves Hub running.

No implementation can promise that Windows, a hardware driver, or an application will never crash. The measurable target is: eliminate reproducible startup defects, contain component failures, avoid silent exits, and prove predictable recovery under the failure tests in section 9.

## 2. Evidence from the current repositories

Inspected `D:/ascend_hub` and `D:/ascend-vision/ascend-vision`. Vision main and the Fairy motion worktree both pointed at `0337752` during inspection. Hub contains unrelated uncommitted UI/Spotify work; preserve it.

| Finding | Evidence | Implication |
|---|---|---|
| Root Vision batch launcher has an obsolete target. | `D:/ascend-vision/run_live_camera.bat` changes into `%~dp0phone_watch`; that directory does not exist. | A confirmed broken launch path. Whether this is the shortcut the user ran is not yet known. |
| There are several possible Python environments and checkouts. | Main checkout, older worktrees, root `.venv`, and nested `.venv` exist. The 2026-09-30 readiness plan records missing `yaml`/`dotenv` in the root interpreter and available dependencies in the nested interpreter. | Record an explicit executable, checkout, config, env path, and working directory. Revalidate installed dependencies; the older check is not current proof. |
| Heavy imports and detector warmup precede Fairy startup. | `main.py` imports native/ML modules at module scope; `run()` constructs and warms `PhoneDetector` before `FocusUI.start()`. | Import, native-library, or model initialization failures can prevent Fairy from opening at all. |
| Fairy requires an existing frontend build. | `focus_ui.py:FocusUI.start()` raises when `fairy-ui/dist/index.html` is absent. It binds an ephemeral loopback port. | Check artifacts before starting; communicate the actual bound URL rather than hard-coding a port. |
| Camera failures can end the Vision run. | `capture.py` raises `CaptureError` for open/read/timeout failures. `run()` rethrows failures and closes resources; `main()` returns exit code 1. | Catching startup exceptions alone does not create a camera-independent chat experience. |
| Hub is currently a development-server launch in its local instructions. | `scripts/run-framework.mjs` chooses Vinext on the portable profile and configures port 5173. `npm start` instead expects `dist/server/wrangler.json`. | Distinguish development startup from a validated daily build. An artifact's existence does not prove freshness or Windows compatibility. |
| Hub has a Core shelf proxy, but no launcher health route in the inspected API tree. | `app/api/status/shelf/route.ts` exists; the inspected routes contain no health endpoint. | An unavailable shelf must not be interpreted as a crashed Hub. |
| The owner reports a startup freeze midway, not a confirmed process crash. | The owner clarified this after initial inspection. No matching process/thread evidence or failed launch was captured in this turn. | Phase R0 prioritizes a still-running but stalled startup, UI responsiveness, and the last completed stage; exit-code diagnostics alone are insufficient. |

The existing nested batch file keeps its console open after exit; the root wrapper's missing directory is a separate issue. Do not assume all terminal closures share one cause.

## 3. Scope and defaults

- Windows, single owner, separate Ascend Vision and Ascend Hub desktop/Start Menu shortcuts and separate controls.
- Manage local Hub and Vision. Core is an existing remote/local dependency to check; do not automatically launch a second Core deployment.
- The Vision shortcut opens Fairy; the Hub shortcut opens Hub. Starting one never implicitly starts or waits for the other. The initial launcher does not embed a browser engine.
- Keep the advanced Vision dashboard optional. Do not start a second Fairy frontend development server when Python already serves its build.
- Reuse configured camera/microphone preferences. Reconnection and retry must honor user pause/mute choices.
- Browser automation, Discord, phone workers, and proactive behavior retain their existing opt-ins. Startup does not enable them or open Chromium.
- Do not launch Codex or Antigravity work sessions merely because Hub displays their status.
- No dependency installation, application build, model download, or live model request during ordinary startup. Expose missing prerequisites with a setup action/instruction.
- Keep existing data and approved memory at their explicit configured paths. Do not select another checkout's database or env file through directory scanning.
- No silent credential copying, automatic data reset, database deletion, or termination of unrelated Node/Python processes.
- Development scripts remain available; the daily launcher selects one recorded, verified runtime profile.

## 4. Startup and readiness design

Sequence:

1. Open the launcher for the requested product and acquire its per-owner instance lock; forward a second product request to the existing supervisor without duplicating either product.
2. Load and validate the selected installation profile.
3. Check executables, artifacts, configuration, writable storage, and existing processes.
4. For a Hub request, start only Hub and wait for its identity/health response. Open Hub once its local UI is ready; Core shelf availability is reported separately.
5. For a Vision request, start only Vision's lightweight host. Initialize its chat transport and serve Fairy before loading optional hardware capabilities.
6. For Vision, start sensing and voice according to saved preferences; publish individual capability results.
7. Open Fairy once its UI and chat transport are ready. Continue showing hardware progress and any unavailable integrations. If both products were explicitly requested, supervise their progress independently; a hung startup cannot block the other product's controls.

Each product's startup is staged. It uses health checks and explicit deadlines, not fixed sleeps. Default budgets: prerequisite child probes 20 seconds each, Hub startup 90 seconds, Vision host 60 seconds, sensing/model warmup 120 seconds, microphone 30 seconds. These are initial diagnostic limits, not speed targets. Progress remains visible; timeout ends in a named failure with a manual retry. Record actual durations and tune only from measured evidence.

Run the launcher UI heartbeat every 250 ms on its own dispatcher; test that Cancel/Stop acknowledges within one second while a fixture child is deliberately hung. Do not place imports, subprocess waits, filesystem scans, HTTP calls, or model loading on the UI thread. Poll health in a background worker with a two-second per-request timeout and a one-second normal interval. Liveness and startup-stage progress are distinct: a process can exist while making no progress. Show the last stage and elapsed time, allow cancellation immediately, and mark a stage timed out at its deadline. Do not reset that deadline merely because the process still exists.

The host being ready does not prove a model provider has answered. Show AI configured/untested until the first real request succeeds. Core authentication failure is different from network unavailability. Sensor data becomes unknown immediately after its worker fails; old observations cannot remain fresh.

Proposed health contract, produced by Hub and the Vision host and consumed by the launcher:

```json
{
  "schemaVersion": 1,
  "component": "vision",
  "instanceId": "unique-per-process-boot",
  "buildId": "selected-release-id",
  "state": "ready",
  "capabilities": {
    "ui": "ready",
    "chat": "ready",
    "camera": "unavailable",
    "microphone": "disabled",
    "core": "unreachable",
    "ai": "configured-untested"
  }
}
```

Component states: `stopped`, `checking`, `starting`, `ready`, `degraded`, `failed`, `stopping`. `ready` requires the profile's mandatory capabilities; `degraded` means the useful host is available with one or more requested optional capabilities unavailable. `failed` does not imply the rest of Ascend has failed.

Vision publishes its bound URL through an owner-restricted runtime record written atomically. The launcher verifies boot identity and an authenticated local handshake before attaching. An HTTP 200 or an occupied port alone never establishes ownership.

## 5. Phase R0 — Capture and classify the real startup failure

**Files inspected/targeted:** existing `run_live_camera.bat` wrappers; Vision `main.py`, `capture.py`, `focus_ui.py`, `assistant/runtime_environment.py`; Hub `scripts/run-framework.mjs`, `scripts/execution-profile.mjs`, `package.json`. Create `D:/ascend_hub/docs/audits/2026-10-01-startup-baseline.md` during implementation.

- [ ] Record the exact shortcut/command the owner uses, selected checkout, Python/Node executable, config and env paths, runtime profile, and exit code. Do not capture env values.
- [ ] Run dependency checks in bounded child processes. Separate missing imports from native import crashes/hangs. Check asset/build presence without downloading anything.
- [ ] Reproduce each failing startup separately and record the first failing stage. Capture a sanitized traceback for Python exceptions and native process exit status when no traceback exists.
- [ ] Prioritize the reported freeze: capture the last completed startup stage, elapsed time, process liveness, CPU/memory snapshot, and whether the launcher, Python worker, Node server, or browser UI is unresponsive. Use sanitized Python thread stacks when available; do not include frame locals or raw memory dumps.
- [ ] Distinguish process exit, window closure, browser connection failure, and an unresponsive-but-running component. Reproduce a stalled dependency/import/model load with fixtures even if the owner's intermittent freeze cannot be reproduced immediately.
- [ ] Record competing listeners and Vision instances without killing them. Test camera access in a controlled run only after identifying the existing camera owner.
- [ ] Rank confirmed causes, plausible causes, and not-reproduced symptoms separately.

**Exit gate:** At least the broken wrapper is reproduced as a path failure. The owner's reported failure is either reproduced with evidence or explicitly marked unverified with the missing evidence named. Do not label the recurring crash fixed solely because a new launcher was added.

## 6. Phase R1 — Stable launch paths and prerequisites

**Files:** fix both Vision batch wrappers; create Hub `desktop/profile.example.json`, `desktop/Preflight.psm1`, `desktop/tests/Preflight.Tests.ps1`; update both READMEs with the canonical daily path.

The installed profile lives at `%LOCALAPPDATA%/Ascend/Desktop/profile.json`. It contains paths and choices, never API keys. Initial paths are `D:/ascend_hub` and `D:/ascend-vision/ascend-vision`, subject to the R0 check; worktree paths require explicit selection.

```json
{
  "schemaVersion": 1,
  "hubRoot": "D:/ascend_hub",
  "visionRoot": "D:/ascend-vision/ascend-vision",
  "pythonExe": "D:/ascend-vision/ascend-vision/.venv/Scripts/python.exe",
  "visionConfig": "D:/ascend-vision/ascend-vision/config.yaml",
  "visionEnvFile": "D:/ascend-vision/ascend-vision/.env",
  "hubRuntime": "portable",
  "openOnReady": { "vision": "fairy", "hub": "hub" }
}
```

Setup also resolves and saves the absolute Node executable and selected build ID after validation. Reject an incomplete profile with a setup message; never choose a random `python` or `node` from a changing PATH.

- [ ] Correct the obsolete root wrapper and handle missing directories before delegating. Print the real error and preserve a visible failure message.
- [ ] Implement `Test-AscendProfile(profile)` returning structured checks: component, stage, success, safe error code, and repair instruction.
- [ ] Validate supported runtime versions, exact config/env-file existence, selected build identity, required imports, model assets, and writable runtime/data paths. A missing API key affects AI availability, not launcher readiness.
- [ ] Make checks side-effect-free: no migrations, camera opening, model downloads, package installations, or live provider probes.
- [ ] Treat configuration/schema incompatibility as a clear component error. Do not repair by deleting data or skipping required validation.
- [ ] Add fixtures for missing folder, wrong interpreter, absent build, bad config, denied directory access, and paths containing spaces.

**Exit gate:** Each prerequisite failure gives a useful persistent result before heavy initialization. A valid profile consistently starts the intended checkout with the intended env/config paths.

## 7. Phase R2 — Persistent launcher and process supervision

**Create in Hub:** `desktop/Start-Ascend.ps1`, `desktop/Launcher.xaml`, `desktop/Supervisor.psm1`, `desktop/ProcessHost.cs`, `desktop/Diagnostics.psm1`, `desktop/tests/Supervisor.Tests.ps1`, and `desktop/tests/fixtures/component.ps1`.

**Create/modify health surfaces:** Hub `app/api/health/route.ts`; Vision `focus_ui.py` and later the R3 host. Health endpoints return no credentials, prompts, or private paths. Keep launcher control on an owner-restricted local channel, not an unauthenticated public route.

- [ ] Open a lightweight WPF window before invoking Python/Node. Run prerequisite checks and polling off the UI thread so a hung child cannot freeze the launcher.
- [ ] Add `Start-Ascend.ps1 -Target Vision` and `Start-Ascend.ps1 -Target Hub` entry options, independent Start/Cancel/Retry/Stop buttons, and per-component singleton checks. Forward launch requests through the owner-restricted supervisor channel; check instance identity when recovering from stale state.
- [ ] Give the supervisor a component record containing `component`, `instanceId`, `buildId`, `pid`, `processStartTime`, `owned`, `state`, `lastHealthAt`, `failureCode`, and `retryCount`.
- [ ] Launch each managed tree using Windows process ownership handles/Job Objects through the helper. Assign a process to its job before allowing it to run; check every native return code. If ownership setup fails, show the failure instead of running an unmanaged child.
- [ ] Use exact executables, argument arrays, and explicit working directories. Hide helper consoles; route startup events to the launcher. Do not depend on the user's terminal staying open.
- [ ] Add Hub liveness separate from Core shelf readiness. Handle busy port as a named conflict. Reuse a process only after verifying its identity; never kill an arbitrary listener or silently accept a wrong application.
- [ ] Add staged progress and the deadlines in section 4. One component failure leaves the launcher and the other component alive.
- [ ] Add independent Open, Retry, Cancel startup, and Stop controls plus Open diagnostics. Disable duplicate Start/Retry while transitioning, but keep Cancel/Stop responsive. Offer Stop all only as an explicit secondary action when both products are running.
- [ ] Test duplicate clicks, early child exit, child hang, wrong health identity, launcher state-file corruption, occupied port, and launcher termination using fixture children. While Vision startup is hung, start/stop Hub and confirm no shared blocking wait. Repeat with Hub hung and Vision starting.

**Diagnostic policy:** Create a session ID and sanitized structured events under `%LOCALAPPDATA%/Ascend/Desktop/logs`. Store stage, build ID, duration, exit code, and allowlisted exception/stack information. Never blindly persist existing stdout: Vision currently logs some generated text. Keep any raw process output only in a bounded transient buffer; persistent fields must remove messages, credentials, frames, audio, and page contents. Rotate at 5 MiB per file, 10 files, and 14 days, whichever limit is reached first. Prove redaction with fixture secrets and chat text.

**Exit gate:** A fixture child can exit or hang without closing/freezing the launcher. Repeated clicks never create a second managed instance, and diagnostics identify the failed stage.

## 8. Phase R3 — Keep Fairy and chat alive without sensors

This is the main Vision reliability change. A `try/except` around `main()` cannot contain a native process crash, and a chat loop dependent on new camera frames cannot work when frames stop.

**Create in Vision:** `desktop_host.py`, `assistant/runtime_health.py`, `assistant/sensing_process.py`, `tests/test_desktop_host.py`, `tests/test_runtime_health.py`, `tests/test_sensing_process.py`.

**Modify in Vision:** `main.py`, `focus_ui.py`, `capture.py`, relevant existing chat/runtime lifecycle code, `fairy-ui/src/hooks/use-vision-runtime.ts`, and `fairy-ui/src/components/fairy-companion.tsx`. Keep existing detector/state-machine logic; move ownership rather than rewriting detection algorithms.

- [ ] Introduce a lightweight host entrypoint with no module-level OpenCV, Torch, YOLO, or MediaPipe imports. Start Fairy and the existing shared local conversation service first.
- [ ] Trace the full chat initialization path for indirect native imports. Move hardware-dependent imports and construction into workers. Keep typed messages and stop/retry commands independent of camera frame arrival.
- [ ] Run camera capture, detection, and native visual inference in one spawned sensing process. It is the sole webcam owner. The host consumes bounded observations, not a second camera stream.
- [ ] Define sensing IPC envelopes with schema version, boot ID, sequence, monotonic observation time, kind, and bounded payload. Coalesce latest sensor observations; keep stop/pause controls separate from sensor traffic. Reject malformed, stale, and old-boot messages.
- [ ] Preserve current frame-preview behavior using bounded local in-memory transfer only when requested. Do not persist raw frames or create a camera listener reachable from the phone.
- [ ] Keep mission/state/database mutations and existing authenticated browser approvals with their current authority. Do not let a restarted sensing worker replay pickup penalties, gestures, or pending actions. Start fresh observation state after restart.
- [ ] Distinguish camera busy, no camera, missing model, model initialization failure, and worker exit. Mark sensing/context stale or unknown and retain typed chat. Allow manual Retry camera.
- [ ] Initialize microphone and TTS independently. A missing/busy microphone leaves typed chat usable; TTS failure leaves text replies usable. Isolate native voice initialization in a worker as needed to meet the native-crash test, using the same bounded lifecycle contract.
- [ ] Publish readiness only when the shared chat transport is bound, not just when Flask starts listening. An unconfigured provider gives an honest unavailable reply rather than false AI success.
- [ ] Clear old observation values and face targets when the sensing heartbeat expires. Preserve pause/mute/speech-output preferences through a worker retry.
- [ ] Test absent camera, forced sensing process exit, frozen sensing process, missing model, microphone denial, TTS failure, and Core outage while completing a typed chat request using a fixture model.

**Exit gate:** A real OS-level sensing worker exit leaves Fairy and typed chat operational. A Python mock throwing `CaptureError` alone is insufficient evidence. Existing chat-session isolation, memory approval, browser authorization, and sensor/state-machine tests remain passing.

## 9. Phase R4 — Predictable stop, retry, and recovery

**Files:** Hub `desktop/Supervisor.psm1`, `desktop/ProcessHost.cs`, supervisor fixture tests; Vision host/worker lifecycle tests and relevant existing browser cancellation interfaces.

- [ ] On Stop Vision or Stop Hub, stop accepting new work and clean up only that product's owned process tree. Cancel startup invalidates its pending start generation so a late-ready child cannot reopen the app. Allow 15 seconds per component for graceful shutdown, with a visible Stopping state. Explicit Stop all applies these transitions to both products.
- [ ] At the deadline, offer Force stop and terminate only the owned process tree. Recheck process start time/handle before acting; PID alone is insufficient. Never use `taskkill /IM python.exe` or equivalent broad cleanup.
- [ ] Make close behavior explicit: Close asks once per action whether to Stop and exit or Keep running in the tray. Do not persist an assumed answer. Explicit application exit closes its owned jobs; externally attached processes remain outside shutdown ownership.
- [ ] Preserve Core/provider unavailability as capability state. Do not restart Hub or Vision merely because the internet is down or authentication has expired.
- [ ] V1 defaults to manual retries for failed Vision/sensor processes, avoiding automatic camera reactivation or model crash loops. Hub may retry a transient startup connection probe within its existing deadline; process restarts require Retry.
- [ ] Retry is component-specific, with a fresh instance ID. It must not replay a sent message, restart a consequential browser action, or label an interrupted action successful. Retain the existing browser journal's unknown-outcome behavior.
- [ ] After sleep/resume, verify fresh health and observations; show unavailable/reconnecting states until evidence returns. Do not restart a user-paused component.
- [ ] Verify release of camera, microphone, ports, worker processes, and database handles after stop. Keep graceful cleanup separate from recovery after unavoidable native termination.

**Exit gate:** Start/stop/retry cycles leave no owned orphan processes and do not affect unrelated apps. A crashed task with an uncertain external result is never automatically repeated.

## 10. Phase R5 — Daily build and app shortcut

**Create in Hub:** `desktop/Install-Shortcut.ps1`, `desktop/Verify-Release.ps1`; release metadata generated during an explicit setup/build step. Update both product READMEs.

- [ ] Validate Hub's existing built portable runtime on this Windows machine: build, start through Wrangler, verify Hub assets/API routes, restart twice, and check stopped process cleanup. Do not assume the old `dist` directory represents current source.
- [ ] If that runtime fails, fix the evidenced compatibility issue in a separate scoped change. Keep the daily profile blocked until a runtime is demonstrated; do not silently change frameworks.
- [ ] Build Fairy once during setup and record compatible Hub/Vision/UI build identities. The launcher checks them before startup and explains when a rebuild is needed.
- [ ] Create separate user-level Ascend Vision and Ascend Hub shortcuts targeting the same launcher with different product arguments, without exposing helper terminals. Ensure bootstrap failures show an error dialog/report rather than disappear.
- [ ] Keep the first release dependent on explicitly installed, verified Python/Node environments. A shortcut is not yet a self-contained installer.
- [ ] Document update and rollback: stop owned components, prepare and verify a candidate build separately, preserve env/data paths, switch the profile only after health checks. Keep the previous verified build. If a data schema changed, require its tested compatibility/backup path; switching binaries alone is not a database rollback.
- [ ] Defer bundled installer, embedded WebView, and start-at-login until the reliability gate passes. These can follow without changing the runtime ownership design.

**Exit gate:** The user can double-click either product's shortcut from outside the repositories and open only the selected product without manual terminal commands or per-launch compilation. Both can also run together when explicitly started.

## 11. Phase R6 — Acceptance evidence

**Create:** `D:/ascend_hub/docs/audits/2026-10-01-desktop-startup-acceptance.md`. Record build IDs, machine/runtime versions, scenario, expected result, actual result, stage durations, owned process count after shutdown, and evidence location. Keep real hardware acceptance distinct from fixture results.

| Scenario | Required result |
|---|---|
| Vision-only cold start | Launcher remains responsive; Fairy opens after its readiness gate; Hub is not started. |
| Hub-only cold start | Launcher remains responsive; Hub opens after its readiness gate; Vision/camera are not started. |
| Explicitly start both | Independent progress/readiness; a failure or stop of either does not stop the other. |
| Ten consecutive start/stop cycles | All ten complete; no duplicate owner, lingering camera/mic handle, or owned orphan process. |
| Three Windows sign-out/reboot sessions | First launch works each time without terminal setup. Hardware presence is recorded. |
| Double/triple click while starting | One launcher and one owned instance of each component. |
| Wrong interpreter or missing Python package | Named prerequisite failure; Hub and launcher remain usable. |
| Missing or incompatible UI build | Clear rebuild instruction; no half-working old UI presented as ready. |
| Camera busy, unplugged, or disabled | Fairy stays open; typed chat works; sensing becomes unavailable. |
| Native sensing worker termination | Host/chat survive; stale observations clear; Retry creates a new worker identity. |
| Microphone unavailable / TTS failure | Typed chat works; audio capability shows its actual failure. |
| No internet / Core offline / expired auth | App stays open; separate states are accurate; no restart storm. |
| Missing model key or failed model response | No false AI-ready indicator; useful explicit failure; other local features stay usable. |
| Hub port occupied by another app | Named conflict; unrelated listener remains running. |
| Hub or Vision exits unexpectedly | Launcher reports exit reason and Retry; unaffected component stays usable. |
| Frozen child process during import/model/server startup | Stage and elapsed time remain visible; Cancel acknowledged within one second; startup deadline is enforced; owned Force stop remains available. |
| One product frozen while starting the other | The other product's controls and startup continue normally. |
| Sleep/resume three times | Health refreshes; old sensor data not presented as current; pauses respected. |
| Stop during initialization | Pending starts cancel; no worker appears after Stop completed. |
| Retry with pending browser action | No automatic re-execution; uncertain outcomes stay unknown. |
| Two-hour normal-use session | No unexplained process exit, UI freeze, or sustained growth in handles/processes. |
| Diagnostic fixture containing secrets/chat | Persistent report contains neither secret nor raw conversation. |

Fixture tests cover supervisor states, identity checks, cleanup, retry, and redaction. Vision uses its existing pytest suites plus the new host/sensing tests. Hub uses its existing Node/TypeScript tests and a focused health-route test. Fairy uses its existing Playwright setup for disconnected/degraded/recovered states. Use temporary data and fixture services for destructive failure injection; never crash the owner's active task as a test.

**Release gate:** All applicable scenarios have evidence, no unresolved reproducible critical startup freeze/failure, and owner observation confirms each shortcut opens its selected usable product independently. Publish any remaining machine-specific limitation; do not call the release crash-proof or equate fixture coverage with live hardware acceptance.

## 12. Delivery order and first implementation slice

Order: **R0 evidence → R1 stable paths → R2 persistent launcher → R3 sensor-independent chat → R4 recovery → R5 daily shortcut → R6 acceptance.** Run each phase's local acceptance while implementing it; R6 combines the evidence on the installed machine.

The first implementation slice is R0–R1: capture the reported freeze and its last completed stage, correct the separately confirmed obsolete wrapper, pin the actual environment/config selection, and expose specific startup failures. This produces a useful reliability improvement before desktop packaging work; correcting the wrapper alone is not proof that the freeze is fixed.

The existing Fairy appearance remains intact. The new UI work is startup/capability status and recovery controls. The requested launcher is not implemented by this plan; implementation starts after the user reviews it.
