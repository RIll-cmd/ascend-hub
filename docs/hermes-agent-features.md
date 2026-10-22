# Hermes Agent: features Ascend can take

Source: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent), `main` at `944c3a43` (2026-10-22), MIT licence. Read from the repository's README, `website/docs/` (55 feature pages, CLI and hook references) and its `skills/`, `optional-skills/`, `optional-mcps/` and `plugins/` folders. Nothing here was run live; every "how" below is from Hermes' own documentation and needs a spike before we rely on it.

MIT means we may copy code or ideas with the copyright notice kept. Where this file says "port", it means re-implement the idea in Hub's Node/TypeScript code, not vendor Hermes' Python.

## What Hermes is

A self-hosted, model-agnostic agent (Python 3.14 plus Node, native Windows supported) with:

- a terminal UI, a desktop app, a web dashboard and a messaging gateway (Telegram, Discord, Slack, WhatsApp, Signal, email, SMS, ntfy and about 30 more);
- a learning loop: curated memory, skills the agent writes and improves itself, full-text search over past sessions;
- delegation to sub-agents, a durable Kanban board for many agents, cron jobs, goals and loops;
- seven terminal back ends (local, Docker, SSH, Singularity, Modal, Daytona, Vercel Sandbox), browser automation and background computer use;
- 58 bundled and 153 optional skills, about 65 optional MCP servers and a plugin system with hooks.

## Four ways to connect Hermes to Ascend

| # | Path | What it gives | Hermes surface | Ascend side | Size |
| --- | --- | --- | --- | --- | --- |
| A | **Hermes as a fourth Agent Room agent** | Hermes plans, codes, reviews or judges next to Codex, Claude and Antigravity, with any model it is set to (OpenRouter, local Ollama, Nous Portal) | `hermes chat --oneshot --query-file <file> --format stream-json`. Events: `system` (init, model, session id), `text`, `tool_use`, `tool_result`, `result` (exit code, text, input/output/cache tokens, duration). Exit codes 0 / 1 / 130 | New agent entry in `scripts/agent-room/agents.mjs`, an event mapper in `events.mjs` beside the Claude, Codex and `agy` ones, a desk and CRT in the deck | M |
| B | **Hermes status TV on the shelf** | A CH 05 TV that shows Hermes `idle` / `working` / `stuck` / `offline`. The handoff lists Hermes adapters as not implemented | Gateway event hooks `gateway:startup`, `agent:start`, `agent:step`, `agent:end`, `session:end`; plugin hooks `on_session_start`, `on_session_end`, `agent_loop_stopped`, `on_human_input_request` (maps to `stuck`) | A reporter in `scripts/status-adapters/` that posts to Core's `POST /api/status/events` with its own producer credential, metadata only. The shelf already renders unknown services | S–M |
| C | **Hermes API server behind Hub** | A chat box in Hub (or a TV channel) backed by Hermes, with its tools and memory | OpenAI-compatible `POST /v1/chat/completions` and `/v1/responses`; `POST /v1/runs` with `GET /v1/runs/{id}/events` for streaming; `GET /health/detailed`; `GET /v1/capabilities` | A Hub server proxy like the status and room proxies, loopback only, key kept server-side | M |
| D | **Vision talks to Hermes** | Fairy Eye hands bigger tasks to Hermes and reads the reply aloud | Same API server, or `hermes chat --oneshot` | `ascend-vision/integrations/` | M |

Path A fits best: the room already drives three CLIs headless through stream-json, and `--query-file` has no prompt-length cap like the 28,000-character `agy --print` limit.

## Feature catalogue

Each row: what Hermes does, where it would land in Ascend, and how big the work is (S under a day, M a few days, L a week or more). "Port" means re-implement in Hub. "Use" means call Hermes itself.

### 1. Coding loop and agent control

