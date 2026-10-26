import assert from "node:assert/strict";
import test from "node:test";
import { graphicFor, nowCard, roomScene, spots } from "../../app/room/deck/room-scene";
import type { QueueView } from "../../app/room/queue-panel";
import type { PlanTask, SessionView } from "../../app/room/room-types";
import { AGENT_IDS } from "../../app/room/room-types";

const task = (id: number, patch: Partial<PlanTask> = {}): PlanTask =>
  ({ id, title: `Task ${id}`, assignee: "claude", description: "d", status: "pending", attempts: 0, commit: null, notes: "", ...patch });

function session(patch: Partial<SessionView> = {}): SessionView {
  return {
    id: "s1", mode: "build", project: "p", projectDir: "D:\\b\\p", task: "t", stage: "build",
    roles: { orchestrator: "codex", coders: ["claude"], reviewer: "agy" },
    plan: { tasks: [task(1, { status: "done", check: { ok: true, code: 0, ms: 1, output: "" } }), task(2, { status: "running" }), task(3)] },
    pause: null, active: { agent: "claude", activity: "editing", since: "2026-10-27T00:00:00Z", subagents: [] }, transcript: [],
    ...patch,
  } as SessionView;
}
const queue = (items: string[], schedules: { title: string; nextRun: string }[] = []): QueueView =>
  ({ items: items.map((title, i) => ({ id: String(i), title, source: "form", addedAt: "" })), failed: [], schedules: schedules.map((s, i) => ({ id: String(i), repeat: "daily", ...s })) });

test("no session or a terminal stage is idle", () => {
  assert.equal(roomScene(null, null).kind, "idle");
  for (const stage of ["done", "rejected", "stopped"] as const) assert.equal(roomScene(session({ stage }), null).kind, "idle");
});

test("a debate and a build's discuss, roles and roles gate are the panel", () => {
  assert.equal(roomScene(session({ mode: "debate", stage: "opening" as SessionView["stage"], judge: "claude" }), null).kind, "debate");
  for (const stage of ["discuss", "roles", "gate-roles"] as const) {
    const scene = roomScene(session({ stage }), null);
    assert.equal(scene.kind, "debate", stage);
    assert.equal(scene.judge, null);
  }
});

test("every other build stage is the workshop", () => {
  for (const stage of ["plan", "gate-plan", "build", "gate-race", "finish", "gate-result"] as const) assert.equal(roomScene(session({ stage }), null).kind, "coding", stage);
});

test("a waiting gate or an owner pause raises the flag; a self-retrying pause does not", () => {
  assert.deepEqual(roomScene(session({ stage: "gate-plan" }), null).gate, { line: "approve the plan" });
  assert.deepEqual(roomScene(session({ stage: "gate-roles" }), null).gate, { line: "approve the roles" });
  assert.deepEqual(roomScene(session({ stage: "gate-result" }), null).gate, { line: "review the result" });
  assert.deepEqual(roomScene(session({ pause: { reason: "r", at: "", kind: "rounds" } }), null).gate, { line: "paused · retry or stop" });
  assert.equal(roomScene(session({ pause: { reason: "r", at: "", kind: "rate-limit", retryAt: "2026-10-27T01:00:00Z" } }), null).gate, null);
  assert.deepEqual(roomScene(session({ pause: { reason: "r", at: "", kind: "rate-limit", retryAt: null } }), null).gate, { line: "paused · retry or stop" });
  assert.equal(roomScene(session(), null).gate, null);
});

test("checks: running wins, then the running task's own result", () => {
  assert.equal(roomScene(session({ checking: { label: "task 2", since: "" } }), null).check, "running");
  assert.equal(roomScene(session(), null).check, null, "task 1 passed, task 2 has not run");
  const failed = session({ plan: { tasks: [task(1, { status: "running", check: { ok: false, code: 1, ms: 1, output: "" } })] } });
  assert.equal(roomScene(failed, null).check, "fail");
  const passed = session({ plan: { tasks: [task(1, { status: "review", check: { ok: true, code: 0, ms: 1, output: "" } })] } });
  assert.equal(roomScene(passed, null).check, "pass");
});

test("the plan and the task strip follow the running task", () => {
  const scene = roomScene(session(), null);
  assert.deepEqual(scene.plan.map(t => t.status), ["done", "running", "pending"]);
  assert.equal(scene.task, "Task 2/3 · Claude coding · Antigravity assigned");
  const reviewing = roomScene(session({ plan: { tasks: [task(1, { status: "review" })] }, active: { agent: "agy", activity: "reviewing", since: "", subagents: [] } }), null);
  assert.equal(reviewing.task, "Task 1/1 · Claude done · Antigravity reviewing");
  assert.equal(roomScene(session({ roles: { orchestrator: "codex", coders: ["claude"], reviewer: null } }), null).task, "Task 2/3 · Claude coding");
});

