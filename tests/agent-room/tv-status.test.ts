import assert from "node:assert/strict";
import test from "node:test";
import { roomScene } from "../../app/room/deck/room-scene";
import { tvStatus, type TvAgent } from "../../app/room/deck/tv-status";
import type { PlanTask, SessionView } from "../../app/room/room-types";

const task = (id: number, patch: Partial<PlanTask> = {}): PlanTask =>
  ({ id, title: `Task ${id}`, assignee: "claude", description: "d", status: "pending", attempts: 0, commit: null, notes: "", ...patch });

function session(patch: Partial<SessionView> = {}): SessionView {
  return {
    id: "s1", mode: "build", project: "p", projectDir: "D:\\b\\p", task: "t", stage: "build",
    roles: { orchestrator: "codex", coders: ["claude"], reviewer: "agy" },
    plan: { tasks: [task(1, { status: "done" }), task(2, { status: "running", title: "Login form" }), task(3)] },
    pause: null, active: { agent: "claude", activity: "editing", since: "2026-10-27T10:00:00Z", subagents: [] }, transcript: [],
    ...patch,
  } as SessionView;
}
const NOW = Date.parse("2026-10-27T10:04:30Z");
const agent = (patch: Partial<TvAgent> = {}): TvAgent =>
  ({ id: "claude", name: "Claude", color: "#d97757", state: "busy", activity: "editing", since: "2026-10-27T10:00:00Z", roles: ["coder"], ...patch });

test("a coder at work is live: its task and how long", () => {
  const s = tvStatus(agent(), roomScene(session(), null), "code", NOW);
  assert.deepEqual([s.channel, s.bug, s.mood, s.headline, s.sub, s.banner], ["CH 01", "LIVE", "working", "CLAUDE · CODING", "task 2/3 · Login form · 4m", "#d97757"]);
});

test("a reviewer squints at the task under review", () => {
  const scene = roomScene(session({ plan: { tasks: [task(1, { status: "review" })] }, active: { agent: "agy", activity: "reviewing", since: "2026-10-27T10:04:00Z", subagents: [] } }), null);
  const s = tvStatus(agent({ id: "agy", name: "Antigravity", color: "#3d7bff", activity: "reviewing", since: "2026-10-27T10:04:00Z", roles: ["reviewer"] }), scene, "review", NOW);
  assert.deepEqual([s.channel, s.mood, s.headline, s.sub], ["CH 04", "reviewing", "ANTIGRAVITY · REVIEWING", "task 1/1 · Task 1 · now"]);
});

test("an idle agent sleeps and lists its roles", () => {
  const s = tvStatus(agent({ id: "agy", name: "Antigravity", state: "idle", activity: null, since: null, roles: ["reviewer"] }), roomScene(session(), null), null, NOW);
  assert.deepEqual([s.bug, s.mood, s.headline, s.sub, s.banner], ["IDLE", "idle", "ANTIGRAVITY · IDLE", "reviewer", "#5f5e5a"]);
  assert.equal(tvStatus(agent({ state: "idle", roles: [] }), roomScene(null, null), null, NOW).sub, "ready");
});

test("at a gate the orchestrator's TV says what you must do; the others stay as they are", () => {
  const scene = roomScene(session({ stage: "gate-plan", active: null }), null);
  const orchestrator = tvStatus(agent({ id: "codex", name: "Codex", state: "idle", roles: ["orchestrator"] }), scene, "plan", NOW);
  assert.deepEqual([orchestrator.bug, orchestrator.mood, orchestrator.headline, orchestrator.sub, orchestrator.banner], ["WAIT", "stuck", "CODEX · NEEDS YOU", "approve the plan", "#ba7517"]);
  assert.equal(tvStatus(agent({ state: "idle" }), scene, null, NOW).bug, "IDLE");
});

test("a gate with no roles yet asks on every TV", () => {
  const scene = roomScene(session({ stage: "gate-roles", roles: null, active: null }), null);
  assert.equal(tvStatus(agent({ state: "idle" }), scene, null, NOW).headline, "CLAUDE · NEEDS YOU");
});

test("the debate speaker is live in its phase; offline and checking say so", () => {
  const scene = roomScene(session({ mode: "debate", stage: "critique" as SessionView["stage"], roles: null, plan: null, judge: "codex" }), null);
  assert.deepEqual([tvStatus(agent(), scene, "wave", NOW).headline, tvStatus(agent(), scene, "wave", NOW).sub], ["CLAUDE · SPEAKING", "critique · 4m"]);
  const off = tvStatus(agent({ state: "offline" }), scene, null, NOW);
  assert.deepEqual([off.bug, off.mood, off.headline], ["OFF", "offline", "CLAUDE · OFFLINE"]);
  assert.equal(tvStatus(agent({ state: "checking" }), scene, null, NOW).headline, "CLAUDE · CHECKING");
});

test("a busy agent with no graphic shows its own activity", () => {
  const s = tvStatus(agent({ activity: "reading the repo", since: null }), roomScene(null, null), null, NOW);
  assert.deepEqual([s.headline, s.sub], ["CLAUDE · WORKING", "reading the repo"]);
});
