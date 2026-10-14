import assert from "node:assert/strict";
import test from "node:test";
import { workflowView } from "../../app/room/workflow-view";
import type { Message, SessionView } from "../../app/room/room-types";

const t = (s: number) => new Date(Date.UTC(2026, 9, 14, 8, 0, s)).toISOString();
const msg = (seq: number, s: number, from: Message["from"], text: string, extra: Partial<Message> = {}): Message => ({ seq, at: t(s), from, text, ...extra });

const session = {
  id: "s1", mode: "build", project: "app", projectDir: "D:/b/app", task: "t", stage: "build",
  roles: { orchestrator: "codex", coders: ["claude", "agy"], reviewer: "agy" },
  plan: { tasks: [
    { id: 1, title: "One", assignee: "claude", description: "", status: "done", attempts: 1, commit: "abc1234", notes: "" },
    { id: 2, title: "Two", assignee: "claude", description: "", status: "running", attempts: 0, commit: null, notes: "" },
    { id: 3, title: "Three", assignee: "agy", description: "", status: "pending", attempts: 0, commit: null, notes: "" },
  ] },
  pause: null, active: null,
  stageLog: [{ stage: "plan", at: t(0) }, { stage: "gate-plan", at: t(20) }, { stage: "build", at: t(50) }],
  transcript: [
    msg(1, 50, "room", "Task 1: One → Claude", { kind: "assign", by: "codex", to: ["claude"] }),
    msg(2, 60, "claude", "done 1", { to: ["agy"] }),
    msg(3, 65, "agy", "changes please", { to: ["claude"] }),
    msg(4, 70, "room", "Task 1: One → Claude", { kind: "assign", by: "codex", to: ["claude"] }),
    msg(5, 80, "claude", "done again", { to: ["agy"] }),
    msg(6, 85, "agy", "ok", { to: ["claude"] }),
    msg(7, 90, "room", "Task 2: Two → Claude", { kind: "assign", by: "codex", to: ["claude"] }),
    msg(8, 95, "claude", "working", { to: ["agy"] }),
  ],
} as unknown as SessionView;

test("stages carry how long each took, and the current one counts up to now", () => {
  const view = workflowView(session, Date.parse(t(100)));
  assert.deepEqual(view.stages.map(s => [s.label, s.state, s.ms]), [
    ["Discuss", "done", null], ["Roles", "done", null], ["Plan", "done", 50_000], ["Build", "current", 50_000], ["Finish", "todo", null], ["Done", "todo", null],
  ]);
});

test("each task shows its rounds, reviews, time and its own messages", () => {
  const [one, two, three] = workflowView(session, Date.parse(t(100))).tasks;
  assert.equal(one.rounds, 2);
  assert.equal(one.reviews, 2);
  assert.equal(one.ms, 40_000);
  assert.deepEqual(one.messages.map(m => m.seq), [1, 2, 3, 4, 5, 6]);
  assert.equal(one.commit, "abc1234");
  assert.equal(two.rounds, 1);
  assert.equal(two.ms, 10_000);
  assert.deepEqual(two.messages.map(m => m.seq), [7, 8]);
  assert.equal(three.rounds, 0);
  assert.equal(three.ms, null);
  assert.deepEqual(three.messages, []);
});

test("a session with no plan or stage log still renders", () => {
  const bare = { ...session, plan: null, stageLog: undefined, stage: "discuss", transcript: [] } as unknown as SessionView;
  const view = workflowView(bare, Date.parse(t(100)));
  assert.deepEqual(view.tasks, []);
  assert.equal(view.stages[0].state, "current");
  assert.equal(view.stages[0].ms, null);
});

test("durations read like a stopwatch", async () => {
  const { formatMs } = await import("../../app/room/workflow-view");
  assert.equal(formatMs(null), "");
  assert.equal(formatMs(42_400), "42s");
  assert.equal(formatMs(192_000), "3m 12s");
  assert.equal(formatMs(3_840_000), "1h 4m");
});

const busy = {
  ...session,
  transcript: [
    ...session.transcript,
    msg(9, 96, "room", "Claude turn failed (exit 1). Retrying once."),
  ],
  active: { agent: "claude", activity: "editing", since: t(96) },
} as unknown as SessionView;

test("the run summary leads with time, turns per agent, retries and problems", () => {
  const { summary } = workflowView(busy, Date.parse(t(100)));
  assert.equal(summary.ms, 100_000);
  assert.deepEqual(summary.turns, { codex: 0, claude: 3, agy: 2 });
  assert.equal(summary.retries, 1);
  assert.equal(summary.problems, 1);
});

test("swim lanes show when each agent was working, including the turn in progress", () => {
  const { lanes } = workflowView(busy, Date.parse(t(100)));
  assert.equal(lanes.start, Date.parse(t(0)));
  assert.equal(lanes.end, Date.parse(t(100)));
  const claude = lanes.rows.find(r => r.agent === "claude")!;
  assert.deepEqual(claude.spans.map(s => [s.start - lanes.start, s.end - lanes.start]), [[50_000, 60_000], [70_000, 80_000], [90_000, 95_000], [96_000, 100_000]]);
  assert.deepEqual(lanes.rows.find(r => r.agent === "agy")!.spans.length, 2);
});

test("retries stay separate rounds, and failing or looping tasks need attention", () => {
  const [one, two] = workflowView(busy, Date.parse(t(100))).tasks;
  assert.deepEqual(one.roundGroups.map(g => g.map(m => m.seq)), [[1, 2, 3], [4, 5, 6]]);
  assert.equal(one.needsAttention, false);
  assert.equal(two.needsAttention, true);
});
