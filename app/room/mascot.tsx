import type { Mood } from "./deck/deck-view";

const LABEL: Record<Mood, string> = { idle: "resting", working: "working", stuck: "stuck", done: "done" };

// A small original robot per agent (no third-party sprites): its face shows the mood, its body the agent's colour.
export function Mascot({ mood, color, name }: { mood: Mood; color: string; name: string }) {
  return (
    <svg className={`agent-room-mascot is-${mood}`} viewBox="0 0 32 32" width="26" height="26" role="img" aria-label={`${name} is ${LABEL[mood]}`}>
      <line x1="16" y1="3" x2="16" y2="7" stroke="#000" strokeWidth="2" />
      <circle className="agent-room-mascot-bulb" cx="16" cy="3" r="2.2" fill={mood === "stuck" ? "#e5484d" : mood === "done" ? "#46a758" : "#ffcf5a"} stroke="#000" strokeWidth="1" />
      <rect x="4" y="7" width="24" height="20" rx="6" fill={color} stroke="#000" strokeWidth="2" />
      <rect x="8" y="11" width="16" height="11" rx="3" fill="#14100c" />
      {mood === "idle" && <g stroke="#9fe870" strokeWidth="1.6" strokeLinecap="round"><line x1="11" y1="16" x2="14" y2="16" /><line x1="18" y1="16" x2="21" y2="16" /></g>}
      {mood === "working" && <g className="agent-room-mascot-eyes" fill="#9fe870"><circle cx="12.5" cy="15.5" r="1.8" /><circle cx="19.5" cy="15.5" r="1.8" /><rect x="13" y="19" width="6" height="1.2" rx=".6" /></g>}
      {mood === "stuck" && <g stroke="#ff8a8a" strokeWidth="1.5" strokeLinecap="round"><path d="M11 14l3 3M14 14l-3 3M18 14l3 3M21 14l-3 3" /><path d="M13 20.5q3-2 6 0" fill="none" /></g>}
      {mood === "done" && <g stroke="#9fe870" strokeWidth="1.6" strokeLinecap="round" fill="none"><path d="M10.5 16.5l2-2 2 2M17.5 16.5l2-2 2 2" /><path d="M13 19q3 2.4 6 0" /></g>}
    </svg>
  );
}
