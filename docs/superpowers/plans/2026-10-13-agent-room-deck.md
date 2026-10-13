# Agent Room Command Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat Agent Room page with a 3D retro command deck (living CRTs, sub-agent minis, message pulses, delegation lines), an inspector side panel, a message ticker, a transcript drawer and a debate view, all driven by real room events.

**Architecture:** The room process adds routing fields (`seq`, `to`, `kind`, `by`, `sub`) to transcript messages. Hub turns session plus status into a plain `DeckView` (pure, tested), which feeds a plain-`three` scene (`createDeck`) and a flat fallback. The page becomes a top bar, a deck or debate stage on the left, an inspector column on the right and a transcript drawer.

**Tech Stack:** Node ESM room (`scripts/agent-room/`), React 19 client components, `three@^0.186` (already installed), plain global CSS (`app/room/room.css`), `node:test` via `node --test` (`.mjs`) and `npx --no-install tsx --test` (`.ts`).

**Spec:** `docs/superpowers/specs/2026-10-13-agent-room-deck-design.md` (behaviour baseline: `docs/superpowers/specs/2026-10-13-agent-room-design.md`).

## Global Constraints

- No new npm dependencies. Use `three` the way `components/RetroWallShelf.tsx` does.
- Agent colours: Codex `#e28a2b`, Claude `#d97757`, Antigravity `#3d7bff`. Retro chrome stays cream `#f3e6cf`, ink `#2b2118`, accent `#ffd27a`.
- Commit messages carry **no** `Co-Authored-By` or any Claude attribution line.
- Messages addressed to the owner have `to: []`. `seq` starts at 1 per session and continues after a restore.
- At most 8 pulses on screen and at most 4 mini CRTs per agent; extra sub-agents show as `+N`.
- Parallax tilt is at most ±3°. No tilt, and the flat fallback is used, under `prefers-reduced-motion: reduce`. The query `?deck=flat` forces the fallback.
- Every CC0 download is preceded by asking the owner, giving file name, source URL and size.
- New and changed files must pass eslint and `tsc --noEmit`. Lint rules in force include `react-hooks/set-state-in-effect`, `react-hooks/refs` and `react-hooks/purity`: no synchronous `setState` in effect bodies, no ref writes during render, no `Date.now()` during render.
- The room tests (`node --no-warnings --test --test-timeout=30000 tests/agent-room/*.test.mjs`) and Hub tests (`npx --no-install tsx --test tests/agent-room/*.test.ts`) stay green after every task.

## Review Focus

1. **Polls with an unchanged session (every 1.5 s).** The scene must not repaint screens, recreate meshes or replay pulses. Tests: `screenKey` deduplication (Task 3); the scene ignores already-spawned `seq` (Task 4, verified live in Task 9).
2. **Page reload or a new session mid-run.** No replay of old messages; `seq` restarting at 1 for a new session still animates. Test: `freshPulses` with `null` / a different session (Task 2).
3. **Many messages arriving at once** (for example after the room comes back online). Only the newest 8 pulses. Test: `freshPulses` cap (Task 2).
4. **WebGL unavailable or context lost.** The flat fallback renders and the page keeps working. Verified live with `?deck=flat` and by forcing `createDeck` to throw (Task 9).
5. **Leaving and re-entering `/room` repeatedly.** No leaked renderers or console errors. Live check in Task 9.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/agent-room/session.mjs` | Adds `seq`, `to`, `kind`, `by`, `sub` to recorded messages |
| `app/room/room-types.ts` | `Message` gains the new optional fields |
| `app/room/deck/deck-view.ts` | Pure: `AGENT_COLORS`, `deckView`, `plateText`, `messageLine`, `freshPulses`, `latestSeq`, `debateRounds` |
| `app/room/deck/pulses.ts` | Pure: `arcPoints`, `pulseProgress`, `easeInOut` |
| `app/room/deck/screen.ts` | Pure: `paintScreen`, `screenKey` (CRT screen canvas painter) |
| `app/room/deck/crt.ts` | `three`: one CRT (+ desk) mesh with a live screen texture |
| `app/room/deck/scene.ts` | `three`: `createDeck(canvas)`, covering room, CRTs, minis, pulses, delegation, parallax, picking, loop, dispose, optional props |
| `app/room/deck/DeckCanvas.tsx` | React wrapper: canvas, name plates, fallback switch |
| `app/room/deck/FlatDeck.tsx` | Flat fallback driven by the same `DeckView` |
| `app/room/room-frame.tsx` | `TopBar`, `Inspector`, `Ticker`, `TranscriptDrawer` |
| `app/room/debate-view.tsx` | `DebateView` (round tabs, three statement cards, judge row, verdict) |
| `app/room/room-parts.tsx` | `Transcript` shows sender → receivers; `Crt` card removed |
| `app/room/page.tsx` | New layout, with pulse tracking in `useRoom` |
| `app/room/room.css` | Layout, deck, plates, inspector, ticker, drawer, debate styles |
| `public/models/room/` | Optional CC0 props, `props.json` manifest, `LICENSE.txt` (Task 8) |
| `tests/agent-room/session-routing.test.mjs` | Room routing tests |
| `tests/agent-room/deck-view.test.ts`, `tests/agent-room/deck-draw.test.ts` | Hub pure-function tests |

Work on branch `claude/room-deck` (already created, holding the spec commit).

---

### Task 1: Room records who each message goes to

**Files:**
- Modify: `scripts/agent-room/session.mjs`
- Test: `tests/agent-room/session-routing.test.mjs`

**Interfaces:**
- Produces: messages `{ at, seq, from, text, to?, kind?, by?, sub? }`.
  - `to: AgentId[]`, where `[]` means the owner.
  - `kind: 'assign' | 'subagent'`.
  - `by`: the sending agent for room-written lines.
  - `sub`: the sub-agent id.
- `say(from, text, meta = {})`; `turn(agent, mode, prompt, activity, to = [])` where `to` is an array or `(text) => AgentId[]`; `jsonTurn(agent, prompt, activity, validate, to = [])`.

- [ ] **Step 1: Write the failing test**

```js
// tests/agent-room/session-routing.test.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const PLAN = { tasks: [{ title: 'API', assignee: 'claude', description: 'd' }] };
const agentMsgs = session => session.transcript.filter(m => m.from !== 'room');
const routes = session => agentMsgs(session).map(m => `${m.from}>${m.to.join(',') || 'owner'}`);

function setup(respond, settingsPatch = {}) {
  const { dataDir, buildsRoot } = tempRoom();
  return { dataDir, opts: { dataDir, settings: { ...testSettings(buildsRoot), ...settingsPatch }, runTurn: fakeRunTurn(respond) } };
}

