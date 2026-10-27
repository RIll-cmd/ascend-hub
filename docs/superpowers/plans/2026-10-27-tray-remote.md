# Tray Remote and Hub on Demand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native tray popup (shelf of three TVs, lower third, remote strip) that shows the agents and starts tasks from the agent room directly, while Hub's server and window run only on demand.

**Architecture:** The launcher owns the agent room as its own process (new `RoomHost`), separate from Hub's job, and reads everything the popup shows from a new room route, `GET /tray`. The TV words move into one `.mjs` module the room and Hub's deck both use. Hub pages send a heartbeat through Hub's proxy so the room knows when someone is looking; the launcher stops Hub after `hubIdleStopMinutes` of silence.

**Tech Stack:** Node 22.13+ ESM (`scripts/agent-room`), Vinext/React TypeScript (Hub), Windows PowerShell 5.1 + WPF + C# compiled by `Add-Type` (`desktop/`).

**Spec:** `docs/superpowers/specs/2026-10-27-tray-remote-design.md`

## Global Constraints

- The popup never embeds a browser; it is WPF shapes and text in the launcher's process.
- Stopping Hub (button, tray menu, auto-stop) never stops the room or a running session. Only Quit stops the room, and only a room the launcher started.
- `GET /tray` never starts readiness probes; `GET /tray?refresh=1` and `POST /tray/task` probe only when the last probe is older than `PROBE_TTL_MS` (10 min) and no session runs.
- Polling: `GET /tray` every 2 s while the popup is open, every 15 s while closed, one request in flight.
- The room token is read from Hub's `.env.local` (`ASCEND_ROOM_TOKEN`), held in memory only, never logged, written to the profile, or shown.
- Loopback only: `127.0.0.1`, port `ASCEND_ROOM_PORT` from `.env.local`, default 5181.
- Auto-stop default 10 minutes, countdown shown for the last 2 minutes; profile `hub.idleStopMinutes`, where 0 turns it off.
- Restart an owned room at most 3 times in 10 minutes.
- Channels and colours: CH 03 Codex `#e28a2b`, CH 05 Claude `#d97757`, CH 04 Antigravity `#3d7bff`; TV order left to right Codex, Claude, Antigravity; needs-you amber `#ef9f27`.
- Commits carry no Claude attribution lines.
- Desktop checks run in Windows PowerShell 5.1 (`powershell.exe`), never `pwsh`.

## Review Focus

1. The room's own 30-minute idle exit while the launcher owns it: the launcher would see an exit and restart-loop. Expect the room never to idle-exit under the launcher (`ASCEND_ROOM_IDLE_MS=0`). Test in Task 2.
2. Hub just started, before any page has loaded: auto-stop must count from when Hub became ready, not from a stale `lastViewerAt`. Test in Task 6.
3. First run with no `ASCEND_ROOM_TOKEN` in `.env.local`: the launcher starts the room (which writes the token), then reads it. Test in Task 5.
4. "Today" crosses midnight: a session created at 23:59 yesterday is not in today's list. Test in Task 2.
5. Quit while a session runs, and Quit with an adopted room: confirm text differs and an adopted room is never stopped. Test in Task 6.

---

### Task 1: One source for the TV words

Move `roomScene`, `graphicFor` and `tvStatus` into a plain ESM module the room can import; Hub's TypeScript re-exports them with their existing types, so every existing test keeps pinning the words.

**Files:**
- Create: `scripts/agent-room/tv-words.mjs`
- Modify: `app/room/deck/room-scene.ts` (`roomScene`, `graphicFor` become typed re-exports; `RoomScene`, `spots`, `nowCard`, `Spot`, `NowCard` stay), `app/room/deck/tv-status.ts` (`tvStatus` becomes a typed re-export; types stay)
- Test: `tests/agent-room/tv-words.test.mjs`; existing `tests/agent-room/{room-scene,tv-status,room-window,deck-view}.test.ts` unchanged

