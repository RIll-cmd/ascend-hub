# Agent scorecard — design

Date: 2026-10-29. Status: approved for planning (owner said "start"; the calls below are Claude's unless marked).

## Why

The Agent Room has run 37 sessions (32 builds) with Codex, Claude and Antigravity, but nothing tells the owner which agent is good at which kind of task. Roles are picked by habit. The data to answer it is already saved in every session's `state.json`. Idea source: "sales call QA and coaching" (grade every call against a playbook, a weekly coaching summary per rep, a manager dashboard showing why deals are lost), mapped onto agents.

## Goals

1. A scorecard per agent and per role (coder, reviewer, orchestrator) and per task role (M7: frontend, backend, ui-ux, security, …) over the last 7 days, 30 days, or all time.
2. Grades come from fixed, measurable rules (the "playbook"), never from an AI's opinion of an agent.
3. A weekly summary: one short paragraph per agent, plus "why sessions ended badly" (rejected or stopped, with the stage they ended in).
4. A suggestion in the start form ("Claude: 5 of 6 frontend tasks passed first try") that the owner may follow. It never changes a role on its own.

## Non-goals

- A free-text playbook graded by an LLM (later, if the fixed rules prove too blunt).
- Vision reading the weekly summary aloud (later; the room push covers the phone).
- Debates: they have no tasks, so they are counted only as sessions.

## Anti-goals

- Silently reassigning work based on scores.
- Showing a "best agent" from 1 or 2 tasks. Under 3 tasks a cell says "not enough data".
- Counting the owner's own test sessions as agent failures when they were stopped by the owner.

## Data (all already stored)

Per session (`<data>/sessions/<id>/state.json`): `mode`, `stage` (`done`, `rejected`, `stopped`), `createdAt`, `roles` (`orchestrator`, `coders`, `reviewer`), `usage[agent]` (`turns`, `tokens`, `costUsd`), `stageLog`, `plan.tasks[]` with `assignee`, `role`, `status`, `attempts` (failures, reset to 0 when the task is reassigned), `rounds` (build turns, including review loops), `extraRounds`, `keptGoing`, `passed` (a list of review passes cleared, such as `code-review` or `security`; not a success flag), `failures`, `reassigned` (true once moved to another coder), `race`/`raced`, `lint`, `coverage`, `check`. Transcript lines that start with `Owner asked for changes to the` count gate revisions.

Field meanings must be confirmed against `session.mjs` while building; where a field is missing on older sessions the metric skips that task (it is not counted as a fail).

## Playbook rules (Claude's call)

Per coder task:

| Rule | Pass when |
| --- | --- |
| First try | `status` is `done`, `attempts` is 0 (it counts failures and resets on a reassign), `rounds` is at most 1, and the task was not `reassigned` |
| Checks green | the task's last check run was ok (or no check configured: not scored) |
| No stall | `keptGoing` is 0 and `extraRounds` is 0 |

Per reviewer: rounds it asked for per task, and how often a task it passed later failed checks or was rejected at the result gate.

Per orchestrator: sessions it led that reached `done` vs `rejected`, and gate revisions per session (plans the owner sent back).

Cost: tokens per passed task, per agent.

A session the owner stopped before any task ran is left out.

## Shape

- `scripts/agent-room/scorecard.mjs`: pure `scorecard(states, transcripts, { now, days })` returning `{ window, agents: { [agent]: { coder, reviewer, orchestrator, byRole: { [role]: { tasks, firstTry, … } }, tokensPerPass } }, endings: [...], weekly: [...] }`, plus `readSessions(dataDir)`.
- Room server: `GET /scorecard?days=7|30|all` (default 7). Hub proxy `app/api/room/scorecard/route.ts`, like `quota`.
- Room UI: a **Scorecard** panel next to Quota (`app/room/scorecard-panel.tsx`): a small table per agent, a "by task role" grid with first-try rates and sample sizes, and the weekly lines.
- Start form: under each coder pick, the hint for the task role when there are 3 or more samples.
- Weekly: on Monday at 09:00 local, if the room is running and `notify.ntfy` is set, one push with the top line per agent ("Codex: 4 tasks, 3 first try"). Stored as `<data>/scorecard/<yyyy-ww>.json` so a missed week is not re-sent.

## Left to the builder

Exact panel layout (follow the room's existing panels and theme), wording of the weekly lines, and how the hint sits in the start form.
