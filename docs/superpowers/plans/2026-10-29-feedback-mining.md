# Owner Feedback Mining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save every piece of the owner's feedback the moment it is given (Vision speech or chat, Room notes, a Room box), group it monthly into themes, and turn a theme into a Room session in one click.

**Architecture:**
- The room process owns the store (`<data>/feedback/items.jsonl`) and reads the Room's own owner notes straight from session transcripts.
- A monthly report is one read-only agent turn whose JSON is checked against the real item ids, with an ungrouped fallback.
- Hub proxies the API and shows a Feedback panel.
- Vision captures "feedback: …" in its existing `local_intercept` hook and posts it to Hub, with a local outbox when Hub is down.

**Tech Stack:**
- Hub: Node ESM and `node:test`; React and `tsx --test`.
- Vision: Python 3 and pytest.

**Spec:** `docs/superpowers/specs/2026-10-29-feedback-mining-design.md` (in Hub)

## Global Constraints

- Sources are only `vision`, `room-box`, and Room notes read from transcripts. Never read Claude Code, Codex or any other conversation logs.
- Item text is 3 to 1,000 characters after trimming. Report themes: at most 12, each item in at most one theme, every `itemId` real.
- Room-note prefixes are exactly `Owner asked for changes to the`, `Owner note:`, and `Owner answered from the phone:`. The last one counts only when it carries a note in parentheses.
- The report agent is `settings.feedback.agent`, default `claude`, mode `read`.
- The Vision call is loopback only, through Hub (`agent_room.base_url`), with no proxy, like `RoomClient`.
- No new dependencies in either repo.
- Vision: do not add new keys to `config.yaml` (the desktop worktree rejects unknown keys).

## Review Focus

- **Hub down when the owner speaks:** Vision still says "Noted." and appends the item to `data/feedback_outbox.jsonl`. The next room-watcher poll that reaches Hub sends it once and removes it. Lines that fail to send stay in the outbox.
- **The agent's report names an item id that does not exist, or puts an item in two themes:** reject it, try once more, then save the report as `ungrouped`.
- **The same Room note read twice** (inbox and report): its id is `<sessionId>:<seq>`, so it shows once.
- **A status change for an unknown id:** 404 `FEEDBACK_NOT_FOUND`. A Room-note id is valid when that note exists.
- **"Feedback" said with nothing after it:** Vision answers "What's the feedback?" and saves nothing.

---

### Task 1: Feedback store and Room-note reader

**Files:**
- Create: `scripts/agent-room/feedback.mjs`
- Test: `tests/agent-room/feedback.test.mjs`

**Interfaces:**
- Consumes: `appendJsonLine`, `readJsonLines` (`store.mjs`); `readSessions(dataDir)` from `scorecard.mjs` if it is merged, otherwise add the same function here and export it.
- Produces:
  - `addItem(dataDir, { text, source }, now = Date.now()) -> Item`. A bad value throws `roomError('FEEDBACK_INVALID')`.
  - `roomNotes(sessions) -> Item[]` with `source: 'room-note'`, `id: '<session id>:<seq>'`, and `session: <id>`.
  - `allItems(dataDir, sessions) -> Item[]`: stored items plus Room notes, with the latest status line applied, newest first.
  - `setStatus(dataDir, sessions, id, status) -> Item`. `status` is `open`, `done` or `dismissed`; otherwise it throws `STATUS_INVALID`. An unknown id throws `FEEDBACK_NOT_FOUND`.
  - `Item = { id, at, source, text, status, session? }`. New ids are `f-<time base36>-<4 random hex>`.

- [ ] **Step 1: Write the failing tests:**
  - `items are saved with an id, time, source and open status`;
  - `text under 3 or over 1000 characters and unknown sources are refused`;
  - `room notes come from the three owner prefixes`: a transcript with `Owner note: too slow`, `Owner asked for changes to the plan: split task 2`, `Owner answered from the phone: revise (use tabs).`, `Owner answered from the phone: approve.`, and an agent line. Expect 3 items, with the texts after the prefix.
  - `the latest status line wins`;
  - `a status for an unknown id is refused`;
  - `a corrupt items line is skipped, not fatal`.
