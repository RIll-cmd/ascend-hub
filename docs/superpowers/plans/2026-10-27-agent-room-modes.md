# Agent Room Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Agent Room's 3D room changes with the work (idle ready room, coding workshop, debate panel), and the page around it becomes a Task Console whose right column changes with the mode.

**Architecture:** A pure `roomScene()` in `app/room/deck/deck-view.ts` turns the session, status and queue into one `RoomScene` (mode, roles, plan, checks, phase, speaker, judge, gate, queue). The three.js deck reads it every frame: `room-modes.ts` owns the layouts, mode props and lights, `screen.ts` paints the TV graphics, `scene.ts` eases desks and TVs between layouts. The page's right column picks its cards from the same mode; a pure `nowCard()` builds the Now card.

**Tech Stack:** React (Vinext), three.js, Node test runner (`node --test`, `tsx --test`), plain CSS.

**Spec:** `docs/superpowers/specs/2026-10-27-agent-room-modes-design.md`. Reference spike (throwaway, do not merge): worktree `.worktrees/room-modes-spike`, branch `spike/room-modes`, files `app/room/deck/room-modes.ts`, `scene.ts`, `screen.ts`, `room.ts`. Port ideas and values from it; do not copy `spike.ts` or the `?spike=` switch.

## Global Constraints

- three.js primitives and canvas textures only; no new model files, no third-party sprites.
- Furniture eases once per mode change (about a second); ordinary activity never rearranges it; the camera never moves for a mode.
- `prefers-reduced-motion`: jump straight to the final arrangement and stop screen animation.
- Every TV faces the camera, separately from its desk.
- Approval always has a shape and words ("NEEDS YOU"); colour never asks the owner to act alone. No whole-room pulsing, no flashing pass/fail.
- Check lamp labels, exactly: "CHECKS RUNNING", "CHECKS PASSED", "CHECKS FAILED".
- Nothing floats, clips the bookcases (back wall, x -3.6 and 2.6) or covers a TV face.
- The flat fallback (`?deck=flat`, reduced motion, lost WebGL) shows the mode, the Now card and any approval in text.
- Status text in all seven themes; full frame rate only while something moves.
- Commits: owner as author, no co-author lines.

## Review Focus

1. **One coder, no reviewer** (the commonest small build): the bench must place two agents and leave the third agent's TV readable and idle; a missing role never crashes `spots()`.
2. **An agent offline during a build**: its TV shows NO SIGNAL at its bench place; the room stays in coding.
3. **A debate whose judge is also the current speaker**: one stage light, on that agent; the JUDGE sign stays visible.
4. **Mode changes mid-ease** (a gate opens while desks still move): no snapping, no props left half-visible.
5. **Narrow (portrait) deck**: the camera already pulls back; the typewriter sheet, chalkboard and flag must still be in frame.

Tests for 1–3 live in Tasks 2–3 (`spots`, `graphicFor`, `roomScene`); 4–5 are covered by the screenshot check in Task 4, Step 3.

---

### Task 1: The room server says when checks are running

**Files:**
- Modify: `scripts/agent-room/session.mjs` (`runCommand`, around line 873)
- Modify: `app/room/room-types.ts` (`SessionView`)
- Test: `tests/agent-room/checking-state.test.mjs`

**Interfaces:**
- Produces: `state.checking: { label: string; since: string } | null`, set when any command run starts in `runCommand`, cleared (null) when it ends, stopped or fails. `SessionView.checking?: { label: string; since: string } | null`.

- [ ] **Step 1: Write the failing test** `a check run marks the session as checking until it ends`: a build session (fake agents, `check: 'node -e "setTimeout(()=>{},300)"'`) is observed while its check runs; assert `session.state.checking.label === 'task 1'` mid-run, and `session.state.checking === null` after the plan gate resolves.
- [ ] **Step 2: Run it:** `node --no-warnings --test tests/agent-room/checking-state.test.mjs` → FAIL (`checking` undefined).
- [ ] **Step 3:** In `runCommand(command, dir, label)`, set `this.state.checking = { label, since: started }` and `this.save()` before `runCheck`; set it back to `null` in a `finally` and save.
- [ ] **Step 4:** Run the test → PASS; run the full room suite `node --no-warnings --test tests/agent-room/*.test.mjs tests/hub/*.test.mjs` → all pass.
- [ ] **Step 5: Commit** `feat(room): record when checks are running`.

