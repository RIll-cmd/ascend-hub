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
| M5 | Light Vision | An Assistant mode that never loads the camera models (YOLO, MediaPipe, torch), with an optional int8 Kokoro voice. Target under 500 MB. | Done (2026-10-14): Assistant mode, 622 MB in use (733 MB reserved), 0.08 cores. The owner keeps the fp32 Kokoro voice, so the 500 MB target is not met. |
| M6 | Harness extras | Budgets and loop guard, a quota meter, session templates, per-role models, decision memory, best-of-N, parallel tasks with a merge queue, and small M4 follow-ups (see the M6 plan below). | Planned (2026-10-14) |

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

## M6 — Harness extras: plan (2026-10-14)

Research covered parallel-agent worktree guides, cost and budget write-ups, AGENTS.md memory practices, spec-driven tools, best-of-N tools, and YouTube demos (Indy Dev Dan and Builder Methods on parallel worktrees and comparing agents). Sources are at the end of this section.

Each slice ships on its own, with tests and a live run, in this order.

### M6a — Budgets and loop guard (safety first)

**Done (2026-10-14):**
- `scripts/agent-room/limits.mjs`: defaults are 120 work minutes, 80 turns and 3 rounds per task, and the start form can change them.
- A limit pauses the session with a plain reason. Retry adds 15 minutes, 10 turns or 1 round.
- The loop guard stops another round, never a skip.
- Usage: Claude reports tokens and cost (`result`); Codex reports tokens only (`turn.completed`).
- It's recorded on each message and in per-agent totals, and shown in the Workflow summary and on task nodes.
- Live run: Codex 37k and Claude 176k tokens at $0.23, 3 of 20 turns.
- A real event check also showed that Codex's exec stream carries no rate-limit data, while Claude's `rate_limit_event` carries the 5-hour and 7-day utilisation (needed for M6b).

- **Problem:** cost per task varies widely (one write-up reports about 30× across tasks), and a coder ↔ reviewer loop can run until the retry rules give up.
- **Per-session limits**, set in the start form with sensible defaults:
  - maximum wall-clock time;
  - maximum agent turns;
  - maximum rounds per task (default 3).
  - Hitting a limit pauses the session with a plain reason. Vision already announces pauses, so it says "The agent room is paused: task 2 reached 3 rounds. Say retry, or stop."
- **Usage per turn:** record tokens and cost from what the CLIs already print.
  - Claude: the `stream-json` `result` event (`usage`, `total_cost_usd`).
  - Codex: the `--json` token-count events.
  - Antigravity: unknown until tested; show "n/a" rather than guessing.
- **Where it shows:** the Workflow summary gets tokens per agent and per task.
- **Tests:** limit triggers, with fake usage events through the existing fake `runTurn`.

### M6b — Quota meter

**Done (2026-10-14):**
- `scripts/agent-room/quota.mjs`:
  - Claude's windows come from its `rate_limit_event`, seen during the startup readiness probe and every turn.
  - Codex's come from the `rate_limits` field of its newest session log under `~\.codex\sessions`. Only that field is read, logs still being written are skipped, and reads are throttled to every 30 seconds.
  - Antigravity reports nothing.
- The last values are kept in `.sites-runtime/agent-room/quota.json`.
- `/status` returns `quota` and `quotaWarning` (90% or more of either window).
- The agent cards show "Usage: 5h 11% · week 26%", and the start form shows the warning.
- Live: Codex 11% / 26%, Claude 5% / 80%.

- **Problem:** Claude and Codex subscriptions have a rolling 5-hour window plus a weekly cap. A session that starts near either limit dies halfway.
- **Read limits passively** from the events turns already emit: Codex token-count events carry rate-limit percentages, and Claude emits rate-limit notices. No extra polling, and no scraping of web pages.
- **Where it shows:** a small meter per agent on the deck nameplates and in `/status`, for example "Codex 72% of 5-hour window, resets 14:20".
- **Before a session:** if an agent is above about 90%, the start form warns and suggests giving that agent fewer roles.

### M6c — Session templates and per-role models

**Done (2026-10-14):**
- The start form's "Kind of work" offers four templates:
  - **Feature:** unchanged.
  - **Bug fix:** needs a check. Task 1 must leave the checks red. If they already pass, that attempt is reset and sent back. Later tasks must turn them green.
  - **Refactor:** needs a check. Checks run on the untouched code first, and a red baseline pauses with kind `baseline`. Prompts say behaviour must not change.
  - **Review only:** runs the read-only debate flow on the chosen repo, with a findings question.
- **Models per agent:** a session can set `models: { codex, claude }`, names only.
  - Codex takes `-m`; Claude now takes `--model`. Antigravity has no flag yet.
  - The model is chosen per agent rather than per role, because an agent can hold several roles and the CLIs take one model per run.
- **Live:** a bug-fix session saw task 1 leave `node --test` red as expected and task 2 make it green. Claude on `haiku` cost $0.013 for 321k tokens.

