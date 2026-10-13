# Agent Room — command deck and debate view

Date: 2026-10-13. Status: draft for owner review. This builds on `2026-10-13-agent-room-design.md` (room, build mode, debate mode, sub-agents), which stays authoritative for behaviour. This spec changes only how the room is shown, plus the `to`/`kind` fields on messages.

## Purpose

Make the agents visible as a team. You see who is working, who delegated to whom, which sub-agents are running and where messages go. Debates read as a structured exchange rather than a log. The ChatGPT "Relay" concepts (command deck, relationships, decision room) are the reference for the behaviours. The look follows Hub's accepted retro room direction instead.

## Decisions

| Topic | Decision |
| --- | --- |
| Visual style | Hub's retro room (cream/brown, CRTs, agent colours: Codex `#e28a2b`, Claude `#d97757`, Antigravity `#3d7bff`), not the dark "Relay" look |
| Agents | **Living CRTs**: each agent is a CRT on a desk; its screen shows its state |
| Views (v1) | **Command deck** (3D overview) and **Debate view**. The agent graph is deferred |
| Rendering | Real 3D with plain `three` (already a dependency, as in `components/RetroWallShelf.tsx`). No new libraries |
| Models | CRTs, desks, floor and walls built in code. Optional CC0 props (lamp, plant, bookcase) for set dressing. Every download is asked for first |
| Page layout | Deck on the left, inspector on the right, message ticker under the deck, transcript as a drawer |
| Message routing | The room records `to` (and `kind`) on each message, so the deck draws real events and never guesses |

## 1. Data: who talks to whom

Transcript messages gain two optional fields: `to: AgentId[]` (an empty array or absent means "to the owner") and `kind: 'assign' | 'subagent'`. The room sets them when it records a message:

| Stage / event | `from` | `to` | `kind` |
| --- | --- | --- | --- |
| Discuss turn | speaker | the other two agents | — |
| Roles proposal, plan, finish summary | speaker | `[]` (owner) | — |
| Build task starts (new room line "Task N: <title> → <Agent>") | `room` | `[assignee]`, with `by: orchestrator` | `assign` |
| Build turn reply | coder | `[reviewer]`, or `[orchestrator]` if there is no reviewer | — |
| Review verdict | reviewer | `[assignee]` | — |
| Reassign decision | orchestrator | `[new assignee]` when reassigning, otherwise `[]` | — |
| Debate opening | speaker | `[]` | — |
| Debate critique | speaker | the other two agents | — |
| Verdict | judge | all three agents | — |
| Sub-agent started / finished room lines | `room` | `[]`, with `by: <agent>` and `sub: <sub-agent id>` | `subagent` |

`assign` and `subagent` lines keep `from: 'room'`, because the room writes them. The deck draws them from `by` to `to` (or to the sub-agent). Existing messages without these fields stay valid.

`GET /sessions/current` keeps its shape; messages simply carry the new fields.

The page animates only messages whose `at` is newer than the newest message it had already seen. A reload never replays old pulses.

## 2. Command deck (3D)

- **Room:** a warm low-poly room with a wooden floor, two cream/brown walls, a rug and lamp light. Three desks stand in an arc: Codex left, Claude back, Antigravity right. Optional CC0 props come from `public/models/room/`, with a `LICENSE.txt`; the room is complete without them.
- **Camera:** fixed and angled (isometric feel), with a parallax tilt of at most ±3° following the pointer. No orbit or free movement. The tilt is off under `prefers-reduced-motion`.
- **CRTs** (built in code):
  - **Body:** body, bezel in the agent colour, slightly curved screen.
  - **Screen:** a `CanvasTexture` showing a dark background with scanlines, the agent's eye glyph, role badges and a state word (`idle`, `thinking…`, `editing…`, `reviewing…`, `judging…`, `offline`). Offline shows static.
  - **Busy:** emissive glow plus a pulsing point light in the agent colour.
  - **Redraws:** the screen texture redraws only when that agent's displayed state changes.
- **Sub-agents:**
  - Mini CRTs pop in beside the parent's desk, up to 4, then a `+N` tag. Each mini screen shows its step label.
  - When a sub-agent finishes, its mini CRT shows a tick, then fades.
  - Codex `waiting` shows as a dotted ring around its CRT.
- **Messages:**
  - A glowing dot travels a curved path from sender to each receiver in about 1.2 s.
  - Messages to the owner float up and fade.
  - `assign` draws a dashed delegation line from the orchestrator to the coder, which stays while that task is `running` or in `review`.
  - At most 8 pulses are on screen; the oldest are dropped.
