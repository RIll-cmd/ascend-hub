import { AGENT_IDS, AGENT_NAMES, type AgentCard, type AgentId, type Scorecard } from "./room-types";

// Fewer tasks than this never name a best agent.
export const MIN_SAMPLE = 3;

const ratio = (part: number, whole: number) => (whole ? `${part} of ${whole}` : "–");
const kilo = (n: number | null) => (n === null ? "–" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const active = (a: AgentCard) => a.coder.tasks > 0 || a.reviewer.tasks > 0 || a.orchestrator.sessions > 0;

export function scoreRows(card: Scorecard) {
  return AGENT_IDS.flatMap(agent => {
    const a = card.agents[agent];
    if (!a || !active(a)) return [];
    return [{
      agent, name: AGENT_NAMES[agent], tasks: a.coder.tasks,
      firstTryText: ratio(a.coder.firstTry, a.coder.tasks),
      checksText: ratio(a.coder.checksGreen, a.coder.checksScored),
      stalls: a.coder.stalls, reassignedAway: a.coder.reassignedAway,
      tokensPerPass: kilo(a.tokensPerPass),
    }];
  });
}

export function roleGrid(card: Scorecard) {
  return Object.entries(card.byRole).sort(([a], [b]) => a.localeCompare(b)).map(([role, cells]) => ({
    role,
    cells: AGENT_IDS.flatMap(agent => {
      const cell = cells[agent];
      if (!cell) return [];
      return [{ agent, text: cell.tasks < MIN_SAMPLE ? "not enough data" : `${cell.firstTry} of ${cell.tasks} first try` }];
    }),
  }));
}

// A suggestion only: the owner still picks the coders.
export function coderHint(card: Scorecard | null, role: string | undefined, agent: AgentId): string | null {
  const counts = role ? card?.byRole[role]?.[agent] : card?.agents[agent]?.coder;
  if (!counts || counts.tasks < MIN_SAMPLE) return null;
  return `${AGENT_NAMES[agent]}: ${counts.firstTry} of ${counts.tasks} ${role ? `${role} ` : ""}tasks passed first try`;
}
