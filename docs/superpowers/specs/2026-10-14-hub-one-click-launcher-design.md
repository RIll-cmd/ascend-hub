# One-click Hub launcher — design

Date: 2026-10-14. Status: approved in chat, awaiting spec review.

## Goal

Double-clicking the **Ascend Hub** desktop shortcut should get the owner into Hub with no further clicks. The small launcher window stays readable and friendly, and Hub keeps running in the tray.

## Current state (2026-10-14)

- The shortcut runs `desktop\Start-Ascend.ps1 -Target Hub` from the `.worktrees\desktop-reliability` checkout, which belongs to Codex's blocked branch.
- The launcher already auto-starts Hub. A second double-click re-activates the existing window (`ProductOwner.ActivationPending`).
- Hub runs in the `development` runtime: `vinext dev`, up to 90 s on first start, about 1.1 GB private memory.
- After **Ready**, the owner must click **Open Hub**, which opens a default-browser tab.
- The window is 760×520 with technical copy ("Not checked", "Stage 3s / startup 15s", "authenticated health"). It doesn't show the agent room.
- Closing the window while Hub runs shows a "Stop this app before closing?" panel.

## Design

### 1. Production runtime

- `Supervisor.Validate` accepts `runtime = "production"`.
  - The required artifact is `scripts/run-framework.mjs`.
  - No `desktop/release.json` is needed: `serve` builds locally and stamps its own build.
- `Supervisor.Arguments` for production: `scripts/run-framework.mjs serve --port <port>`.
  - `serve` binds `127.0.0.1`, rebuilds only when the source stamp changed, and starts the agent room.
- `/api/health` already reads `ASCEND_LAUNCH_TOKEN`, `ASCEND_INSTANCE_ID` and `ASCEND_BUILD_ID` from the process environment under `vinext start`. Verified: `ui: ready` with the token, 403 without.
- Stage lines from the child output:
  - Vite/vinext build output ("building", "Build complete") shows "Building Hub (first start after an update)".
  - "Production server running" shows "Starting Hub".
- The production startup budget stays 90 s, which covers a first build of about 15 s.
- `HubSessionConflict` (`ProcessHost.cs`) also treats `run-framework.mjs serve` and `vinext/dist/cli.js start` as a verified Hub session. "Stop the other copy and retry" then works against a `serve` session.
- The agent room process is spawned by `serve` inside the launcher's job object, so it stops with Hub. It restores its sessions on the next start.

### 2. One-click flow