- [ ] **Step 2: Run them and see them fail.** Run `node --no-warnings --test tests/agent-room/feedback.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Status changes are appended as `{ id, status, at }` lines in the same `items.jsonl`. `allItems` folds them. Read lines one at a time with try/catch rather than through `readJsonLines`, which throws on a bad line.
- [ ] **Step 4: Run them and see them pass.** Same command. Expected: PASS.
- [ ] **Step 5: Pin the prefixes in `tests/agent-room/session-gates.test.mjs`.** Add `owner change requests keep the prefix feedback mining reads`: after a revise gate, the transcript has a room line starting `Owner asked for changes to the plan:`. Run `node --no-warnings --test tests/agent-room/session-gates.test.mjs`. Expected: PASS.
- [ ] **Step 6: Commit.** Message: `feat(room): feedback store and owner notes`.

### Task 2: Monthly report

**Files:**
- Modify: `scripts/agent-room/feedback.mjs`
- Test: `tests/agent-room/feedback.test.mjs`

**Interfaces:**
- Consumes: Task 1; `extractJsonBlock` (`parse.mjs`).
- Produces:
  - `reportPrompt(items) -> string`. It asks for only a json block `{ "themes": [{ "title", "area": "hub|room|vision|core|other", "tone": "complaint|request|praise", "itemIds": [], "suggestion" }] }`, gives the rules (at most 12 themes, every id from the list, each id at most once, the suggestion is one task sentence an agent could do), and lists the items as `id | date | source | text`.
  - `checkReport(value, items) -> { themes }`. It throws `REPORT_INVALID` with a reason.
  - `buildReport(dataDir, sessions, month: 'yyyy-mm', askAgent: (prompt) => Promise<string|null>) -> Report`. Report is `{ month, at, status: 'grouped'|'ungrouped'|'empty', themes, items }`, saved to `<data>/feedback/reports/<month>.json`.
  - `reportDue(dataDir, now: Date) -> 'yyyy-mm' | null`: last month when today is the 1st or later and its file is missing.
  - `listReports(dataDir) -> string[]`: newest first.

- [ ] **Step 1: Write the failing tests:**
  - `a grouped report keeps only real ids`. A fake `askAgent` returns a valid block. Expect `status === 'grouped'` and the file is written.
  - `an invented id is asked once more, then saved ungrouped`. `askAgent` returns a bad id twice. Expect 2 calls and `status === 'ungrouped'` with all items.
  - `an item in two themes is refused`.
  - `a month with no items is saved empty without asking`. Expect 0 calls.
  - `the report is due once for last month`: on 2026-11-01 expect `'2026-10'`; after the file exists expect null.
- [ ] **Step 2: Run them and see them fail.** Same command as Task 1. Expected: FAIL.
- [ ] **Step 3: Implement.** Items for a month are those whose `at` falls in that local month. On a second bad answer, or when `askAgent` returns null or throws, save `ungrouped`.
- [ ] **Step 4: Run them and see them pass.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(room): monthly feedback report`.

### Task 3: Room API, timer and Hub proxies

**Files:**
- Modify: `scripts/agent-room/server.mjs`
- Create: `app/api/room/feedback/route.ts`, `app/api/room/feedback/[id]/route.ts`, `app/api/room/feedback/report/route.ts`, `app/api/room/feedback/report/[month]/route.ts`
- Test: `tests/agent-room/server.test.mjs`, `tests/agent-room/room-proxy.test.ts` (only if it lists routes)

**Interfaces:**
- Consumes: Tasks 1–2; `buildInvocation`, `runTurn` (`agents.mjs`), the way `probeAgent` in `server.mjs` uses them; `settings.feedback?.agent ?? 'claude'`.
- Produces:
  - `GET /feedback` → `{ items: Item[] /* open only */, reports: string[] }`;
  - `POST /feedback { text, source }` → 201 `{ item }`;
  - `POST /feedback/<id> { status }` → 200 `{ item }`;
  - `POST /feedback/report` → 200 `{ report }` for the current month, rebuilt;
  - `GET /feedback/report/<yyyy-mm>` → `{ report }` or 404 `REPORT_NOT_FOUND`;
  - errors as 400 with `{ error: code }`.
  - Hub routes forward the same paths and bodies under `/api/room/feedback…`.

- [ ] **Step 1: Write the failing tests** in `server.test.mjs`:
  - `feedback can be added, listed and closed`;
  - `a report is built with the configured agent`, using the `fakeRunTurn` helper that answers a valid block;
  - `bad feedback text answers 400`.
- [ ] **Step 2: Run them and see them fail.** Run `node --no-warnings --test tests/agent-room/server.test.mjs`. Expected: the new tests fail with 404.
- [ ] **Step 3: Implement the routes.**
  - Use regexes like the existing `/sessions/<id>/…` ones.
  - `askAgent` writes `outFile` under `<data>/feedback/` and runs with `cwd` set to `<data>/feedback` and a 5-minute timeout.
  - Add a 1-hour `setInterval(...).unref()` that builds a due report when no session is running (`!busy()`). Clear it in `close()`.
  - Copy the Hub routes from `queue/route.ts` and `queue/remove/route.ts` (GET through `foreignHost`, POST through `readCommand`).
- [ ] **Step 4: Run them and see them pass.** Run `node --no-warnings --test tests/agent-room/*.test.mjs` and `npx --no-install tsc --noEmit`. Expected: all pass, no type errors.
- [ ] **Step 5: Commit.** Message: `feat(room): feedback API`.

### Task 4: Feedback panel

