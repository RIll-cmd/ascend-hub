import assert from "node:assert/strict";
import test from "node:test";
import { limitsView } from "../../app/room/limits-view";

const NOW = Date.parse("2026-10-14T12:00:00.000Z");
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

test("each agent gets a 5-hour and a weekly bar with percent, tone and a reset countdown", () => {
  const [claude, codex] = limitsView({
    claude: { fiveHour: { usedPercent: 12, resetsAt: at(134) }, weekly: { usedPercent: 82, resetsAt: at(4 * 1440 + 60) }, seenAt: at(-5) },
    codex: { fiveHour: { usedPercent: 95, resetsAt: at(0.5) }, weekly: { usedPercent: 31, resetsAt: at(6 * 1440) }, seenAt: at(-90) },
  }, NOW);
  assert.equal(claude.name, "Claude");
  assert.deepEqual(claude.bars.map(b => [b.label, b.percent, b.tone, b.resets]), [
    ["5-hour", 12, "ok", "resets in 2h 14m"],
    ["Weekly", 82, "warn", "resets in 4d 1h"],
  ]);
  assert.equal(claude.seen, "read 5m ago");
  assert.equal(claude.stale, false);
  assert.deepEqual(codex.bars.map(b => [b.percent, b.tone, b.resets]), [[95, "full", "resets in <1m"], [31, "ok", "resets in 6d"]]);
  assert.equal(codex.seen, "read 1h 30m ago");
  assert.equal(codex.stale, true, "a reading over an hour old is flagged");
});

test("a window that has reset since the reading shows no percent, and missing readings say why", () => {
  const [claude, codex, agy] = limitsView({
    claude: { fiveHour: { usedPercent: 70, resetsAt: at(-10) }, weekly: { usedPercent: 40, resetsAt: at(600) }, seenAt: at(-300) },
    codex: null,
  }, NOW);
  assert.deepEqual(claude.bars[0], { label: "5-hour", percent: null, tone: "unknown", resets: "reset since this reading" });
  assert.equal(codex.bars.length, 0);
  assert.match(codex.note ?? "", /No reading yet/);
  assert.equal(agy.name, "Antigravity");
  assert.match(agy.note ?? "", /does not report/);
});

test("the summary names the fullest window, for the collapsed home pill", async () => {
  const { limitsSummary } = await import("../../app/room/limits-view");
  const view = limitsView({
    claude: { fiveHour: { usedPercent: 12, resetsAt: at(60) }, weekly: { usedPercent: 82, resetsAt: at(600) }, seenAt: at(-1) },
    codex: { fiveHour: { usedPercent: 40, resetsAt: at(60) }, weekly: { usedPercent: 31, resetsAt: at(600) }, seenAt: at(-1) },
  }, NOW);
  assert.deepEqual(limitsSummary(view), { text: "Claude weekly 82%", tone: "warn" });
  assert.equal(limitsSummary(limitsView({}, NOW)), null);
});