| Hermes feature | What it does | Fit in Ascend | How | Size |
| --- | --- | --- | --- | --- |
| `/goal` (Ralph loop) | Keeps one objective alive; after each turn a small judge model checks whether it is met and, if not, sends a continuation prompt | Room backlog "keep-going mode": loop a task until its check passes, inside the M6a budgets | Port: a judge turn after each failed check, reusing the loop guard | M |
| `/loop` and `/heartbeat` | Re-run a prompt on an interval inside the same session, or whenever the session is idle | Room backlog "scheduled sessions" and "auto-continue when a limit window resets" | Port: a room timer that resumes a paused session when `quota.json` shows the window reset | M |
| Delegation (`delegate_task`) | Child agents with isolated context; only their summary returns. Lifecycle hooks `subagent_start` / `subagent_stop` | Room already shows Claude and Codex sub-agents on the CRT | Use: map Hermes sub-agent events into `active.subagents` when Hermes joins the room | S |
| Code execution with RPC | The agent writes a Python script that calls its own tools, collapsing many tool calls into one turn | Cheaper check-fix rounds for Hermes inside the room | Use (Hermes-only) | — |
| Checkpoints and `/rollback` | A shadow git store snapshots the project before destructive operations; the real `.git` is untouched | Room: an "undo last task" button for new-project sessions that never committed | Port idea; the room's per-task commits already cover most of it | S |
| `--worktree` | Starts a session in its own git worktree | Same model as M4 repo sessions | Use when Hermes is a room agent | — |
| LSP post-write lint | Runs pyright, gopls, rust-analyzer and others after every file write and feeds errors back | Room backlog "coverage and lint per task" | Port: run the repo's linter after each task, next to the check, and show it in Workflow | M |
| Mixture of Agents | A virtual model: reference models advise, an aggregator writes the answer and runs the tool loop | Debate mode already does opinion, critique, judge. MoA adds "advisers plus one actor" for build tasks | Use as Hermes' model in the room, or port as a debate variant that then builds | M |
| Codex app-server runtime | Hermes can hand OpenAI turns to the Codex CLI app-server and keep its own memory and tools through MCP | Shows how to run Codex with a ChatGPT subscription through its app-server instead of `codex exec` | Study only | — |
| Fallback providers and credential pools | Automatic failover to a backup model; several keys per provider, rotated on rate limits | Room backlog "limit-aware assignment": move work from an agent at 90% to another | Port: reassign the task when the M6b quota meter crosses the line | M |
| `/steer`, `/queue`, `/btw`, `/bg` | Steer a running turn, queue the next message, ask a side question, send work to the background | Room: an owner note to a running agent without stopping the session | Port: append the note to the next turn's prompt | S |
| `/insights`, `/usage`, `hermes usage --json` | Usage over N days and rate-limit windows without starting a session | Limits pill: a Hermes bar, read for free from `hermes usage --json` | Use | S |
| Context references (`@file`, `@diff`, `@url`) | Inline attachments in a message | Room prompt box: `@` to attach a file or the current diff to the task | Port | S |
| Context files | Loads `AGENTS.md`, `CLAUDE.md`, `.hermes.md`, `.cursorrules` and a global `SOUL.md` | Already matches the M6d memory PR to `AGENTS.md` | — | — |
| Tool search | Replaces many MCP tool schemas with three bridge tools that load a schema on demand | Needed if the room gives agents MCP connectors | Pattern only | — |
| Deliverable mode | Sends charts, PDFs and spreadsheets as native attachments | Result gate: show produced files as downloads | Port | S |

### 2. Memory and learning

| Hermes feature | What it does | Fit in Ascend | How | Size |
| --- | --- | --- | --- | --- |
| Bounded `MEMORY.md` and `USER.md` with nudges | Small curated memory; the agent is reminded to save what it learned | Room project memory (M6d) asks once, at the result gate | Port: an optional mid-session "save this?" nudge after a failed-then-fixed check | S |
| FTS5 session search with LLM summaries | Full-text search over every past session, summarised for recall | Room backlog "search across sessions" | Port: SQLite FTS5 (or a plain index) over `.sites-runtime/agent-room/` session files, plus a search box in the history column | M |
| Self-written skills (`skill_manage`) | After a hard task the agent writes a skill; it patches the skill while using it | M7 skill library: agents propose a new skill at the result gate, owner approves | Port | M |
| Curator | Tracks how often each skill is viewed, used and patched; moves unused ones `active → stale → archived`; an auxiliary model reviews them | Skill library hygiene: show use counts and stale skills in the role-set UI | Port the counters first (S), the review pass later (M) | S–M |
| agentskills.io standard | Skills use the open `SKILL.md` format | The room's skill library can import from Hermes' 211 skills | Use: add `NousResearch/hermes-agent` as a skill source | S |
| Honcho and other memory providers | Dialectic user modelling and external stores (Mem0, Supermemory, RetainDB and others) | Vision's local memory could use one later | Study only | — |

### 3. Many agents at once

