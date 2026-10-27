import assert from "node:assert/strict";
import test from "node:test";
import { roomWindow } from "../../app/room/deck/room-window";
import type { PlanTask, RoomStatus, SessionView } from "../../app/room/room-types";

const ready: RoomStatus = { online: true, agents: { codex: { state: "ready" }, claude: { state: "ready" }, agy: { state: "ready" } } };
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
const moods = (w: ReturnType<typeof roomWindow>) => w.tvs.map(t => `${t.id}:${t.mood}`);

test("a room that is not running shows a closed window with three dark TVs", () => {
  const w = roomWindow(null, null, NOW);
  assert.deepEqual([w.bug, w.headline, w.sub], ["OFF", "ROOM CLOSED", "the room process is not running"]);
  assert.deepEqual(moods(w), ["codex:offline", "claude:offline", "agy:offline"]);
});

test("with no session the window is quiet and counts the ready agents", () => {
  assert.deepEqual(Object.values(pick(roomWindow(ready, null, NOW))), ["IDLE", "ALL QUIET", "3 of 3 agents ready"]);
  const oneOff = roomWindow({ ...ready, agents: { ...ready.agents, agy: { state: "offline" } } }, null, NOW);
  assert.equal(oneOff.sub, "2 of 3 agents ready");
  assert.deepEqual(moods(oneOff), ["codex:idle", "claude:idle", "agy:offline"]);
});

test("a coder at work leads the window with its TV's words", () => {
  const w = roomWindow(ready, session(), NOW);
  assert.deepEqual(Object.values(pick(w)), ["LIVE", "CLAUDE · CODING", "task 2/3 · Login form · 4m"]);
  assert.equal(w.banner, "#d97757");
  assert.deepEqual(w.tvs.find(t => t.id === "claude"), { id: "claude", color: "#d97757", mood: "working" });
});

test("a gate puts what you must do in the window", () => {
  const w = roomWindow(ready, session({ stage: "gate-plan", active: null }), NOW);
  assert.deepEqual(Object.values(pick(w)), ["WAIT", "CODEX · NEEDS YOU", "approve the plan"]);
  assert.equal(w.banner, "#ba7517");
  assert.equal(w.tvs.find(t => t.id === "codex")?.mood, "stuck");
});

function pick(w: ReturnType<typeof roomWindow>) {
  return { bug: w.bug, headline: w.headline, sub: w.sub };
}
