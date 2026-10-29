# Owner feedback mining — design

Date: 2026-10-29. Status: approved for planning (owner said "start"; the calls below are Claude's).

## Why

The owner's complaints and corrections are scattered and get lost. The handoff listed "Fairy UI feedback" as open, and on 2026-10-29 nobody could find what it was. Vision's chat tables are emptied as messages are handled, so nothing spoken is kept. Idea source: "voice of customer analysis" (pull feedback from every source into one place, tag it by topic and sentiment, a monthly report of what keeps coming up), with the owner as the customer.

## Goals

1. Every piece of feedback is saved with its date and source the moment it is given, and stays visible until the owner deals with it.
2. Sources:
   - Vision voice and Fairy chat: a sentence that starts with "feedback", "note feedback" or "complaint" (for example, "Vision, feedback: the Fairy eye is too bright at night");
   - the Room's own owner notes, read from session transcripts (gate change requests, owner notes, phone answers with a note);
   - a Feedback box in the Room page.
3. A monthly report, or one on request, that groups the items into themes, each with an area (hub, room, vision, core, other), a tone (complaint, request, praise), a count, the quotes, and a suggested task.
4. A theme becomes work in one click: **Start a session** opens the Room start form with the suggested task filled in. The owner picks the repo.

## Non-goals

- GitHub PR review comments (most PRs are agent-made; later if useful).
- Automatic fixing: the report suggests, the owner starts.

## Anti-goals

- Reading Claude Code or Codex conversation logs, or any other personal transcript. Only words the owner deliberately addressed to Ascend count.
- Losing an item because Hub was down when it was spoken.
- A report that invents feedback: every theme lists the item ids it came from, and items without a theme still show.

## Shape (Claude's calls)

- **Store:** the room process owns it, because Hub's route handlers cannot write to disk. `<data>/feedback/items.jsonl` holds `{ id, at, source: 'vision'|'room-box', text, status: 'open'|'done'|'dismissed' }`. Status changes are appended as `{ id, status, at }` lines; the latest one wins.
- **Room notes** are not copied. They are read from transcripts when the inbox or a report is built: lines from `room` that start with `Owner asked for changes to the`, `Owner note:` or `Owner answered from the phone:` with a note. Their id is `<session>:<seq>`. These prefixes are produced by `session.mjs`, so a test pins them.
- **API (room, proxied by Hub under `/api/room/feedback`):**
  - `GET /feedback`: the inbox (open items, newest first) and the list of reports;
  - `POST /feedback { text, source }`: text 3–1,000 characters; source is `vision` or `room-box`;
  - `POST /feedback/:id { status }`;
  - `POST /feedback/report`: builds the report for the current month now;
  - `GET /feedback/report/:month`.
- **Report:** one read-only headless turn by the agent named in `settings.feedback.agent` (default `claude`), in the room's data folder. It gets the month's items as JSON and must return `{ themes: [{ title, area, tone, itemIds, suggestion }] }`. The JSON is checked: ids must exist, at most 12 themes, and every item is in at most one theme. Saved as `<data>/feedback/reports/<yyyy-mm>.json`. If the agent fails, the report is saved as "ungrouped" with every item listed. On the 1st of each month the room builds last month's report once, if the room is running.
- **Room UI:** a **Feedback** panel with the box, the open inbox (mark done or dismiss) and the latest report's themes, each with **Start a session**.
- **Vision:**
  - `assistant/feedback_capture.py` matches the phrases;
  - it joins `local_intercept` in `main.py`, which `LocalConversation` already calls before the assistant for spoken chat and for typed Fairy and dashboard chat, so the item's source is `vision`;
  - Vision says "Noted." and posts to Hub through the same loopback client as gate answers;
  - if Hub is unreachable, the item is appended to `data/feedback_outbox.jsonl`, and the agent room watcher sends it on its next poll.

## Left to the builder

Panel layout, the exact capture phrases beyond the three above, and the report prompt wording.
