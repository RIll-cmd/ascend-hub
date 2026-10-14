import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { shelfNowMs, statusClockMs } from "../../app/status/use-now";

test("the shelf clock ticks every second only while a status TV detail is open", () => {
  assert.equal(statusClockMs(true), 1_000);
  assert.equal(statusClockMs(false), 10_000);
});

test("the status poll hook no longer owns a clock", async () => {
  const source = await readFile("app/status/use-status-shelf.ts", "utf8");
  assert.doesNotMatch(source, /setInterval|nowMs/);
});

test("a fresh poll moves the shelf clock forward so a new heartbeat never looks like it is from the future", () => {
  assert.equal(shelfNowMs(1_000, 5_000), 5_000);
  assert.equal(shelfNowMs(9_000, 5_000), 9_000);
  assert.equal(shelfNowMs(9_000, null), 9_000);
});