**Interfaces:**
- Produces (`scripts/agent-room/tv-words.mjs`): `roomScene(session, queue)`, `graphicFor(id, state, scene)`, `tvStatus(agent, scene, graphic, nowMs)`, `CHANNELS`, `AGENT_COLORS`. Same inputs and outputs as today's TS. Agent names come from `scripts/agent-room/prompts.mjs` `AGENT_NAMES`.
- TS keeps `export const roomScene: (session: SessionView | null, queue: QueueView | null) => RoomScene = core.roomScene;` style re-exports, so callers do not change.

- [ ] **Step 1: Write the failing test** `tests/agent-room/tv-words.test.mjs`:

```js
test('the room can read the TV words without TypeScript', () => {
  const scene = roomScene(session(), null);
  const s = tvStatus({ id: 'claude', name: 'Claude', color: '#d97757', state: 'busy', activity: 'editing', since: '2026-10-27T10:00:00Z', roles: ['coder'] }, scene, graphicFor('claude', 'busy', scene), Date.parse('2026-10-27T10:04:30Z'));
  assert.deepEqual([s.channel, s.bug, s.headline, s.sub], ['CH 05', 'LIVE', 'CLAUDE · CODING', 'task 2/3 · Login form · 4m']);
});
```
(`session()` is the same fixture as `tests/agent-room/tv-status.test.ts`.)

- [ ] **Step 2: Run it:** `node --no-warnings --test tests/agent-room/tv-words.test.mjs` → FAIL, module not found.
- [ ] **Step 3: Create the module** by moving the bodies from the TS files (drop type syntax), then turn the TS functions into typed re-exports.
- [ ] **Step 4: Run** `node --no-warnings --test tests/agent-room/tv-words.test.mjs` → PASS; `npx --no-install tsx --test tests/agent-room/*.test.ts` → all pass (92); `npx --no-install tsc --noEmit` → clean.
- [ ] **Step 5: Commit** `refactor(room): one module for the TV words`.

### Task 2: The room's `/tray` routes

**Files:**
- Create: `scripts/agent-room/tray.mjs`
- Modify: `scripts/agent-room/server.mjs` (routes, viewer stamp, `ASCEND_ROOM_IDLE_MS`)
- Test: `tests/agent-room/tray.test.mjs` (pure), `tests/agent-room/server.test.mjs` (routes)

