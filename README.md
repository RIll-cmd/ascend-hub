<div align="center">

<img src="desktop/assets/hub.png" alt="Ascend Hub icon" width="96" />

# Ascend Hub

**A retro orchestrator for your AI coding agents.**
Codex, Claude and Antigravity plan, build, review and merge as a team in the Agent Room while you approve each step. Watch it happen, see their status on CRT televisions, and keep an eye on your subscription limits. Between sessions, the same TV plays your Spotify music, the weather, YouTube and a little game.

![Node 22.13+](https://img.shields.io/badge/node-%E2%89%A522.13-3c873a)
![React 19](https://img.shields.io/badge/react-19-149eca)
![Platform: Windows first](https://img.shields.io/badge/platform-Windows%20first-0078d4)
![Runs locally](https://img.shields.io/badge/runs-127.0.0.1%20only-555)

<img src="docs/screenshots/shelf.webp" alt="The Ascend Hub status shelf: four CRT televisions for Ascend Core, Ascend Vision, Codex CLI and Antigravity around the Ascend Hub poster" width="900" />

</div>

## Contents

- [What it is](#what-it-is)
- [Features](#features)
- [Screenshots](#screenshots)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [One-click desktop launcher](#one-click-desktop-launcher-windows)
- [Using the Agent Room](#using-the-agent-room)
- [Status shelf setup](#status-shelf-setup)
- [Media setup](#media-setup)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Security and privacy](#security-and-privacy)
- [Documentation](#documentation)
- [License and credits](#license-and-credits)

## What it is

Ascend Hub is the front end of the Ascend ecosystem:

| Project | Role |
| --- | --- |
| **Ascend Hub** (this repo) | The dashboard you look at: status shelf, Agent Room, media and limits. |
| [Ascend Core](https://github.com/RIll-cmd/ascend-core) | The status authority. It stores each service's state; Hub only reads it. |
| [Ascend Vision](https://github.com/RIll-cmd/ascend-vision) | The desktop assistant. It can read Agent Room questions aloud and take spoken answers. |

```mermaid
flowchart LR
  You((You)) --> Hub[Ascend Hub<br/>127.0.0.1:5173]
  Hub -- reads status --> Core[Ascend Core]
  Hub -- runs sessions --> Room[Agent Room<br/>127.0.0.1:5181]
  Room --> Codex[Codex CLI]
  Room --> Claude[Claude Code]
  Room --> Agy[Antigravity CLI]
  Vision[Ascend Vision] -- voice gates --> Room
  Codex & Agy & Vision -- heartbeats --> Core
```

Everything runs on your own computer and listens on `127.0.0.1` only.

## Features

### Home dashboard

- A detailed retro room: CRT television, shelves, posters, a flip calendar, an LED clock and collectible props.
- **Edit mode** (**Ctrl+E**) to move and resize items, and add shelves, lights and collectibles. The layout is saved in your browser.
- A cassette and CD player whose background follows the music that is playing.

### Status shelf

- Four shelf TVs, built from Ascend Core's `services[]` list: **CH 01 Ascend Core / AIRA**, **CH 02 Ascend Vision**, **CH 03 Codex CLI** and **CH 04 Antigravity CLI**. Unknown services get a generic TV with no code changes.
- Four states (`idle`, `working`, `stuck`, `offline`), shown as text as well as colour, with last-seen times.
- Polls every four seconds and slows down in hidden tabs. Stale or failed reports are labelled as such, never shown as live.
- Click a TV, or move the Vision eye with **WASD** / **arrow keys** and press **Space**, to open its status monitor. **Escape** zooms back out.

### Subscription limits

- A **Limits** pill on the home screen names your fullest window, for example `Claude weekly 82%`.
- Open it for a 5-hour and a weekly bar per agent, each with its reset countdown and the age of the reading. Bars turn amber at 70% and red at 90%.
- **Refresh limits** re-reads Codex's own session log (free) and runs one tiny Claude turn, at most once a minute. Antigravity's CLI does not report limits.

### Agent Room (`/room`)

A 3D room where **Codex**, **Claude** and **Antigravity** build software together while you approve each step.

The page has three columns: past sessions on the left, the 3D room and the chat in the middle with the prompt box under it, and session details, limits, agents and the plan on the right.

- **Build a project:** the agents discuss the task, agree on roles (orchestrator, coders, reviewer), plan small tasks, build them one by one with a commit each, review, and write a summary.
- **Three owner gates:** you approve the roles, the plan and the result. At the roles and plan gates you can also send the step back with a note, or pick one of the agents' suggested changes.
- **New project or existing repo:** a new project gets its own git repository in `D:\ascend-builds\<name>`. An existing repo session works on its own branch in its own git worktree, so your checkout is never touched. At the end you can merge (fast-forward only), keep the branch, or reject it.
- **Checks after every task:** your test command runs after each task. A failure sends the task back to its coder with the output.
- **Lint and coverage per task (optional):** under Options, a lint command and a coverage command run after a task's checks pass. Workflow shows *lint ✓/✗* and *coverage N%* on each task, with the change since the previous task; the full output is in the Checks tab. They are information only and never send a task back. Coverage totals are read from c8/istanbul, Node's `--experimental-test-coverage` and pytest-cov summaries.
- **Templates:** *Feature*, *Bug fix* (task 1 must add a failing test, later tasks make it pass), *Refactor* (checks must pass before and after every task) and *Review only*.
- **Limits and loop guard:** caps on work minutes, agent turns and rounds per task. The room pauses and asks you instead of looping, and **Retry** grants a little more.
- **Steering a session:** while a session runs or waits, **Send note** under the chat adds a note that every later prompt carries (the last five are kept). At a gate or a pause, **Go back to an earlier step** sends a build back to its roles, its plan, or a task: going back to task N undoes the committed work of task N and every task after it and runs them again; earlier tasks stay.
- **Limit-aware assignment:** just before a task runs, a coder that has used 90% or more of a usage window that has not reset yet hands the task to the coder with the most room left, and the chat says so. Agents without readings (Antigravity) count as free; race tasks are not moved.
- **Queue and schedules:** while a session runs, **New session** opens the form again and **Add to queue** lines the next one up; it starts by itself when the running one ends and all three agents are ready. **Schedule** in the prompt bar starts a session at a set time, once, every day or on weekdays (a schedule only adds it to the queue, so it waits for a running session). The **Queue** section in the right column lists what waits, what is scheduled and anything that could not start, with its reason; × removes an entry. Gates still wait for you, attachments cannot be queued, and the room stays up while anything is queued or scheduled.
- **Keep going:** with *Keep going on failing tasks* ticked, a task that would pause at its round limit or be skipped goes to the orchestrator first. If its failures are changing, the orchestrator gives it another round with a hint for the coder, up to five extra rounds per task. If they keep repeating, the task pauses as usual. Session minutes and turns still apply.
- **Models per agent:** pick a model for Codex and for Claude, for example a cheaper one for reviews.
- **Project memory:** at the result gate the orchestrator proposes up to five notes for next time. You tick and edit the ones to keep, and later sessions for that repo read them.
- **Best-of-N races:** mark a hard task as a race and every coder attempts it at once in its own worktree. The checks filter the attempts, a judge picks the best, and only the winner is kept.
- **Parallel tasks (experimental):** independent tasks run at the same time, then merge one by one through a merge queue, with checks after each merge. When a merge conflicts, the task's coder gets one turn to resolve the conflict markers in place; the checks and review then judge the result. If markers remain, the merge is undone and the task is redone on top of the merged work.
- **Attachments and references:** paste a screenshot into the prompt box, or use **Attach** for PNG, JPEG, GIF, WebP, PDF, Markdown or text files (at most 5, 8 MB each, 12 MB in all). In a repo session, `@path/to/file` points the agents at a committed file and `@diff` hands them your checkout's uncommitted changes. Everything lands in the session folder's `.ascend/attachments/` (never committed) and every prompt lists it, so the agents read it themselves. A PDF's text is extracted beside it with `pdftotext` or Python's `pypdf` when either is installed, so agents that cannot open PDFs can read it too. Debates take no attachments.
- **Start from a GitHub issue:** in a repo session, put an issue number or link in *GitHub issue*. The room reads it (and its last five comments) with `gh` and adds it to the task, marked as text written by others, not instructions. The prompt box may then stay empty.
- **Review a pull request:** with *Review only* and a *Pull request* number, every agent reviews the PR's diff (`gh pr diff`, the first 12,000 characters per prompt) and Codex writes the verdict. **Post to PR** then adds the verdict to the PR as a comment-only review, after you confirm. Nothing is posted by itself, and it posts once.
- **Debate a question:** the agents answer on their own, critique each other, and a judge writes the combined answer with *Where they agree*, *Where they disagree* and *Recommendation*. Debates are read-only.
- **See everything:** the *Workflow* tab shows stage timings, swim lanes per agent, each task's rounds, reviews, checks, tokens and diffs. The *Deck* shows the 3D room, Claude's sub-agents and an optional sound layer.
- **Changes tab:** while a build runs, its uncommitted changes in the session folder, refreshed every 3 seconds: the patch against the last commit plus new files, with the task and the agent working on it. Parallel and race attempts edit in their own worktrees, so their changes show in Workflow once committed.
- **Files tab:** a build's folder as a file tree with a read-only viewer, for live sessions and past ones whose folder still exists. It lists only files git tracks or would track, so ignored files such as `.env` and `node_modules` never show. Binary files and files over 512 KB are named but not shown.
- **Checks tab:** every run of the check command, labelled by what it checked (a task, a race attempt, a merge, or the state before a refactor), with its result and time. Pick one to read its full output in a terminal pane, up to 2 MB per run; the agents still see only the last 6,000 characters.
- **Usage:** tokens per agent and task, plus cost where the CLI reports it.
- **Session history:** every past session is listed in the left column. Click one to read its chat, workflow, plan and verdict again.
- **Export:** **Export .md** on the Session card saves any session, live or past, as one Markdown file: its facts (folder, branch, roles, checks, usage), the task, the plan with each task's outcome, the summary or verdict, and every message with its time in UTC.
- **Search:** the box above the list finds past sessions whose task, chat or verdict contain every word you type, in any case, newest first. Each result shows who said the matching line. It matches parts of words, so *resolved* also finds *unresolved*.
- **Formatted chat:** agent replies render Markdown, with headings, lists, inline code and code blocks that collapse when long. **Full transcript** opens every message in one drawer.
- **Themes:** seven neobrutalist colour themes: *Dark wood* (default), *Sky*, *Lime*, *Retro SaaS*, *BrutAdmin*, *Brutstack* and *Neoflux*. Pick one under **Theme** at the bottom of the left column. Your browser remembers the choice.
- **Voice gates:** with Ascend Vision running, it announces when the room needs you and accepts spoken decisions such as "approve" or "merge", confirmed with "yes".

### The TV and its channels

The big CRT on the home screen is a working television. Click its upper knob to change input and the lower knob to change channel:

- **Music:** the Spotify track you are playing, with its album art, artist and progress.
- **Weather:** the current temperature, feels-like, humidity, chance of rain and wind, plus a short forecast, from Visual Crossing. A news-style anchor reads out the conditions.
- **YouTube:** search a title or paste a link, or tune into curated recommendations.
- **Video:** Zenless Zone Zero shows and commercials on rotation.
- **Game:** a small Bangboo jump game. Click to start.

### CD player

- Opens from the shelf. The jewel case, disc label and background follow the album art of the song playing on Spotify, so it changes with every album.
- Shows the track, artist and progress, with a **Customize** panel for its look.

### Desktop launcher (Windows)

- **Ascend Hub** and **Ascend Vision** desktop shortcuts with a small native console: Start, Open, Stop, Force stop, Retry and diagnostics.
- Hub opens in an Edge app window when it is ready and keeps a tray icon with *Open Hub*, *Show launcher*, *Stop Hub* and *Quit*.
- Hub runs from a production build: it starts in about 2 seconds and uses about 150 MB of memory.

## Screenshots

| | |
| --- | --- |
| <img src="docs/screenshots/home.webp" alt="Home screen with the retro CRT television, calendar and clock" /> **Home** | <img src="docs/screenshots/limits.webp" alt="The Limits panel open over the home screen, with 5-hour and weekly bars for Claude and Codex" /> **Subscription limits** |
| <img src="docs/screenshots/tv-detail.webp" alt="The Codex CLI status monitor opened from its shelf TV" /> **Status monitor** | <img src="docs/screenshots/room-start.webp" alt="The Agent Room in the Dark wood theme: session history on the left, the 3D room with three agent desks and the prompt box in the middle, limits, agents and new-session options on the right" /> **Agent Room** |
| <img src="docs/screenshots/room-workflow.webp" alt="The Workflow tab of a finished parallel session, with swim lanes and three tasks" /> **Workflow view** (two tasks ran in parallel) | <img src="docs/screenshots/room-debate.webp" alt="A finished debate with the judge's combined answer" /> **Debate verdict** |

<p align="center">
<img src="docs/screenshots/room-themes.webp" alt="The same finished session in six themes: Sky, Lime, Retro SaaS, BrutAdmin, Brutstack and Neoflux" width="900" /><br/>
<b>Agent Room themes</b>: Sky, Lime, Retro SaaS (top), BrutAdmin, Brutstack, Neoflux (bottom). Dark wood is above.
</p>

**The TV, the CD player and the game**

| | |
| --- | --- |
| <img src="docs/screenshots/tv-music.webp" alt="The music channel showing the Spotify track, artist, album art and progress" /> **Music (Spotify)** | <img src="docs/screenshots/cd-player.webp" alt="The CD player styled after the playing album's cover art" /> **CD player** (follows the album art) |
| <img src="docs/screenshots/tv-weather.webp" alt="The weather channel with temperature, feels-like, humidity, chance of rain and wind" /> **Weather** | <img src="docs/screenshots/tv-youtube.webp" alt="The YouTube tuner with search and recommendations" /> **YouTube tuner** |
| <img src="docs/screenshots/tv-commercials.webp" alt="A Zenless Zone Zero commercial playing on the TV" /> **ZZZ shows and commercials** | <img src="docs/screenshots/tv-game.webp" alt="The Bangboo jump game on the TV" /> **Bangboo jump game** |

## Requirements

- **Node.js 22.13 or newer** and npm.
- **Windows 10 or 11** for the desktop launcher and the CLI status adapters. The web app itself also runs on macOS and Linux.
- For the Agent Room, the agent CLIs installed and signed in:
  - [Codex CLI](https://github.com/openai/codex) (`npm i -g @openai/codex`, then `codex login`)
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`npm i -g @anthropic-ai/claude-code`, then sign in inside `claude`)
  - Antigravity CLI (`agy`)
- Optional: a running [Ascend Core](https://github.com/RIll-cmd/ascend-core) for live shelf status, and [Ascend Vision](https://github.com/RIll-cmd/ascend-vision) for voice gates.

> [!NOTE]
> The Agent Room runs each CLI as you, with the account that CLI is signed into. Sessions count against the same subscription limits as your own terminal use, and API keys in your environment (such as `ANTHROPIC_API_KEY`) would be used instead of a subscription.

## Quick start

```powershell
git clone https://github.com/RIll-cmd/ascend-hub.git
cd ascend-hub
npm run install:ci
npm run serve
```

Open **http://127.0.0.1:5173**.

`npm run serve` builds Hub only when the source changed since the last build, then serves the production build together with the Agent Room. The first start takes about 15 seconds; later starts take about 2. On first start the room writes a random `ASCEND_ROOM_TOKEN` to `.env.local`; Hub uses it to talk to the room.

For development with hot reload, use `npm run dev` instead (it starts at `http://localhost:5173` and needs much more memory).

## One-click desktop launcher (Windows)

Install the desktop shortcuts once, from Windows PowerShell, with your own paths:

```powershell
& 'D:\ascend_hub\desktop\Install-Ascend.ps1' `
  -HubRoot 'D:\ascend_hub' `
  -VisionRoot 'D:\ascend-vision\ascend-vision' `
  -NodeExe 'D:\node.exe' `
  -PythonExe 'D:\ascend-vision\ascend-vision\.venv\Scripts\python.exe' `
  -VisionEnvFile 'D:\ascend-vision\ascend-vision\.env'
```

Then double-click **Ascend Hub** on the desktop. Closing the launcher window while Hub runs hides it to the tray; **Quit** stops Hub and the Agent Room. See [desktop/README.md](desktop/README.md) for every option.

## Using the Agent Room

1. Open **http://127.0.0.1:5173/room**, or click the *Ascend Hub* poster on the shelf. Wait until all three agents show as ready.
2. Under **New session** in the right column, choose **Build** or **Debate**.
3. For a build, pick the **Kind of work** and either a **New project** name or an **Existing repo**. Under **Options**, add a **check** command such as `npm test`. It is required for *Bug fix* and *Refactor*.
4. Also under **Options**, optionally set models, limits, sub-agents, **Keep going on failing tasks** and **Run independent tasks at the same time**. Tick **Set roles myself** to skip the discussion.
5. Describe the task in the prompt box under the room and press **Start**.
6. Answer the gates as they come:
   - **Roles:** edit the roles or approve them.
   - **Plan:** rename tasks, change who does each, tick **Race all coders** on a hard task, then approve. Or ask for changes with a note.
   - **Result:** read the summary and diff, open **Files produced** to download any added or changed file exactly as committed (or all of them as one zip), tick the memory notes worth keeping, then merge, keep the branch, open a pull request (pushes to `origin` and uses the GitHub CLI `gh`), or reject.
   - **Pull-request review:** read the verdict, then **Post to PR** if it should go on GitHub.
7. Follow progress in the *Deck* and *Workflow* tabs. **Stop** in the top bar ends the session at any time; committed work stays. A stopped repo session keeps its worktree for inspection until you press **Remove worktrees** in the right column; its branch stays either way.

> [!TIP]
> Check the **Limits** bars before a long session. The start form also warns when an agent has used 90% or more of a window.

## Status shelf setup

The shelf shows live data only when Ascend Core is running and Hub can read it. Hub never invents status: without Core, the TVs say the status feed is unavailable.

1. Start Ascend Core (see its README).
2. Add the read-only connection to `.env.local`:

   ```env
   ASCEND_CORE_SHELF_URL=<full URL of your Core Shelf read endpoint>
   ASCEND_SHELF_READ_CREDENTIAL=<dedicated read-only credential>
   ```

   Use a dedicated **read-only** credential, never a browser cookie, user token or producer credential. Never prefix these with `NEXT_PUBLIC_`. Restart Hub after changing them.
3. Confirm the proxy answers:

   ```powershell
   Invoke-RestMethod 'http://127.0.0.1:5173/api/status/shelf' | ConvertTo-Json -Depth 10
   ```

   It returns `{ "schemaVersion": 1, "generatedAt": "...", "services": [...] }`.

The browser only ever calls `GET /api/status/shelf`. Hub adds the credential on the server side, validates the schema-v1 response and never sends the credential to the browser.

<details>
<summary><b>Report Codex and Antigravity CLI status</b></summary>

CLI status is reported only for sessions started through their status wrappers. The Antigravity IDE/sidebar is not a supported reporter.

**Codex CLI:**

```powershell
Set-Location D:\ascend-core
& 'D:\ascend_hub\scripts\status-adapters\codex-status.ps1' `
  -ConfigPath 'D:\ascend-status-adapters\codex-local-1\config.json'
```

Run a harmless task. The Codex TV goes `offline → working → idle`, and returns to `offline` about 30 seconds after Codex exits.

**Antigravity CLI:**

```powershell
$agyWorkspace = "$env:TEMP\ascend-phase3-agy-probe-20260918-4c81e5"
Test-Path -LiteralPath $agyWorkspace   # must be True
& 'D:\ascend_hub\scripts\status-adapters\antigravity-status.ps1' -Workspace $agyWorkspace
```

Submit `Compute 2 + 2 and reply with the number only. Do not use tools.` and watch the TV go `offline → working → idle`. An interrupted run (`Ctrl+C`) is recorded as interrupted or abandoned, never as completed. If the workspace check returns `False`, follow the [Antigravity setup guide](docs/antigravity-cli-status-adapter.md) instead of installing hooks elsewhere.

Each agent needs its own instance-bound producer credential, stored outside this repository. Keep `scripts/status-adapters/` paths stable, because installed hooks reference them. Full guides: [Codex adapter](docs/codex-status-adapter.md), [Antigravity adapter](docs/antigravity-cli-status-adapter.md).

</details>

<details>
<summary><b>Check Vision on the shelf</b></summary>

With Core and Hub running, start Vision and confirm its TV shows `idle` and its heartbeat advances. Stop Vision; after about 30 seconds the TV shows `offline` with a last-seen time.

</details>

## Media setup

Each media integration is set up from its own TV screen:

- **Spotify:** needs your Spotify developer app ID and secret, then the account authorization flow.
- **Weather:** needs a Visual Crossing API key and a location.
- **YouTube:** works without setup; availability depends on YouTube and the chosen stream.

Secrets are stored by the local Hub runtime under the ignored `.sites-runtime/` folder and are never returned by the setup APIs. Keep that folder private.

## Configuration

### `.env.local` (repository root, ignored by git)

| Variable | Purpose |
| --- | --- |
| `ASCEND_CORE_SHELF_URL` | Core's Shelf read endpoint. |
| `ASCEND_SHELF_READ_CREDENTIAL` | Dedicated read-only credential for that endpoint. |
| `ASCEND_ROOM_TOKEN` | Shared secret between Hub and the Agent Room. Created automatically. |

### Agent Room settings (`.sites-runtime/agent-room/settings.json`)

Optional overrides of the defaults in `scripts/agent-room/agents.mjs`:

| Key | Default | Meaning |
| --- | --- | --- |
| `buildsRoot` | `D:\ascend-builds` | Where new projects and session worktrees are created. Also set by `ASCEND_BUILDS_ROOT`. |
| `debateFolders` | the three Ascend repos | Folders that debates may read and repo sessions may branch from. |
| `checks` | per repo | Suggested check command for each repo. |
| `timeouts` | chat 3 min, build 15 min, debate 10 min, check 15 min | Time limit per agent turn or check run, in milliseconds, from 1,000 to 14,400,000 (4 hours). A value outside that range keeps its default and the room logs a warning. |
| `notify` | off | Phone pushes through [ntfy](https://ntfy.sh): `{ "ntfy": "https://ntfy.sh/<private-topic>" }`, or a self-hosted server's topic URL. The room posts once each time a gate opens or a session pauses. The project name and gate summary go to that server, so pick a long, random topic. |
| `limits` | 120 minutes, 80 turns, 3 rounds | Limits for sessions started without their own (the start form always sends its values). |
| `agents` | global npm installs | Command for each CLI, if yours live elsewhere. |

The room keeps its sessions, project memory (`memory/<repo>.md`) and last-known quota (`quota.json`) in the same folder.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Shelf TVs say *Cannot reach the status feed* | Core is not running or not reachable. `/api/status/shelf` returns `502` when Core is down and `503` when `.env.local` is missing values (restart Hub after editing it). |
| `/room` says *Room offline* | Start Hub with `npm run serve` or the desktop shortcut, or run `node scripts/agent-room/server.mjs` on its own. |
| *Not ready: claude, agy.* when starting | The room is still probing the CLIs (a few seconds after start), or a CLI is missing or signed out. Run it once in a terminal to check. |
| A session paused | Read the reason in the gate panel. **Retry** continues and grants more turns, minutes or one more round; **Reassign** hands the task to another coder. |
| Paused: *hit a rate limit* | The agent's subscription or provider refused work for now. The turn is not counted, and the room retries by itself at the reset time it knows (or in 10 minutes), up to six times in a row. **Retry** tries at once; **Reassign** moves the task to another coder. |
| Paused: *tried a command the room does not allow* | An agent ran `git push`, `git reset --hard`, `git clean -f`, `npm publish` or a recursive delete outside the session folder. The room killed that turn. Check the transcript, then **Retry** or **Stop**. |
| *MERGE_REFUSED* at the result gate | Your checkout moved off the base branch, or the base branch moved. Switch back, or choose **Keep branch** and merge yourself. |
| `localhost` does not load in development | The dev server may listen on IPv6 only. Use `http://[::1]:5173`. |

## Development

```sh
npm run dev            # development server with hot reload
npm run serve          # production build on 127.0.0.1 (rebuilds only when sources change)
npm run build          # production build only
npm run lint           # repository lint
npm run test:status    # status shelf tests
```

Agent Room and Hub tests:

```sh
node --no-warnings --test tests/agent-room/*.test.mjs tests/hub/*.test.mjs
npx tsx --test tests/agent-room/*.test.ts
npx tsc --noEmit
```

Other checks:

```sh
node --no-warnings --test tests/phase3/*.test.mjs   # CLI status adapters
npx tsx --test tests/tv/*.test.ts                   # media TVs
python tests/tv/channel-ui.browser.py               # media TVs in a browser (Playwright)
```

Desktop launcher checks, from Windows PowerShell 5.1:

```powershell
desktop/tests/Test-LauncherLayout.ps1
desktop/tests/Test-Installer.ps1
desktop/tests/Test-Supervisor.ps1
desktop/tests/Test-SessionReplacement.ps1
```

`npm run lint` still reports existing findings in older UI files, so a clean build or test run does not mean the whole repository lints clean.

### Project structure

| Path | Contents |
| --- | --- |
| `app/` | Pages and API routes: home, `/room`, the status and room proxies, media APIs |
| `app/room/` | Agent Room UI: deck, workflow, gates, start form, limits, session history, themes |
| `scripts/agent-room/` | Agent Room server: sessions, prompts, git work, checks, quota, memory |
| `scripts/status-adapters/` | CLI status wrappers, hooks and reporters |
| `components/`, `hooks/`, `lib/` | Shared UI components and logic |
| `desktop/` | Windows launcher, installer and supervisor |
| `public/` | Artwork, fonts, videos and 3D models |
| `tests/` | Agent Room, Hub, status, adapter and media tests |
| `docs/` | Roadmap, operator guides, audits and design references |
| `vendor/`, `build/`, `worker/` | Vendored code, build plugins and the Worker entry point |

## Security and privacy

- Hub and the Agent Room listen on `127.0.0.1` only. Room requests need a bearer token, and Hub refuses requests whose host is not loopback, which blocks DNS-rebinding attacks.
- Browser code never receives the Shelf read credential, producer credentials or the room token.
- Repo sessions work in separate git worktrees. The room never edits your checkout, and a merge is fast-forward only.
- Agent turns run with each CLI's own permission mode: read-only for discussion, planning, review and debates, edit mode only for coding in the session folder. Git hooks and signing are disabled for the room's own git calls.
- The room watches every shell command an agent reports and kills the turn on pushes, hard resets, `git clean -f`, branch deletes, `npm publish` and recursive deletes of the session folder, its `.git` or anything outside it. It sees a command when the CLI reports it, so a very fast command may already have run; the per-task commits and fast-forward-only merges remain the real safety net.
- Status reporters send lifecycle metadata only, never prompts, responses, transcripts, code, terminal output or raw errors.
- The quota meter reads only the `rate_limits` field from Codex's session logs and Claude's rate-limit events.
- `.gitignore` excludes `.env.local`, `.sites-runtime/`, build output and scratch files. Review staged changes before publishing; ignore rules do not protect secrets that are already tracked.

## Documentation

- [Roadmap](docs/ROADMAP.md): milestones M1–M6 and what is next
- [Desktop launcher](desktop/README.md)
- [Codex CLI status adapter](docs/codex-status-adapter.md) and [Antigravity CLI status adapter](docs/antigravity-cli-status-adapter.md)
- [Status Shelf architecture](<future ai implementation.md>)
- [Phase 3 audit](docs/phase-3-local-ai-status-adapter-audit.md) and [implementation status](docs/phase-3-implementation-status.md)
- [Development, hosting and optional database setup](docs/development-and-hosting.md)
- [Design references](docs/design/README.md)

## License and credits

This repository has no license file yet, so default copyright applies: you may read the code, but reuse needs the owner's permission.

Built with React 19, TypeScript, Vinext (Vite), Tailwind CSS, Three.js and Framer Motion. The Agent Room's controls are [neobrutalism.dev](https://www.neobrutalism.dev/) components (MIT, see `components/neo/LICENSE`). Third-party reference artwork, media and vendored code keep their own files and notices; their presence here does not grant redistribution rights.
