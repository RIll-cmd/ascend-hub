# Agent Scorecard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grade Codex, Claude and Antigravity from the Room's saved sessions, show it in a Scorecard panel and as a start-form hint, and push a weekly summary.

**Architecture:** A pure `scorecard()` in the room process reads `state.json` and `transcript.jsonl` of past sessions. The room server serves it at `GET /scorecard`, and Hub proxies it at `/api/room/scorecard`. A typed view model turns it into the panel and the hint. A room timer sends the weekly ntfy push once per ISO week.

**Tech Stack:** Node ESM (`scripts/agent-room`), `node:test`; Next-style route handlers and React (`app/room`), `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-29-agent-scorecard-design.md`

## Global Constraints

- Under 3 tasks, a cell or hint says "not enough data". Never name a best agent from fewer.
- Never change roles automatically. The hint is text only.
- A session stopped before any task left `pending` is excluded entirely.
- Missing fields on older sessions skip that metric for that task. They never count as a fail.
- No new dependencies.
- Agent ids are `codex`, `claude` and `agy` (display names come from `AGENT_NAMES` in `session.mjs`).

## Review Focus

- **A corrupt or half-written `state.json`** (read mid-save): skip that session; the endpoint still answers 200.
- **Sessions from before M7** with no `role` on tasks: count them under the task role `general`.
- **A reassigned task:** the first assignee (from the first `kind: 'assign'` transcript line for that task id) gets `reassignedAway`. The final assignee gets the task, and it is never first try.
- **`?days=` garbage** (`abc`, `-1`, `100000`): answer 400 `DAYS_INVALID`. Allowed values are `7`, `30` and `all`.
- **The room down at 09:00 on Monday:** the push goes out at the first check after that, in the same ISO week, and never twice.

---

### Task 1: Pure scorecard metrics

**Files:**
- Create: `scripts/agent-room/scorecard.mjs`
- Test: `tests/agent-room/scorecard.test.mjs`

**Interfaces:**
- Produces:
  - `readSessions(dataDir: string): { state: object, transcript: object[] }[]`: newest first, at most 500; it skips a directory whose `state.json` fails to parse.
  - `scorecard(sessions, { now: number, days: 7 | 30 | null }) -> Scorecard`, where:

```js
// Scorecard
{ window: { days, from: iso|null, to: iso }, sessions: number,
  agents: { [agent]: {
    coder: { tasks, firstTry, checksGreen, checksScored, stalls, reassignedAway, failures },
    reviewer: { tasks, roundsAsked, laterFailed },
    orchestrator: { sessions, done, rejected, revisions },
    tokens, tokensPerPass } },        // tokensPerPass: tokens / tasks done as coder; null when none
  byRole: { [taskRole]: { [agent]: { tasks, firstTry } } },
  endings: [{ id, at, stage: 'rejected'|'stopped', lastStage, task }],   // task cut to 120 chars
  weekly: string[] }                  // one line per agent with any activity
```

- Rules, exactly as in the spec:
  - **First try:** `status === 'done' && (attempts ?? 0) === 0 && (rounds ?? 0) <= 1 && !reassigned`.
  - **Checks green:** scored only when `task.check` exists; green when its last run is ok.
  - **Stall:** `(keptGoing ?? 0) > 0 || (extraRounds ?? 0) > 0`.
  - **Revisions:** transcript lines from `room` starting with `Owner asked for changes to the`.
  - **Reviewer `laterFailed`:** a task this reviewer reviewed that later has `failures > 0` after review, or whose session ended `rejected`.
- `weekly` line copy: `"<Name>: <n> task(s), <k> first try, <r> review round(s) asked"`, with zero parts left out.

- [ ] **Step 1: Write the failing tests.** Build sessions inline with a `session({ stage, tasks, roles, usage, transcript, createdAt })` helper.
  - `first try needs done, no failures, one round and no reassign`: 4 tasks for claude, where only `{status:'done', attempts:0, rounds:1}` counts. Assert `agents.claude.coder.firstTry === 1` and `tasks === 4`.
  - `a reassigned task is charged to the first assignee`: assign lines `Task 1: X → Codex` (`to:['codex']`), then `to:['claude']`; task `assignee:'claude', reassigned:true`. Assert `agents.codex.coder.reassignedAway === 1` and `agents.claude.coder.firstTry === 0`.
  - `tasks without a role count as general`. Assert `byRole.general.claude.tasks`.
  - `owner-stopped sessions with no started task are left out`: `stage:'stopped'`, all tasks pending. Assert `sessions === 0`.
  - `the window keeps only sessions created in the last N days`: `now` fixed; sessions at -3d and -10d with `days:7` give 1, and `days:null` gives 2.
  - `endings list rejected and stopped sessions with the stage they ended in`: `stageLog:[{stage:'build'},{stage:'gate-result'},{stage:'rejected'}]` gives `lastStage:'gate-result'`.
  - `orchestrator revisions come from owner change requests`: 2 matching transcript lines give `revisions === 2`.
  - `readSessions skips a corrupt state file`: temp dir with one valid and one `{"id":` file gives length 1.

- [ ] **Step 2: Run them and see them fail.** Run `node --no-warnings --test tests/agent-room/scorecard.test.mjs`. Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `readSessions` and `scorecard` in `scripts/agent-room/scorecard.mjs`.** Use `readJson`/`readJsonLines` from `store.mjs` and wrap each session read in try/catch. `sessionIds` order: copy the `listSessions` approach in `server.mjs` (newest first).

- [ ] **Step 4: Run the tests and see them pass.** Same command. Expected: PASS, 8 tests.

- [ ] **Step 5: Commit.**
```bash
git add scripts/agent-room/scorecard.mjs tests/agent-room/scorecard.test.mjs
git commit -m "feat(room): score agents from saved sessions"
```

