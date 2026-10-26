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

const pupilX = (calls: { op: string; args: unknown[]; fillStyle?: unknown }[]) =>
  Number(calls.filter(c => c.op === "arc")[1]?.args[0]);

test("paintScreen: the pupil follows the gaze", () => {
  const left = recorder(), centre = recorder(), right = recorder();
  paintScreen(left.ctx, 512, 384, { ...base, look: -1 });
  paintScreen(centre.ctx, 512, 384, { ...base, look: 0 });
  paintScreen(right.ctx, 512, 384, { ...base, look: 1 });
  assert.ok(pupilX(left.calls) < pupilX(centre.calls) && pupilX(centre.calls) < pupilX(right.calls));
});

test("paintScreen: a blink hides the pupil and draws a closed lid", () => {
  const r = recorder();
  paintScreen(r.ctx, 512, 384, { ...base, blink: true });
  assert.equal(r.calls.some(c => c.op === "fill" && c.fillStyle === "#d97757"), false);
  assert.ok(r.calls.some(c => c.op === "fillRect" && c.fillStyle === "#d97757"), "lid line in agent colour");
});

test("screenKey changes with gaze and blink", () => {
  assert.notEqual(screenKey(base), screenKey({ ...base, look: 1 }));
  assert.notEqual(screenKey(base), screenKey({ ...base, blink: true }));
});

test("paintScreen: each graphic draws its own marks instead of the eye", () => {
  const code = recorder();
  paintScreen(code.ctx, 256, 192, { ...base, graphic: "code", tick: 9 });
  assert.ok(code.calls.filter(c => c.op === "fillRect" && c.fillStyle === "#d97757").length >= 1, "code lines in the agent colour");
  assert.ok(!code.calls.some(c => c.op === "arc"), "no eye");
  assert.ok(code.texts().includes("CLAUDE"), "the name stays");
  const wave = recorder();
  paintScreen(wave.ctx, 256, 192, { ...base, graphic: "wave", tick: 3 });
  assert.ok(wave.calls.filter(c => c.op === "fillRect" && c.fillStyle === "#d97757").length >= 20, "at least 20 bars");
  const plan = recorder();
  paintScreen(plan.ctx, 256, 192, { ...base, graphic: "plan", lines: ["☑ 1 Build", "▸ 2 Verify"] });
  assert.ok(plan.texts().includes("☑ 1 Build") && plan.texts().includes("▸ 2 Verify"));
  const review = recorder();
  paintScreen(review.ctx, 256, 192, { ...base, graphic: "review", tick: 4 });
  assert.ok(review.calls.some(c => c.op === "arc"), "the magnifier");
  assert.ok(review.calls.some(c => c.op === "fillRect" && c.fillStyle === "#ff8a8a"), "removed lines");
});

test("screenKey changes with tick only for an animated graphic", () => {
  assert.notEqual(screenKey({ ...base, graphic: "code", tick: 1 }), screenKey({ ...base, graphic: "code", tick: 2 }));
  assert.equal(screenKey({ ...base, graphic: null, tick: 1 }), screenKey({ ...base, graphic: null, tick: 2 }));
});