**Files:**
- Create: `app/room/feedback-panel.tsx`, `app/room/feedback-view.ts`
- Modify: `app/room/page.tsx` (render the panel; "Start a session" calls the existing `setTask` and opens the start form), `app/room/room-types.ts`
- Test: `tests/agent-room/feedback-view.test.ts`

**Interfaces:**
- Consumes: the Task 3 API.
- Produces:
  - `themeTask(theme, items): string`, which is `"<suggestion>\n\nFeedback:\n- <date> <text>"` for each item, cut to 4,000 characters;
  - `sourceLabel(source): 'Vision' | 'Room box' | 'Room note'`.

- [ ] **Step 1: Write the failing tests:**
  - `a theme becomes a task with its quotes`;
  - `the task is cut to 4000 characters`;
  - `sources have plain labels`.
- [ ] **Step 2: Run them and see them fail.** Run `npx tsx --test tests/agent-room/feedback-view.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the view, then the panel.**
  - The panel has a text box with an Add button, posting with source `room-box`.
  - It shows the open items with date, source and text, each with Done and Dismiss.
  - It shows the latest report's themes with count and tone, each with **Start a session**, plus a **Build report now** button.
  - Use existing panel styles and theme tokens.
- [ ] **Step 4: Run the tests and see them pass.** Same command, plus `npx --no-install tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Check it live.** Run `npm run dev` and open `/room`. Add "Test: the deck is too dark", then Build report now. Expected: an item and a report appear, and Start a session fills the start form.
- [ ] **Step 6: Commit.** Message: `feat(room): feedback panel`.

### Task 5: Vision capture and outbox (repo `D:\ascend-vision`, app `ascend-vision/`)

**Files:**
- Create: `ascend-vision/assistant/feedback_capture.py`
- Modify: `ascend-vision/integrations/agent_room.py` (`RoomClient.post_feedback`, `RoomWatcher` flush), `ascend-vision/main.py` (`local_intercept` handlers tuple, around line 795)
- Test: `ascend-vision/tests/test_feedback_capture.py`, `ascend-vision/tests/test_agent_room_client.py`

**Interfaces:**
- Produces:
  - `RoomClient.post_feedback(text: str) -> bool`: POSTs `{text, source: 'vision'}` to `/api/room/feedback`; True on 2xx.
  - `FeedbackCapture(client, outbox: Path)` with `intercept(text) -> str | None` and `flush() -> int` (number sent).
  - Phrase regex: `^\W*(?:(?:hey|ok|okay)\W+)?(?:vision\W+)?(?:note\s+(?:this\s+)?feedback|feedback|complaint)\b[\s:,.-]*(?P<text>.*)$` (case-insensitive).
  - Replies:
    - `"Noted."` when sent or stored;
    - `"What's the feedback?"` when the text is under 3 characters;
    - None when the phrase does not match.
  - `RoomWatcher(..., feedback=None)` calls `feedback.flush()` each poll when Hub answered.

- [ ] **Step 1: Write the failing tests** (`test_feedback_capture.py`, with a fake client):
  - `test_feedback_phrase_is_sent_and_acknowledged`: "Vision, feedback: the eye is too bright" sends "the eye is too bright" and returns "Noted.";
  - `test_other_speech_is_left_alone`;
  - `test_empty_feedback_asks_what_it_is`;
  - `test_hub_down_keeps_it_in_the_outbox_and_flush_sends_it_once`: the client fails, then succeeds; the outbox is empty after flush, with 1 sent;
  - `test_a_failed_flush_keeps_the_line`.
  - In `test_agent_room_client.py`: `test_post_feedback_posts_json_to_hub`, using that file's `FakeHub` HTTP server.
- [ ] **Step 2: Run them and see them fail.** From `ascend-vision/`, run `.\.venv\Scripts\python.exe -m pytest tests/test_feedback_capture.py tests/test_agent_room_client.py -q`. Expected: FAIL, ImportError.
- [ ] **Step 3: Implement.**
  - The outbox is JSON lines `{text, at}`. `flush` rewrites the file with the lines that failed, under a lock.
  - Wire it in `main.py`: build `FeedbackCapture(RoomClient(agent_room_config.base_url), Path(config.storage.database).parent / 'feedback_outbox.jsonl')` when `agent_room.enabled`.
  - Put it first in the `local_intercept` tuple after `away_mode`, and pass it to `RoomWatcher`.
- [ ] **Step 4: Run the tests and see them pass.** Run the same command, then `.\.venv\Scripts\python.exe -m pytest tests -q`. Expected: the new tests pass; the full run shows only the 12 known date-pinned failures (`test_activity_summary.py`, `test_dashboard_activity_history.py`, one in `test_intervention_delivery.py`).
- [ ] **Step 5: Docs and commit.**
  - Add a line to Vision `README.md` under the settings table: say "feedback: …" to save it to the Room.
  - Add a row to Hub `docs/ROADMAP.md`.
  - Commit each repo separately: `feat(vision): save spoken feedback to the room` and `docs: feedback mining done`.