const buildRespond = ({ stage, agent, prompt }) => {
  if (stage === 'plan') return { text: json(PLAN) };
  if (stage === 'build') return { text: 'built', files: { [`${agent}-${prompt.length}.txt`]: 'x' } };
  if (stage === 'review') return { text: json({ verdict: 'ok' }) };
  if (stage === 'finish') return { text: 'summary' };
  if (stage === 'discuss') return { text: `${agent} [READY]` };
  if (stage === 'roles') return { text: json({ orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' }) };
  throw new Error(stage);
};

test('build with a reviewer: plan to owner, assign line, coder to reviewer, review to coder, summary to owner', async () => {
  const { opts } = setup(buildRespond);
  const session = RoomSession.create(opts, { project: 'p', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' } });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.deepEqual(routes(session), ['codex>owner', 'claude>agy', 'agy>claude', 'codex>owner']);
  const assign = session.transcript.find(m => m.kind === 'assign');
  assert.deepEqual({ from: assign.from, by: assign.by, to: assign.to, text: assign.text },
    { from: 'room', by: 'codex', to: ['claude'], text: 'Task 1: API → Claude' });
});

test('build without a reviewer: the coder reports to the orchestrator', async () => {
  const { opts } = setup(buildRespond);
  const session = RoomSession.create(opts, { project: 'p', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.deepEqual(routes(session), ['codex>owner', 'claude>codex', 'codex>owner']);
});

test('discussion goes to the other two; the roles proposal goes to the owner', async () => {
  const { opts } = setup(buildRespond);
  const session = RoomSession.create(opts, { project: 'p', task: 't' });
  await session.kick();
  assert.deepEqual(routes(session), ['codex>claude,agy', 'claude>codex,agy', 'agy>codex,claude', 'codex>owner']);
});

test('a reassign decision is addressed to the new coder; a skip to the owner', async () => {
  for (const [decision, expected] of [[{ action: 'reassign', to: 'agy' }, 'codex>agy'], [{ action: 'skip' }, 'codex>owner']]) {
    const { opts } = setup(({ stage }) => {
      if (stage === 'plan') return { text: json(PLAN) };
      if (stage === 'build') return { text: 'nothing changed' };
      if (stage === 'reassign') return { text: json(decision) };
      if (stage === 'finish') return { text: 'summary' };
      throw new Error(stage);
    });
    const session = RoomSession.create(opts, { project: 'p', task: 't', roles: { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null } });
    await session.kick();
    await session.gate({ gate: 'plan', decision: 'approve' });
    const reassign = agentMsgs(session).find(m => m.text.includes('"action"'));
    assert.equal(`${reassign.from}>${reassign.to.join(',') || 'owner'}`, expected);
  }
});

test('debate: openings to the owner, critiques to the other two, the verdict to everyone', async () => {
  const { dataDir } = tempRoom();
  const folder = join(dataDir, '..', 'repo');
  mkdirSync(folder, { recursive: true });
  const { opts } = setup(({ agent, stage }) => ({ text: `${agent} ${stage}` }), { debateFolders: [folder], timeouts: { chat: 1000, build: 1000, debate: 1000 } });
  const session = RoomSession.create(opts, { mode: 'debate', question: 'q', folder, judge: 'claude' });
  await session.kick();
  assert.deepEqual(routes(session), [
    'codex>owner', 'claude>owner', 'agy>owner',
    'codex>claude,agy', 'claude>codex,agy', 'agy>codex,claude',
    'claude>codex,claude,agy',
  ]);
});

test('sub-agent lines name the agent and the sub-agent', async () => {
  const { opts } = setup(({ emit }) => {
    emit({ type: 'system', subtype: 'task_started', task_id: 't1', description: 'Look', subagent_type: 'Explore' });
    emit({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'completed' } });
    return { text: json(PLAN) };
  });
  const session = RoomSession.create(opts, { project: 'p', task: 't', roles: { orchestrator: 'claude', coders: ['claude'], reviewer: null } });
  await session.kick();
  const lines = session.transcript.filter(m => m.kind === 'subagent');
  assert.equal(lines.length, 2);
  assert.ok(lines.every(m => m.from === 'room' && m.by === 'claude' && m.sub === 't1' && m.to.length === 0));
});

test('seq numbers every message and continues after a restore', async () => {
  const { opts } = setup(buildRespond);
  const session = RoomSession.create(opts, { project: 'p', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  await session.kick();
  assert.deepEqual(session.transcript.map(m => m.seq), session.transcript.map((_, i) => i + 1));
  const restored = RoomSession.load({ settings: opts.settings, runTurn: opts.runTurn }, session.dir);
  restored.say('room', 'after restore');
  assert.equal(restored.transcript.at(-1).seq, session.transcript.length + 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --no-warnings --test --test-timeout=20000 tests/agent-room/session-routing.test.mjs`
Expected: FAIL. Messages have no `to`, so `m.to.join` throws `Cannot read properties of undefined`.

- [ ] **Step 3: Implement routing in `scripts/agent-room/session.mjs`**

Replace `say`:

```js
  // Every message gets a seq (for "what is new"); routing fields tell the deck where to draw it.
  say(from, text, { to, kind, by, sub } = {}) {
    const last = this.transcript.at(-1)?.seq ?? this.transcript.length;
    const message = { at: new Date().toISOString(), seq: last + 1, from, text };
    if (to !== undefined) message.to = to;
    if (kind) message.kind = kind;
    if (by) message.by = by;
    if (sub) message.sub = sub;
    this.transcript.push(message);
    appendJsonLine(join(this.dir, 'transcript.jsonl'), message);
  }
```

Add next to `subagentChoice` (top of the file):

```js
const others = agent => AGENT_IDS.filter(id => id !== agent);
```

In `turn`, change the signature to `async turn(agent, mode, prompt, activity, to = [])` and replace `this.say(agent, result.text);` with:

```js
        this.say(agent, result.text, { to: typeof to === 'function' ? to(result.text) : to });
```

In `jsonTurn`, change the signature to `async jsonTurn(agent, prompt, activity, validate, to = [])` and pass `to` as the fifth argument to **both** of its `this.turn(...)` calls.

Update the call sites:

```js
// discussStep
    const text = await this.turn(agent, 'read', this.prompt('discuss', agent), 'thinking', others(agent));
// rolesStep
    const roles = await this.jsonTurn('codex', this.prompt('roles', 'codex'), 'proposing roles', validateRoles, []);
// planStep
    const plan = await this.jsonTurn(roles.orchestrator, this.prompt('plan', roles.orchestrator), 'planning', v => validatePlan(v, roles.coders), []);
```

In `buildStep`, inside `if (task.status !== 'review') {`, directly after `rollback(state.projectDir);`:

```js
      this.say('room', `Task ${task.id}: ${task.title} → ${AGENT_NAMES[task.assignee]}`, { kind: 'assign', by: state.roles.orchestrator, to: [task.assignee] });
```

and change the coder turn to:

```js
      const text = await this.turn(task.assignee, 'edit', this.prompt('build', task.assignee, { task }), 'editing',
        state.roles.reviewer ? [state.roles.reviewer] : [state.roles.orchestrator]);
```

The review call gets `[task.assignee]` as its fifth argument:

```js
    const verdict = await this.jsonTurn(reviewer, this.prompt('review', reviewer, { task, diff: lastCommitDiff(state.projectDir) }), 'reviewing', validateVerdict, [task.assignee]);
```

In `taskFailed`, the reassign call:

```js
    const decision = await this.jsonTurn(roles.orchestrator, this.prompt('reassign', roles.orchestrator, { task, reason }), 'deciding',
      v => validateReassign(v, roles.coders, task.assignee),
      text => {
        const block = extractJsonBlock(text);
        return block.ok && block.value?.action === 'reassign' && roles.coders.includes(block.value.to) ? [block.value.to] : [];
      });
```

`finishStep`: `this.turn(orchestrator, 'read', this.prompt('finish', orchestrator), 'summarizing', [])`.

`debateStep`: `this.turn(agent, 'read', prompt, state.stage === 'opening' ? 'answering' : 'critiquing', state.stage === 'opening' ? [] : others(agent))`.

`verdictStep`: pass `[...AGENT_IDS]` as the fifth argument of its `this.turn(...)`.

In `onAgentEvent`, the two sub-agent lines:

```js
      this.say('room', `${AGENT_NAMES[agent]} started a sub-agent: ${sub.label}.`, { kind: 'subagent', by: agent, sub: sub.id, to: [] });
// ...
      this.say('room', `${AGENT_NAMES[agent]}'s sub-agent finished (${sub.status}): ${this.startLabels.get(sub.id) ?? item.label}.`, { kind: 'subagent', by: agent, sub: sub.id, to: [] });
```

- [ ] **Step 4: Run the tests**

Run: `node --no-warnings --test --test-timeout=20000 tests/agent-room/session-routing.test.mjs`
Expected: PASS, 7 tests

Run: `node --no-warnings --test --test-timeout=30000 tests/agent-room/*.test.mjs`
Expected: PASS, all (81)

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-room/session.mjs tests/agent-room/session-routing.test.mjs
git commit -m "feat(agent-room): record seq and who each message goes to"
```

---

### Task 2: Deck view model (pure)

**Files:**
- Modify: `app/room/room-types.ts` (`Message`)
- Create: `app/room/deck/deck-view.ts`
- Test: `tests/agent-room/deck-view.test.ts`

**Interfaces:**
- Consumes: the message fields from Task 1.
- Produces:
  - `AGENT_COLORS: Record<AgentId,string>`.
  - `type DeckAgent = { id; name; color; roles: string[]; state: 'offline'|'checking'|'idle'|'busy'; activity: string|null; since: string|null; subagents: {id,label,tool,status}[]; waiting: boolean; latest: Message|null; task: {id,title,status}|null }`.
  - `type DeckView = { sessionId: string|null; mode: 'build'|'debate'|null; status: string; agents: DeckAgent[]; delegation: {from,to}|null }`.
  - `type DeckPulse = { seq: number; from: AgentId; to: AgentId[] | 'owner'; kind: 'message'|'assign'|'subagent'; sub?: string }`.
  - Functions: `deckView(session, status): DeckView`, `plateText(agent): string`, `messageLine(m): { from: string; to: string; text: string }`, `latestSeq(messages): number`, `freshPulses(lastSeq: number|null, messages, max = 8): DeckPulse[]`, `debateRounds(session): DebateRounds`.

- [ ] **Step 1: Extend `Message` in `app/room/room-types.ts`**

Replace the `Message` line with:

```ts
export type Message = {
  at: string; from: AgentId | "room"; text: string;
  seq?: number; to?: AgentId[]; kind?: "assign" | "subagent"; by?: AgentId; sub?: string;
};
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/agent-room/deck-view.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { debateRounds, deckView, freshPulses, latestSeq, messageLine, plateText } from "../../app/room/deck/deck-view";
import type { Message, RoomStatus, SessionView } from "../../app/room/room-types";

const ready: RoomStatus = { online: true, agents: { codex: { state: "ready" }, claude: { state: "ready" }, agy: { state: "offline", detail: "x" } } };
const m = (seq: number, from: Message["from"], text: string, extra: Partial<Message> = {}): Message => ({ at: `2026-10-13T00:00:${String(seq).padStart(2, "0")}Z`, seq, from, text, ...extra });

function session(patch: Partial<SessionView> = {}): SessionView {
  return {
    id: "s1", mode: "build", project: "p", projectDir: "D:\\b\\p", task: "t", stage: "build",
    roles: { orchestrator: "codex", coders: ["claude"], reviewer: "agy" },
    plan: { tasks: [{ id: 1, title: "API", assignee: "claude", description: "d", status: "running", attempts: 0, commit: null, notes: "" }] },
    pause: null,
    active: { agent: "claude", activity: "editing", since: "2026-10-13T00:00:00Z", subagents: [{ id: "t1", label: "Reading a.txt", tool: "Read", status: "running" }] },
    transcript: [m(1, "codex", "plan", { to: [] }), m(2, "room", "Task 1: API → Claude", { kind: "assign", by: "codex", to: ["claude"] })],
    ...patch,
  };
}

test("deckView: states, roles, sub-agents, latest message, task and delegation", () => {
  const view = deckView(session(), ready);
  assert.equal(view.status, "Build in progress");
  assert.equal(view.sessionId, "s1");
  const [codex, claude, agy] = view.agents;
  assert.deepEqual([codex.state, claude.state, agy.state], ["idle", "busy", "offline"]);
  assert.deepEqual(codex.roles, ["orchestrator"]);
  assert.equal(claude.activity, "editing");
  assert.equal(claude.subagents.length, 1);
  assert.equal(codex.latest?.text, "plan");
  assert.deepEqual(claude.task, { id: 1, title: "API", status: "running" });
  assert.deepEqual(view.delegation, { from: "codex", to: "claude" });
  assert.equal(claude.color, "#d97757");
});

test("deckView: status text for gates, pause, debate, done and no session", () => {
  assert.equal(deckView(session({ stage: "gate-plan", active: null }), ready).status, "Waiting for you");
  assert.equal(deckView(session({ pause: { reason: "x", at: "a" } }), ready).status, "Paused");
  assert.equal(deckView(session({ mode: "debate", stage: "critique", roles: null, plan: null, judge: "claude" }), ready).status, "Debate in progress");
  assert.equal(deckView(session({ stage: "done", active: null }), ready).status, "Done");
  const idle = deckView(null, null);
  assert.equal(idle.status, "Idle");
  assert.ok(idle.agents.every(a => a.state === "checking"));
  assert.equal(idle.delegation, null);
});

test("deckView: debate shows a judge badge and no delegation", () => {
  const view = deckView(session({ mode: "debate", stage: "opening", roles: null, plan: null, judge: "agy", active: null }), ready);
  assert.deepEqual(view.agents.map(a => a.roles), [[], [], ["judge"]]);
  assert.equal(view.delegation, null);
});

test("plateText: activity plus sub-agent overflow", () => {
  const busy = deckView(session(), ready).agents[1];
  assert.equal(plateText(busy), "editing… · 1 sub-agent");
  const many = { ...busy, subagents: Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, label: "x", tool: null, status: "running" })) };
  assert.equal(plateText(many), "editing… · 6 sub-agents (+2)");
  assert.equal(plateText({ ...busy, state: "offline" }), "offline");
});

test("messageLine: sender, receivers and a one-line text", () => {
  assert.deepEqual(messageLine(m(1, "codex", "hello\nworld", { to: ["claude", "agy"] })), { from: "Codex", to: "Claude, Antigravity", text: "hello" });
  assert.deepEqual(messageLine(m(2, "room", "Task 1: API → Claude", { kind: "assign", by: "codex", to: ["claude"] })), { from: "Codex", to: "Claude", text: "Task 1: API → Claude" });
  assert.deepEqual(messageLine(m(3, "claude", "plan", { to: [] })), { from: "Claude", to: "you", text: "plan" });
  assert.deepEqual(messageLine(m(4, "room", "Paused: x")), { from: "Room", to: "", text: "Paused: x" });
  assert.equal(messageLine(m(5, "codex", "y".repeat(300))).text.length, 140);
});

test("freshPulses: nothing on first load, only new agent messages after, newest 8 at most", () => {
  const msgs = [m(1, "codex", "a", { to: ["claude", "agy"] }), m(2, "room", "Paused: x"), m(3, "room", "Task", { kind: "assign", by: "codex", to: ["claude"] }),
    m(4, "claude", "b", { to: [] }), m(5, "room", "sub", { kind: "subagent", by: "claude", sub: "t1", to: [] })];
  assert.deepEqual(freshPulses(null, msgs), []);
  assert.deepEqual(freshPulses(1, msgs), [
    { seq: 3, from: "codex", to: ["claude"], kind: "assign" },
    { seq: 4, from: "claude", to: "owner", kind: "message" },
    { seq: 5, from: "claude", to: "owner", kind: "subagent", sub: "t1" },
  ]);
  const flood = Array.from({ length: 30 }, (_, i) => m(i + 10, "codex", "x", { to: ["claude"] }));
  assert.deepEqual(freshPulses(9, flood).map(p => p.seq), [32, 33, 34, 35, 36, 37, 38, 39]);
  assert.equal(latestSeq(msgs), 5);
  assert.equal(latestSeq([]), 0);
});

test("debateRounds: openings, critiques, verdict and who is speaking", () => {
  const debate = session({
    mode: "debate", stage: "critique", roles: null, plan: null, judge: "claude", answer: null,
    active: { agent: "claude", activity: "critiquing", since: "x" },
    transcript: [m(1, "room", "Debate started"), m(2, "codex", "o1", { to: [] }), m(3, "claude", "o2", { to: [] }), m(4, "agy", "o3", { to: [] }),
      m(5, "codex", "c1", { to: ["claude", "agy"] })],
  });
  const rounds = debateRounds(debate);
  assert.equal(rounds.live, "critique");
  assert.equal(rounds.speaking, "claude");
  assert.equal(rounds.judge, "claude");
  assert.deepEqual(Object.fromEntries(Object.entries(rounds.opening).map(([k, v]) => [k, v?.text])), { codex: "o1", claude: "o2", agy: "o3" });
  assert.deepEqual(Object.keys(rounds.critique), ["codex"]);
  const done = debateRounds({ ...debate, stage: "done", active: null, answer: "## Where they agree\nall" });
  assert.equal(done.live, "done");
  assert.equal(done.verdict, "## Where they agree\nall");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx --no-install tsx --test tests/agent-room/deck-view.test.ts`
Expected: FAIL with `Cannot find module '../../app/room/deck/deck-view'`

- [ ] **Step 4: Write the implementation**

```ts
// app/room/deck/deck-view.ts
import { AGENT_IDS, AGENT_NAMES, TERMINAL_STAGES, rolesOf, type AgentId, type Message, type RoomStatus, type SessionView } from "../room-types";

export const AGENT_COLORS: Record<AgentId, string> = { codex: "#e28a2b", claude: "#d97757", agy: "#3d7bff" };
const GATE_STAGES = ["gate-roles", "gate-plan", "gate-result"];
export const MAX_MINIS = 4;

export type DeckSubagent = { id: string; label: string; tool: string | null; status: string };
export type DeckAgent = {
  id: AgentId; name: string; color: string; roles: string[];
  state: "offline" | "checking" | "idle" | "busy"; activity: string | null; since: string | null;
  subagents: DeckSubagent[]; waiting: boolean; latest: Message | null;
  task: { id: number; title: string; status: string } | null;
};
export type DeckView = { sessionId: string | null; mode: "build" | "debate" | null; status: string; agents: DeckAgent[]; delegation: { from: AgentId; to: AgentId } | null };
export type DeckPulse = { seq: number; from: AgentId; to: AgentId[] | "owner"; kind: "message" | "assign" | "subagent"; sub?: string };

function statusText(session: SessionView | null): string {
  if (!session) return "Idle";
  if (session.pause) return "Paused";
  if (GATE_STAGES.includes(session.stage)) return "Waiting for you";
  if (TERMINAL_STAGES.includes(session.stage)) return session.stage === "done" ? "Done" : session.stage === "rejected" ? "Rejected" : "Stopped";
  return session.mode === "debate" ? "Debate in progress" : "Build in progress";
}

export function deckView(session: SessionView | null, status: RoomStatus | null): DeckView {
  const mode = session ? session.mode ?? "build" : null;
  const tasks = session?.plan?.tasks ?? [];
  const current = mode === "build" ? tasks.find(t => t.status === "running" || t.status === "review") ?? null : null;
  const agents = AGENT_IDS.map((id): DeckAgent => {
    const availability = status?.agents[id]?.state;
    const active = session?.active?.agent === id ? session.active : null;
    const state = availability === "offline" ? "offline" : availability !== "ready" ? "checking" : active ? "busy" : "idle";
    const roles = mode === "debate" ? (session?.judge === id ? ["judge"] : []) : rolesOf(id, session?.roles ?? null);
    const latest = [...(session?.transcript ?? [])].reverse().find(m => m.from === id) ?? null;
    const task = current && current.assignee === id ? { id: current.id, title: current.title, status: current.status } : null;
    return {
      id, name: AGENT_NAMES[id], color: AGENT_COLORS[id], roles, state,
      activity: active?.activity ?? null, since: active?.since ?? null,
      subagents: active?.subagents ?? [], waiting: Boolean(active?.waiting), latest, task,
    };
  });
  const orchestrator = session?.roles?.orchestrator;
  const delegation = current && orchestrator && orchestrator !== current.assignee ? { from: orchestrator, to: current.assignee } : null;
  return { sessionId: session?.id ?? null, mode, status: statusText(session), agents, delegation };
}

export function plateText(agent: DeckAgent): string {
  if (agent.state === "offline") return "offline";
  if (agent.state === "checking") return "checking…";
  const base = agent.state === "busy" ? `${agent.activity ?? "working"}…` : "idle";
  const running = agent.subagents.filter(s => s.status === "running").length;
  if (!running) return agent.waiting ? `${base} · waiting on sub-agents` : base;
  const extra = running > MAX_MINIS ? ` (+${running - MAX_MINIS})` : "";
  return `${base} · ${running} sub-agent${running > 1 ? "s" : ""}${extra}`;
}

export function messageLine(m: Message): { from: string; to: string; text: string } {
  const sender = m.from === "room" ? (m.by ? AGENT_NAMES[m.by] : "Room") : AGENT_NAMES[m.from];
  const receivers = m.to === undefined ? "" : m.to.length ? m.to.map(id => AGENT_NAMES[id]).join(", ") : "you";
  return { from: sender, to: receivers, text: (m.text.split("\n")[0] ?? "").slice(0, 140) };
}

export function latestSeq(messages: Message[]): number {
  return messages.reduce((max, m) => Math.max(max, m.seq ?? 0), 0);
}

// lastSeq === null means "first look at this session": nothing replays.
export function freshPulses(lastSeq: number | null, messages: Message[], max = 8): DeckPulse[] {
  if (lastSeq === null) return [];
  const pulses: DeckPulse[] = [];
  for (const m of messages) {
    if (!m.seq || m.seq <= lastSeq || m.to === undefined) continue;
    const from = m.from === "room" ? m.by : m.from;
    if (!from) continue;
    const kind = m.kind === "assign" ? "assign" : m.kind === "subagent" ? "subagent" : "message";
    pulses.push({ seq: m.seq, from, to: m.to.length ? m.to : "owner", kind, ...(m.sub ? { sub: m.sub } : {}) });
  }
  return pulses.slice(-max);
}

export type DebateRound = "opening" | "critique" | "verdict";
export type DebateRounds = {
  opening: Partial<Record<AgentId, Message>>; critique: Partial<Record<AgentId, Message>>;
  verdict: string | null; live: DebateRound | "done"; speaking: AgentId | null; judge: AgentId;
};

export function debateRounds(session: SessionView): DebateRounds {
  const opening: Partial<Record<AgentId, Message>> = {};
  const critique: Partial<Record<AgentId, Message>> = {};
  for (const m of session.transcript) {
    if (m.from === "room") continue;
    if (!opening[m.from]) opening[m.from] = m;
    else if (!critique[m.from]) critique[m.from] = m;
  }
  const live = session.stage === "opening" || session.stage === "critique" || session.stage === "verdict" ? session.stage : "done";
  return { opening, critique, verdict: session.answer ?? null, live, speaking: session.active?.agent ?? null, judge: session.judge ?? "codex" };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx --no-install tsx --test tests/agent-room/deck-view.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 6: Commit**

```bash
git add app/room/room-types.ts app/room/deck/deck-view.ts tests/agent-room/deck-view.test.ts
git commit -m "feat(agent-room): deck view model from session and status"
```

---

### Task 3: Pulse paths and the CRT screen painter (pure)

**Files:**
- Create: `app/room/deck/pulses.ts`
- Create: `app/room/deck/screen.ts`
- Test: `tests/agent-room/deck-draw.test.ts`

**Interfaces:**
- Produces:
  - `type Vec3 = [number, number, number]`.
  - `arcPoints(from: Vec3, to: Vec3, height: number, segments = 24): Vec3[]`.
  - `pulseProgress(startMs, nowMs, durationMs = 1200): number` (0..1).
  - `easeInOut(t): number`.
  - `type ScreenState = { name: string; color: string; state: DeckAgent['state']; activity: string|null; roles: string[]; mini?: boolean; label?: string; done?: boolean }`.
  - `type Ctx2D` (a subset of `CanvasRenderingContext2D`).
  - `paintScreen(ctx: Ctx2D, w: number, h: number, s: ScreenState): void`.
  - `screenKey(s: ScreenState): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/agent-room/deck-draw.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { arcPoints, easeInOut, pulseProgress } from "../../app/room/deck/pulses";
import { paintScreen, screenKey, type Ctx2D, type ScreenState } from "../../app/room/deck/screen";

function recorder() {
  const calls: { op: string; args: unknown[]; fillStyle?: unknown }[] = [];
  const ctx: Record<string, unknown> = { fillStyle: "", strokeStyle: "", font: "", textAlign: "left", globalAlpha: 1, lineWidth: 1 };
  for (const op of ["fillRect", "fillText", "beginPath", "arc", "fill", "stroke"]) {
    ctx[op] = (...args: unknown[]) => { calls.push({ op, args, fillStyle: ctx.fillStyle }); };
  }
  return { ctx: ctx as unknown as Ctx2D, calls, texts: () => calls.filter(c => c.op === "fillText").map(c => String(c.args[0])) };
}

const base: ScreenState = { name: "Claude", color: "#d97757", state: "busy", activity: "editing", roles: ["coder"] };

test("arcPoints: starts and ends at the endpoints and rises in the middle", () => {
  const pts = arcPoints([0, 1, 0], [4, 1, 0], 2, 4);
  assert.equal(pts.length, 5);
  assert.deepEqual(pts[0], [0, 1, 0]);
  assert.deepEqual(pts[4], [4, 1, 0]);
  assert.ok(pts[2][1] > 1.9, `mid height ${pts[2][1]}`);
});

test("pulseProgress and easing clamp to 0..1", () => {
  assert.equal(pulseProgress(1000, 900), 0);
  assert.equal(pulseProgress(1000, 1600), 0.5);
  assert.equal(pulseProgress(1000, 5000), 1);
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.equal(easeInOut(0.5), 0.5);
});

test("paintScreen: a busy agent shows its name, roles and activity in its colour", () => {
  const r = recorder();
  paintScreen(r.ctx, 256, 192, base);
  assert.ok(r.texts().includes("CLAUDE"));
  assert.ok(r.texts().includes("coder"));
  assert.ok(r.texts().includes("editing…"));
  assert.ok(r.calls.some(c => c.op === "fill" && c.fillStyle === "#d97757"), "pupil in agent colour");
});

test("paintScreen: offline shows static and NO SIGNAL; idle and checking show their word", () => {
  const off = recorder();
  paintScreen(off.ctx, 256, 192, { ...base, state: "offline" });
  assert.ok(off.texts().includes("NO SIGNAL"));
  assert.ok(off.calls.filter(c => c.op === "fillRect").length > 100, "static noise");
  const idle = recorder();
  paintScreen(idle.ctx, 256, 192, { ...base, state: "idle", activity: null });
  assert.ok(idle.texts().includes("idle"));
  const checking = recorder();
  paintScreen(checking.ctx, 256, 192, { ...base, state: "checking", activity: null });
  assert.ok(checking.texts().includes("checking…"));
});

test("paintScreen: a mini shows its label, then a tick when done", () => {
  const mini = recorder();
  paintScreen(mini.ctx, 128, 96, { ...base, mini: true, label: "Reading a.txt" });
  assert.ok(mini.texts().includes("Reading a.txt"));
  const done = recorder();
  paintScreen(done.ctx, 128, 96, { ...base, mini: true, label: "Reading a.txt", done: true });
  assert.ok(done.texts().includes("✓"));
});

test("screenKey only changes when what the screen shows changes", () => {
  assert.equal(screenKey(base), screenKey({ ...base }));
  assert.notEqual(screenKey(base), screenKey({ ...base, activity: "reviewing" }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx --no-install tsx --test tests/agent-room/deck-draw.test.ts`
Expected: FAIL with `Cannot find module '../../app/room/deck/pulses'`

- [ ] **Step 3: Write `pulses.ts`**

```ts
// app/room/deck/pulses.ts
export type Vec3 = [number, number, number];

// Quadratic Bézier from `from` to `to`, lifted by `height` at the middle.
export function arcPoints(from: Vec3, to: Vec3, height: number, segments = 24): Vec3[] {
  const control: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + height, (from[2] + to[2]) / 2];
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    return [0, 1, 2].map(k => a * from[k] + b * control[k] + c * to[k]) as Vec3;
  });
}

export function pulseProgress(startMs: number, nowMs: number, durationMs = 1200): number {
  return Math.min(1, Math.max(0, (nowMs - startMs) / durationMs));
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
```

- [ ] **Step 4: Write `screen.ts`**

```ts
// app/room/deck/screen.ts
import type { DeckAgent } from "./deck-view";

export type ScreenState = {
  name: string; color: string; state: DeckAgent["state"]; activity: string | null; roles: string[];
  mini?: boolean; label?: string; done?: boolean;
};
export type Ctx2D = Pick<CanvasRenderingContext2D,
  "fillRect" | "fillText" | "beginPath" | "arc" | "fill" | "stroke" | "fillStyle" | "strokeStyle" | "font" | "textAlign" | "globalAlpha" | "lineWidth">;

export const screenKey = (s: ScreenState) => JSON.stringify([s.name, s.color, s.state, s.activity, s.roles, s.mini, s.label, s.done]);

function stateWord(s: ScreenState): string {
  if (s.state === "busy") return `${s.activity ?? "working"}…`;
  if (s.state === "checking") return "checking…";
  return "idle";
}

// Draws one CRT screen: scanlines, the agent's eye, name, roles and state. Deterministic, so it is testable.
export function paintScreen(ctx: Ctx2D, w: number, h: number, s: ScreenState): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#0d0f0c";
  ctx.fillRect(0, 0, w, h);
  if (s.state === "offline") {
    let seed = 7;
    for (let i = 0; i < 420; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const v = 60 + (seed % 140);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(seed % w, (seed * 7) % h, 3, 2);
    }
    ctx.fillStyle = "#f3e6cf";
    ctx.font = `bold ${Math.round(h / 8)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("NO SIGNAL", w / 2, h / 2);
    return;
  }
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#ffffff";
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;
  const busy = s.state === "busy";
  const cx = w / 2;
  const cy = s.mini ? h * 0.42 : h * 0.48;
  const radius = (s.mini ? h * 0.22 : h * 0.2) * (busy ? 1.12 : 1);
  ctx.strokeStyle = s.color;
  ctx.lineWidth = Math.max(2, h / 48);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * (busy ? 0.55 : 0.4), 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#f3e6cf";
  if (s.mini) {
    ctx.font = `${Math.round(h / 8)}px monospace`;
    ctx.fillText(s.done ? "✓" : (s.label ?? "").slice(0, 18), cx, h * 0.86);
    if (s.done) ctx.fillText(s.label?.slice(0, 18) ?? "", cx, h * 0.97);
    return;
  }
  ctx.fillStyle = s.color;
  ctx.font = `bold ${Math.round(h / 10)}px monospace`;
  ctx.textAlign = "left";
  ctx.fillText(s.name.toUpperCase(), w * 0.06, h * 0.14);
  ctx.textAlign = "right";
  ctx.fillStyle = "#c9b79a";
  ctx.font = `${Math.round(h / 13)}px monospace`;
  ctx.fillText(s.roles.join(" · "), w * 0.94, h * 0.14);
  ctx.textAlign = "center";
  ctx.fillStyle = "#9fe8b0";
  ctx.font = `${Math.round(h / 10)}px monospace`;
  ctx.fillText(stateWord(s), cx, h * 0.9);
}
```

The test expects `"coder"` alone for `roles: ["coder"]`, which `join(" · ")` gives.

- [ ] **Step 5: Run the tests**

Run: `npx --no-install tsx --test tests/agent-room/deck-draw.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add app/room/deck/pulses.ts app/room/deck/screen.ts tests/agent-room/deck-draw.test.ts
git commit -m "feat(agent-room): pulse paths and CRT screen painter"
```

---

### Task 4: The 3D scene (CRT mesh and `createDeck`)

**Files:**
- Create: `app/room/deck/crt.ts`
- Create: `app/room/deck/scene.ts`

**Interfaces:**
- Consumes: `paintScreen`, `screenKey`, `ScreenState` (Task 3); `arcPoints`, `pulseProgress`, `easeInOut`, `Vec3` (Task 3); `DeckView`, `DeckPulse`, `MAX_MINIS` (Task 2).
- Produces:
  - `buildCrt(color, { scale = 1, withDesk = true }): Crt`, where `Crt = { group; setScreen(s); setGlow(level 0..1); dispose() }`.
  - `createDeck(canvas, { tilt = true, onLost } = {}): Deck`, where `Deck = { update(view, pulses); select(id|null); onSelect(cb); onFrame(cb(plates: PlatePosition[])); dispose() }` and `PlatePosition = { id: AgentId; x: number; y: number; visible: boolean }`.

These modules need WebGL, so they are verified by `tsc`, lint and the live checks in Tasks 6 and 9. Their pure parts are already tested.

- [ ] **Step 1: Write `crt.ts`**

```ts
// app/room/deck/crt.ts
import * as THREE from "three";
import { paintScreen, screenKey, type ScreenState } from "./screen";

export type Crt = { group: THREE.Group; setScreen(state: ScreenState): void; setGlow(level: number): void; dispose(): void };

const SCREEN = { w: 256, h: 192 };
export const SCREEN_Y = 1.19;

// A low-poly retro CRT (optionally on a desk) whose screen is a live canvas texture.
export function buildCrt(color: string, { scale = 1, withDesk = true } = {}): Crt {
  const group = new THREE.Group();
  const accent = new THREE.Color(color);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    geometries.push(geometry);
    if (!materials.includes(material)) materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  if (withDesk) {
    const wood = new THREE.MeshStandardMaterial({ color: "#7a5236", roughness: 0.85 });
    add(new THREE.BoxGeometry(1.7, 0.08, 1.05), wood, 0, 0.72, 0);
    for (const [x, z] of [[-0.75, -0.45], [0.75, -0.45], [-0.75, 0.45], [0.75, 0.45]]) add(new THREE.BoxGeometry(0.07, 0.72, 0.07), wood, x, 0.36, z);
  }
  const top = withDesk ? 0.76 : 0;
  add(new THREE.BoxGeometry(1.0, 0.82, 0.86), new THREE.MeshStandardMaterial({ color: "#d9c8a6", roughness: 0.6 }), 0, top + 0.41, -0.04);
  const bezel = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.15, roughness: 0.5 });
  add(new THREE.BoxGeometry(0.9, 0.72, 0.06), bezel, 0, top + 0.43, 0.4);

  const canvas = document.createElement("canvas");
  canvas.width = SCREEN.w;
  canvas.height = SCREEN.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screenGeometry = new THREE.PlaneGeometry(0.74, 0.56, 8, 6);
  const position = screenGeometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) / 0.37;
    const y = position.getY(i) / 0.28;
    position.setZ(i, 0.03 * (1 - 0.5 * x * x - 0.5 * y * y)); // a gentle CRT bulge
  }
  position.needsUpdate = true;
  add(screenGeometry, new THREE.MeshBasicMaterial({ map: texture }), 0, top + 0.43, 0.435);

  const light = new THREE.PointLight(accent, 0, 2.6);
  light.position.set(0, top + 0.5, 0.9);
  group.add(light);
  group.scale.setScalar(scale);

  let key = "";
  return {
    group,
    setScreen(state) {
      const next = screenKey(state);
      if (next === key) return;
      key = next;
      paintScreen(ctx, SCREEN.w, SCREEN.h, state);
      texture.needsUpdate = true;
    },
    setGlow(level) {
      light.intensity = level * 2.2;
      bezel.emissiveIntensity = 0.15 + level * 0.6;
    },
    dispose() {
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      texture.dispose();
    },
  };
}
```

- [ ] **Step 2: Write `scene.ts`**

```ts
// app/room/deck/scene.ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AGENT_IDS, type AgentId } from "../room-types";
import { buildCrt, SCREEN_Y, type Crt } from "./crt";
import { AGENT_COLORS, MAX_MINIS, type DeckPulse, type DeckView } from "./deck-view";
import { arcPoints, easeInOut, pulseProgress, type Vec3 } from "./pulses";

export type PlatePosition = { id: AgentId; x: number; y: number; visible: boolean };
export type Deck = {
  update(view: DeckView, pulses: DeckPulse[]): void;
  select(id: AgentId | null): void;
  onSelect(cb: (id: AgentId) => void): void;
  onFrame(cb: (plates: PlatePosition[]) => void): void;
  dispose(): void;
};
type Prop = { file: string; position: Vec3; rotationY?: number; scale?: number };

const SEATS: Record<AgentId, Vec3> = { codex: [-2.3, 0, 0.5], claude: [0, 0, -1.3], agy: [2.3, 0, 0.5] };
const MAX_PULSES = 8;
const TILT = (3 * Math.PI) / 180;

const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export function createDeck(canvas: HTMLCanvasElement, { tilt = true, onLost }: { tilt?: boolean; onLost?: () => void } = {}): Deck {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1a120c");
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 0.7, 0);
  const baseSpherical = new THREE.Spherical().setFromVector3(new THREE.Vector3(5.5, 6.2, 8.2).sub(target));
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => { disposables.push(item); return item; };
  const plane = (w: number, h: number, color: string) =>
    new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), keep(new THREE.MeshStandardMaterial({ color, roughness: 0.9 })));

  // Room
  const floor = plane(10, 8, "#6b4a32");
  floor.rotation.x = -Math.PI / 2;
  const back = plane(10, 4, "#e9d7b5");
  back.position.set(0, 2, -3.5);
  const left = plane(8, 4, "#dcc7a1");
  left.rotation.y = Math.PI / 2;
  left.position.set(-5, 2, 0.5);
  const rug = new THREE.Mesh(keep(new THREE.CircleGeometry(2.3, 48)), keep(new THREE.MeshStandardMaterial({ color: "#8a3b2e", roughness: 1 })));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.01;
  scene.add(floor, back, left, rug);
  scene.add(new THREE.AmbientLight("#fff1dc", 0.85));
  const sun = new THREE.DirectionalLight("#ffffff", 1.3);
  sun.position.set(-4, 8, 6);
  const lamp = new THREE.PointLight("#ffb46a", 1.2, 9);
  lamp.position.set(-3.5, 2.6, -2.5);
  scene.add(sun, lamp);

  // Agents
  const crts = {} as Record<AgentId, Crt>;
  const rings = {} as Record<AgentId, THREE.Mesh>;
  for (const id of AGENT_IDS) {
    const crt = buildCrt(AGENT_COLORS[id]);
    crt.group.position.set(...SEATS[id]);
    crt.group.lookAt(0, 0, 6);
    crt.group.traverse(object => { object.userData.agentId = id; });
    scene.add(crt.group);
    crts[id] = crt;
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(1.1, 1.16, 48)),
      keep(new THREE.MeshBasicMaterial({ color: AGENT_COLORS[id], transparent: true, opacity: 0.7, side: THREE.DoubleSide })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(SEATS[id][0], 0.02, SEATS[id][2]);
    ring.visible = false;
    scene.add(ring);
    rings[id] = ring;
  }
  const selection = new THREE.Mesh(keep(new THREE.RingGeometry(0.95, 1.05, 48)),
    keep(new THREE.MeshBasicMaterial({ color: "#ffd27a", side: THREE.DoubleSide })));
  selection.rotation.x = -Math.PI / 2;
  selection.visible = false;
  scene.add(selection);

  // Live state
  let view: DeckView | null = null;
  let sessionId: string | null | undefined; // undefined = no update yet
  let spawnedSeq = 0;
  const minis = new Map<string, { crt: Crt; agent: AgentId; leftAt: number | null }>();
  const pulses: { mesh: THREE.Mesh; points: Vec3[]; start: number; owner: boolean }[] = [];
  const pulseGeometry = keep(new THREE.SphereGeometry(0.07, 12, 12));
  let delegationLine: THREE.Line | null = null;
  let delegationKey = "";
  let selectCb: ((id: AgentId) => void) | null = null;
  let frameCb: ((plates: PlatePosition[]) => void) | null = null;
  let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0;
  let disposed = false;

  const miniSpot = (agent: AgentId, index: number): Vec3 => add3(SEATS[agent], [1.15, 0, 0.6 - index * 0.5]);
  const screenPoint = (agent: AgentId): Vec3 => add3(SEATS[agent], [0, SCREEN_Y, 0]);

  function spawnPulse(from: Vec3, to: Vec3, color: string, owner: boolean) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true });
    const mesh = new THREE.Mesh(pulseGeometry, material);
    scene.add(mesh);
    pulses.push({ mesh, points: arcPoints(from, to, owner ? 0.3 : 1.0), start: performance.now(), owner });
    while (pulses.length > MAX_PULSES) removePulse(0);
  }
  function removePulse(index: number) {
    const [pulse] = pulses.splice(index, 1);
    scene.remove(pulse.mesh);
    (pulse.mesh.material as THREE.Material).dispose();
  }

  function syncMinis(next: DeckView) {
    const wanted = new Set<string>();
    for (const agent of next.agents) {
      const running = agent.subagents.filter(s => s.status === "running").slice(0, MAX_MINIS);
      const shown = [...running, ...agent.subagents.filter(s => s.status !== "running")].slice(0, MAX_MINIS);
      shown.forEach((sub, index) => {
        const key = `${agent.id}:${sub.id}`;
        wanted.add(key);
        let mini = minis.get(key);
        if (!mini) {
          const crt = buildCrt(agent.color, { scale: 0.38, withDesk: false });
          crt.group.lookAt(0, 0, 6);
          scene.add(crt.group);
          mini = { crt, agent: agent.id, leftAt: null };
          minis.set(key, mini);
        }
        mini.crt.group.position.set(...miniSpot(agent.id, index));
        const done = sub.status !== "running";
        mini.crt.setScreen({ name: agent.name, color: agent.color, state: "busy", activity: null, roles: [], mini: true, label: sub.label, done });
        if (done && mini.leftAt === null) mini.leftAt = performance.now();
      });
    }
    for (const [key, mini] of minis) if (!wanted.has(key) && mini.leftAt === null) mini.leftAt = performance.now();
  }

  function syncDelegation(next: DeckView) {
    const key = next.delegation ? `${next.delegation.from}>${next.delegation.to}` : "";
    if (key === delegationKey) return;
    delegationKey = key;
    if (delegationLine) {
      scene.remove(delegationLine);
      delegationLine.geometry.dispose();
      (delegationLine.material as THREE.Material).dispose();
      delegationLine = null;
    }
    if (!next.delegation) return;
    const points = arcPoints(screenPoint(next.delegation.from), screenPoint(next.delegation.to), 0.9, 32).map(p => new THREE.Vector3(...p));
    delegationLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineDashedMaterial({ color: AGENT_COLORS[next.delegation.from], dashSize: 0.12, gapSize: 0.08 }));
    delegationLine.computeLineDistances();
    scene.add(delegationLine);
  }

  // Interaction
  const raycaster = new THREE.Raycaster();
  const onPointerDown = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(AGENT_IDS.map(id => crts[id].group), true)[0];
    const id = hit?.object.userData.agentId as AgentId | undefined;
    if (id) selectCb?.(id);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!tilt) return;
    const rect = canvas.getBoundingClientRect();
    targetYaw = (((event.clientX - rect.left) / rect.width) * 2 - 1) * TILT;
    targetPitch = (((event.clientY - rect.top) / rect.height) * 2 - 1) * TILT;
  };
  const onLostContext = (event: Event) => { event.preventDefault(); onLost?.(); };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("webglcontextlost", onLostContext);

  const resize = () => {
    const parent = canvas.parentElement;
    if (!parent) return;
    const { clientWidth: w, clientHeight: h } = parent;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  if (canvas.parentElement) observer.observe(canvas.parentElement);
  resize();

  // Loop: full rate while something moves, about 30 fps otherwise; rAF pauses in hidden tabs.
  let raf = 0;
  let lastRender = 0;
  const projected = new THREE.Vector3();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const busy = view?.agents.some(a => a.state === "busy") ?? false;
    const moving = pulses.length > 0 || [...minis.values()].some(m => m.leftAt !== null) || busy
      || Math.abs(yaw - targetYaw) > 1e-4 || Math.abs(pitch - targetPitch) > 1e-4;
    if (!moving && now - lastRender < 33) return;
    lastRender = now;
    yaw += (targetYaw - yaw) * 0.08;
    pitch += (targetPitch - pitch) * 0.08;
    const spherical = baseSpherical.clone();
    spherical.theta += yaw;
    spherical.phi = Math.min(Math.PI / 2.2, Math.max(0.3, spherical.phi + pitch));
    camera.position.setFromSpherical(spherical).add(target);
    camera.lookAt(target);
    for (const agent of view?.agents ?? []) {
      crts[agent.id].setGlow(agent.state === "busy" ? 0.55 + 0.45 * Math.sin(now / 320) : 0);
      rings[agent.id].visible = agent.waiting;
      rings[agent.id].rotation.z = now / 1500;
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pulse = pulses[i];
      const t = pulseProgress(pulse.start, now);
      const index = Math.min(pulse.points.length - 1, Math.floor(easeInOut(t) * (pulse.points.length - 1)));
      pulse.mesh.position.set(...pulse.points[index]);
      (pulse.mesh.material as THREE.MeshBasicMaterial).opacity = pulse.owner ? 1 - t : t > 0.85 ? (1 - t) / 0.15 : 1;
      if (t >= 1) removePulse(i);
    }
    for (const [key, mini] of minis) {
      if (mini.leftAt === null) continue;
      const t = pulseProgress(mini.leftAt, now, 1600);
      mini.crt.group.scale.setScalar(0.38 * (1 - Math.max(0, t - 0.6) / 0.4));
      if (t >= 1) {
        scene.remove(mini.crt.group);
        mini.crt.dispose();
        minis.delete(key);
      }
    }
    renderer.render(scene, camera);
    if (frameCb) {
      const { clientWidth: w, clientHeight: h } = canvas;
      frameCb(AGENT_IDS.map(id => {
        projected.set(...add3(SEATS[id], [0, 2.05, 0])).project(camera);
        return { id, x: ((projected.x + 1) / 2) * w, y: ((1 - projected.y) / 2) * h, visible: projected.z < 1 };
      }));
    }
  };
  raf = requestAnimationFrame(loop);

  // Optional CC0 props from public/models/room/props.json (Task 8); the room is complete without them.
  void (async () => {
    try {
      const response = await fetch("/models/room/props.json", { cache: "no-store" });
      if (!response.ok) return;
      const props = (await response.json()) as Prop[];
      const loader = new GLTFLoader();
      for (const prop of props) {
        const gltf = await loader.loadAsync(`/models/room/${prop.file}`);
        if (disposed) return;
        gltf.scene.position.set(...prop.position);
        gltf.scene.rotation.y = prop.rotationY ?? 0;
        gltf.scene.scale.setScalar(prop.scale ?? 1);
        gltf.scene.traverse(object => {
          if (object instanceof THREE.Mesh) {
            keep(object.geometry);
            (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => keep(m));
          }
        });
        scene.add(gltf.scene);
      }
    } catch {
      // Props are decoration only.
    }
  })();

  return {
    update(next, fresh) {
      // A fresh deck (remount) or a different session seeds the cursor: pulses already handed over never replay.
      if (next.sessionId !== sessionId) {
        sessionId = next.sessionId;
        spawnedSeq = Math.max(0, ...fresh.map(p => p.seq));
      }
      view = next;
      for (const agent of next.agents) {
        crts[agent.id].setScreen({ name: agent.name, color: agent.color, state: agent.state, activity: agent.activity, roles: agent.roles });
      }
      syncMinis(next);
      syncDelegation(next);
      for (const pulse of fresh) {
        if (pulse.seq <= spawnedSeq) continue;
        spawnedSeq = pulse.seq;
        const from = screenPoint(pulse.from);
        const color = AGENT_COLORS[pulse.from];
        if (pulse.kind === "subagent") {
          spawnPulse(from, add3(miniSpot(pulse.from, 0), [0, 0.3, 0]), color, false);
        } else if (pulse.to === "owner") {
          spawnPulse(from, add3(from, [0.6, 2.4, 1.2]), color, true);
        } else {
          for (const to of pulse.to) if (to !== pulse.from) spawnPulse(from, screenPoint(to), color, false);
        }
      }
    },
    select(id) {
      selection.visible = id !== null;
      if (id) selection.position.set(SEATS[id][0], 0.015, SEATS[id][2]);
    },
    onSelect(cb) { selectCb = cb; },
    onFrame(cb) { frameCb = cb; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("webglcontextlost", onLostContext);
      while (pulses.length) removePulse(0);
      for (const mini of minis.values()) mini.crt.dispose();
      minis.clear();
      AGENT_IDS.forEach(id => crts[id].dispose());
      if (delegationLine) {
        delegationLine.geometry.dispose();
        (delegationLine.material as THREE.Material).dispose();
      }
      disposables.forEach(item => item.dispose());
      renderer.dispose();
    },
  };
}
```

- [ ] **Step 3: Type check and lint**

Run: `npx --no-install tsc --noEmit`
Expected: no errors

Run: `npx --no-install eslint app/room/deck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/room/deck/crt.ts app/room/deck/scene.ts
git commit -m "feat(agent-room): 3D command deck scene with living CRTs, minis and pulses"
```

---

### Task 5: Deck canvas wrapper and flat fallback

**Files:**
- Create: `app/room/deck/DeckCanvas.tsx`
- Create: `app/room/deck/FlatDeck.tsx`

**Interfaces:**
- Consumes: `createDeck`, `Deck`, `PlatePosition` (Task 4); `DeckView`, `DeckPulse`, `plateText` (Task 2).
- Produces:
  - `<DeckCanvas view pulses selected onSelect />`, which renders the 3D deck, or `<FlatDeck>` when forced, under reduced motion, or on failure.
  - `<FlatDeck view selected onSelect />`.

- [ ] **Step 1: Write `FlatDeck.tsx`**

```tsx
// app/room/deck/FlatDeck.tsx
"use client";
import type { CSSProperties } from "react";
import type { AgentId } from "../room-types";
import { messageLine, plateText, type DeckView } from "./deck-view";

export function FlatDeck({ view, selected, onSelect }: { view: DeckView; selected: AgentId | null; onSelect: (id: AgentId) => void }) {
  return (
    <div className="agent-room-flatdeck">
      {view.agents.map(agent => {
        const latest = agent.latest ? messageLine(agent.latest) : null;
        return (
          <button key={agent.id} type="button" onClick={() => onSelect(agent.id)} aria-pressed={selected === agent.id}
            className={`agent-room-flatcrt${agent.state === "busy" ? " is-busy" : ""}${selected === agent.id ? " is-selected" : ""}`}
            style={{ "--crt-color": agent.color } as CSSProperties}>
            <b>{agent.name}</b>
            <span className="agent-room-badges">{agent.roles.map(role => <span key={role} className="agent-room-badge">{role}</span>)}</span>
            <span className="agent-room-crt-status">{plateText(agent)}</span>
            {latest && <small>{latest.to ? `→ ${latest.to}: ` : ""}{latest.text}</small>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write `DeckCanvas.tsx`**

```tsx
// app/room/deck/DeckCanvas.tsx
"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { AgentId } from "../room-types";
import { plateText, type DeckPulse, type DeckView } from "./deck-view";
import { FlatDeck } from "./FlatDeck";
import { createDeck, type Deck } from "./scene";

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribe = (onChange: () => void) => {
  const query = matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const forcedFlat = () => matchMedia(REDUCED).matches || new URLSearchParams(location.search).get("deck") === "flat";

export function DeckCanvas({ view, pulses, selected, onSelect }: {
  view: DeckView; pulses: DeckPulse[]; selected: AgentId | null; onSelect: (id: AgentId) => void;
}) {
  const flat = useSyncExternalStore(subscribe, forcedFlat, () => false);
  const [failed, setFailed] = useState(false);
  const deckRef = useRef<Deck | null>(null);
  const plates = useRef<Partial<Record<AgentId, HTMLButtonElement | null>>>({});
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; });

  // A ref callback, not an effect: the deck lives exactly as long as the canvas element.
  const attach = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    let deck: Deck;
    try {
      deck = createDeck(canvas, { onLost: () => setFailed(true) });
    } catch {
      setFailed(true);
      return;
    }
    deck.onSelect(id => onSelectRef.current(id));
    deck.onFrame(positions => {
      for (const p of positions) {
        const plate = plates.current[p.id];
        if (!plate) continue;
        plate.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
        plate.style.visibility = p.visible ? "visible" : "hidden";
      }
    });
    deckRef.current = deck;
    return () => { deck.dispose(); deckRef.current = null; };
  }, []);

  useEffect(() => { deckRef.current?.update(view, pulses); }, [view, pulses]);
  useEffect(() => { deckRef.current?.select(selected); }, [selected]);

  if (flat || failed) return <FlatDeck view={view} selected={selected} onSelect={onSelect} />;
  return (
    <div className="agent-room-deck">
      <canvas ref={attach} className="agent-room-deck-canvas" aria-hidden="true" />
      {view.agents.map(agent => (
        <button key={agent.id} type="button" ref={el => { plates.current[agent.id] = el; }}
          className={`agent-room-plate${selected === agent.id ? " is-selected" : ""}`}
          style={{ "--plate": agent.color } as CSSProperties} onClick={() => onSelect(agent.id)} aria-pressed={selected === agent.id}>
          <b>{agent.name}</b>
          <span>{plateText(agent)}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Type check and lint**

Run: `npx --no-install tsc --noEmit` → no errors.
Run: `npx --no-install eslint app/room/deck` → no errors. If `react-hooks/refs` flags the plate `ref` callback or the `onSelectRef` write, record a ruling and adjust within the rule (both writes happen outside render).

- [ ] **Step 4: Commit**

```bash
git add app/room/deck/DeckCanvas.tsx app/room/deck/FlatDeck.tsx
git commit -m "feat(agent-room): deck canvas wrapper with name plates and flat fallback"
```

---

### Task 6: Page frame (top bar, inspector, ticker, drawer) and the new layout

**Files:**
- Create: `app/room/room-frame.tsx`
- Modify: `app/room/room-parts.tsx` (`Transcript` shows receivers; remove `Crt` and `SubagentLine`)
- Modify: `app/room/page.tsx` (layout and pulse tracking)
- Modify: `app/room/room.css`

**Interfaces:**
- Consumes: `deckView`, `freshPulses`, `latestSeq`, `messageLine`, `DeckAgent` (Task 2); `DeckCanvas` (Task 5); `StageSteps`, `GateBar`, `TaskBoard`, `VerdictPanel`, `BriefForm`, `Transcript` (existing).
- Produces:
  - `<TopBar session view running act />`.
  - `<Inspector agent session />`.
  - `<Ticker messages onOpen />`.
  - `<TranscriptDrawer open onClose messages />`.

- [ ] **Step 1: Update `Transcript` in `room-parts.tsx`**

Replace the `Transcript` function with the version below, and delete the `Crt` and `SubagentLine` functions (the deck replaces them). Add `import { messageLine } from "./deck/deck-view";`.

```tsx
export function Transcript({ messages }: { messages: Message[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [messages.length]);
  return (
    <div ref={ref} className="agent-room-log" role="log" aria-label="Transcript">
      {messages.map((m, i) => {
        const line = messageLine(m);
        return (
          <p key={`${m.seq ?? m.at}-${i}`} className={m.from === "room" ? "is-room" : undefined}>
            <b className={m.from === "room" ? undefined : `agent-room-name-${m.from}`}>{line.from}</b>
            {line.to && <span className="agent-room-to"> → {line.to}</span>}: {m.text}
          </p>
        );
      })}
    </div>
  );
}
```

Remove only the imports that become unused. `rolesOf` goes, but `Availability` stays because `BriefForm` uses it. Run `npx --no-install eslint app/room/room-parts.tsx` and fix any unused-import warnings it reports.

- [ ] **Step 2: Write `room-frame.tsx`**

```tsx
// app/room/room-frame.tsx
"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { messageLine, type DeckAgent, type DeckView } from "./deck/deck-view";
import { StageSteps, Transcript, type Act } from "./room-parts";
import { AGENT_IDS, AGENT_NAMES, type AgentId, type Message, type SessionView } from "./room-types";

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");

export function TopBar({ session, view, running, act }: { session: SessionView | null; view: DeckView; running: boolean; act: Act }) {
  return (
    <header className="agent-room-bar">
      <Link href="/" className="agent-room-back">◂ Shelf</Link>
      <span className="agent-room-title">AGENT ROOM{session ? ` · ${session.project}` : ""}</span>
      {session && <StageSteps stage={session.stage} paused={Boolean(session.pause)} mode={session.mode} />}
      <span className="agent-room-status"><i aria-hidden="true" />{view.status}</span>
      {running && <button className="agent-room-stop" onClick={() => act("/api/room/sessions/current/stop")}>Stop</button>}
    </header>
  );
}

export function Inspector({ agent, session }: { agent: DeckAgent | null; session: SessionView }) {
  if (!agent) return <section className="agent-room-inspector"><p>Select an agent to inspect its work.</p></section>;
  const latest = agent.latest ? messageLine(agent.latest) : null;
  return (
    <section className="agent-room-inspector" aria-label={`${agent.name} details`} style={{ borderColor: agent.color }}>
      <h2><span className="agent-room-swatch" style={{ background: agent.color }} />{agent.name}</h2>
      <p className="agent-room-badges">{agent.roles.map(role => <span key={role} className="agent-room-badge">{role}</span>)}</p>
      <h3>Current activity</h3>
      <p>{agent.state === "busy" ? `${agent.activity}… since ${clock(agent.since)}` : agent.state}</p>
      {agent.task && <p>Task {agent.task.id}: {agent.task.title} ({agent.task.status})</p>}
      {(agent.subagents.length > 0 || agent.waiting) && (
        <>
          <h3>Sub-agents</h3>
          {agent.waiting && agent.subagents.length === 0 && <p>Waiting on sub-agents…</p>}
          <ul>{agent.subagents.map(s => <li key={s.id}>↳ {s.label}{s.tool ? ` · ${s.tool}` : ""} <small>({s.status})</small></li>)}</ul>
        </>
      )}
      {latest && (
        <>
          <h3>Latest message</h3>
          <blockquote>{agent.latest?.text.slice(0, 600)}</blockquote>
          {latest.to && <p className="agent-room-sent">Sent to {latest.to}</p>}
        </>
      )}
      {session.mode !== "debate" && session.roles?.reviewer === agent.id && <p className="agent-room-hint">Reviews every task.</p>}
    </section>
  );
}

export function Ticker({ messages, onOpen }: { messages: Message[]; onOpen: () => void }) {
  const last = messages.at(-1);
  const line = last ? messageLine(last) : null;
  return (
    <div className="agent-room-ticker">
      <span aria-live="polite">{line ? <><b>{line.from}{line.to ? ` → ${line.to}` : ""}</b> · {line.text}</> : "No messages yet."}</span>
      <button type="button" onClick={onOpen}>Open transcript</button>
    </div>
  );
}

export function TranscriptDrawer({ open, onClose, messages }: { open: boolean; onClose: () => void; messages: Message[] }) {
  const [filter, setFilter] = useState<AgentId | "all">("all");
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button, select")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>("button, select, [tabindex='0']")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const shown = filter === "all" ? messages : messages.filter(m => m.from === filter || m.by === filter || m.to?.includes(filter));
  return (
    <div className="agent-room-drawer" role="dialog" aria-modal="true" aria-label="Transcript" ref={panel}>
      <div className="agent-room-drawer-bar">
        <b>Transcript</b>
        <select aria-label="Filter by agent" value={filter} onChange={e => setFilter(e.target.value as AgentId | "all")}>
          <option value="all">All agents</option>
          {AGENT_IDS.map(id => <option key={id} value={id}>{AGENT_NAMES[id]}</option>)}
        </select>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <Transcript messages={shown} />
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `page.tsx`**

```tsx
// app/room/page.tsx
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DebateView } from "./debate-view";
import { DeckCanvas } from "./deck/DeckCanvas";
import { deckView, freshPulses, latestSeq, type DeckPulse } from "./deck/deck-view";
import { Inspector, Ticker, TopBar, TranscriptDrawer } from "./room-frame";
import { BriefForm, GateBar, TaskBoard, VerdictPanel } from "./room-parts";
import { BOARD_STAGES, TERMINAL_STAGES, type AgentId, type RoomStatus, type SessionView } from "./room-types";

function useRoom() {
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [pulses, setPulses] = useState<DeckPulse[]>([]);
  const seen = useRef<{ id: string | null; seq: number | null }>({ id: null, seq: null });

  const refresh = useCallback(async () => {
    try {
      const [statusRes, sessionRes] = await Promise.all([
        fetch("/api/room", { cache: "no-store" }),
        fetch("/api/room/sessions/current", { cache: "no-store" }),
      ]);
      if (!statusRes.ok) {
        const data = await statusRes.json().catch(() => ({})) as { reason?: string };
        setOffline(data.reason ?? "The room process is not running.");
        return;
      }
      setOffline(null);
      setStatus(await statusRes.json() as RoomStatus);
      if (!sessionRes.ok) return;
      const next = (await sessionRes.json() as { session?: SessionView | null }).session ?? null;
      const messages = next?.transcript ?? [];
      // First sight of a session seeds the cursor, so a reload never replays old pulses.
      const lastSeq = next && seen.current.id === next.id ? seen.current.seq : null;
      const fresh = freshPulses(lastSeq, messages);
      seen.current = { id: next?.id ?? null, seq: latestSeq(messages) };
      // A new session clears the previous session's batch; otherwise only a non-empty batch replaces it.
      setPulses(prev => (fresh.length || (lastSeq === null && prev.length) ? fresh : prev));
      setSession(next);
    } catch {
      setOffline("Hub could not be reached.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      await refresh();
      if (alive) timer = setTimeout(tick, document.hidden ? 10_000 : 1_500);
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [refresh]);

  const send = useCallback(async (path: string, body?: unknown) => {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = await res.json().catch(() => ({})) as { message?: string; error?: string };
    await refresh();
    return res.ok ? null : String(data.message ?? data.error ?? `Request failed (${res.status})`);
  }, [refresh]);

  return { status, session, offline, pulses, send };
}

export default function RoomPage() {
  const { status, session, offline, pulses, send } = useRoom();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState<"debate" | "deck">("debate");
  const act = useCallback(async (path: string, body?: unknown) => setError(await send(path, body)), [send]);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const view = useMemo(() => deckView(session, status), [session, status]);
  const running = Boolean(session && !TERMINAL_STAGES.includes(session.stage));
  const debate = session?.mode === "debate";
  const focus = view.agents.find(a => a.id === (selected ?? session?.active?.agent)) ?? null;
  const showBoard = Boolean(session?.plan && BOARD_STAGES.includes(session.stage));
  const messages = session?.transcript ?? [];

  return (
    <main className="agent-room">
      <TopBar session={session} view={view} running={running} act={act} />
      {offline ? (
        <div className="agent-room-offline" role="status">
          <p>Room offline: {offline}</p>
          <p>It starts with <code>npm run dev</code>. To start it alone, run <code>node scripts/agent-room/server.mjs</code> in the Hub folder.</p>
        </div>
      ) : (
        <div className="agent-room-layout">
          <section className="agent-room-stage" aria-label="Room">
            {debate && (
              <div className="agent-room-tabs" role="tablist" aria-label="View">
                <button role="tab" aria-selected={tab === "debate"} onClick={() => setTab("debate")}>Debate</button>
                <button role="tab" aria-selected={tab === "deck"} onClick={() => setTab("deck")}>Deck</button>
              </div>
            )}
            {debate && tab === "debate" && session
              ? <DebateView session={session} />
              : <DeckCanvas view={view} pulses={pulses} selected={selected} onSelect={setSelected} />}
            <Ticker messages={messages} onOpen={() => setDrawer(true)} />
          </section>
          <aside className="agent-room-side">
            {session && <Inspector agent={focus} session={session} />}
            {session && <GateBar session={session} act={act} />}
            {session && <VerdictPanel session={session} />}
            {showBoard && session?.plan && <TaskBoard tasks={session.plan.tasks} />}
            {!running && <BriefForm agents={status?.agents} folders={status?.folders} act={act} />}
            {error && <p role="alert" className="agent-room-error">{error}</p>}
          </aside>
        </div>
      )}
      <TranscriptDrawer open={drawer} onClose={closeDrawer} messages={messages} />
    </main>
  );
}
```

Until Task 7 exists, create a stub `app/room/debate-view.tsx` so the page compiles. Task 7 replaces it:

```tsx
"use client";
import type { SessionView } from "./room-types";
export function DebateView({ session }: { session: SessionView }) {
  return <div className="agent-room-debate"><h2>{session.task}</h2></div>;
}
```

- [ ] **Step 4: Styles**

In `app/room/room.css`, **remove** these rules: `.agent-room-crts`, `.agent-room-crt`, `.agent-room-codex`/`-claude`/`-agy` (the `--crt-color` line), `.agent-room-crt.is-busy`, `@keyframes agent-room-glow`, `.agent-room-crt-status`, `.agent-room-crt-sub`, `.agent-room-body` and `.agent-room-body.has-board`. In the `@media (max-width: 720px)` and `prefers-reduced-motion` blocks, remove the lines that reference them.

Then append:

```css
.agent-room-bar { flex-wrap: wrap; }
.agent-room-title { font-weight: bold; }
.agent-room-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.agent-room-status i { width: 8px; height: 8px; border-radius: 50%; background: var(--room-accent); }
.agent-room-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; background: var(--room-paper); padding: 12px;
  border: 2px solid #000; border-top: 0; border-radius: 0 0 6px 6px; }
.agent-room-stage { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.agent-room-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.agent-room-deck { position: relative; height: clamp(360px, 62vh, 640px); border: 2px solid var(--room-ink); border-radius: 6px; overflow: hidden; background: #1a120c; }
.agent-room-deck-canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.agent-room-plate { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 8px;
  border: 2px solid var(--plate); border-radius: 4px; background: #141414e6; color: #f3e6cf; font: 11px ui-monospace, Consolas, monospace; cursor: pointer; white-space: nowrap; }
.agent-room-plate b { color: var(--plate); }
.agent-room-plate.is-selected { background: var(--plate); color: #141414; }
.agent-room-plate.is-selected b { color: #141414; }
.agent-room-flatdeck { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.agent-room-flatcrt { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 8px; border-radius: 14px; background: #141414; color: #e9e9e9;
  border: 3px solid var(--room-ink); box-shadow: inset 0 0 0 3px var(--crt-color); font: inherit; cursor: pointer; }
.agent-room-flatcrt.is-busy, .agent-room-flatcrt.is-selected { box-shadow: inset 0 0 0 3px var(--crt-color), 0 0 14px var(--crt-color); }
.agent-room-flatcrt small { color: #c9b79a; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-room-crt-status { font-size: 12px; color: #9fe8b0; }
.agent-room-ticker { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--room-ink); color: #ffd27a; padding: 6px 10px; border-radius: 4px; }
.agent-room-ticker span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-room-inspector { background: var(--room-card); border: 2px solid var(--room-ink); border-left-width: 6px; border-radius: 4px; padding: 10px; }
.agent-room-inspector h2 { display: flex; align-items: center; gap: 8px; font-size: 16px; margin: 0 0 4px; }
.agent-room-inspector h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #6b5a48; margin: 10px 0 4px; }
.agent-room-inspector p, .agent-room-inspector ul { margin: 0; }
.agent-room-inspector ul { padding-left: 0; list-style: none; }
.agent-room-inspector blockquote { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 180px; overflow-y: auto; }
.agent-room-swatch { width: 14px; height: 14px; border-radius: 3px; display: inline-block; }
.agent-room-sent { color: #b4532f; font-size: 12px; margin-top: 4px !important; }
.agent-room-to { color: #6b5a48; }
.agent-room-tabs { display: flex; gap: 6px; }
.agent-room-tabs [aria-selected="true"] { background: var(--room-ink); color: var(--room-paper); }
.agent-room-drawer { position: fixed; left: 16px; right: 16px; bottom: 0; max-height: 70vh; display: flex; flex-direction: column; gap: 8px; z-index: 50;
  background: var(--room-paper); border: 2px solid var(--room-ink); border-bottom: 0; border-radius: 8px 8px 0 0; padding: 10px; box-shadow: 0 -10px 30px #0008; }
.agent-room-drawer-bar { display: flex; align-items: center; gap: 8px; }
.agent-room-drawer-bar b { flex: 1; }
.agent-room-drawer .agent-room-log { max-height: none; flex: 1; }
@media (max-width: 900px) {
  .agent-room-layout { grid-template-columns: 1fr; }
  .agent-room-deck { height: 45vh; }
  .agent-room-flatdeck { grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: Type check, lint, tests, and a live smoke check**

Run: `npx --no-install tsc --noEmit` → no errors.
Run: `npx --no-install eslint app/room` → no errors.
Run: `npx --no-install tsx --test tests/agent-room/*.test.ts` → all pass.

Live: restart the dev server (preview `hub-dev`), open `http://localhost:5173/room`, and confirm:
- the 3D room renders with three CRTs and name plates;
- clicking a CRT or a plate selects it (selection ring, inspector shows it);
- `?deck=flat` shows the flat cards;
- there are no console errors.

- [ ] **Step 6: Commit**

```bash
git add app/room/room-frame.tsx app/room/room-parts.tsx app/room/page.tsx app/room/room.css app/room/debate-view.tsx
git commit -m "feat(agent-room): deck layout with inspector, ticker and transcript drawer"
```

---

### Task 7: Debate view

**Files:**
- Modify: `app/room/debate-view.tsx` (replace the stub)
- Modify: `app/room/room.css`

**Interfaces:**
- Consumes: `debateRounds`, `DebateRound`, `AGENT_COLORS`, `messageLine` (Task 2).
- Produces: `<DebateView session />`.

- [ ] **Step 1: Write the component**

```tsx
// app/room/debate-view.tsx
"use client";
import { useState, type CSSProperties } from "react";
import { AGENT_COLORS, debateRounds, messageLine, type DebateRound } from "./deck/deck-view";
import { AGENT_IDS, AGENT_NAMES, type SessionView } from "./room-types";

const ROUNDS: DebateRound[] = ["opening", "critique", "verdict"];
const LABEL: Record<DebateRound, string> = { opening: "Opening", critique: "Critique", verdict: "Verdict" };

function Verdict({ text }: { text: string }) {
  return (
    <div className="agent-room-debate-verdict">
      {text.split("\n").map((line, i) => (line.startsWith("## ") ? <h3 key={i}>{line.slice(3)}</h3> : <p key={i}>{line}</p>))}
    </div>
  );
}

export function DebateView({ session }: { session: SessionView }) {
  const rounds = debateRounds(session);
  const [picked, setPicked] = useState<DebateRound | null>(null);
  const live: DebateRound = rounds.live === "done" ? "verdict" : rounds.live;
  const round = picked ?? live;
  const judgeStatus = rounds.verdict ? "Verdict ready" : rounds.live === "verdict" ? "Writing verdict…" : "Listening";
  return (
    <div className="agent-room-debate">
      <header>
        <h2>{session.task}</h2>
        <span>Round {ROUNDS.indexOf(round) + 1} / 3 · {LABEL[round]}</span>
      </header>
      <div className="agent-room-tabs" role="tablist" aria-label="Debate round">
        {ROUNDS.map(r => (
          <button key={r} role="tab" aria-selected={round === r} onClick={() => setPicked(r === live ? null : r)}>{LABEL[r]}</button>
        ))}
        {picked && <button type="button" className="agent-room-live" onClick={() => setPicked(null)}>Back to live</button>}
      </div>
      {round === "verdict" ? (
        rounds.verdict ? <Verdict text={rounds.verdict} /> : <p className="agent-room-hint">The judge has not written the verdict yet.</p>
      ) : (
        <div className="agent-room-debate-cards">
          {AGENT_IDS.map(id => {
            const message = rounds[round][id];
            const speaking = rounds.speaking === id && rounds.live === round;
            const line = message ? messageLine(message) : null;
            return (
              <article key={id} className="agent-room-debate-card" style={{ "--crt-color": AGENT_COLORS[id] } as CSSProperties}>
                <header>
                  <span className="agent-room-swatch" style={{ background: AGENT_COLORS[id] }} />
                  <b>{AGENT_NAMES[id]}</b>
                  <small>{LABEL[round]}</small>
                  <em>{speaking ? "Speaking…" : message ? "" : "Waiting"}</em>
                </header>
                <div className="agent-room-debate-text">{message?.text ?? ""}</div>
                {message && (
                  <footer>
                    {line?.to && line.to !== "you" ? `→ ${line.to} · ` : ""}
                    {new Date(message.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {message.text.length} chars
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}
      <div className="agent-room-judge">
        <b>JUDGE · {AGENT_NAMES[rounds.judge]}</b> <span>{judgeStatus}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Styles**

Append to `app/room/room.css`:

```css
.agent-room-debate { display: flex; flex-direction: column; gap: 10px; background: var(--room-card); border: 2px solid var(--room-ink); border-radius: 6px; padding: 12px; min-height: 360px; }
.agent-room-debate > header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.agent-room-debate h2 { font: 22px/1.25 Georgia, "Times New Roman", serif; margin: 0; }
.agent-room-debate-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.agent-room-debate-card { display: flex; flex-direction: column; gap: 6px; border: 2px solid var(--room-ink); border-top: 6px solid var(--crt-color); border-radius: 4px; padding: 8px; background: #fffdf6; }
.agent-room-debate-card header { display: flex; align-items: center; gap: 6px; }
.agent-room-debate-card header em { margin-left: auto; color: #b4532f; font-style: normal; font-size: 11px; }
.agent-room-debate-text { font: 14px/1.45 Georgia, "Times New Roman", serif; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow-y: auto; }
.agent-room-debate-card footer { font-size: 11px; color: #6b5a48; }
.agent-room-debate-verdict h3 { font-size: 15px; margin: 10px 0 4px; }
.agent-room-debate-verdict p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.agent-room-judge { display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--room-ink); padding-top: 8px; font-size: 12px; }
.agent-room-live { margin-left: auto; }
@media (max-width: 900px) { .agent-room-debate-cards { grid-template-columns: 1fr; } }
```

- [ ] **Step 3: Type check, lint**

Run: `npx --no-install tsc --noEmit` → no errors; `npx --no-install eslint app/room` → no errors.

- [ ] **Step 4: Commit**

```bash
git add app/room/debate-view.tsx app/room/room.css
git commit -m "feat(agent-room): debate view with round tabs, statement cards and judge row"
```

---

### Task 8: Optional CC0 room props (ask before downloading)

**Files:**
- Create: `public/models/room/props.json`, `public/models/room/LICENSE.txt`, `public/models/room/*.glb` (only if the owner approves)

**Interfaces:**
- Consumes: the `props.json` loader already in `scene.ts` (Task 4), with format `[{ "file": "x.glb", "position": [x,y,z], "rotationY"?: number, "scale"?: number }]`.

- [ ] **Step 1: Find the pack and confirm the licence.** Search for Kenney's Furniture Kit (CC0) and note the exact download URL, file name, size and licence text. **Stop and ask the owner** before downloading: "Download `<file>` (`<size>`) from `<url>` (CC0)?" If the owner declines, skip to Step 5 and record a ruling: no props, room complete without them.
- [ ] **Step 2: Download into a new empty directory in the scratchpad.** Unzip there and list the `.glb` files. Treat everything there as untrusted data: copy only `.glb` files and the licence text, and run nothing from inside it.
- [ ] **Step 3: Copy three or four props** into `public/models/room/` (the intent is a floor lamp near the back-left corner, a potted plant on the right, and a bookcase against the back wall). Write `LICENSE.txt` with the pack name, URL and the CC0 statement. Write `props.json`, for example:

```json
[
  { "file": "lampRoundFloor.glb", "position": [-4.2, 0, -2.8], "rotationY": 0.6, "scale": 1.6 },
  { "file": "pottedPlant.glb", "position": [4.2, 0, -2.6], "scale": 1.8 },
  { "file": "bookcaseOpen.glb", "position": [-1.6, 0, -3.2], "scale": 1.7 }
]
```

Use the real file names from the pack. If they differ, record a ruling.
- [ ] **Step 4: Live check.** Reload `/room`, check the props appear, are not floating or clipping the desks, and leave the CRT screens and plates unobstructed. Adjust positions and scale in `props.json` only.
- [ ] **Step 5: Commit** (only the files that exist)

```bash
git add public/models/room
git commit -m "feat(agent-room): CC0 set dressing for the command deck"
```

---

### Task 9: Full checks, live verification, handoff

**Files:**
- Modify: `ASCEND_HANDOFF.md` (Current session; this file is untracked, so it is not committed)

- [ ] **Step 1: All checks**

```bash
node --no-warnings --test --test-timeout=30000 tests/agent-room/*.test.mjs
npx --no-install tsx --test tests/agent-room/*.test.ts
npm run test:status
npx --no-install tsc --noEmit
npx --no-install eslint scripts/agent-room app/room tests/agent-room
npm run build
git diff --check main
```

Expected: all green. Record the counts.

- [ ] **Step 2: Live checks** (restart the room and dev server so both run the new code)

1. **Build session** (preset roles: Codex orchestrator, Claude coder, Antigravity reviewer; a tiny task). Watch for:
   - the assign pulse and the dashed delegation line from Codex to Claude;
   - Claude's screen glowing "editing…";
   - the coder → reviewer pulse and the review → coder pulse;
   - the inspector following the active agent;
   - the ticker updating and the drawer listing "from → to".
2. **Reload mid-run:** no old pulses replay.
3. **Debate session** on `D:\ascend_hub`: the Debate tab follows the rounds, round tabs browse past rounds, the judge row changes status, the verdict renders and Download works. The Deck tab shows pulses to the other two during the critique.
4. **Sub-agents:** a Claude turn told to use a sub-agent shows a mini CRT that ticks and fades.
5. **Fallback:** with `?deck=flat`, the flat cards show the same states.
6. **Phone width:** resize the preview to the mobile preset. The deck is about 45vh, panels stack below, and nothing scrolls horizontally.
7. **Leave and re-enter:** go to `/` and back to `/room` five times. No console errors.

Stop the test sessions afterwards.

- [ ] **Step 3: Update the handoff** with the deck work, branch and commits, check results, live results and anything outstanding.

Do not push. Ask the owner about merging into `main`.
