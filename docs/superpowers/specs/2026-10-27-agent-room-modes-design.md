# Agent Room: a room that changes with the work

Date: 2026-10-27. Status: approved by the owner in conversation; spike in branch `spike/room-modes` (throwaway, not to be merged).

## Why

The Agent Room's 3D deck (three desks with CRTs around a table) fits a debate, where three voices talk, but it says little while the agents code and nothing useful while the room is idle. The owner wants the 3D room kept as the page's centrepiece and **tailored to what is happening**: an idle room, a coding workshop and a debate panel, each recognisable from its furniture and light even with the TV screens hidden. The page around the room should carry the precise facts (task, checks, reviewer, plan) so the room can stay atmospheric without having to be read closely.

## Goals

- Three room arrangements, chosen from the session: **idle** (ready room), **coding** (workshop), **debate** (panel).
- Each TV shows what its agent is really doing, not a generic busy state.
- The owner can tell at a glance whether the room needs them.
- The page around the room becomes a **Task Console**: the right column changes with the mode.

## Non-goals

- New 3D models from Blender or third-party sprites. Everything is built in code from three.js primitives and canvas textures, like the current room (the CC0 Kenney props stay as they are).
- Showing the agent's own browser. The live app view stays the room's own capture (`liveScreen`).
- A history shelf of session cartridges (raised once, never chosen).
- Changing how sessions run. This is presentation only, plus the small state additions listed under Data.

## Anti-goals (failure even if it works)

- Colour alone telling the owner to act. Approval always has a shape and words ("NEEDS YOU").
- Whole-room pulsing or sweeping lights during a long wait.
- Text in the room that cannot be read from the normal camera.
- Props floating, clipping into shelves or covering a TV face.
- Flashing pass/fail while checks are still running.

## The three rooms

Furniture moves once when the mode changes, easing over about a second; ordinary activity never rearranges it. The camera stays where it is. Reduced motion jumps straight to the final arrangement and turns off screen animation. Each TV turns to face the camera on its own, separately from its desk, so every screen stays readable.

### Idle: ready room (no session, or a finished one)

- **Light:** dim. Ambient and sun low; the floor lamp and a warm light over the centre table stay on; the TVs glow in the dark.
- **Desks:** moved forward from the back wall and turned slightly in, clear of the two bookcases (bookcases stand at x -3.6 and 2.6 on the back wall). Spike values: desks at x -2.65, 0.05, 2.75, z -1.45, turned 0.18, 0, -0.18.
- **Typewriter on the centre table** (owner's pick over a terminal, an in-tray, a console and a wall TV): a green typewriter with a sheet rolled in reading "NEW TASK · type here" with a blinking cursor. The sheet's foot sits behind the roller, held by a bail bar, with a dark paper rest behind it; it is lit like paper, not drawn unlit. Clicking the typewriter (or its sheet) focuses the start form in the right column.
- **The table grows** (about twice its radius) so the typewriter and the queue stack both rest on it; it shrinks back in the other modes.
- **Queued sessions:** a stack of typed pages beside the typewriter, with a count large enough to read ("2 queued"). No stack when nothing is queued.
- **Agents:** calm, awake eyes. A TV is switched off ("NO SIGNAL") only when its agent's CLI is offline, with the agent's own label saying so.

### Coding: workshop (a build from plan through finish)

- **Light:** dim room, with a warm work lamp over the bench so the workshop reads as lit.
- **Bench:** the three desks are replaced by an L-shaped workbench. The long side holds the orchestrator and the coder side by side; the short return holds the reviewer. Places are given by role, not by agent. With two coders, the second coder takes the reviewer's spot when there is no reviewer, otherwise the bench grows by one place (builder's call on the exact spot).
- **TV graphics** follow what the agent is doing at that moment:
  - the coder while editing: lines of code typing in its colour, with a cursor;
  - the reviewer while reviewing: diff lines with a magnifier moving over them;
  - the orchestrator: the plan as a checklist (done, current, waiting);
  - anyone else, or anyone not in a turn: the existing calm eye.
- **Shared wall screen** where the poster hangs, with a CRT-style bezel: the plan, and below it a strip that always keeps the task context, for example "Task 2/3 · Claude coding · Antigravity reviewing". During frontend or ui-ux tasks it shows the live app capture (from `liveScreen`) with that strip still visible; the capture moves here from the coder's own TV, which keeps showing it coding.
- **Check lamp** on the bench beside the coder, with a label: "CHECKS RUNNING" (steady amber) while checks run, then "CHECKS PASSED" (green) or "CHECKS FAILED" (red). Nothing flashes.
- **Approval:** when a build gate waits (roles, plan, race, result), a tray with a raised "NEEDS YOU" flag and a short line ("approve the plan") stands on the front corner of the bench, placed so it never overlaps a TV. The buttons stay in the page.

### Debate: panel (a debate, and a build's discuss and roles steps)

