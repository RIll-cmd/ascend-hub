# Ascend roadmap — Hub and Vision

Updated 2026-10-14.

**Goals:**
- **Hub:** the owner's main coding tool, where Codex, Claude and Antigravity plan, build and review together.
- **Vision:** a light AI assistant that tells the owner when the agents are done or need a reply, and lets the owner answer by voice.

## Where things stand

**Hub:**
- The Agent Room covers discuss → roles → plan → build → review → finish, with three owner gates. It also has debate mode, sub-agent visibility, the 3D deck and sound.
- The status shelf shows Codex CLI, Antigravity CLI, Core and Vision.
- The one-click launcher starts Hub in production mode, about 150 MB.
- **Gaps:**
  - the Room only builds new projects in `D:\ascend-builds`;
  - a waiting gate is visible only on the Room page;
  - a gate can only be approved or rejected, not sent back with changes.

**Vision:**
- Camera focus coaching, voice commands (faster-whisper), Kokoro speech and the Fairy UI.
- A read-only `hub_status` tool and an Agent needs input option that is disabled by default.
- Idle CPU went from 7.5 to 2 cores on 2026-10-14.
- **Gaps:**
  - about 1.1 GB of memory even when only the assistant is wanted;
  - no awareness of the Agent Room.

## Milestones

| # | Milestone | What it gives the owner | Status |
| --- | --- | --- | --- |
| M1 | Room attention and change requests | Each waiting gate carries a plain summary and 2–4 suggested changes. Roles and plan gates accept "revise" with a note, so the agents redo that step. The Hub gate bar offers the options. | Done (2026-10-14) |
| M2 | Vision agent announcer with voice gates | Vision says when the agents finish or need a reply. It reads the gate summary and takes "approve", "change" (lists the options or takes dictation, then confirms) or "reject" by voice. | Done (2026-10-14) |
| M3 | Workflow view | A timeline graph of the session: stages, task nodes with agent, time, diff and test results, and a loop view counting coder ↔ reviewer rounds. | Done (2026-10-14); test results arrive with M4 |
| M4 | Room on real repositories | Each session works in a git worktree and branch of an existing repo. Tests, lint and build run after every task, a red result blocks "done", and the finish gate shows the diff, then merges or opens a PR. | Done (2026-10-14); PRs via `gh` not yet |
| M5 | Light Vision | An Assistant mode that never loads the camera models (YOLO, MediaPipe, torch), with an optional int8 Kokoro voice. Target under 500 MB. | Planned |
| M6 | Harness extras | Session templates (feature, bug fix, refactor, debate); per-role model choice; time and token budgets; parallel tasks in worktrees with a merge queue; a quota meter; decision memory per project. | Later |

**Reliability work alongside:**
- Room sessions keep a pending gate across restarts.
- The launcher restarts a crashed app and says why.
- One tray for both apps.
- One shared local token for Vision → Hub calls.

## M1 — Room attention and change requests (Hub)

- `scripts/agent-room/attention.mjs` builds `attention` for the session view from the session state. It returns `null` when the owner isn't needed.
  - **Gate:** `{ kind: 'gate', gate, summary, options, decisions }`.
    - The roles summary names who orchestrates, codes and reviews.
    - The plan summary lists the tasks and their assignees.
    - The result summary is the opening of the orchestrator's final summary.
  - **Pause:** `{ kind: 'pause', summary, options: [], decisions: ['retry', 'stop'] }`.
- The roles and plan JSON may carry `options`: 2–4 short alternative changes, each at most 160 characters. The prompts ask for them, the validators keep them, and they're shown at the gate.
- The roles and plan gates accept `decision: 'revise'` with `note` (1–2000 characters).
  - The Room records "Owner asked for changes: …" in the transcript and sends the session back to the `roles` or `plan` step. The agents see the note in the conversation.
  - The result gate stays accept/reject.
- The Hub gate bar shows the spoken summary, the suggested changes as buttons, a free-text field and a **Request changes** button.

## M4 — Room on real repositories (Hub)

- **Starting:** the start form offers **New project** or **Existing repo**. The repo comes from the allowlist (Hub, Core, Vision), and only real git checkouts are offered.
- **Where the work happens:** a repo session creates branch `room/<name>-<id>` in its own worktree under `D:\ascend-builds\worktrees`.
  - It links the repo's `node_modules` (root and one level down) so checks can run.
  - Your own checkout is never edited.