test("the speaker is the debate's active agent; the judge is the session's judge", () => {
  const debate = (stage: string, agent: "codex" | "claude" | null) => session({ mode: "debate", stage: stage as SessionView["stage"], roles: null, plan: null, judge: "claude",
    active: agent ? { agent, activity: "x", since: "", subagents: [] } : null });
  const opening = roomScene(debate("opening", "codex"), null);
  assert.deepEqual([opening.phase, opening.speaker, opening.judge], ["opening", "codex", "claude"]);
  const verdict = roomScene(debate("verdict", "claude"), null);
  assert.deepEqual([verdict.phase, verdict.speaker, verdict.judge], ["verdict", "claude", "claude"]);
  assert.equal(roomScene(debate("critique", null), null).speaker, null);
});

test("queue: count and up next", () => {
  const two = roomScene(null, queue(["Add dark mode", "Fix login"]));
  assert.deepEqual([two.queued, two.upNext], [2, "Add dark mode"]);
  const scheduled = roomScene(null, queue([], [{ title: "Nightly review", nextRun: "2026-10-28T02:00:00Z" }]));
  assert.equal(scheduled.queued, 0);
  assert.match(scheduled.upNext ?? "", /^Nightly review · /);
  assert.equal(roomScene(null, queue([])).upNext, null);
  assert.equal(roomScene(null, null).queued, 0);
});

test("spots: idle desks stand clear of the bookcases", () => {
  for (const id of AGENT_IDS) assert.ok(spots(roomScene(null, null), [...AGENT_IDS])[id].desk[2] >= -1.6, id);
});

const distinct = (places: Record<string, { desk: [number, number, number] }>) => new Set(Object.values(places).map(p => p.desk.join(","))).size;

test("spots: one coder and no reviewer still places all three agents", () => {
  const scene = roomScene(session({ roles: { orchestrator: "codex", coders: ["claude"], reviewer: null } }), null);
  const places = spots(scene, [...AGENT_IDS]);
  assert.equal(Object.keys(places).length, 3);
  assert.equal(distinct(places), 3);
});

test("spots: two coders take the long side and the return", () => {
  const scene = roomScene(session({ roles: { orchestrator: "codex", coders: ["claude", "agy"], reviewer: null } }), null);
  assert.equal(distinct(spots(scene, [...AGENT_IDS])), 3);
});

test("spots: no roles yet (panel) still places everyone", () => {
  const scene = roomScene(session({ stage: "discuss", roles: null }), null);
  assert.equal(distinct(spots(scene, [...AGENT_IDS])), 3);
});

test("graphicFor follows the turn", () => {
  const coding = roomScene(session(), null);
  assert.equal(graphicFor("claude", "busy", coding), "code");
  assert.equal(graphicFor("agy", "idle", coding), null, "an assigned reviewer waiting shows its eye");
  assert.equal(graphicFor("agy", "busy", coding), "review");
  assert.equal(graphicFor("codex", "idle", coding), "plan", "the orchestrator keeps the plan up");
  const race = roomScene(session({ roles: { orchestrator: "codex", coders: ["claude", "agy"], reviewer: null } }), null);
  assert.deepEqual([graphicFor("claude", "busy", race), graphicFor("agy", "busy", race)], ["code", "code"], "racing coders both type");
  assert.equal(graphicFor("claude", "offline", coding), null, "an offline agent shows NO SIGNAL");
  const debate = roomScene(session({ mode: "debate", stage: "opening" as SessionView["stage"], roles: null, plan: null, judge: "claude", active: { agent: "codex", activity: "x", since: "", subagents: [] } }), null);
  assert.equal(graphicFor("codex", "busy", debate), "wave");
  assert.equal(graphicFor("agy", "idle", debate), null);
  assert.equal(graphicFor("codex", "idle", roomScene(null, null)), null);
});

test("the Now card shows the running task's own checks", () => {
  const card = nowCard(session());
  assert.equal(card?.task, "Task 2/3 · Task 2");
  assert.equal(card?.coder, "claude");
  assert.equal(card?.checks, "not run yet", "task 1 passed, but that is task 1's result");
  assert.equal(nowCard(session({ checking: { label: "task 2", since: "" } }))?.checks, "running");
  const failed = session({ plan: { tasks: [task(1, { status: "running", check: { ok: false, code: 1, ms: 1, output: "" } })] } });
  assert.equal(nowCard(failed)?.checks, "failed");
});

test("the reviewer is assigned until its turn starts", () => {
  assert.deepEqual(nowCard(session())?.reviewer, { agent: "agy", state: "assigned, waiting" });
  const reviewing = session({ active: { agent: "agy", activity: "reviewing", since: "", subagents: [] } });
  assert.deepEqual(nowCard(reviewing)?.reviewer, { agent: "agy", state: "reviewing" });
  assert.equal(nowCard(session({ roles: { orchestrator: "codex", coders: ["claude"], reviewer: null } }))?.reviewer, null);
});

test("no Now card outside coding", () => {
  assert.equal(nowCard(null), null);
  assert.equal(nowCard(session({ stage: "done" })), null);
  assert.equal(nowCard(session({ mode: "debate", stage: "opening" as SessionView["stage"], roles: null, plan: null })), null);
  assert.equal(nowCard(session({ stage: "gate-plan", plan: { tasks: [task(1), task(2)] } }))?.task, "Plan · 2 tasks", "at the plan gate there is no running task yet");
});
