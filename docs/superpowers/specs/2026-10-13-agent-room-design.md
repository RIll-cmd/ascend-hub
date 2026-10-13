# Agent Room — design

Date: 2026-10-13. Status: draft for owner review.

## Purpose

Let Codex, Claude, and Antigravity work as a small team on a coding task the owner gives them, for example "build a to-do system". They discuss the task, agree on roles (or the owner sets them), plan, and build the project together while the owner watches in Hub and approves at three gates.

This spec covers **Phase 1 (room, roles, discussion) and Phase 2 (build mode)**. Phase 3, a discussion-only "debate" mode that ends in a combined answer, is out of scope and gets its own spec later; it reuses this core.

## Decisions already made

| Topic | Decision |
| --- | --- |
| How a session starts | Owner types a task and a project name, presses Start. No ambient or self-started chats. Owner does not speak mid-session in v1. |
| Agents | Codex (`codex exec`), Claude (`claude -p`), Antigravity (`agy --print`); ids in JSON are `codex`, `claude`, `agy`. The plain `gemini` CLI is not used. |
| Where code goes | A new folder per project under `D:\ascend-builds\<project>\`, each its own git repository. Existing Ascend repositories are never written. |
| Approvals | Three gates only: roles, plan, final result. Between gates the agents work without per-task approval. |
| Architecture | A separate local room process owns sessions and runs the CLIs; Hub only shows state and forwards commands. |
| Entry point | Clicking the center poster on the shelf opens `/room`. |
| Layout | Three CRTs (one per agent) above the transcript, stage steps and gate buttons below; a task board slides in during Build. |

## Verified CLI facts (2026-10-13, this machine)

| Agent | Version | Headless call | Read-only flag | Edit flag | Observed reply time |
| --- | --- | --- | --- | --- | --- |
| Codex | `codex-cli 0.153.4` | `codex exec "<prompt>"` | `--sandbox read-only` | `--sandbox workspace-write` | ~8 s |
| Claude | `2.1.296 (Claude Code)` | `claude -p "<prompt>"` | `--permission-mode plan` | `--permission-mode acceptEdits` | ~9 s |
| Antigravity | `agy` (in `%LOCALAPPDATA%\agy\bin`) | `agy --print "<prompt>"` | `--mode plan` | `--mode accept-edits` | ~48 s |

The owner's `~/.codex/config.toml` sets `model = "gpt-6.1-sol"`, which Codex rejects for a ChatGPT account. The room always passes a model explicitly (default `-m gpt-6-astra`, which worked) and never edits the owner's config.

## Architecture

```
Hub page /room ──poll──▶ Hub API app/api/room/* ──HTTP 127.0.0.1 + token──▶ room process (scripts/agent-room/)
                                                                              │
                                                     spawns codex / claude / agy (headless, per turn)
                                                                              │
                              .sites-runtime/agent-room/<session>/   D:\ascend-builds\<project>\ (git)
```

### Room process — `scripts/agent-room/`

A plain Node ESM process, the same style as `scripts/status-adapters/worker.mjs`.

- Listens on `127.0.0.1` only, on a fixed port (default `5181`, overridable by `ASCEND_ROOM_PORT`).
- The shared token is `ASCEND_ROOM_TOKEN` in Hub's git-ignored `.env.local`. It is appended there (32 random bytes in hex) the first time it is needed. Hub's route handlers run in workerd, which has no `child_process` and no real disk, so `.env.local` (exposed as `process.env`) is the only channel they share with the room. On startup the room also writes `.sites-runtime/agent-room/server.json` with `{ port, token, pid }` for local diagnostics.
- Every request must carry `Authorization: Bearer <token>`; anything else gets `401`.
- Runs at most **one session at a time**. Starting a second one while one is active returns `409`.
- Survives Hub restarts. `npm run dev` (`scripts/run-framework.mjs`) starts it as a detached process, logging to `.sites-runtime/agent-room/room.log`. It can also be started alone with `node scripts/agent-room/server.mjs`. It stays up until stopped or until it has been idle with no active session for 30 minutes.

Modules (one job each):

| File | Job |
| --- | --- |
| `server.mjs` | HTTP routes, token check, startup/shutdown |
| `session.mjs` | Stage machine; persists and restores session state |
| `agents.mjs` | Builds the argument list for each CLI and role; runs one turn with a timeout; kills the process tree |
| `prompts.mjs` | Builds each turn's prompt from stage, role, task, transcript tail, and `PLAN.md` |
| `parse.mjs` | Extracts and validates the JSON blocks (roles, plan, review verdict) |
| `project.mjs` | Creates the project folder, `git init`, commits a task, rolls back a half-done task; enforces the path rules |
| `store.mjs` | Atomic JSON writes under `.sites-runtime/agent-room/` |

### Hub API — `app/api/room/`

Server-side routes that read `ASCEND_ROOM_TOKEN` (and optional `ASCEND_ROOM_PORT`) from `process.env` and forward to the room process. The token never reaches the browser.

| Route | Purpose |
| --- | --- |
| `GET /api/room` | Room status (`online`/`offline`), agent availability, current session summary |
| `POST /api/room/sessions` | Start a session: `{ project, task, roles? }` |
| `GET /api/room/sessions/current` | Full state: stage, roles, transcript, plan, task statuses |
| `POST /api/room/sessions/current/gate` | Approve or edit at a gate: `{ gate, decision, roles?, plan? }` |
| `POST /api/room/sessions/current/resume` | After a pause: `{ action: "retry" | "reassign" | "stop", agent? }` |
| `POST /api/room/sessions/current/stop` | Kill the running CLI and end the session |

Request bodies are validated (types, lengths, allowed values) before being forwarded. The routes reject requests whose `Origin` is not the Hub's own origin, matching the setup-origin checks already used for Spotify.

### Storage

- Session state: `.sites-runtime/agent-room/<session-id>/state.json`, plus one append-only `transcript.jsonl`. `.sites-runtime/` is already git-ignored.
- Project code: `D:\ascend-builds\<project>\` (root overridable by `ASCEND_BUILDS_ROOT`). `PLAN.md` lives in the project.
- Room settings: `.sites-runtime/agent-room/settings.json`, holding the per-agent model and executable path. Defaults come from code.

## Session flow

```
Brief ─▶ Discuss ─▶ [Gate 1: roles] ─▶ Plan ─▶ [Gate 2: plan] ─▶ Build ─▶ Finish ─▶ [Gate 3: result] ─▶ Done
           (skipped if the owner set roles in the Brief)
Any stage ─▶ Paused (on failure) ─▶ retry / reassign / stop
Any stage ─▶ Stopped (Stop button)
```

1. **Brief.** The owner gives the project name, the task text (max 4,000 characters), and optionally the roles. The room checks all three CLIs are available and signed in (a version call plus a tiny read-only prompt, cached for 10 minutes), creates the project folder, and runs `git init`.
2. **Discuss** (all agents read-only, working directory = project folder).
   - Turns go round-robin in the order Codex → Claude → Antigravity, at most 6 turns by default.
   - Each agent may end its message with `[READY]`. The discussion ends early when the latest message from every agent contains `[READY]`.
   - Then the room asks Codex (the first agent) for a roles block. Its reply must contain a fenced `json` block: `{ "orchestrator": "codex", "coders": ["claude", "agy"], "reviewer": "agy" | null }`.
3. **Gate 1, roles.** The owner approves or edits the roles. Rules: exactly one orchestrator, at least one coder, at most one reviewer, and one agent may hold several roles.
4. **Plan** (orchestrator, read-only). It returns a `json` block: `{ "tasks": [{ "id": 1, "title": "...", "assignee": "claude", "description": "..." }] }`, with 1–20 tasks, each assignee a coder. The room writes it to `PLAN.md` and commits `plan: initial plan`.
5. **Gate 2, plan.** The owner approves, or edits titles and assignees, then approves.
6. **Build.** Tasks run strictly one at a time in plan order. For each task:
   - The assignee runs in edit mode in the project folder with the task, `PLAN.md`, and a short summary of the earlier tasks.
   - The room runs `git add -A` and `git commit -m "task-<id>: <title>"` with the author `Ascend Agent Room <agent-room@localhost>`. If nothing changed, the task is marked failed with "no changes".
   - If there is a reviewer, it reads the diff read-only and returns `{ "verdict": "ok" | "changes", "notes": "..." }`. On `changes` the assignee gets one retry with the notes. After two failed attempts the orchestrator is asked to reassign or skip, returning `{ "action": "reassign", "to": "<agent>" }` or `{ "action": "skip" }`.
7. **Finish.** The orchestrator writes a summary of what was built, how to run it, and what was skipped. The room commits it as `SUMMARY.md`.
8. **Gate 3, result.** Accept marks the session `done`. Reject marks it `rejected`; the folder and its history are kept either way.

### Prompts

Every turn's prompt contains, in order: the fixed room rules (who the agent is, its role, what it may and may not do, the expected output format for this stage), the owner's task, `PLAN.md` when one exists, and the transcript tail (the last 20 messages, capped at 12,000 characters, with older messages dropped first). Each CLI call is a fresh process; the room supplies all the context.

### Roles and permissions

| Role | CLI mode | Working directory | Job |
| --- | --- | --- | --- |
| Orchestrator | read-only | project | Plan, reassign or skip, summary |
| Coder | edit | project | Do its assigned tasks |
| Reviewer | read-only | project | Verdict on each task's diff |
| Anyone in Discuss | read-only | project | Discussion and role proposal |

The permissions come from the CLI flags in the "Verified CLI facts" table, which the room chooses from the role. An agent's text can never change its own flags.

**Command access (verified 2026-10-13, owner chose option a):** Codex `workspace-write` and Antigravity `accept-edits` can edit files and run any command. Claude `acceptEdits` edits files and simple file commands (such as `mkdir`) but refuses other commands. So Claude in edit mode also gets `--disallowedTools PowerShell --allowedTools Bash(node:*) Bash(npm:*) Bash(npx:*) "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)"`. `curl` and `git commit` stay refused. Each coder's prompt states what it can run, and the planner sees it. Antigravity reads its prompt only from `--print=<prompt>` (not stdin), so prompts are capped at 28,000 characters.

## Room page — `/room`

- **Entry:** the center poster (`app/page.tsx`, the `slot.isPoster` branch) becomes a link to `/room`. It keeps its pointer tilt and gains a visible focus ring and the accessible name "Enter the agent room".
- **Top:** three CRTs (Codex orange, Claude coral, Antigravity blue). Each shows the agent's name, role badge(s), and a text status: `idle`, `thinking…`, `editing…`, `reviewing…`, `offline · not signed in`. The active one glows; with `prefers-reduced-motion` the glow is static.
- **Middle:** the transcript. Agent messages, plus room events such as commits, retries and pauses shown as system lines.
- **Bottom:** the stage steps; gate controls when a gate is open (Approve, Edit, and Accept/Reject at Gate 3); and Stop, which is always visible during a session.
- **Build:** a task board slides in on the right showing each task's status (`pending`, `running`, `review`, `done`, `failed`, `skipped`), assignee, and commit hash.
- **Brief form:** project name, task text, an optional "set roles myself" section, and Start. Shown when no session is active.
- **States:** "Room offline" with the reason and how to start it (`npm run dev`, or `node scripts/agent-room/server.mjs`); "Paused" with the failure and Retry / Reassign / Stop.
- **Back:** a "◂ Shelf" control returns to `/`.
- The page polls `GET /api/room/sessions/current` every 1.5 s while visible and every 10 s when hidden. No WebSocket.
- Visual language: the existing retro cream/brown chrome used by the TV inspection windows.

## Errors

| Situation | Behavior |
| --- | --- |
| CLI missing or not signed in | That CRT shows `offline · not signed in`; Start is disabled and lists which agent is missing. No silent skipping. |
| Turn exits non-zero, times out, or returns empty text | Logged as a system line, retried once, then the session is **Paused** for the owner. |
| Required JSON block missing or invalid | One automatic re-ask that quotes the validation error, then Paused. |
| Turn time limits | 3 min in Discuss/Plan/Review/Finish, 15 min for a Build task. On timeout the whole process tree is killed (`taskkill /PID <pid> /T /F`). |
| Stop pressed | The running CLI tree is killed and the session marked `stopped`. Committed work stays; uncommitted changes are rolled back. |
| Room process restarts mid-session | The session reloads from `state.json`. A Build task that was running is rolled back to the last commit and re-run. |
| Hub restarts | No effect on the session; the page reconnects on its next poll. |
| Room process not running | `/room` shows "Room offline". The rest of Hub is unaffected. |

**Rollback** means `git reset --hard HEAD` and `git clean -fd`, run **only** inside the project folder after the path rules below pass.

### Path and input rules

- The project name must match `^[a-z0-9][a-z0-9-]{0,39}$`.
- The resolved project path must sit directly under the builds root, must not be a symlink or junction, and must be a new folder (or this session's own folder on resume).
- The room never passes a path outside the builds root as a working directory or `--add-dir`.
- Task text and agent output are passed to the CLIs as arguments or stdin, never through a shell string.

## Testing

- **Unit tests** (`tests/agent-room/*.test.mjs`, `node --test`): stage transitions and gates; role validation; role-to-flag mapping for all three CLIs; prompt building and transcript truncation; JSON block parsing (valid, missing, malformed); path rules (bad names, `..`, symlinks or junctions, outside the root).
- **Fake CLIs:** small Node scripts that stand in for `codex`, `claude` and `agy`. They print scripted replies, can simulate edits, timeouts and errors, and use no quota. Executable paths come from settings, so the tests point at the fakes.
- **Integration test:** a full session with the fakes in a temporary builds root, from Brief through Gate 3. It checks the git log (plan, task commits, summary), the rollback after a simulated crash, and Stop.
- **API route tests:** token handling, body validation, offline behavior.
- **Manual live check:** one small real session ("make a hello-world Node CLI") with all three agents, recording the outcome.
- The existing checks still pass: `npx --no-install tsc --noEmit`, lint on the new files, `npm run test:status`, and `git diff --check`.

## Out of scope for this spec

Debate mode (Phase 3). The owner speaking mid-session. Parallel task execution. Building inside existing Ascend repositories. Ambient or self-started chats. Desktop launcher integration (the room starts with `npm run dev`). Running the room under `npm start` (Wrangler). Status-shelf reporting of room sessions.
