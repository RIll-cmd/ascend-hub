import assert from "node:assert/strict";
import test from "node:test";
import { agentMood, debateRounds, deckView, frameIntervalMs, freshPulses, latestSeq, lookTargets, messageLine, miniSlots, nearBottom, plateText, stepStates } from "../../app/room/deck/deck-view";
import type { DeckAgent, DeckView } from "../../app/room/deck/deck-view";
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

test("miniSlots: finished minis that already faded are not rebuilt; unknown ids are ignored", () => {
  const view = deckView(session({
    active: { agent: "claude", activity: "editing", since: "x", subagents: [
      { id: "a", label: "A", tool: null, status: "completed" }, { id: "b", label: "B", tool: null, status: "running" },
    ] },
  }), ready);
  assert.deepEqual(miniSlots(view, new Set()).map(s => `${s.key}:${s.index}:${s.done}`), ["claude:b:0:false", "claude:a:1:true"]);
  assert.deepEqual(miniSlots(view, new Set(["claude:a"])).map(s => s.key), ["claude:b"]);
});

test("freshPulses drops messages naming agents the deck does not know", () => {
  const msgs = [m(2, "codex", "x", { to: ["gpt" as never] }), m(3, "room", "y", { kind: "assign", by: "gpt" as never, to: ["claude"] }), m(4, "claude", "ok", { to: ["codex", "gpt" as never] })];
  assert.deepEqual(freshPulses(1, msgs), [{ seq: 4, from: "claude", to: ["codex"], kind: "message" }]);
});

test("nearBottom: only a reader already at the bottom gets auto-scrolled", () => {
  assert.equal(nearBottom({ scrollTop: 560, scrollHeight: 1000, clientHeight: 400 }), true);
  assert.equal(nearBottom({ scrollTop: 100, scrollHeight: 1000, clientHeight: 400 }), false);
});

test("lookTargets: everyone looks at the working agent, who looks at you", () => {
  assert.deepEqual(lookTargets(deckView(session(), ready)), { codex: 1, claude: 0, agy: -1 });
  const codexBusy = deckView(session({ active: { agent: "codex", activity: "planning", since: "x" } }), ready);
  assert.deepEqual(lookTargets(codexBusy), { codex: 0, claude: -1, agy: -1 });
  assert.deepEqual(lookTargets(deckView(session({ active: null }), ready)), { codex: 0, claude: 0, agy: 0 });
});

test("stepStates: earlier steps are done, the current one is marked, later ones wait", () => {
  assert.deepEqual(stepStates("build", "build").map(s => `${s.label}:${s.state}`),
    ["Discuss:done", "Roles:done", "Plan:done", "Build:current", "Finish:todo", "Done:todo"]);
  assert.deepEqual(stepStates("critique", "debate").map(s => `${s.label}:${s.state}`),
    ["Opening:done", "Critique:current", "Verdict:todo", "Done:todo"]);
  assert.deepEqual(stepStates("stopped", "build").at(-1), { label: "stopped", state: "current" });
});

test("the deck renders at 30 fps while moving and 8 fps idle, fast enough to show a 140 ms blink", () => {
  assert.equal(frameIntervalMs(true), 33);
  assert.equal(frameIntervalMs(false), 125);
  assert.ok(frameIntervalMs(false) < 140);
});

test("a mascot is stuck when its CLI is offline or its session paused, done when it finished, working on a turn", () => {
  const agent = (state: DeckAgent["state"], roles: string[] = ["coder"]) => ({ state, roles }) as DeckAgent;
  const view = (status: string) => ({ status }) as DeckView;
  assert.equal(agentMood(agent("offline", []), view("Idle")), "stuck");
  assert.equal(agentMood(agent("busy"), view("Paused")), "working");
  assert.equal(agentMood(agent("idle"), view("Paused")), "stuck");
  assert.equal(agentMood(agent("idle", []), view("Paused")), "idle", "an agent outside the session is not stuck by it");
  assert.equal(agentMood(agent("idle"), view("Done")), "done");
  assert.equal(agentMood(agent("checking"), view("Build in progress")), "idle");
});