- **Templates** in the start form preset roles, prompts, checks and gates:
  - **Feature:** today's flow (discuss → plan → build). Discussion works as a short spec interview: open questions become owner questions at the plan gate.
  - **Bug fix (reproduce first):** task 1 must add a failing test, and the check must fail before the fix and pass after (RED → fix → green). The cycle has an iteration cap from M6a.
  - **Refactor:** checks run on the base branch first to record a baseline, and every task must keep them green. "Behaviour must not change" goes into every coder prompt.
  - **Review only:** agents read a repo or branch and produce prioritised findings, with no edits. This reuses debate mode's read-only path.
- **Per-role models:** choose a model per agent (for example a cheaper reviewer, which cost guides call the biggest lever). Stored in the session and passed through the existing `settings.agents.*.model` and Claude `--model`.

### M6d — Decision memory per project

**Done (2026-10-14):**
- The finish turn ends the summary with a json block `{"memory": [...]}` holding 0–5 one-line notes. The block is cut from `SUMMARY.md` and from the gate summary.
- The result gate shows the notes as ticked, editable lines. Merge, Keep branch or Accept saves only the ticked notes. Reject saves none.
- Notes live in `<room data>/memory/<repo folder or project>.md`, never in the repo. They are deduplicated and capped at 60 lines, and the newest notes win.
- Every later build session for that repo or project gets them as a "PROJECT MEMORY" prompt section, capped at 3,000 characters. Debates do not.
- The start form shows the chosen repo's memory and lets the owner edit or prune it (`GET`/`POST /api/room/memory`).
- Not done: the offer to copy notes into the repo's `AGENTS.md` as a PR.

- **Problem:** each session starts cold.
- **At the result gate**, the orchestrator proposes 0–5 short entries: decisions, gotchas, commands that work. The owner approves or edits them, and only approved entries are kept.
- **Where entries live:**
  - `.sites-runtime/agent-room/memory/<repo>.md`, outside the repo, in the owner's runtime data;
  - optionally offered as a PR to the repo's `AGENTS.md` (M4 follow-up).
- **Following the research,** entries:
  - must change behaviour (prevent a mistake, or override a default);
  - are capped at about 60 lines;
  - are shown and editable in Hub;
  - are pruned when stale.
- **Use:** they go into every prompt for that repo, ahead of the transcript.

### M6e — Best-of-N

**Done (2026-10-14):**
- A plan task can carry `"race": true` when the session has two or more coders. The orchestrator may mark one hard task, and the owner can tick "Race all coders" per task at the plan gate.
- Every coder attempts a race task at once, each in its own worktree and branch (`room/try-<id>-t<task>-<agent>`) cut from the session's HEAD. All prompts are built before any attempt replies.
- Attempts that change nothing, fail their turn or fail the checks drop out. With two or more survivors, one judge turn (the reviewer, or the orchestrator when there is none) reads their diffs and picks a winner.
- The winner fast-forwards into the session branch, and every attempt worktree and branch is deleted. The Workflow tab shows each attempt and the judge's reason.
- No survivor counts as one failed attempt, and round limits apply. Bug fix task 1 never races, because it must go red.
- **Live:** Claude on haiku and Codex both passed the checks. Codex judged and kept Claude's attempt, and no worktrees were left behind.
- Not done: an owner override gate with side-by-side diffs. The losing attempts are deleted right after judging.

- **Option:** for one hard task, 2–3 coders each attempt it in their own worktree, with the same prompt (guidance: start with 2–3).
- **Gates:** the checks are the automatic gate.
- **Choosing:** the reviewer judges the survivors' diffs (the Agent S3 best-of-N idea: summarise each attempt, then a one-shot judge), and the owner can override in the Workflow tab, which shows the diffs side by side.
- **After:** the winner's branch is kept; the others are deleted.

### M6f — Parallel tasks with a merge queue

**Done (2026-10-14):**
- Behind a setting: the start form's "Run independent tasks at the same time (experimental)" sets the session's `parallel`. It is off by default, and bug fix sessions never run in parallel.
- Plan tasks can carry `"after": [earlier task numbers]`. Only earlier tasks are allowed, so the order is always valid. The orchestrator is asked to order tasks that touch the same files, and the plan gate shows "Starts after task …".
- Each round runs every pending task whose earlier tasks are finished, at most one per coder. Each task runs in its own worktree (`room/par-<id>-t<task>`) cut from the session's HEAD. A race task always runs alone.
- **Merge queue:** in plan order, each task is squash-merged into the session branch as one commit. The checks run, then the review. A conflict, a red check or a "changes" review undoes only that merge and sends the task back to its coder. Its next round runs on top of the merged work.
- **Live:** add.js (Claude on haiku) and mul.js (Codex) ran at once and merged in order with checks after each. calc.js then waited for both. History stayed linear, and no worktrees or branches were left.

- **Problem:** independent tasks still run one at a time.
- **Planning:** the orchestrator marks dependencies, and independent tasks run at once, each in its own worktree off the session branch.
- **Merge queue:** finished task branches merge into the session branch one at a time, and checks run after each merge. A conflict or red check sends that task back to its coder. Guides agree merging is still the weak spot, so this ships last, behind a setting.
- **Workflow tab:** the swim lanes already show overlap.