### Task 2: One description of the room, derived from the session

**Files:**
- Create: `app/room/deck/room-scene.ts`
- Modify: `app/room/deck/deck-view.ts` (`DeckView` gains `room: RoomScene`; `deckView(session, status, queue?)`)
- Modify: `app/room/page.tsx` (pass the queue the Queue panel polls; lift its fetch into a small `useQueue()` hook in `queue-panel.tsx` if needed)
- Test: `tests/agent-room/room-scene.test.ts`

**Interfaces:**
- Produces, in `room-scene.ts`:
  - `type RoomKind = "idle" | "coding" | "debate"`
  - `type RoomScene = { kind: RoomKind; gate: { line: string } | null; roles: { orchestrator: AgentId | null; coders: AgentId[]; reviewer: AgentId | null }; plan: { title: string; status: "done" | "running" | "pending" | "failed" }[]; task: string | null; check: "running" | "pass" | "fail" | null; phase: "opening" | "critique" | "verdict" | null; speaker: AgentId | null; judge: AgentId | null; queued: number; upNext: string | null }`
  - `roomScene(session: SessionView | null, queue: QueueView | null): RoomScene` (`QueueView` is the existing export of `app/room/queue-panel.tsx`: `{ items: { title }[]; schedules: { title; nextRun }[] }`)
  - `spots(scene: RoomScene, ids: AgentId[]): Record<AgentId, { desk: [number, number, number]; deskYaw: number }>` (moved here from the spike so it is unit-tested)

- [ ] **Step 1: Write the failing tests** in `room-scene.test.ts`:
  - `no session or a terminal stage is idle`: `roomScene(null, null).kind === "idle"`; stages `done`, `rejected`, `stopped` → `"idle"`.
  - `a debate and a build's discuss, roles and roles gate are the panel`: debate session → `"debate"`; build stages `discuss`, `roles`, `gate-roles` → `"debate"` with `judge === null`.
  - `every other build stage is the workshop`: `plan`, `gate-plan`, `build`, `gate-race`, `finish`, `gate-result` → `"coding"`.
  - `a waiting gate or an owner pause raises the flag; a self-retrying pause does not`: `gate-plan` → `gate.line === "approve the plan"`; `pause: { kind: "rounds" }` → `gate.line === "paused · retry or stop"`; `pause: { kind: "rate-limit", retryAt: "…" }` → `gate === null`.
  - `checks: running wins, then the running task's own result`: `checking` set → `"running"`; task 2 running with no `check` while task 1 passed → `null`; task with `check.ok === false` → `"fail"`.
  - `the speaker is the debate's active agent; the judge is the session's judge`: debate `active.agent === "codex"`, `judge: "claude"` → `speaker === "codex"`, `judge === "claude"`; judge speaking at verdict → `speaker === judge`.
  - `queue: count and up next`: two queued items → `queued === 2`, `upNext` = first item's title; empty queue with a schedule → `upNext` contains the schedule time; nothing → `upNext === null`.
  - `spots: idle desks stand clear of the bookcases`: for all three idle desks, `desk[2] >= -1.6` (the bookcases end before z -1.9).
  - `spots: one coder and no reviewer still places all three agents` (Review Focus 1): roles `{orchestrator: "codex", coders: ["claude"], reviewer: null}` → three distinct desk positions.
  - `spots: two coders take the long side and the return`: `coders: ["claude", "agy"]`, `reviewer: null` → three distinct positions.
