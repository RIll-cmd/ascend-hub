import test from "node:test";
import assert from "node:assert/strict";
import { normalizedPointer, dampedAxis } from "../components/ui/parallax-motion.ts";

test("pointer coordinates use the stage center and clamp outside its bounds", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };
  assert.deepEqual(normalizedPointer(300, 150, rect), { x: 0, y: 0 });
  assert.deepEqual(normalizedPointer(100, 50, rect), { x: -1, y: -1 });
  assert.deepEqual(normalizedPointer(500, 250, rect), { x: 1, y: 1 });
  assert.deepEqual(normalizedPointer(900, -100, rect), { x: 1, y: -1 });
});

test("zero-sized stages do not produce invalid motion", () => {
  assert.deepEqual(normalizedPointer(50, 50, { left: 0, top: 0, width: 0, height: 0 }), { x: 0, y: 0 });
});

test("damped movement approaches the target without overshooting", () => {
  assert.equal(dampedAxis(0, 1, 0.1), 0.1);
  assert.equal(dampedAxis(0.1, 1, 0.1), 0.19);
  assert.equal(dampedAxis(1, 0, 0.1), 0.9);
});