### Small follow-ups

- **Limits panel (done 2026-10-14):** the home screen has a "Limits" pill naming the fullest window, which opens to 5-hour and weekly bars per agent. Each bar shows its reset countdown and how old the reading is. The Agent Room's cards show the same bars. **Refresh limits** re-reads Codex's log and runs one tiny Claude turn, at most once a minute and never during a session. The meter itself never runs a turn (`GET /quota`). Antigravity's CLI reports no limits.
- **Pull request (done 2026-10-15):** **Open pull request** at the repo result gate pushes the branch to `origin` and runs `gh pr create` with the session summary as the body, after a confirmation. If either step fails the gate stays open with the error. Voice gates never offer it.
- **Worktree clean-up (done 2026-10-15):** when stopped repo sessions still have worktrees, the Agent Room lists them above the start form with **Remove worktrees (branches stay)** (`GET /worktrees`, `POST /worktrees/clean`).
- **Voice model:** a lighter Vision voice model, when the owner decides (see M5).

### Order and size

M6a and M6b come first because they protect your quotas and wallet before more parallelism. Then M6c, which gives the most day-to-day value. M6d, M6e and M6f follow.

Rough size, judged against the earlier milestones:
- M6a, M6b and M6c are each about one M3-sized slice.
- M6d is small.
- M6e and M6f are each larger than M4.

### Sources

- Parallel agents and worktrees:
  - [git worktrees for parallel AI agents (augmentcode)](https://augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution)
  - [open-source agent orchestrators (augmentcode)](https://augmentcode.com/tools/open-source-agent-orchestrators)
  - [parallel multi-CLI orchestration with Codex, Claude Code and Gemini CLI](https://codex.danielvaughan.com/2026/04/11/agentmaxxing-parallel-multi-cli-orchestration/)
  - [parallel coding agents guide (superset)](https://superset.sh/blog/parallel-coding-agents-guide)
  - [how to parallelize AI coding agents (tessl)](https://tessl.io/blog/how-to-parallelize-ai-coding-agents)
- YouTube:
  - [Builder Methods: comparing multiple agents with worktrees](https://buildermethods.com/library/multipe-agents-worktrees-review-comparison)
  - [Claude Code multitasking made easy](https://yt.chop.dev/vi/v/Bz5fyyCa2-0)
  - [Codex multi-agent workflow with worktrees (transcript)](https://sozai.app/transcript/codex-multi-agent-workflow-git-worktrees/)
- Budgets:
  - [where do your tokens go (Codex CLI budget control)](https://codex.danielvaughan.com/2026/07/03/where-do-your-tokens-go-empirical-token-consumption-coding-agents-codex-cli-budget-control/)
  - [AI agent cost per task](https://www.kunalganglani.com/blog/ai-agent-cost-per-task-2026)
  - [budget guide (PwC coding agents)](https://idi-coding-agents-dev.pwc.it/guide/budget)
- Quotas:
  - [Codex CLI usage limits](https://inventivehq.com/blog/codex-cli-usage-rate-limits)
  - [Claude 5-hour limit explained](https://usagebar.com/blog/how-does-claude-5-hour-limit-work)
- Memory:
  - [agents project memory](https://skills.cat/skills/vasilyu1983/ai-agents-public/agents-project-memory)
  - [scoring CLAUDE.md files of large projects](https://blume.codes/blog/we-scored-the-claudemd-files-of-the-biggest-open-source-projects-the-best-ones-break-the-rules)
- Templates and best-of-N:
  - [GitHub Spec Kit](https://developer.microsoft.com/blog/spec-driven-development-spec-kit/)
  - [Pilot Shell spec and fix workflows](https://pilot-shell.com/docs/workflows/spec)
  - [emdash best-of-N](https://docs.emdash.sh/best-of-n)
  - [Agent S3 behavior best-of-N](https://academy.dair.ai/papers/agent-s3)

## M5 — Light Vision

- `runtime.mode: assistant` in `config.yaml`, or `--assistant`, makes `run()` pass `assistant_mode` stand-ins: an idle capture that ticks four times a second, and models that see nothing.
  - torch, Ultralytics and MediaPipe never load. A test runs it in a fresh process to prove it.
  - Voice commands, Kokoro speech, chat, the coaches and the agent room keep working.
- The Fairy window and the launcher show the camera as Disabled. Away mode stays off without a camera.
- Measured with the owner's config: 622 MB in use and 733 MB reserved, 0.08 cores, 32 threads. Watch mode: 1,104 MB, 1,255 MB, 2.05 cores and 122 threads.
- The owner chose to keep the fp32 Kokoro voice (about 385 MB). An int8 model would save about 250 MB.
- Switching modes stays a config setting, with no launcher change (owner's choice).
- **Future: voice model.** The owner may change Kokoro's voice model later.
  - The int8 `kokoro-v1.0.int8.onnx` (about 88 MB, about 250 MB less memory) would bring Assistant mode under 500 MB. It needs a download, or `pip install onnx` to quantize locally.
  - Listen to the voice before switching.
  - The path is `feedback.tts_model_path` in `config.yaml`.

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
