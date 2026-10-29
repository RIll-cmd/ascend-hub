import assert from "node:assert/strict";
import test from "node:test";
import { coderHint, roleGrid, scoreRows } from "../../app/room/scorecard-view";
import type { AgentCard, Scorecard } from "../../app/room/room-types";

const agentCard = (coder: Partial<AgentCard["coder"]> = {}, more: Partial<AgentCard> = {}): AgentCard => ({
  coder: { tasks: 0, firstTry: 0, checksGreen: 0, checksScored: 0, stalls: 0, reassignedAway: 0, failures: 0, ...coder },
  reviewer: { tasks: 0, roundsAsked: 0, laterFailed: 0 },
  orchestrator: { sessions: 0, done: 0, rejected: 0, revisions: 0 },
  tokens: 0, tokensPerPass: null, ...more,
});

const card = (over: Partial<Scorecard> = {}): Scorecard => ({
  window: { days: 7, from: null, to: "2026-10-29T12:00:00.000Z" },
  sessions: 3,
  agents: { codex: agentCard(), claude: agentCard({ tasks: 6, firstTry: 5, checksScored: 4, checksGreen: 3 }, { tokens: 6000, tokensPerPass: 1000 }), agy: agentCard() },
  byRole: { frontend: { claude: { tasks: 6, firstTry: 5 }, agy: { tasks: 2, firstTry: 2 } } },
  endings: [], weekly: [],
  ...over,
});

test("under three tasks the grid says not enough data", () => {
  const [frontend] = roleGrid(card());
  assert.equal(frontend.role, "frontend");
  assert.deepEqual(frontend.cells, [
    { agent: "claude", text: "5 of 6 first try" },
    { agent: "agy", text: "not enough data" },
  ]);
});

test("the hint names the role and counts", () => {
  assert.equal(coderHint(card(), "frontend", "claude"), "Claude: 5 of 6 frontend tasks passed first try");
});

test("without a role the hint uses all of the agent's coder tasks", () => {
  assert.equal(coderHint(card(), undefined, "claude"), "Claude: 5 of 6 tasks passed first try");
});

test("no hint with too few tasks or no scorecard", () => {
  assert.equal(coderHint(card(), "frontend", "agy"), null);
  assert.equal(coderHint(card(), undefined, "codex"), null);
  assert.equal(coderHint(null, undefined, "claude"), null);
});

test("rows list every agent that has any activity, in codex, claude, agy order", () => {
  const rows = scoreRows(card({ agents: { ...card().agents, codex: agentCard({}, { orchestrator: { sessions: 2, done: 1, rejected: 1, revisions: 0 } }) } }));
  assert.deepEqual(rows.map(r => r.agent), ["codex", "claude"]);
  const claude = rows[1];
  assert.equal(claude.name, "Claude");
  assert.equal(claude.firstTryText, "5 of 6");
  assert.equal(claude.checksText, "3 of 4");
  assert.equal(claude.tokensPerPass, "1.0k");
  assert.equal(rows[0].firstTryText, "–");
});