- [ ] **Step 2: Run** `npx --no-install tsx --test tests/agent-room/room-scene.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `roomScene` and `spots`** with the stage mapping above and the spike's layout values (idle desks x -2.65, 0.05, 2.75, z -1.45, yaws 0.18, 0, -0.18; bench places from the spike's `spots`). Gate lines: roles → "approve the roles", plan → "approve the plan", race → "pick a race winner", result → "review the result".
- [ ] **Step 4: Add `room: roomScene(session, queue)` to `deckView`;** pass the queue from `page.tsx`. Update existing `deckView` callers and fixtures (`tests/agent-room/room-sound.test.ts`, `deck-view.test.ts`) for the new field.
- [ ] **Step 5: Run** `npx --no-install tsx --test tests/agent-room/*.test.ts` and `npx --no-install tsc --noEmit` → pass.
- [ ] **Step 6: Commit** `feat(room): describe the room's mode from the session`.

### Task 3: TV graphics for what each agent is doing

**Files:**
- Modify: `app/room/deck/screen.ts` (`ScreenState` gains `graphic?: "code" | "review" | "plan" | "wave" | null; tick?: number; lines?: string[]`; `screenKey` includes them)
- Test: `tests/agent-room/deck-draw.test.ts`

**Interfaces:**
- Produces: `paintScreen(ctx, w, h, state)` draws the graphic instead of the eye when `graphic` is set (name, roles and state word stay); `graphicFor(agentId, agentState, scene: RoomScene): ScreenState["graphic"]` in `room-scene.ts` — coding: each coder in a turn → `"code"`, the reviewer in a review turn → `"review"`, the orchestrator → `"plan"`; debate: the speaker → `"wave"`; otherwise `null`. Offline always `null` (NO SIGNAL wins).

- [ ] **Step 1: Write the failing tests:** in `deck-draw.test.ts`, `each graphic draws its own marks` (record calls on the existing fake context: `"code"` draws `fillRect` lines in the agent colour, `"wave"` draws ≥ 20 bars, `"plan"` writes each `lines` entry, the eye `arc` is not drawn); `screenKey changes with tick only for an animated graphic`. In `room-scene.test.ts`, `graphicFor follows the turn` covering: coder editing → `"code"`; two coders racing → both `"code"`; reviewer idle while assigned → `null`; speaker → `"wave"`; offline coder → `null` (Review Focus 2).
- [ ] **Step 2: Run** `npx --no-install tsx --test tests/agent-room/deck-draw.test.ts tests/agent-room/room-scene.test.ts` → FAIL.
- [ ] **Step 3: Implement** the graphics as in the spike's `paintGraphic` (code lines typing with a cursor, diff lines with a moving magnifier, plan checklist from `lines`, sound-wave bars) and `graphicFor`.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(room): TV graphics for coding, reviewing, planning and speaking`.

### Task 4: The three rooms in the 3D scene

**Files:**
- Create: `app/room/deck/room-modes.ts` (mode props and lights; port from the spike, reading `RoomScene` from Task 2)
- Modify: `app/room/deck/scene.ts` (desks separate from CRTs; ease to `spots()`; TVs face the camera; minis, pulses, plates, delegation and selection follow current positions; set `graphic` via `graphicFor`; live capture goes to the wall screen, not the coder's CRT)
- Modify: `app/room/deck/room.ts` (name the table, poster, ambient, sun and lamp objects so `room-modes.ts` can find them)
- Modify: `app/room/deck/crt.ts` only if `buildCrt(..., { withDesk: false })` needs adjusting

**Interfaces:**
- Consumes: `RoomScene`, `spots()`, `graphicFor()` (Tasks 2–3).
- Produces: `buildModeProps(scene: THREE.Scene, keep: Keep): { update(room: RoomScene, seats: ReturnType<typeof spots>, now: number, live: HTMLImageElement | null, reduced: boolean): void }`.

Contents, per the spec (values from the spike are the starting point):
- Lights per mode, eased: idle ambient 0.22, sun 0.3, lamp 2.4 plus a warm station light; coding ambient 0.26, sun 0.4, lamp 1.8 plus a bench work lamp (intensity 3.2); debate ambient 0.45, sun 0.8, lamp 1.4.
- Idle: typewriter (sheet's foot behind the roller, bail bar, paper rest, lit `MeshStandardMaterial`, "NEW TASK" / "type here" with a blinking cursor), centre table scaled to 2.1 radius factor, queue page stack on the table showing "N queued" in large type, hidden when `queued === 0`.
- Coding: L bench (long side + return), check lamp with the three exact labels, the shared wall screen (plan + task strip; the live capture with the strip when `live` is set), the NEEDS YOU tray and flag on the bench's front corner placed clear of every TV.
- Debate: stage light (spot, floor pool, beam fading out above the TV) on `speaker`, or on `judge` at `verdict`; JUDGE sign beside the judge's desk below its plate; flag on the centre table for a roles gate.
- Chalkboard in its own 3:2 wooden frame (idle "Up next", debate phases with the current one in yellow chalk, underlined, words clear of the arrows); the old poster and its frame hidden.
- Name plates must not cover the wall screen's task strip (lift the strip above them, or shrink plates in coding).
- Reduced motion: positions, lights and table scale jump to their targets; `tick` frozen.

- [ ] **Step 1: Implement** `room-modes.ts` and the `scene.ts` changes.
- [ ] **Step 2: Run** `npx --no-install tsc --noEmit`, `npx --no-install eslint app/room/deck` and `npx --no-install tsx --test tests/agent-room/*.test.ts` → clean and passing.
- [ ] **Step 3: Screenshot check** with a dev server on a spare port (as the spike did) and a real or made-up session for each of: idle with 2 queued, coding (one coder, no reviewer), coding with a reviewer, plan gate, owner pause, debate opening, verdict with the judge speaking, an offline agent in coding, a portrait-shaped deck. Expected: nothing floats or clips, all TV faces and the chalkboard read, the flag covers no TV (Review Focus 1–5).
- [ ] **Step 4: Commit** `feat(room): idle, workshop and panel rooms`.

### Task 5: The Task Console around the room

**Files:**
- Create: `app/room/now-card.tsx` (Now card and approval line)
- Modify: `app/room/room-parts.tsx` (`TaskBoard`: each task's own check result), `app/room/page.tsx` (right column by `view.room.kind`; Settings row wraps Limits, Role sets and Options; typewriter click focuses the start form), `app/room/deck/scene.ts` (pick the typewriter → `onTask` callback), `app/room/deck/DeckCanvas.tsx` (pass `onTask`), `app/room/deck/FlatDeck.tsx` (mode, Now card and approval in text), `app/room/room.css`
- Modify: `app/room/deck/room-scene.ts` (add `nowCard`)
- Test: `tests/agent-room/room-scene.test.ts`

**Interfaces:**
- Produces: `nowCard(session: SessionView): { task: string; coder: AgentId | null; since: string | null; checks: "not run yet" | "running" | "passed" | "failed"; reviewer: { agent: AgentId; state: "assigned, waiting" | "reviewing" } | null } | null` (null outside coding). `Deck.onTask(cb: () => void)`.

- [ ] **Step 1: Write the failing tests:** `the Now card shows the running task's own checks` (task 2 running, task 1 passed → `checks === "not run yet"`; `checking` set → `"running"`); `the reviewer is assigned until its turn starts` (`active.agent` is the coder → `"assigned, waiting"`; `active.agent` is the reviewer → `"reviewing"`); `no Now card outside coding` (idle and debate → `null`).
- [ ] **Step 2: Run** `npx --no-install tsx --test tests/agent-room/room-scene.test.ts` → FAIL.
- [ ] **Step 3: Implement** `nowCard` and the right column: idle → start form (BriefSettings), Queue; coding → Now card, TaskBoard, Queue, approval; debate → phase and verdict; Settings row collapsed by default. Evidence tabs stay below the room. Phones: Now/approval summary before the room.
- [ ] **Step 4: Run** all suites: `node --no-warnings --test tests/agent-room/*.test.mjs tests/hub/*.test.mjs`, `npx --no-install tsx --test tests/agent-room/*.test.ts`, `npx --no-install tsc --noEmit`, eslint on changed files → pass.
- [ ] **Step 5: Browser check** at 1280 px, 1024 px and phone width in idle, coding (plan gate and build) and debate: the right column matches the mode, clicking the typewriter focuses the form, Settings opens, the flat view (`?deck=flat`) shows mode, Now card and approval. Screenshot each.
- [ ] **Step 6: Update** README (Agent Room section), `docs/ROADMAP.md` (a line under "Hub and Vision polish") and `ASCEND_HANDOFF.md`; commit `feat(room): Task Console around the room`; push to `main`.
