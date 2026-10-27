# Tray remote and Hub on demand: design

Status: draft for the owner's approval (2026-10-27).

## Intent

The owner wants to check on the agents and start work from the Windows tray without running the whole Hub. Today Hub's server (about 300 MB) and its Edge window stay up all day, even though the agents only need the agent room process (about 70 MB). The tray remote is a small native popup above the Ascend tray icon. It shows the three agents and their sessions, starts a task, and turns Hub on and off. Hub runs only while someone looks at it.

The owner chose the look (layout "H" from the mockups) and handed every other decision to this design, with one instruction: keep it light on RAM.

## Goals

- A tray popup in the shape of a small shelf with three TVs, a news lower third, and a remote strip under it.
- Hub on demand: Hub's server and window start only when opened, and stop by themselves when nobody has had a Hub page open for a while.
- The agent room keeps running while Hub is off, so sessions, the queue and schedules carry on.
- RAM with Hub off: only the launcher and the room run. The popup adds no browser engine.

## Non-goals

- No change to Vision's launcher.
- No full session controls in the popup (gates, diffs, transcripts). Anything beyond "look" and "start a simple task" opens Hub.
- No new installer flow beyond what the launcher already has.

## Anti-goals (failure even if it works)

- The popup embeds a browser (WebView2 or Edge): that defeats the RAM goal.
- Stopping Hub stops a running agent session.
- The popup polls the room fast while closed, or wakes the agents' CLI readiness probes on every poll.
- The room token appears in logs, diagnostics, the profile or the UI.

## The popup (decided with the owner)

Layout "H": a wooden shelf with three TVs, a lower third under the shelf, and a dark remote strip along the bottom.

- **TVs:** CH 03 Codex, CH 05 Claude, CH 04 Antigravity, in that order left to right (the shelf order on the home page). Each screen shows its agent's mood with the room TVs' colours and faces: working or reviewing glows in the agent's colour (Codex #e28a2b, Claude #d97757, Antigravity #3d7bff) with open eyes; idle is dim with closed eyes; "needs you" is amber (#ef9f27) and blinks; offline shows static. The selected TV has a light frame.
- **Lower third:** a coloured banner with the headline and a light bar with the detail, the same words the room's TVs use (`tvStatus` in `app/room/deck/tv-status.ts`), for example "CLAUDE · CODING" over "task 2/3 · Login form · 4m". A channel number and a LIVE / WAIT / IDLE / OFF light sit above it, as on the room's TVs.
- **Remote strip:** three round coloured buttons pick the agent; "◀ 1/3 ▶" steps through that agent's sessions from today; "+TASK"; a red "⏻ HUB" power button.

## Behaviour (designer's calls; the owner delegated these)

### Opening and closing

- A left click on the tray icon opens the popup just above the icon, inside the working area (it never covers the taskbar). It is topmost, has no taskbar entry, and closes when it loses focus or on Esc.
- The right-click menu keeps Open Hub, Show launcher and Quit. "Stop Hub" stays too. Quit asks first when a session is running, because Quit also stops the room.
- Keyboard: 1, 2 and 3 pick Codex, Claude and Antigravity; Left and Right step sessions; Enter on the lower third opens that session in Hub; Esc closes. Every control has an automation name for screen readers.

### What the popup shows

- **Default selection when it opens:** the agent whose TV needs you, else one at work, else the last one picked.
- **Sessions per agent:** sessions started since local midnight in which that agent took part. In a build, that means it held a role (orchestrator, coder or reviewer). In a debate, all three take part. The newest is 1. With none today, the lower third shows the agent's live status ("CODEX · IDLE" over its roles or "ready") and the arrows are hidden.
- **A past session** shows its outcome and age, for example "DONE · 37m ago" over the task's first line.
- **Hub off:** the lower third and TVs still work, because they come from the room, not from Hub.
- **Room not running:** all three screens show static, and the lower third reads "ROOM CLOSED" over "start the room from the launcher". Clicking the lower third shows the launcher window, where the room's Start button is.

### +TASK

- Opens a one-line text box in place of the lower third. Enter starts a session with the room's defaults: a feature build of a new project, with the text as the task and a project name derived from its first words. Esc cancels.
- If a session is running, the same text joins the queue, and the box says so before Enter ("Adds to the queue").
- If an agent is not ready, the box says which one and Enter does nothing.
- Anything else (repo, debate, attachments, roles) opens Hub's room page with the text already in the prompt box.

### Hub on demand

- **States of the power button:** Off (grey), Starting (amber, spinner), On (green), and Closing in Xm (grey, countdown) when Hub is about to stop for lack of viewers.
- **Power on:** starts Hub's server if it is off, then opens the Edge app window when it is ready, as Open Hub does today. Clicking a session's lower third does the same and lands on that session.
- **Power off:** stops Hub's server and leaves the room running. No confirmation is needed, because no agent work is lost.
- **Auto-stop:** Hub stops when no Hub page has been open for 10 minutes. Not every page polls the room (a session summary fetches once; the design-system page never calls it), so every page sends a heartbeat: a small client component in the shared root layout calls a Hub route (for example `POST /api/viewer`) every 30 s, visible or hidden, and that route forwards to the room with the viewer header. A closed window means silence. The countdown shows for the last 2 minutes. The minutes are a profile setting, `hubIdleStopMinutes`, default 10, where 0 turns auto-stop off.
- **Shortcut double-click:** behaves as today: it starts the room and Hub and opens the window. The owner opened Hub on purpose.