### Task 2: `GET /scorecard` and the Hub proxy

**Files:**
- Modify: `scripts/agent-room/server.mjs` (route block near `GET /queue`, around line 307)
- Create: `app/api/room/scorecard/route.ts`
- Test: `tests/agent-room/server.test.mjs` (add a test)

**Interfaces:**
- Consumes: `readSessions`, `scorecard` (Task 1).
- Produces: `GET /scorecard?days=7|30|all` → `200 { scorecard }`; a bad value gives `400 { error: 'DAYS_INVALID' }`. With no parameter, days is 7.

- [ ] **Step 1: Write the failing test** `scorecard answers for 7 days by default and refuses bad days`. Seed `dataDir/sessions/s1/state.json` with one done build. `call('GET','/scorecard')` gives 200 and `body.scorecard.window.days === 7`. `?days=all` gives `window.days === null`. `?days=abc` gives 400 `DAYS_INVALID`.
- [ ] **Step 2: Run it and see it fail.** Run `node --no-warnings --test tests/agent-room/server.test.mjs`. Expected: the new test fails with 404.
- [ ] **Step 3: Add the route.** `route` is method plus pathname, so match `GET /scorecard` and read `searchParams.get('days')`. Add `route.ts`, copying `quota/route.ts`'s GET: `foreignHost(request) ?? forwardToRoom(\`/scorecard${new URL(request.url).search}\`)`.
- [ ] **Step 4: Run it and see it pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(room): serve the agent scorecard`.

### Task 3: Scorecard panel and start-form hint

**Files:**
- Create: `app/room/scorecard-view.ts`, `app/room/scorecard-panel.tsx`
- Modify: `app/room/page.tsx` (render the panel where `limits-panel`/quota panels are shown), `app/room/room-parts.tsx` (the start form's coder pick), `app/room/room-types.ts` (the `Scorecard` type mirroring Task 1)
- Test: `tests/agent-room/scorecard-view.test.ts`

**Interfaces:**
- Consumes: `/api/room/scorecard` JSON (Task 2).
- Produces:
  - `scoreRows(card: Scorecard): { agent, name, tasks, firstTryText, checksText, stalls, reassignedAway, tokensPerPass }[]`;
  - `roleGrid(card): { role, cells: { agent, text }[] }[]`, where `text` is `"3 of 4 first try"` or `"not enough data"` under 3 tasks;
  - `coderHint(card, role: string | undefined, agent: string): string | null`, giving `"Claude: 5 of 6 frontend tasks passed first try"`; null under 3.

- [ ] **Step 1: Write the failing tests:**
  - `under three tasks the grid says not enough data`;
  - `the hint names the role and counts`;
  - `no hint without a role or with too few tasks`;
  - `rows list every agent that has any activity, in codex, claude, agy order`.
- [ ] **Step 2: Run them and see them fail.** Run `npx tsx --test tests/agent-room/scorecard-view.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the view functions, then the panel.**
  - The panel has a 7 / 30 / all switch, `scoreRows` as a table, `roleGrid`, and `weekly` lines.
  - It fetches once on open and when the switch changes, and uses the existing panel styles in `room.css` and the theme tokens.
  - Add the hint as small muted text under each coder choice in the start form. It uses the role picked for the session when the form has one; otherwise it is not shown.
- [ ] **Step 4: Run the tests and see them pass.** Same command. Expected: PASS. Also run `npx --no-install tsc --noEmit` and expect no errors.
- [ ] **Step 5: Check it live.** Run `npm run dev`, open `/room`, open Scorecard, and switch 7 → all. Expected: the rows show the real 37 sessions, and test sessions show small counts.
- [ ] **Step 6: Commit.** Message: `feat(room): scorecard panel and coder hint`.

### Task 4: Weekly push

**Files:**
- Modify: `scripts/agent-room/scorecard.mjs`, `scripts/agent-room/server.mjs` (beside `queueTimer`, around line 430)
- Test: `tests/agent-room/scorecard.test.mjs`

**Interfaces:**
- Consumes: `phonePush(notify, text, fetchImpl)` from `notify.mjs`, and `scorecard`.
- Produces: `weeklyDue(dataDir, now: Date): string | null` gives the ISO week key (`2026-W44`) when it is Monday 09:00 local or later in that week and `<data>/scorecard/<key>.json` does not exist; otherwise null. `markWeekly(dataDir, key, lines)` writes that file.

- [ ] **Step 1: Write the failing tests:**
  - `weekly is due from Monday 9:00 local once per week`: Monday 08:59 gives null; 09:00 gives the key; after `markWeekly` it gives null; Wednesday of the same week, unmarked, gives the key.
  - `weekly is not sent without notify`: the server timer skips when `settings.notify?.ntfy` is falsy. Test this through a stub `fetchImpl` that records no call.
- [ ] **Step 2: Run them and see them fail.** Run `node --no-warnings --test tests/agent-room/scorecard.test.mjs`. Expected: the new tests fail.
- [ ] **Step 3: Implement.** Add a 10-minute `setInterval(...).unref()`. When `weeklyDue` returns a key and notify is set, send `phonePush(settings.notify, ['Agent scorecard, last 7 days:', ...weekly].join('\n'))` and call `markWeekly`. Clear the timer in `close()` like `queueTimer`.
- [ ] **Step 4: Run them and see them pass.** Run `node --no-warnings --test tests/agent-room/*.test.mjs`. Expected: all pass.
- [ ] **Step 5: Docs and commit.**
  - Add a Scorecard paragraph to `README.md` (Agent Room section).
  - Add an "Agent scorecard" row to `docs/ROADMAP.md`, M13 table: Done with the date.
  - Commit message: `feat(room): weekly scorecard push`.