- The launcher auto-starts Hub, as today.
- On the first transition to `ready` in a launch, the launcher opens Hub in an app window:
  - `msedge.exe --app=<url>`;
  - Edge is located through `HKLM`/`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe`, then the standard Program Files paths;
  - with no Edge, it falls back to the default browser (today's `UseShellExecute`).
- The URL is always validated as `http://127.0.0.1:<port>/` before launch, as today.
- **Open Hub** (window and tray) opens the app window again.
- When the shortcut is double-clicked while the launcher already runs, the existing instance opens the app window if Hub is `ready`/`degraded`. Otherwise it shows the launcher window.

### 3. Mini console window (option A)

`HubLauncher.xaml` becomes a compact window: about 320×400, minimum 300×360, the same charcoal and orange resources.

| State | Heading | Body | Actions |
| --- | --- | --- | --- |
| stopped | "Hub is stopped" | — | **Start Hub** |
| checking / starting | "Waking up Hub" | progress bar (indeterminate) + current step in plain words | **Cancel** |
| ready | "Hub is open" | status lines | **Open Hub**, **Stop** |
| degraded | "Hub is open, with limits" | status lines | **Open Hub**, **Stop** |
| failed | plain sentence per failure code (below) | — | one fix button (**Retry**, or **Stop the other copy and retry** for `port-in-use`) |
| stopping / stop_failed | "Stopping Hub" / "Hub didn't stop" | — | **Force stop** (stop_failed) |

- **Status lines (ready/degraded):**
  - Hub: from health `ui`.
  - Agent room: from `GET http://127.0.0.1:<port>/api/room`, polled every 5 s off the UI thread. It shows "3 of 3 agents" (agents whose state is not `offline`), "Starting", or "Offline".
  - Core status: from the existing capability label.
- **Plain failure sentences** (the existing failure codes):
  - `profile-missing`: "Hub isn't set up yet."
  - `port-in-use`: "Another copy of Hub is using port 5173."
  - `runtime-missing`: "Node.js wasn't found."
  - `hub-build-missing`: "Hub's files are missing."
  - `startup-timeout`: "Hub took too long to start."
  - `child-exit-*`: "Hub stopped unexpectedly."
  - anything else: "Hub couldn't start."
  - The failure code and stage stay visible under **Details** with the **Open diagnostics folder** button.
- Copy rules: no "runtime", "health", "stage" or second counters in the main view. Elapsed time appears only under **Details**.

### 4. Tray

- A `System.Windows.Forms.NotifyIcon` using `assets/hub.ico`. The tooltip is "Ascend Hub — <heading>".
- Menu: **Open Hub**, **Show launcher**, **Stop Hub**, **Quit**. Quit stops Hub, then exits the launcher.
- Double-clicking the tray icon opens Hub when it's running and shows the launcher otherwise.
- Clicking ✕ while Hub is running or starting hides the window to the tray. A one-time balloon says "Ascend Hub keeps running here. Right-click to stop it."
- Clicking ✕ when Hub is stopped or failed exits the launcher.
- This replaces the `CloseActions` panel for Hub.
- The launcher exits when the owner chooses **Quit**, or closes the window while Hub is stopped.
- Vision keeps its current close behaviour.

### 5. Installer

- `Install-Ascend.ps1` writes `hub.runtime = 'production'` by default.
- New switch `-HubRuntime development|production` (default `production`).
- Re-running it from `D:\ascend_hub\desktop` with `-Force` moves the shortcut to the main checkout and keeps a dated profile backup. The owner confirms before it runs.

## Out of scope

- Auto-start at Windows sign-in.
- Vision launcher changes. Vision shares `LauncherPresentation.ps1`, `Supervisor.cs` and `ProcessHost.cs`, so every change there is Hub-only or backward-compatible, and Vision tests must still pass.
- A packaged installer (MSI or EXE).
- Rewriting the supervisor.

## Success criteria

- From a cold start, one double-click ends with Hub visible in an app window, with no further clicks. The time is about 2 s plus the browser after the first build.
- A second double-click while Hub runs focuses or opens Hub, and never starts a second copy.
- Closing the launcher keeps Hub running in the tray. **Quit** stops Hub and the agent room.
- Every state renders without clipping at 100%, 150% and 200% scale.
- All desktop tests pass in Windows PowerShell 5.1: layout, supervisor, installer, native launchers, session replacement. Hub web tests pass too.

## Testing

- `Test-LauncherLayout.ps1`:
  - new Hub assertions: compact size, headings per state, one primary action per state, status lines when ready, failure sentence per code;
  - renders every state to PNG at 100/150/200%;
  - Vision assertions unchanged.
- `Test-Supervisor.ps1` / `SupervisorRegression.cs`:
  - production arguments;
  - `Validate` accepts production with `run-framework.mjs`;
  - `HubSessionConflict` accepts `serve` and `start`.
- `Test-Installer.ps1`: default `production`, `-HubRuntime development` still works.
- Pure helpers get their own tests: Edge path resolution, the failure sentence map and the agent count. They live in `LauncherPresentation.ps1`, are tested from `Test-LauncherLayout.ps1`, and take values as input with no I/O.
- Live: install into a temporary profile with `-SkipShortcuts`, launch with that profile, confirm the app window opens, then Quit, and check that no Hub or room process remains. The Edge app window belongs to the owner and is left open.