| Hermes feature | What it does | Fit in Ascend | How | Size |
| --- | --- | --- | --- | --- |
| Kanban board | Durable SQLite board shared by many profiles; a dispatcher spawns workers per card; dependencies, assignees, worker lanes, retries and a circuit breaker; a worker exits `75` on rate limits so the card is requeued without counting a failure | Room backlog "session queue" plus "auto-continue when a limit window resets". A board view of queued, running and finished sessions | Port the requeue-on-rate-limit rule first (S); a session queue with a board view later (L) | S–L |
| Profiles | Fully separate homes: config, keys, memory, skills, sessions | Per-role identities for room agents | Pattern only | — |
| Bot Mode | A roster of named bots with roles, avatars, routines, and group chats where bots deliberate | Closest Hermes equivalent to the Agent Room. Useful as UI reference for agent cards and a permanent chat per agent | Study | — |
| Optional skill `agent-merge-conflict-arbiter` | A skill for resolving merge conflicts between agents | M6f merge queue: try an arbiter turn before failing a conflicted merge | Use the skill text | S |
| Optional skill `dynamic-workflow` | Builds a workflow on the fly | Template ideas for the room | Study | — |

### 4. Automation

| Hermes feature | What it does | Fit in Ascend | How | Size |
| --- | --- | --- | --- | --- |
| Cron with delivery | Natural-language schedules; output delivered to any platform; skills can be attached | Room backlog "scheduled sessions", for example a nightly review-only session on a repo | Port: a schedule list in room settings that starts a session at the set time | M |
| Automation blueprints | A catalogue of ready-made automations | Starter templates for scheduled sessions | Study | — |
| Webhooks and GitHub PR review guide | A webhook triggers a review agent that comments on the PR | Room backlog "start from a GitHub issue or PR" and "a PR review mode that posts comments" | Port: a *Review a PR* template that takes a PR number, uses `gh pr diff`, and posts with `gh pr review` after the owner approves | M |
| `BOOT.md` startup checklist | Runs a checklist when the gateway starts | Hub launcher: a startup check list (Core reachable, CLIs signed in, disk space) shown in the mini console | Port | S |
| Gateway and plugin hooks | About 50 hook points (11 gateway events, about 39 plugin hooks): sessions, tool calls, API requests, approvals, human-input waits, Kanban claims | Needed for path B, and a model for room hooks (for example a user script on `gate`) | Use for B | — |

### 5. Reaching the owner away from the PC

| Hermes feature | What it does | Fit in Ascend | How | Size |
| --- | --- | --- | --- | --- |
| Messaging gateway | One process serves Telegram, Discord, Slack, WhatsApp, Signal, email, SMS, Matrix, Home Assistant and others, with DM pairing and allowlists | Room backlog "phone push when a gate waits". Core already has `phone-chat-discord` worktrees | Use Hermes as the bridge, or port one channel | M |
| ntfy | Push notifications through an ntfy server | The smallest version of "phone push when a gate waits" | Port: one `POST https://ntfy.sh/<private-topic>` from the room when `attention` changes | S |
| Voice memo transcription | Voice notes on Telegram or WhatsApp become text | Answer a gate by voice from the phone | Later, after ntfy | M |
| Cross-platform continuity | The same conversation follows you between CLI and chat apps | Approve gates from the phone with a signed link | Port, after DM pairing exists | L |

### 6. Voice, screen and browser

| Hermes feature | What it does | Fit in Ascend | How | Size |
| --- | --- | --- | --- | --- |
| Voice mode | Live voice in the CLI and in Discord voice channels; streaming TTS | Vision already speaks and listens for gates | Study streaming TTS for Vision's Kokoro output | — |
| Wake word ("Hey Hermes") | Hands-free start | Vision: a wake word before gate answers, so stray speech is ignored | Port into Vision | M |
| Computer use (`cua-driver`) | Background clicks and typing on Windows, macOS and Linux with any tool-capable model; the owner's cursor does not move | Room backlog "app preview with screenshots after UI tasks" | Use `cua-driver` over MCP, or Playwright, which the repo already uses | M |
| Bot screen | Each bot gets its own desktop, streamed live; the owner can take over for a login and hand back | Deck: show a live screen on an agent's CRT during UI tasks | L | L |
| Browser automation | CDP to local Chromium, Camofox, Lightpanda or cloud browsers; dialogs; snapshots | Same as above, for web-app checks | Use Playwright first | — |
| Credential vault | The agent signs in through a vault and never sees the password | Pattern for any future room browser login | Study | — |
| Vision (image paste) | Paste a screenshot into the CLI | Room prompt box: paste a screenshot of a bug | Port: attach the image to the task for agents that accept images | S |

### 7. Tools and connectors

