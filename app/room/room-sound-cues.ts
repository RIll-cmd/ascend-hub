import type { DeckPulse, DeckView } from "./deck/deck-view";

export type SoundCue = "assign" | "subagent" | "message" | "attention" | "verdict";

// At most one cue per kind for each poll, so a burst of messages never becomes a burst of blips.
export function soundCues(prev: DeckView | null, next: DeckView, pulses: DeckPulse[]): SoundCue[] {
  const cues: SoundCue[] = [];
  for (const kind of ["assign", "subagent", "message"] as const) {
    if (pulses.some(p => p.kind === kind)) cues.push(kind);
  }
  if (prev && prev.status !== next.status) {
    if (next.status === "Waiting for you" || next.status === "Paused") cues.push("attention");
    if (next.mode === "debate" && next.status === "Done") cues.push("verdict");
  }
  return cues;
}