**Interfaces:**
- Consumes: Task 1's `roomScene`, `graphicFor`, `tvStatus`.
- Produces:
  - `trayView({ agents, session, today, probedAt, lastViewerAt, nowMs })` →
    `{ tvs: [{ id, channel, color, bug, mood, headline, sub, stale }], lead: AgentId | null, today: { codex: Entry[], claude: Entry[], agy: Entry[] }, running: boolean, needs: string | null, lastViewerAt: string | null, buildsRoot: string }` (`buildsRoot` feeds the launcher's disk line), with `Entry = { id, headline, sub }`. `tvs` is in the order codex, claude, agy. `lead` is the agent whose TV is WAIT, else LIVE, else null. `needs` is the gate line or null. `stale` is true when `nowMs - probedAt > PROBE_TTL_MS`; then `sub` ends with ` · checked Nm ago`. Agent state comes from availability and the session exactly as `deckView` derives it (offline / checking / idle / busy).
  - `sessionsToday(dataDir, nowMs)` → summaries created since local midnight, newest first, each `{ id, mode, stage, title, createdAt, roles }`.
  - `todayFor(id, sessions, nowMs)` → `Entry[]`: an agent takes part when it holds a role in a build (orchestrator, coder or reviewer) or in any debate. Headline `` `${OUTCOME} · ${age} ago` `` with OUTCOME `DONE` / `STOPPED` / `REJECTED` / `RUNNING`, age as `now`, `Xm`, `Xh Ym`; sub is the title.
  - `defaultTask(text)` → `{ template: 'feature', project, task: text }`, where `project` is the first three words lower-cased and joined with `-`, letters, digits and `-` only, at most 40 characters, `task` if empty.
  - Routes: `GET /tray` (no probe), `GET /tray?refresh=1` (probes under the TTL rule, awaits it), `POST /tray/task {text}` (refreshes under the TTL rule, then `POST /sessions` behaviour, or the queue when busy; 409 `AGENTS_NOT_READY` names who), `POST /viewer` (204). Any request with header `x-ascend-viewer: 1` sets `lastViewerAt`.
  - `startRoomServer({ ..., idleMs })`: `idleMs` 0 means never idle-exit; the CLI entry reads `ASCEND_ROOM_IDLE_MS`.

- [ ] **Step 1: Write the failing pure tests** in `tests/agent-room/tray.test.mjs`:
  - `the lead is the TV that needs you, then one at work` — gate-plan session → `lead === 'codex'`, `needs === 'approve the plan'`; build with Claude busy → `lead === 'claude'`; no session → `lead === null`.
  - `a stale probe says when it checked` — `probedAt` 12 min before `nowMs` → codex `sub` ends with `· checked 12m ago` and `stale === true`.
  - `today stops at local midnight` — sessions at local 23:59 yesterday and 00:01 today → only the 00:01 one.
  - `an agent counts the sessions it took part in` — build roles `{orchestrator:'codex', coders:['claude'], reviewer:null}` → agy gets 0, codex and claude 1; a debate → all three get 1; headline `DONE · 37m ago`.
  - `defaultTask names the project from the first words` — `'Build a todo app with tags'` → `project === 'build-a-todo'`; `'!!!'` → `project === 'task'`.
- [ ] **Step 2: Run** `node --no-warnings --test tests/agent-room/tray.test.mjs` → FAIL, module not found.
- [ ] **Step 3: Implement `scripts/agent-room/tray.mjs`.**
- [ ] **Step 4: Write the failing route tests** in `tests/agent-room/server.test.mjs`, using `boot()` with a counting `probe`:
  - `GET /tray never probes; refresh=1 probes only when stale` — probe count unchanged after two `GET /tray`; `refresh=1` right after boot does not probe again within the TTL.
  - `a viewer header stamps lastViewerAt; the launcher's own calls do not` — `GET /tray` → `lastViewerAt === null`; `POST /viewer` with `x-ascend-viewer: 1` → set.
  - `POST /tray/task starts a feature build, or queues it while busy` — 201 with a session whose task is the text; a second call → queued.
  - `idleMs 0 never closes the room` — `startRoomServer({ ..., idleMs: 0 })` keeps listening after the idle check runs (expose the check or use a short `idleMs` sentinel and assert it is skipped).
- [ ] **Step 5: Implement the routes** in `server.mjs`.
- [ ] **Step 6: Run** `node --no-warnings --test tests/agent-room/tray.test.mjs tests/agent-room/server.test.mjs` → PASS, then the whole room+hub suite → all pass.
- [ ] **Step 7: Commit** `feat(room): tray routes for the launcher`.

### Task 3: Hub tells the room someone is looking

**Files:**
- Modify: `app/room/room-proxy.ts` (both forwarders add `x-ascend-viewer: 1`)
- Create: `app/api/viewer/route.ts` (`POST` → `forwardToRoom("/viewer", { method: "POST" })`, guarded by `foreignHost` like the other routes), `components/ViewerHeartbeat.tsx` (client component, `POST /api/viewer` on mount and every 30 s, visible or hidden, renders nothing)
- Modify: `app/layout.tsx` (render `<ViewerHeartbeat />` once), `app/room/room-parts.tsx` (`useBrief` seeds `task` from a `draft` query parameter once, then removes it from the address with `history.replaceState`)
- Test: `tests/agent-room/room-proxy.test.ts`, `tests/hub/viewer-heartbeat.test.mjs`

**Interfaces:**
- Consumes: Task 2's `POST /viewer` and `x-ascend-viewer`.
- Produces: `/room?draft=<text>` prefills the prompt box (used by Task 7's "More options").

- [ ] **Step 1: Failing tests:** room-proxy test asserts the fetch init carries `x-ascend-viewer: "1"` for `forwardToRoom` and `forwardFileFromRoom`; `viewer-heartbeat.test.mjs` reads `app/layout.tsx` and asserts it renders `<ViewerHeartbeat />`, and reads the component and asserts a `30_000` interval and `/api/viewer`.
- [ ] **Step 2: Run** `npx --no-install tsx --test tests/agent-room/room-proxy.test.ts` and `node --no-warnings --test tests/hub/viewer-heartbeat.test.mjs` → FAIL.
- [ ] **Step 3: Implement** the header, route, component, layout line and `draft` seeding.
- [ ] **Step 4: Run** both tests → PASS; `tsc --noEmit` clean; check live on the dev server that `POST /api/viewer` returns 204 and `/room?draft=hello` shows "hello" in the prompt box.
- [ ] **Step 5: Commit** `feat(hub): viewer heartbeat and prompt drafts`.

### Task 4: Hub stops spawning the room under the launcher

**Files:**
- Modify: `scripts/agent-room/launch.mjs` (`startAgentRoom({ env = process.env, spawnImpl = spawn } = {})` returns `false` without spawning when `env.ASCEND_ROOM_EXTERNAL === '1'`, else spawns and returns `true`)
- Modify: `desktop/Supervisor.cs` (extract `public static Dictionary<string,string> ChildEnvironment(string component, string token, string instanceId, string buildId)`; for `hub` it adds `ASCEND_ROOM_EXTERNAL=1`; `Run` uses it)
- Test: `tests/agent-room/launch.test.mjs`, `desktop/tests/Test-HubRuntime.ps1`

- [ ] **Step 1: Failing tests:** `launch.test.mjs` — with `{ ASCEND_ROOM_EXTERNAL: '1' }` the spy `spawnImpl` is never called and the result is `false`; without it, called once. `Test-HubRuntime.ps1` — `[Ascend.Desktop.Supervisor]::ChildEnvironment('hub','t','i','b')['ASCEND_ROOM_EXTERNAL'] -eq '1'` and the vision environment has no such key.
- [ ] **Step 2: Run** `node --no-warnings --test tests/agent-room/launch.test.mjs`; `powershell.exe -NoProfile -File desktop/tests/Test-HubRuntime.ps1` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both → PASS; `Test-Supervisor.ps1` still passes.
- [ ] **Step 5: Commit** `feat(desktop): Hub leaves the room to the launcher`.

### Task 5: `RoomHost`, the launcher's own room

**Files:**
- Create: `desktop/RoomHost.cs`
- Test: `desktop/tests/Test-RoomHost.ps1`, fixture `desktop/tests/fixture_room.mjs` (answers `GET /tray` 200 only for the bearer token in its environment; writes the token to the given env file when missing, as the real room does)

**Interfaces:**
- Produces (namespace `Ascend.Desktop`):
  - `public sealed class RoomEnv { public int Port; public string Token; }` and `public static RoomEnv RoomHost.ReadEnv(string envFile)`: parses `ASCEND_ROOM_TOKEN` and `ASCEND_ROOM_PORT` (quotes optional, CRLF or LF, default port 5181, Token null when absent).
  - `public static bool RoomHost.ShouldRestart(IList<DateTime> recentExitsUtc, DateTime nowUtc)`: true when fewer than 3 exits fall in the 10 minutes before `nowUtc`.
  - `public RoomHost(string nodeExe, string hubRoot, string script = "scripts/agent-room/server.mjs")`, `Start()`, `Stop()`, `Dispose()`, `string State` (`stopped` / `starting` / `running` / `adopted` / `failed`), `bool Owned`, `string FailureCode` (`room-port-in-use`, `room-start-timeout`, `room-crashed`), `RoomEnv Env` (current, re-read after start).
  - Start: if the port answers `GET /tray` 200 with this checkout's token → `adopted`, `Owned=false`. If the port is busy otherwise → `failed` / `room-port-in-use`. Else spawn through `ProcessHost` (own job) with `ASCEND_ROOM_IDLE_MS=0`, re-read the env file until the token exists, and poll `/tray` until 200 within 20 s → `running`. An unexpected exit of an owned room restarts it while `ShouldRestart` allows, else `failed` / `room-crashed`. `Stop()` ends an owned room's job only; on an adopted room it only stops watching.

- [ ] **Step 1: Failing tests** in `Test-RoomHost.ps1`: `ReadEnv` on a quoted CRLF file and on a file without the token; `ShouldRestart` with 2 and 3 exits in 10 minutes and 3 exits spread over 20 minutes; start with the fixture on a free port → `running`, `Owned` true, token read after the fixture wrote it; second host on the same port → `adopted`; an `HttpListener` on the port answering 401 → `failed`/`room-port-in-use`; killing the fixture → back to `running` (restart); `Stop()` on the adopted host leaves the first host's process alive.
- [ ] **Step 2: Run** `powershell.exe -NoProfile -File desktop/tests/Test-RoomHost.ps1 -NodeExe D:/node.exe` → FAIL (type not found).
- [ ] **Step 3: Implement `desktop/RoomHost.cs`.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(desktop): the launcher owns the agent room`.

### Task 6: Launcher wiring, auto-stop and the tray icon

**Files:**
- Modify: `desktop/Start-Ascend.ps1` (load `RoomHost.cs`; for Hub: start the room on launch; replace `Start-RoomPoll`'s Hub `api/room` call with `GET /tray` on the room with the token; poll 2 s / 15 s; auto-stop; tray icon and tooltip; Quit confirmation; room line and Start button), `desktop/LauncherPresentation.ps1` (pure functions below), `desktop/HubLauncher.xaml` (room line: `RoomStatus` text and `RoomStart` button), `desktop/Supervisor.cs` (`ComponentProfile.idleStopMinutes` as `int?`)
- Test: `desktop/tests/Test-TrayLogic.ps1`, `desktop/tests/Test-LauncherLayout.ps1` (room line)

**Interfaces:**
- Consumes: Task 2's `/tray` payload, Task 5's `RoomHost`.
- Produces (`LauncherPresentation.ps1`):
  - `Get-HubIdleAction($lastViewerAt, [DateTime]$hubReadyAt, [DateTime]$now, [int]$minutes)` → `'none'`, `'countdown:N'` (whole minutes left, shown when N ≤ 2) or `'stop'`; idle counts from the later of `lastViewerAt` and `hubReadyAt`; `$minutes -eq 0` → always `'none'`.
  - `Get-TrayTooltip($tray, [bool]$hubOn)` → `'Ascend Hub: approve the plan'` when `needs`, else `'Ascend Hub: Hub on'` / `'Ascend Hub: Hub off'` (at most 63 characters, the `NotifyIcon` limit).
  - `Get-QuitPrompt([bool]$running, [bool]$roomOwned)` → `$null` when nothing runs; otherwise the confirmation text: owned → "A session is running. Quit stops it and the agent room."; adopted → "The agent room was started elsewhere and keeps running."
  - `Get-AgentSummary($tray)` keeps its current output, now read from the `/tray` payload.
  - `New-AttentionIcon([Drawing.Icon]$base)` → the icon with an amber `#ef9f27` dot in the lower right.

- [ ] **Step 1: Failing tests** in `Test-TrayLogic.ps1`: idle table (hub ready 3 min ago and no viewer → `none`; last viewer 8.5 min ago → `countdown:2`; 10 min → `stop`; minutes 0 → `none`; viewer 30 s ago after a long idle → `none`); tooltip for needs, on and off, and truncation of a long gate line; both Quit prompts and `$null`.
- [ ] **Step 2: Run** `powershell.exe -NoProfile -File desktop/tests/Test-TrayLogic.ps1` → FAIL.
- [ ] **Step 3: Implement** the functions, then the wiring in `Start-Ascend.ps1`: the launcher's agent and disk lines from `/tray`; the auto-stop timer calls `$supervisor.Stop('hub')` on `'stop'`; Stop Hub and auto-stop never touch `RoomHost`; Quit stops `RoomHost` only when `Owned`.
- [ ] **Step 4: Run** `Test-TrayLogic.ps1`, `Test-LauncherLayout.ps1`, `Test-NativeLaunchers.ps1`, `Start-Ascend.ps1 -SelfTest` → PASS.
- [ ] **Step 5: Commit** `feat(desktop): Hub on demand`.

### Task 7: The tray remote popup

**Files:**
- Create: `desktop/TrayRemote.xaml` (shelf, three TVs, lower third, remote strip, task box), `desktop/TrayRemote.ps1`
- Modify: `desktop/Start-Ascend.ps1` (tray left click opens it; right-click menu unchanged), `desktop/tests/Test-LauncherLayout.ps1` (popup at 100/150/200% with a 60-character headline, each mood, Hub off/starting/on/closing, room closed)
- Test: `desktop/tests/Test-TrayLogic.ps1` (pure functions), `desktop/tests/Test-TrayRemote.ps1` (STA, real window, memory)

**Interfaces:**
- Consumes: Task 2's payload and `POST /tray/task`, Task 6's idle action and supervisor snapshot, Task 3's `/room?draft=`.
- Produces (`TrayRemote.ps1`):
  - `Get-TraySelection($tray, [string]$lastPicked)` → agent id: `lead`, else `$lastPicked`, else `'claude'`.
  - `Get-PowerState($hubSnapshotState, [string]$idleAction)` → `'off'`, `'starting'`, `'on'` or `'closing:N'`.
  - `Get-PopupPlacement($workArea, [double]$width, [double]$height, $cursor)` → `@{ Left; Top }` inside `$workArea`, anchored to the taskbar edge nearest the cursor, 8 px gap.
  - `New-TrayRemote([string]$desktopDirectory)` → the window; `Set-TrayRemote($window, $tray, [string]$selected, [int]$index, [string]$power)` renders.
- ⏻ HUB: `off` → `$supervisor.Start('hub',$false)` and open the Edge app window when it is ready (the launcher's existing `autoOpened` path); `on` or `closing:N` → `$supervisor.Stop('hub')`; `starting` → no action. The room is never touched.
- Behaviour from the spec: keys 1/2/3, Left/Right, Enter on the lower third opens the session in Hub (starting Hub if off), Esc closes; closes on `Deactivated`; topmost, `ShowInTaskbar=False`; automation names on every control; the "needs you" screen and the LIVE/WAIT lights blink only while the window is visible; +TASK swaps the lower third for a one-line `TextBox` ("Adds to the queue" while running, "checking agents…" while waiting, the not-ready agent's name on 409) and a "More options" link to `/room?draft=<text>`; "ROOM CLOSED" over "start the room from the launcher" when the room is down, and clicking it shows the launcher.

- [ ] **Step 1: Failing pure tests** in `Test-TrayLogic.ps1`: selection (lead wins, else last picked, else claude); power states for `stopped`/`starting`/`ready` and `countdown:2`; placement with the taskbar at the bottom, right and top of a 1920×1080 work area, never outside it.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement the pure functions → PASS.
- [ ] **Step 4: Failing window test** `Test-TrayRemote.ps1`: render with a fixture payload, assert the three TVs' automation names and the lower third text ("CLAUDE · CODING"), press `2`, assert Claude selected; open and close 20 times and assert the process working set grew less than 15 MB.
- [ ] **Step 5: Implement** `TrayRemote.xaml` and the rendering, and wire the left click. Faces: per mood, two eye shapes (ellipses or short lines) on a coloured `Border`; static is a `DrawingBrush` of lines; no images or video.
- [ ] **Step 6: Run** all desktop checks and `Start-Ascend.ps1 -SelfTest` → PASS; then run the real launcher from this checkout: open the popup with Hub off, start Hub from ⏻, close the window and watch the countdown, start a +TASK, and measure the launcher and room working sets with Hub off.
- [ ] **Step 7: Commit** `feat(desktop): tray remote`.

### Task 8: Docs and handoff

**Files:** `README.md` (desktop launcher section), `desktop/README.md` (room ownership, `idleStopMinutes`, tray remote, new checks), `ASCEND_HANDOFF.md` (Latest note)

- [ ] **Step 1:** Write the three updates, including that the installed profile must be reinstalled or updated (`Install-Ascend.ps1`) for the installed launcher to get this.
- [ ] **Step 2:** Run the full suites once more: room+hub `.mjs`, tsx `.ts`, `tsc`, eslint on changed files, every desktop check.
- [ ] **Step 3: Commit** `docs: tray remote and Hub on demand`, then push to main.