- **Labels and selection:** each CRT has an HTML name-plate button positioned over the canvas (projected each frame). Clicking a CRT (raycaster) or its plate selects the agent for the inspector.
- **Performance:**
  - The loop renders while anything animates, then drops to about 30 fps.
  - It pauses while the tab is hidden.
  - `dispose()` frees geometries, materials, textures and the renderer on unmount.
- **Modules** (`app/room/deck/`):
  - `scene.ts`: `createDeck(canvas)` returns `{ update(view), select(agentId | null), onSelect(cb), dispose() }`.
  - `crt.ts`: the CRT mesh and `paintScreen(ctx, screenState)`.
  - `pulses.ts`: `arcPoints(from, to, height)`, `pulseProgress(startMs, nowMs)`, `newMessages(prev, next)`.
  - `deck-view.ts`: `deckView(session, status)` builds the plain deck state used by both the 3D scene and the fallback.
  - `DeckCanvas.tsx`: the React wrapper, name plates, fallback and error boundary.

## 3. Page frame, inspector, ticker, drawer

- **Top bar:** "◂ Shelf", the session name, stage steps (build or debate set), a status dot with text ("Build in progress", "Waiting for you" at a gate, "Paused", "Done"), and Stop.
- **Inspector** (right column):
  - **Who it shows:** the selected agent; with nothing selected, it follows the active agent.
  - **What it shows:** name, role badges, current activity and elapsed time, its sub-agents (step and status), its latest message with "sent to …", and its assigned task in build mode.
  - **Docked below, depending on the stage:**
    - gate panels;
    - the pause panel;
    - the task board (build);
    - the verdict panel with Download (debate);
    - with no session running, the start form (build or debate, plus the sub-agent switch).
- **Ticker:** a strip under the deck with the newest message ("Codex → Claude · Task 3 …"). Clicking it, or *Open transcript*, opens the drawer. It is announced through `aria-live="polite"`.
- **Transcript drawer:** the full transcript with sender → receivers and a filter by agent. It keeps its open state and scroll position across polls, traps focus, and closes on Esc.
- **Room offline:** today's message, shown over the deck area.
- **Narrow screens:** the deck takes about 45% of the viewport height; the inspector and the other panels stack below.
- **Styling:** the existing global `app/room/room.css` with `agent-room-` class names, in Hub's retro chrome.

## 4. Debate view

During a debate session the main area has two tabs, **Debate** (the default) and **Deck**. The inspector stays.

- **Heading:** the question in serif type, with "Round n / 3 · Opening | Critique | Verdict".
- **Three statement cards** (stacked on phones), one per agent:
  - mini CRT face, name and the round role;
  - a `Speaking…` tag while it's that agent's turn, otherwise `Waiting`;
  - its statement for the selected round, with internal scrolling;
  - critique targets ("→ …");
  - a footnote with the time and length.
- **Judge row:** "JUDGE · <agent>", with the status Listening, then Writing verdict…, then Verdict ready.
- **Round tabs:** Opening | Critique | Verdict. They follow the live round, and clicking browses past rounds, with "Back to live".
- **Verdict tab:** the verdict full width, its three `##` headings rendered as headings and the rest as plain text, plus Download .md.

There is no "Next exchange" button; rounds advance when agents finish.

## 5. Fallback, assets, testing

- **Fallback:**
  - **When:** WebGL is unavailable, the scene throws, or `prefers-reduced-motion` is on.
  - **What:** a flat row of CRT cards (today's component), fed by the same `deckView`. It shows states, sub-agents and the latest message line as text.
  - **Guarantee:** nothing depends on the 3D scene.
- **CC0 assets:** I search for a CC0 furniture pack (Kenney first) and confirm the licence. Before any download I ask the owner, giving file name, source and size. Only the needed GLBs are copied, with a licence note.
- **Tests** (written first):
  - **Room:** `to`/`kind`/`by`/`sub` for every row of section 1, covering build with and without a reviewer, reassign, debate and sub-agents.
  - **Pure functions:** `deckView`, `paintScreen` (drawing calls against a stub 2D context), `arcPoints`/`pulseProgress`, and `newMessages` (no replay on reload).
  - **Hub:** `tsc`, lint and `npm run build`.
  - **Live:** one build and one debate with real agents, checked in the browser: pulses, delegation line, sub-agent minis, inspector, drawer, the debate tabs, the fallback (forced) and a phone-width layout.

## Out of scope

The agent graph view, free camera, Blender-made models, sound, and changes to room behaviour beyond the `to`/`kind`/`by`/`sub` fields.
