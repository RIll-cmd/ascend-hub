# Ascend roadmap — Hub and Vision

Updated 2026-10-24. M1–M7 are done; the open work is under [Next: M8–M13](#next-m8m13-2026-10-24).

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
| M6 | Harness extras | Budgets and loop guard, a quota meter, session templates, per-role models, decision memory, best-of-N, parallel tasks with a merge queue, and small M4 follow-ups (see the M6 plan below). | Done (2026-10-14) |
| M7 | Role sets and skills | The owner gives agents specialist roles (UI/UX, frontend, backend, code reviewer, security), each a switchable set of agent skills, and tasks go to the agent wearing the matching role (see the M7 plan below). | Done (2026-10-17) |
| M8 | Reach the owner away from the PC | A phone push when a gate waits, then answering gates from the phone. | Not started |
| M9 | Unattended sessions | Sessions that wait out a limit window, queue up, run on a schedule and keep going until the checks pass. | Not started |
| M10 | GitHub in and out | Start from an issue or PR, review a PR and post comments, resolve merge-queue conflicts, several repos in one session. | Not started |
| M11 | Seeing the work | Live diff, file viewer, check output, search and export across sessions, lint per task, richer prompt attachments. | Not started |
| M12 | More agents and connectors | MCP connectors, a self-maintaining skill library, safety guards. | Not started |
| M13 | Hub and Vision polish | Spotify controls, reacting mascots, a launcher start-up checklist, a Vision wake word, a lighter voice. | Not started |

**Reliability work alongside:**
- Room sessions keep a pending gate across restarts.
- The launcher restarts a crashed app and says why.
- One tray for both apps.
- One shared local token for Vision → Hub calls.

These four have no recorded status; confirm each in the code before M8.

## Next: M8–M13 (2026-10-24)

Everything not built yet, from the Room ideas backlog (2026-10-16), the handoff's open items and [the Hermes Agent feature map](hermes-agent-features.md). Sizes: S under a day, M a few days, L a week or more. Nothing here is scheduled until the owner picks it.

### M8 — Reach the owner away from the PC

| Feature | What it gives | Source | Size |
| --- | --- | --- | --- |
| Phone push when a gate waits | One `POST` to a private ntfy topic whenever the session's `attention` changes, with the gate summary | Backlog; Hermes ntfy | Done (2026-10-24): `notify.ntfy` in settings |
| Answer a gate from the phone | A signed, single-use link per decision, or a paired chat bot (Core's `phone-chat-discord` worktrees). Needs pairing and an allowlist first | Hermes gateway | L |
| Voice-note answers | A voice note on the phone becomes a gate reply through Vision's faster-whisper | Hermes voice memos | M |
| Publish the session summary as a page | A shareable read-only summary after the result gate | Backlog | M |

### M9 — Unattended sessions

| Feature | What it gives | Source | Size |
| --- | --- | --- | --- |
| Auto-continue when a limit window resets | A paused session resumes by itself when `quota.json` shows the window reset | Backlog; Hermes `/loop` | Done (2026-10-24) by the rate-limit requeue: a limited session resumes at the reset |
| Requeue on rate limit | A turn that fails only on a rate limit or 5xx is retried later without counting as a failed round | Hermes Kanban exit code 75 | Done (2026-10-24): main turns pause and retry at the reset; race and parallel attempts still fail |
| Limit-aware assignment | Work moves from an agent above 90% of a window to another coder | Backlog; Hermes fallback providers | M |
| Session queue | Start several sessions; they run one after another | Backlog; Hermes Kanban | L |
| Scheduled sessions | A schedule in room settings, for example a nightly *Review only* session on a repo | Backlog; Hermes cron | M |
| Keep-going mode | A judge turn after each failed check keeps the task going, inside the M6a budgets | Backlog; Hermes `/goal` | Done (2026-10-24): `keepGoing` option; the orchestrator judges progress where a task would pause or be skipped, up to 5 extra rounds |
| Retry from any stage | Restart a session from roles, plan or a single task | Backlog | M |
| Owner note to a running agent | A note joins the agent's next turn without stopping the session | Hermes `/steer` | S |

### M10 — GitHub in and out

| Feature | What it gives | Source | Size |
| --- | --- | --- | --- |
| Start from an issue or PR | Paste an issue or PR number; its text and diff become the task | Backlog | Done (2026-10-24): issues start repo builds; PRs start reviews (below) |
| PR review mode | A *Review a PR* template: `gh pr diff` in, comments posted with `gh pr review` after the owner approves | Backlog; Hermes PR-review guide | Done (2026-10-24): *Review only* with a PR; one comment-only review after a confirmation. Diffs over 12,000 characters are cut per prompt |
| Merge-conflict arbiter | A conflicted merge in the M6f merge queue gets one arbiter turn before it fails | Hermes optional skill | Done (2026-10-24): the task's coder resolves the markers in place; checks and review judge it |
| Several repos in one session | One plan with tasks across repos, one worktree each | Backlog | L |

### M11 — Seeing the work

| Feature | What it gives | Source | Size |
| --- | --- | --- | --- |
| Live diff panel | The current task's diff while it is being written | Backlog | Done (2026-10-24): **Changes** tab, `GET /sessions/current/live-diff`; not for parallel or race worktrees |
| File tree and read-only viewer | Browse the session worktree | Backlog | Done (2026-10-24): **Files** tab; only files git tracks or would track, never ignored ones |
| Terminal pane for check output | The full output of each check run | Backlog | Done (2026-10-24): **Checks** tab; runs in `state.checkRuns`, output in `checks/<n>.log` |
| Search across sessions | Full-text search over past sessions in the history column | Backlog; Hermes FTS5 search | Done (2026-10-24): `GET /sessions?q=`, a plain scan of task, transcript and verdict, at most 50 results |
| Transcript and summary export | Markdown export of a session | Backlog | Done (2026-10-24): **Export .md** on the Session card, from `GET /sessions/<id>/export` with the full transcript |
| Lint and coverage per task | The repo's linter and coverage after each task, shown in Workflow | Backlog; Hermes LSP lint | M |
| Files produced, as downloads | The result gate lists generated files to download | Hermes deliverable mode | S |
| Prompt attachments | `@file` and `@diff` references, a pasted screenshot, an attached PDF spec | Hermes context references, vision paste, document extraction | M |

### M12 — More agents and connectors

| Feature | What it gives | Source | Size |
| --- | --- | --- | --- |
| Hermes Agent spike | Install, run `hermes chat --oneshot -q "2+2" --format stream-json`, record the real events and exit codes | Hermes feature map | Stopped (2026-10-24): installed, failure events recorded; no successful turn, Hermes agent work dropped |
| Hermes as a fourth room agent | Hermes plans, codes, reviews or judges with any model it is set to; `--query-file` avoids the 28,000-character prompt cap | Hermes feature map, path A | Dropped (2026-10-24): the owner chose not to run Hermes as an agent |
| Hermes status TV (CH 05) | A status adapter from Hermes hooks to Core's `POST /api/status/events`; the shelf already shows unknown services | Handoff; Hermes path B | Dropped (2026-10-24): the owner chose not to run Hermes as an agent |
| Hermes on the Limits pill | Read `hermes usage --json` | Hermes | Dropped (2026-10-24): the owner chose not to run Hermes as an agent |
| MCP connectors for agents | A curated list of MCP servers per session, with only the needed environment variables passed | Backlog; Hermes MCP catalogue | M |
| Hermes skills as a library source | Add `NousResearch/hermes-agent` skills through M7d | Hermes | S |
| Skills the agents write | The orchestrator proposes a new skill at the result gate; the owner approves it | Hermes self-written skills | M |
| Skill use counts and stale skills | Use counts per skill and a stale mark in the role-set UI | Hermes curator | S |
| Advisers and one actor | A build variant where references advise and one agent acts | Hermes Mixture of Agents | M |
| Dangerous-command guard | Edit turns block `rm -rf`, `git push --force` and `git reset --hard` outside the session worktree | Hermes command approval | Done (2026-10-24): kills the turn when the CLI reports the command |
| Prompt-injection scan of fetched skills | Flag suspicious instructions on the staged card before Install | Hermes context-file scan | S |

### M13 — Hub and Vision polish

| Feature | What it gives | Source | Size |
| --- | --- | --- | --- |
| Spotify controls | Play, pause, skip and queue on the music TV; needs the `user-modify-playback-state` scope | Hermes Spotify plugin | S–M |
| Reacting mascots | A Bangboo on each status TV or desk that reacts to idle, working, stuck and done (check sprite licences) | Hermes pets | S–M |
| Hermes dashboard channel | A TV channel that embeds `127.0.0.1:9119` when Hermes is installed | Hermes web dashboard | Dropped (2026-10-24): the owner chose not to run Hermes as an agent |
| Launcher start-up checklist | The mini console checks Core, the CLI logins and free disk space | Hermes `BOOT.md` | S |
| Vision wake word | A wake word before gate answers, so stray speech is ignored | Hermes wake word | M |
| Lighter Vision voice | A smaller Kokoro model, when the owner decides (see M5) | M6 follow-ups | S |
| Live agent screen on a CRT | During UI tasks the agent's browser shows on its desk CRT | Hermes bot screen | L |

### Fixes and debt (alongside)

- A stopped session's in-progress task still shows `running` on the board.
- `npm start` (Wrangler) does not start the room.
- Done (2026-10-24): `mergeSettings` validates `timeouts` (1 s to 4 h) and `notify`, keeping defaults with a warning.
- Nine minor findings from the Agent Room final review were deferred; they are listed only in that session's final message. Recover and file them.
- Not live-tested: the memory PR (a real push), the result-gate memory picker, Antigravity sub-agents and skill reads. Hub and Vision keep an untracked root `AGENTS.md`, so a memory PR there would clash with it.
- The desktop `Test-Supervisor.ps1` is flaky (port in use in its restart cycle).
- Confirm which checkout and runtime the installed desktop profile uses; the handoff has both the main checkout and `.worktrees\desktop-reliability`.
- Repository lint: 34 errors in 10 older UI files (2026-10-06). Development dependency audit: 15 findings (8 high, 7 moderate), none in production.

### Suggested order

1. M8 phone push, M9 requeue on rate limit, the dangerous-command guard and the `mergeSettings` fix: small, and they make long sessions safer.
2. M9 auto-continue and keep-going mode: sessions that finish without the owner.
3. ~~M12 Hermes spike~~: dropped on 2026-10-24. Hermes ideas stay; Hermes as an agent does not (see the spike results in the feature map).
4. M10 PR review mode and start from an issue.
5. M11 search, diff panel and export.
6. M13 polish when there is time.

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

## M7 — Role sets and skills: plan (2026-10-16)

**Goal:** the owner gives agents specialist roles (UI/UX, frontend, backend, code reviewer, security). Each role is a set of agent skills that the owner can switch on or off, and tasks go to the agent wearing the matching role.

**Constraint from the current code:**
- A prompt is capped at `MAX_PROMPT_CHARS` (28,000).
- Antigravity takes its prompt as a command-line argument, so the Windows command-line limit also applies.
- So skills are never pasted into prompts. Each agent gets a short index and reads the files it needs.

### Concepts

- **Skill:** a `SKILL.md` folder from a GitHub source, pinned to one commit, with its license and a has-scripts flag recorded.
- **Role set:** a name, a short role prompt, and skills that can each be switched on or off. One skill can be in several sets.
- **Assignment:** in each session, every agent wears zero or more role sets. They come on top of orchestrator, coders and reviewer.

### Starting role sets

Every skill can be switched off. Check each source's license and scripts before enabling it.

| Set | Skills |
| --- | --- |
| UI/UX (design) | [Impeccable](https://impeccable.style/), [Anthropic frontend-design](https://github.com/anthropics/skills), [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), [Vercel web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) |
| Frontend (code) | [Vercel react-best-practices and composition-patterns](https://github.com/vercel-labs/agent-skills), web-interface-guidelines, [Magic UI](https://github.com/magicuidesign/magicui/tree/main/skills/magic-ui), 21st.dev agent skills (repo still to find) |
| Code reviewer | [Sentry code-review](https://github.com/getsentry/skills), [Anthropic pr-review-toolkit](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pr-review-toolkit) |
| Backend | [wshobson api-design-principles and architecture-patterns](https://github.com/wshobson/agents/tree/main/plugins/backend-development/skills), [Supabase Postgres best practices](https://github.com/supabase/agent-skills) (off by default) |
| Security | [Trail of Bits differential-review and static-analysis](https://github.com/trailofbits/skills); Semgrep and CodeQL are installed separately |

### Flow

1. **Roles:** the orchestrator sees the enabled sets and proposes who wears which. The roles gate shows them as tags on each agent, and the owner can edit them.
2. **Plan:**
   - each task gets a `role` (frontend, backend and so on);
   - `validatePlan` checks the role is an enabled set and prefers an assignee wearing it;
   - the plan gate shows a role badge on each task.
3. **Build:**
   - the coder's prompt lists only the skills for that task's role, as name, one-line description and path, in about 1,500 characters;
   - the prompt tells the coder to read the SKILL.md before starting.
4. **Review:**
   - the normal reviewer uses the Code reviewer set;
   - with Security on, tasks also get a security review;
   - frontend tasks get a design review from the UI/UX wearer, later with app-preview screenshots.
5. **Workflow view:** shows each task's role and the SKILL.md files the agent actually read. Claude's and Codex's event streams report file reads; Antigravity's are unconfirmed.

### Delivery to agents

- Enabled skills are copied into the session folder at `.ascend/skills/<id>/`.
- `.ascend/` goes into `.git/info/exclude`, so it is never committed.
- One method works for all three CLIs: each reads inside its own folder, and copying avoids Claude's plan-mode limit on reading outside it.
- Each CLI's own skill system is an optional later step.

### Storage, API and UI

- **Storage:**
  - skills in `.sites-runtime/agent-room/skills/<id>/`, alongside `source.json` with the repo, path, commit, license and has-scripts;
  - set definitions and switches in `role-sets.json`.
- **Room server:** `GET/POST /skills` and `GET/POST /role-sets`, with matching Hub proxy routes.
- **UI:**
  - a Role sets section in the right column;
  - a Skill library drawer: the list, source, license, view SKILL.md with the existing Markdown renderer, Add from GitHub URL, and Update with a diff;
  - per-session overrides under Options in the start form.

### Safety

Third-party skills are untrusted instructions running inside the agents.

- Pin each skill to one commit.
- Show the content before it is enabled.
- Show a diff before any update; never update automatically.
- Warn when a skill includes scripts.
- Put the room's rules after the skill text in every prompt, so the room's rules win a conflict.
- Fetching a source is a download and waits for the owner's approval.

### Slices

| Slice | Delivers |
| --- | --- |
| M7a | Data model, a library of local folders, role-set switches in the UI (done 2026-10-17) |
| M7b | Copying skills into the session, the skill index in prompts, `role` on plan tasks, coders getting the skills for their role (done 2026-10-17) |
| M7c | Specialist review passes: code review, security, UI/UX (done 2026-10-17) |
| M7d | Add from a GitHub URL: pinned commit, license, diff on update (done 2026-10-17) |
| M7e | Which skills were read, shown per task; overrides per session (done 2026-10-17) |

**Tests:**
- plan role validation;
- the size of the skill index;
- the exclude entry;
- keeping the switches;
- falling back when no agent wears a role.

### Decisions (2026-10-17)

1. **Where roles live:** both. Agents wear sets, tasks get role labels, and the two are matched.
2. **How skills arrive:** fetched on demand, one approval per source, pinned to a commit. Nothing third-party is copied into this repo.
3. **Security tools:** optional. The Security set runs on its review skills and uses Semgrep or CodeQL only when they're installed.
4. **21st.dev:** left out of the Frontend set for now; add it from a GitHub URL once the repo is known.

### M7a as built (2026-10-17)

- `scripts/agent-room/skills.mjs` holds the five starting sets and reads the library from `.sites-runtime/agent-room/skills/<id>/SKILL.md` (name and description from the front matter, a has-scripts flag, an optional `source.json`).
- The owner's switches are saved in `.sites-runtime/agent-room/role-sets.json`. Every set starts off; Supabase starts off inside Backend.
- The room server has `GET/POST /role-sets`, with a Hub proxy at `/api/room/role-sets`.
- A **Role sets** section in the right column switches sets and single skills, links each skill's source, and marks skills that are not installed or include scripts.

### M7b as built (2026-10-17)

- A new build session snapshots the sets that are on (`state.roleSets`); later switches never change it.
- The session copies those sets' installed skills to `<project>/.ascend/skills/<id>/` (links inside skill folders are skipped) and adds `.ascend/` to the repository's local exclude file. Race and parallel worktrees get the same copy. The room never commits the folder, and rollbacks keep it.
- Discussion, roles and plan prompts list the enabled sets. The roles JSON may add `wear` (which agent wears which set); the plan may give a task a `role`, which must be an enabled set. The roles gate shows the worn sets, and the plan gate and Plan board show each task's role.
- A coder's build prompt for a task with a role gets the role, a skill index of about 1,500 characters (name, description, path), and a line saying the room's rules win any conflict. Tasks without a role get nothing extra.
- Matching is guidance: the orchestrator is asked to give a role's tasks to an agent wearing it, but the plan is not rejected when it doesn't.

### M7c as built (2026-10-17)

- Each task runs up to three read-only review passes, in order: the code review (when there is a reviewer), a security review (when Security is on), and a design review (when UI/UX is on and the task's role is frontend or ui-ux).
- The code reviewer gets the Code reviewer set's skills when that set is on; the security and design reviewers get their sets' skills.
- A security or design pass goes to an agent wearing that set other than the coder, else the reviewer, else the orchestrator.
- A failed pass sends the task back with notes such as "security review: ..."; the next attempt runs every pass again. Passes already passed are recorded on the task, so a resumed session does not repeat them.
- Parallel tasks run the same passes in the merge queue, and a raced task's kept attempt runs them after the judge.
- **App preview:** under Options the owner may set a start command and a localhost URL. Before a design pass the room starts the app, waits for the URL, takes a 1280x800 screenshot with headless Edge or Chrome (`settings.browser` overrides), stops the app, and points the design reviewer at `.ascend/preview/task-<n>.png`. Only loopback URLs are accepted. A failed capture is reported and the review continues from the diff.

### M7d as built (2026-10-17)

- A **Skill library** drawer (button in the Role sets section) lists installed skills with their commit and license, shows each `SKILL.md` with the room's Markdown renderer, and removes skills.
- **Add from GitHub** takes a repo, `tree`, `blob` or raw link. The room resolves the ref to a commit, reads the file tree, and downloads that folder from `raw.githubusercontent.com` at the pinned commit into `.sites-runtime/agent-room/skills-staging/<token>/`. A link to a repo with several skills lists them to pick from.
- Nothing is installed until the owner reads the staged card (name, commit, license, file count, a scripts warning, the `SKILL.md`) and presses **Install**, optionally under another id. Install writes `source.json` (URL, commit, license, fetch time).
- **Update** fetches the same link again and shows a `git diff --no-index` against the installed copy; it replaces the copy only on Install.
- Limits: 200 files, 512 kB a file, 1 MB in all; links, submodules and paths with `..` are refused. Only `api.github.com` and `raw.githubusercontent.com` are contacted. When the `gh` CLI is logged in, its token is sent to `api.github.com` only, lifting GitHub's limit from 60 to 5,000 requests an hour; a used-up limit is reported with its reset time. Skills named in the role sets but not installed are listed with a Fetch button when their source is a GitHub link.

### M7e as built (2026-10-17)

- **Skill reads:** the room watches each turn's event stream for files opened inside `.ascend/skills/<id>/`: Claude's tool calls and Codex's shell commands, never what an agent only says. Each plan task keeps `skillsRead` per agent across its build, race, parallel and review turns, and the Workflow view shows the task's role and "Skills read: …". Antigravity prints no event stream, so its reads are not reported.
- **Per-session sets:** under Options, "Role sets for this session" starts from the switches; changing it sends `roleSets` with the new session, which then uses exactly those sets (even ones switched off). "Use the switches" goes back.

### M7 live check (2026-10-17)

A real session (`skills-check`: Codex orchestrator and reviewer, Claude coder, sets Code reviewer and Security, Sentry `code-review` fetched from GitHub at `f57ada2`, Apache-2.0) ran to the result gate: the skill was copied to `.ascend/skills/` and never committed, Codex's review opened its `SKILL.md` and the room recorded the read, and both the code and security passes ran. The first fetch hit GitHub's 60-an-hour limit for anonymous requests, which led to the `gh` token fix. The test skill was removed afterwards.

### More role sets (2026-10-17)

- **General** (always on for every coder task when switched on): Superpowers systematic debugging and verification before completion, Ponytail, Context7 `find-docs`, Caveman.
- **Testing / QA:** Microsoft Playwright CLI (needs `npm install -g @playwright/cli@latest` as well), Superpowers test-driven development, Trail of Bits property-based testing.
- Added to the existing sets: Emil Kowalski design engineering and animation performance (off by default), Addy Osmani accessibility and performance, Trail of Bits variant analysis and supply chain risk auditor, wshobson error handling patterns, Better Auth best practices (off by default).
- Every source points at the skill's own folder. Dropped: Anthropic PR review toolkit (sub-agents, no `SKILL.md`). Not available as a skill: Trail of Bits `insecure-defaults` (a command plugin).
- Installed 2026-10-17 after review: 27 skills. Licences: MIT, Apache-2.0 and CC-BY-SA-4.0, except Anthropic frontend design (its own `LICENSE.txt`), the three Vercel skills and Better Auth, which show no licence on GitHub. Scripts reviewed: Semgrep runner, supply-chain collector (public registry APIs), Superpowers `find-polluter.sh`, a FastAPI template.

### M7 follow-ups (2026-10-18)

- **Library limits:** 2 MB a file and 8 MB in all (was 512 kB and 1 MB), so Impeccable (57 files, 2.2 MB, Apache-2.0) and UI UX Pro Max (73 files, 3.6 MB, MIT) can be fetched. Both include scripts; live fetches staged in about 34 s each, inside the proxy's 120 s.
- **21st.dev:** the skills are in [21st-dev/skill](https://github.com/21st-dev/skill) (Apache-2.0). `21st-ui-build` and `21st-cli-use` are in the Frontend set, off by default: they drive `npx @21st-dev/cli`, which needs a 21st.dev login or API key.
- **Antigravity skill reads:** `agy` now runs with `--output-format stream-json`. Its reply comes from the `result` event, its `view_file` and `run_command` tool steps count as skill reads, and its token totals reach the usage meter. Its prompt still goes through `--print`, so the 28,000-character cap stays.

## Room ideas backlog (2026-10-16)

Not scheduled. Every item not yet built is now in [Next: M8–M13](#next-m8m13-2026-10-24); app preview with screenshots shipped in M7c.

- **Running sessions:**
  - retry from any stage;
  - auto-continue when a limit window resets;
  - limit-aware assignment, moving work away from an agent above 90%;
  - a session queue;
  - scheduled sessions;
  - start from a GitHub issue or PR;
  - a PR review mode that posts comments.
- **Seeing the work:**
  - a live diff panel;
  - a file tree and read-only viewer;
  - a terminal pane for check output;
  - app preview with screenshots after UI tasks;
  - search across sessions;
  - transcript and summary export.
- **Quality:**
  - keep-going mode, looping until checks pass within the budgets;
  - coverage and lint per task in the Workflow view.
- **Reach:**
  - phone push when a gate waits;
  - publish the session summary as a page;
  - MCP connectors for agents;
  - several repos in one session.

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
- **AGENTS.md pull request (done 2026-10-18):** the start form's memory editor has **Open pull request to AGENTS.md**. After a confirmation it saves the notes, cuts `room/memory-<time>` from the checkout's HEAD in its own worktree, writes them into a marked section of the committed `AGENTS.md` (a later PR replaces that section; a repo without one gets a new file), pushes and runs `gh pr create` (`memoryPullRequest` in `memory.mjs`, `POST /memory/pr`, proxy `app/api/room/memory/pr`). The owner's checkout is never touched. Hub and Vision keep an untracked root `AGENTS.md`, so a PR there adds a tracked file that clashes with it on the next pull.

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
- **Race gate (done 2026-10-18):** the start form's "Let me pick race winners" sets the session's `raceGate`. When two or more attempts pass, the judge still picks, then the session waits at `gate-race`: the attempt branches stay (their worktrees go), the gate shows each attempt's whole diff side by side (`diff('attempt:<agent>')`) with the judge's pick marked, and **Keep** fast-forwards the chosen one and deletes the others. Voice can only approve the judge's pick. The gate survives a restart; Stop deletes the waiting branches. Off by default, so races run unattended as before.

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