- **Checks:** after each task the room runs the check command, in the background, stoppable, with a 15-minute limit.
  - The command comes from `settings.checks`, the repo's `package.json` test script, or pytest, and you can edit it in the form.
  - A failure sends the task back to the coder with the output. The reviewer only sees work that passes.
- **Room notes:** repo sessions keep `PLAN.md` and `SUMMARY.md` with the session data, never on the branch.
- **Finishing:**
  - The result gate shows the branch, whether checks passed, and the whole branch diff.
  - **Merge** fast-forwards the base branch, and only while your checkout is still on it; otherwise it's refused and the gate stays open.
  - **Keep branch** leaves the branch for you.
  - **Reject** deletes the branch.
  - Every choice removes the worktree.
- **Workflow tab:** task nodes show the check result, with failed output.
- **Vision:** at a repo result it says "merge, accept, or reject", and understands "merge it".

## M3 — Workflow view (Hub)

- The Room records `stageLog`, one `{ stage, at }` entry for each stage entered (written in `save()`).
- `GET /api/room/sessions/current/diff?commit=` returns one task's commit as a stat plus a patch.
  - It is limited to the session's own task commits.
  - The output is capped at 100,000 characters.
  - It refuses non-loopback hosts.
- `app/room/workflow-view.ts` (pure) builds two things:
  - **Steps:** each step's duration. The current one counts up live.
  - **Tasks:** one node per task, with its coder rounds (assignments), reviewer replies, time, last note and its own messages.
- The Room page has a **Workflow** tab next to **Deck** (and **Debate**):
  - a step rail with durations;
  - a task timeline where each node opens to show the coder ↔ reviewer exchange and a **Show changes** button that loads the coloured diff;
  - three or more rounds on one task are marked "looping?".
- Polish, after a web search of agent-trace UIs ([Honeycomb's agent timeline](https://www.honeycomb.io/platform/agent-timeline), [Langfuse's timeline and agent graphs](https://langfuse.com/docs/observability/features/agent-graphs), and [a PromptLayer thread on loops](https://www.producthunt.com/products/promptlayer-2?embed=true)):
  - **Run summary first:** total time, turns per agent, retries, problems.
  - **Swim lanes:** one row per agent, one bar per turn, including the turn in progress.
  - **Retries stay separate:** each round is kept on its own (Round 1, Round 2…) instead of folded together.
  - **Problems stand out:** failed and invalid turns and pauses are shown in red; skipped, looping or failing tasks get a red outline; and a filter shows only the tasks that need attention.

## M2 — Vision agent announcer and voice gates

- `integrations/agent_room.py` reads `GET http://127.0.0.1:5173/api/room/sessions/current` and posts `/api/room/sessions/current/gate`, with short timeouts. Hub refuses any non-loopback host.
- `assistant/room_dialog.py`, a pure state machine:
  - **New gate:** "The agents need you: <summary>. Say approve, change, or reject."
  - **Session finished:** "Codex, Claude and Antigravity are done." It also announces stopped and paused sessions.
  - **Approve or reject:** asks for a yes before sending.
  - **Change:** lists "Option 1: … Option 2: …" or takes "change: <words>", then confirms ("Send option 2 to the room? Say yes.") before sending `revise` with that note.
  - **Cancel:** "never mind" drops the dialog. A gate that closes elsewhere ends the dialog.
  - **Natural replies:** "I approve", "yes, send it", "option number two" and "the first one" all work. Any negation ("I don't approve") never counts. "Repeat" and "what are the options" work at any point.
  - **Reminder:** a gate still waiting after 10 minutes is mentioned once more.
  - **Restarts:** an unreachable Hub keeps the dialog without re-announcing. "No session" ends it.
  - **Chat:** replies also appear in the Fairy chat, like other Vision notices.
- `main.py` runs a watcher thread every 3 seconds when `agent_room.enabled` is on (the default; a missing Hub just means silence). The dialog gets first look at unmatched speech while it's active.
- Every decision is written to the Room transcript by Hub, so the Hub page shows what Vision sent.