| Hermes feature | What it does | Fit in Ascend | How | Size |
| --- | --- | --- | --- | --- |
| MCP integration and the optional MCP catalogue | Per-server tool filters; about 65 ready configs (GitHub-adjacent: Linear, Sentry, Vercel, Netlify, Supabase, Neon, Cloudflare, Context7, DeepWiki, Semgrep and more) | Room backlog "MCP connectors for agents" | Use their configs as a curated list for a room *Connectors* option | M |
| Web search with SearXNG | Free self-hosted search back end, plus paid ones | Research turns in debates | Use if Hermes joins; otherwise skip | — |
| Document extraction | `read_file` turns PDF, Office and notebooks into text | Room: attach a spec PDF to a task | Port with an existing npm parser | S |
| Image generation (FAL) | 11 models | Placeholder art for room-built front ends | Skip unless asked | — |
| Spotify plugin | Playback, queue, search, playlists, history; Premium for control | Hub's Spotify TV only shows what plays. Add play, pause, skip and queue buttons | Port: Spotify Web API calls on the existing token in `lib/spotify.ts`; needs the `user-modify-playback-state` scope | S–M |
| X search | Search X posts through xAI | No fit | Skip | — |

### 8. Look and feel

| Hermes feature | What it does | Fit in Ascend | How | Size |
| --- | --- | --- | --- | --- |
| Pets (petdex sprites) | A mascot that reacts to idle, tool, thinking, done and failed | Hub: a Bangboo on each status TV or room desk that reacts to the agent's state | Port: sprite states driven by the existing status and room events. Check each petdex sprite's licence first | S–M |
| Skins and language packs | Themeable CLI; 17 UI languages | The room already has seven themes | Skip | — |
| Web dashboard (`127.0.0.1:9119`) | Config, keys, MCP, sessions, logs, analytics, cron, skills; themes and plugin tabs | A Hermes channel on the TV that embeds it, if Hermes is installed | Use (iframe) | S |
| Status bar and indicator | Live footer with model, tokens and cost | Room top bar already shows similar data | — | — |

### 9. Integration surfaces worth knowing

- **ACP adapter:** Hermes runs inside ACP editors (Zed and others). Not needed for Hub.
- **Python library:** `run_agent.py` and `AIAgent` can be imported. Vision could call it in-process, but a separate process keeps Vision light (M5).
- **Subscription proxy:** exposes a subscription-backed model as a local OpenAI-compatible endpoint.
- **Runs API:** durable runs with idempotency keys, `interrupted` and `unknown` states that never pretend to be `running` after a restart. A good model for the room's "stopped task still shows `running`" bug in the handoff.

### 10. Safety ideas

| Hermes practice | Ascend use |
| --- | --- |
| Dangerous-command approval with a smart (model-checked) mode | Room edit turns: block or ask on `rm -rf`, `git push --force`, `git reset --hard` outside the session worktree |
| Context-file scanning for prompt injection | Scan skills fetched from GitHub into the M7 library before staging them |
| MCP credential filtering | Pass only the needed environment variables to agent processes when connectors arrive |
| Cross-session isolation and path checks on cron storage | Same rule for scheduled sessions |
| DM pairing and allowlists | Required before any phone gate approval |

### 11. Out of scope

Batch trajectory generation, trajectory compression and the RL `evals` (model training); Termux, Nix, Docker and cloud sandboxes (Modal, Daytona, Vercel); WeChat, QQ, Feishu, DingTalk and similar regional platforms; OpenClaw migration; Nous Portal billing.

## Suggested order

Small and useful first:

1. **ntfy push when a gate waits** (S). Closes a backlog item with one HTTP call.
2. **Hermes status TV** (path B, S–M). The handoff already names it as missing.
3. **Requeue on rate limit** plus **auto-continue when the window resets** (S–M), from Kanban's exit-75 rule and `/loop`.
4. **Hermes skills as a library source** and **merge-conflict arbiter** in the merge queue (S each).
5. **Hermes as a fourth room agent** (path A, M). Spike first: install, `hermes chat --oneshot -q "2+2" --format stream-json`, record the real event lines.
6. **Keep-going mode** from `/goal` (M), **search across sessions** from FTS5 (M), **PR review template** (M).
7. **Spotify controls** and **pets** on the shelf (S–M), when there is time for Hub polish.

## Risks

- Hermes is large (about 20,700 files) and moves fast; flags and event shapes above are from one commit. Pin a version before integrating.
- It installs Python 3.14 and its own `uv`; antivirus may flag `uv.exe` (Hermes documents this as a false positive). Keep it out of Vision's Python environment.
- Never point two Hermes processes at one profile: both write memory and read each other's writes.
- Hermes as a room agent spends whatever provider it is set to; its usage must reach the M6 meter before long sessions.
- The gateway and API server must stay on `127.0.0.1` with a key, like the room.