### The room keeps running

- The launcher starts and owns the room as its own supervised component, in its own job, separate from Hub's.
- When the launcher runs Hub, `scripts/run-framework.mjs serve` does not spawn the room (an environment flag set by the launcher, for example `ASCEND_ROOM_EXTERNAL=1`). Run by hand without the flag, it keeps today's behaviour.
- "Stop Hub" and auto-stop stop only Hub's job. Quit stops both.
- The launcher starts the room for every Hub runtime it can run (production and development). The development script also stops spawning its own room when the flag is set.
- **A room already on the port** that the launcher did not start (a dev run, a room started by hand): the launcher adopts it read-only. It uses it (the token in `.env.local` proves it is this checkout's room) but never stops it. The launcher window shows "Agent room: running (started elsewhere)", and Quit's prompt says the room will keep running. The launcher never replaces a room, because that would kill a running session.
- **If the room the launcher owns exits unexpectedly**, the launcher restarts it, at most 3 times in 10 minutes; after that it shows "Agent room stopped" with a Start button in the launcher window and the popup's "ROOM CLOSED" text. Quit and Stop are expected exits and never restart it.
- **Room health:** the room counts as up when `GET /tray` answers 200 with the token. No separate instance handshake is needed: the token already ties it to this checkout.

### Talking to the room

- The launcher talks to the room directly on `127.0.0.1` and `ASCEND_ROOM_PORT` (default 5181), with the bearer token read from Hub's `.env.local` (`ASCEND_ROOM_TOKEN`), never through Hub. The token is held in memory only.
- A new room route, `GET /tray`, returns what the popup needs in one light reply: each agent's availability and live status words, the current session's summary, and today's sessions per agent (id, outcome, age, first line of the task). It never starts readiness probes (unlike `GET /status`).
- The room records when a Hub page last reached it: requests that arrive through Hub's proxy (`app/room/room-proxy.ts`) carry a header the proxy adds, and `GET /tray` reports that time as `lastViewerAt`. The launcher's own requests do not count as a viewer.
- The launcher's existing 5-second poll of Hub's `api/room` (for its agent summary and disk line) moves to `GET /tray` on the room, so it works while Hub is off and does not count as a viewer.

### Agent readiness while Hub is off

Readiness probes run real CLI turns and use quota, so `GET /tray` never probes by itself. Today Hub's open pages refresh the probes at most every 10 minutes through `GET /status`; the popup takes that role, with no more cost:
- Opening the popup asks the room to refresh readiness when the last probe is older than the existing 10-minute TTL (for example `GET /tray?refresh=1`, which probes only under the same rule as `/status`, and never while a session runs).
- +TASK does the same before it starts or queues a session, and waits for the result (with the box showing "checking agents…").
- Each TV's detail line shows "checked 12m ago" when its readiness is older than the TTL, so a stale "ready" or "offline" is visible.
- A failed probe at room start is retried by the same rule, so "offline" clears the next time the popup opens.

### Polling budget

- Popup open: `GET /tray` every 2 s.
- Popup closed: every 15 s, only to keep the tray icon's state and the auto-stop clock current.
- One request in flight at a time, as the launcher's poll already does.

### Tray icon state

- The tray icon gains a small amber dot when a session waits for the owner (a gate, or a pause that will not resume by itself), and its tooltip says what is needed, for example "Ascend Hub: approve the plan". Otherwise it is the plain icon, with the tooltip "Ascend Hub: Hub on" or "Ascend Hub: Hub off".

## RAM budget

- Hub off: the launcher (PowerShell and WPF, about 100 MB today) plus the room (about 70 MB). The popup is WPF shapes and text in the launcher's process. Target: opening and closing the popup 20 times grows the launcher's working set by less than 15 MB.
- No video, images or canvas painting in the popup: the TV faces are a few WPF shapes per screen. Animation only for the blinking WAIT and LIVE lights and the "needs you" screen, and none while the popup is closed.
- Hub on: as today, plus nothing.

## Constraints

- Windows PowerShell 5.1 and the .NET Framework WPF already used by `desktop/`. No new runtime or package.
- One source for the TV words: the popup shows what `tvStatus` would say. The builder decides whether the room computes the words (with the logic moved to a shared module that both the room and the deck use) or the room returns raw state and the words are computed once on the launcher side, but the two must not drift. Tests pin the words.
- Loopback only. The token never leaves memory.
- Existing launcher checks (`desktop/tests/*`) keep passing; layout checks gain the popup at 100/150/200% scale with long headlines.

## Left to the builder

- Exact pixel sizes, shadows and fonts within the shelf look (target about 300 × 250 px at 100% scale).
- How the popup is placed when the taskbar is on another edge.
- Project name derivation for +TASK.
- How the TV faces are drawn, within "a few shapes per screen".
