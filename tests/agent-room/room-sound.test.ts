import assert from "node:assert/strict";
import test from "node:test";
import type { DeckPulse, DeckView } from "../../app/room/deck/deck-view";
import { soundCues } from "../../app/room/room-sound-cues";

const view = (status: string, mode: DeckView["mode"] = "build"): DeckView => ({ sessionId: "s", mode, status, agents: [], delegation: null });
const pulse = (kind: DeckPulse["kind"], seq = 1): DeckPulse => ({ seq, from: "codex", to: ["claude"], kind });

test("soundCues: one cue per kind of event in a batch, never a burst", () => {
  assert.deepEqual(soundCues(view("Build in progress"), view("Build in progress"), [pulse("message", 1), pulse("message", 2), pulse("assign", 3), pulse("subagent", 4)]),
    ["assign", "subagent", "message"]);
  assert.deepEqual(soundCues(view("Build in progress"), view("Build in progress"), []), []);
});

test("soundCues: a chime when the room starts waiting for you or pauses, not on first load", () => {
  assert.deepEqual(soundCues(view("Build in progress"), view("Waiting for you"), []), ["attention"]);
  assert.deepEqual(soundCues(view("Build in progress"), view("Paused"), []), ["attention"]);
  assert.deepEqual(soundCues(view("Waiting for you"), view("Waiting for you"), []), []);
  assert.deepEqual(soundCues(null, view("Waiting for you"), []), []);
});

test("soundCues: a fanfare when a debate verdict arrives", () => {
  assert.deepEqual(soundCues(view("Debate in progress", "debate"), view("Done", "debate"), [pulse("message")]), ["message", "verdict"]);
  assert.deepEqual(soundCues(view("Build in progress"), view("Done"), []), []);
});