- **Light:** medium.
- **Desks:** a shallow arc facing the centre table, still readable from the camera (the current arc, angled in).
- **Stage light** on whoever has the floor: a spotlight from above, a soft pool of light on the floor and a faint beam that fades out above the TV so the screen stays readable. It follows the speaker during opening and critique and moves to the judge at the verdict. No painted discs.
- **Speaker's TV:** a sound-wave graphic in its colour while it takes its turn (it stands for "contributing"; there is no audio).
- **Judge:** a small "JUDGE" sign beside the judge's desk, below its name plate so the plate never hides it. The judge is whichever agent the session picked (`session.judge`), never a fixed agent.
- **Wall board:** "Debate" with the three phases, the current one underlined.
- A build's discuss and roles steps use this arrangement too (agents talking, no judge), so a build starts as a panel and becomes a workshop at the plan. A roles gate shows the "NEEDS YOU" flag on the centre table, where it must not cover a TV. (My call; the owner approved the three rooms, not this mapping.)

### In every mode

- **Paused sessions** keep their arrangement. A pause that waits for the owner (Retry or Stop) shows the same "NEEDS YOU" flag with "paused · retry or stop". A rate-limit pause that retries by itself shows no flag; the right column says when it retries. (My call.)
- **Races and parallel tasks:** every coder in a turn shows the code graphic at its own place on the bench. (My call.)
- **Sub-agent mini TVs, message pulses, the delegation line, name plates and the selection ring** stay, placed relative to each agent's current spot rather than fixed seats (the spike does this already).
- The existing mascots in the right column keep their moods.

## Wall board (idle and debate)

A **chalkboard** (owner's pick over a letter board, cork board and split-flap): dark green slate with faint smudges, chalk lettering with a slightly uneven edge, a wooden chalk ledge with a stick of chalk, in its own wooden frame shaped like the board (3:2). It replaces the poster and its square frame in every mode. Lettering is sized for the normal camera: idle shows "Up next", the next queued session and the next scheduled time; debate shows the phases with the current one in yellow chalk and underlined, spaced so words never touch the arrows.

## The page around the room: Task Console

Three columns, as today; no fourth column:

- **Left:** session history (unchanged).
- **Middle:** the stage bar, the 3D room as the large centrepiece, and the evidence tabs below it: Changes, Preview, Checks, Files, Workflow, Transcript.
- **Right, changing with the mode:**
  - **Idle:** the new-session form (what the typewriter focuses), the queue and schedules.
  - **Coding:** a **Now** card (task number and title, the coder and how long, the checks *for this task*, the reviewer's state), the compact plan with each task's own check result, the queue, and the approval when a gate waits.
  - **Debate:** the phase and, once given, the verdict.
  - Limits, role sets and options fold into one collapsed **Settings** row at the bottom.
- **Phones:** a compact Now/approval summary first, then the room, then the evidence.

Two rules for the Now card and plan:

- Checks belong to the task shown. A task whose checks have not run says "Checks: not run yet"; an earlier task's pass stays on that task's plan line.
- An assigned reviewer reads "assigned, waiting" until its review turn actually starts, then "reviewing".

## Data

The room already receives `session` (stage, roles, plan tasks with status, check results and reviews, `active` agent and activity, `judge`, `pause`, live screen) and the queue and schedules (queue endpoint). Missing today:

- **Checks running.** `session.active` is null while checks run (`runChecks` does not set it). Add a small state field (for example `state.checking = { task, since }`, cleared when the run ends) so the lamp and the Now card can say "running".
- **Mode.** Derive it in `deckView` (pure, unit-tested): idle when there is no session or its stage is terminal; debate for a debate session and for a build's discuss, roles and roles-gate stages; coding for every other build stage.
- **Queue on the table and board.** The queue count and "Up next" come from the queue endpoint the Queue panel already polls: the first queued item's title, else the next schedule's time.

## Constraints

- three.js only, in the existing scene (`app/room/deck/`). The room must keep working in the flat fallback (`?deck=flat`, reduced motion, lost WebGL): the flat view shows the mode, the Now card and the approval in text.
- Every themed colour still reads in all seven themes; status always has words, not only colour.
- The frame-rate rules stay: full rate only while something moves.

## What the spike showed

Built in the real scene with made-up data (`?spike=idle|coding|gate|debate|verdict` on the spike branch): all arrangements read from the normal camera after these fixes, which the build must keep: desks clear of the bookcases; the board drawn at its real 3:2 shape; a real light (not a painted disc) for whoever has the floor; the typewriter's sheet seated in the roller and lit; the queue stack on the table; the board's chalk lettering large. Still to solve in the build: the floating name plates can cover the wall screen's task strip (move or shrink them), and the "NEEDS YOU" flag must not overlap the reviewer's TV.

## Left to the builder

- Exact coordinates, sizes, easing and light strengths (the spike's values are a starting point).
- How the plates avoid the wall screen.
- The geometry of the typewriter, bench and flag, within the look described.
- Splitting the work into steps and tests: `deckView` mode and Now-card logic are pure and get unit tests; the scene is checked by screenshots of each mode.
