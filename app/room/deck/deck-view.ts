import { AGENT_IDS, AGENT_NAMES, TERMINAL_STAGES, rolesOf, type AgentId, type Message, type RoomStatus, type SessionView } from "../room-types";

export const AGENT_COLORS: Record<AgentId, string> = { codex: "#e28a2b", claude: "#d97757", agy: "#3d7bff" };
const GATE_STAGES = ["gate-roles", "gate-plan", "gate-result"];
export const MAX_MINIS = 4;

export type DeckSubagent = { id: string; label: string; tool: string | null; status: string };
export type DeckAgent = {
  id: AgentId; name: string; color: string; roles: string[];
  state: "offline" | "checking" | "idle" | "busy"; activity: string | null; since: string | null;
  subagents: DeckSubagent[]; waiting: boolean; latest: Message | null;
  task: { id: number; title: string; status: string } | null;
};
export type DeckView = { sessionId: string | null; mode: "build" | "debate" | null; status: string; agents: DeckAgent[]; delegation: { from: AgentId; to: AgentId } | null };
export type DeckPulse = { seq: number; from: AgentId; to: AgentId[] | "owner"; kind: "message" | "assign" | "subagent"; sub?: string };

function statusText(session: SessionView | null): string {
  if (!session) return "Idle";
  if (session.pause) return "Paused";
  if (GATE_STAGES.includes(session.stage)) return "Waiting for you";
  if (TERMINAL_STAGES.includes(session.stage)) return session.stage === "done" ? "Done" : session.stage === "rejected" ? "Rejected" : "Stopped";
  return session.mode === "debate" ? "Debate in progress" : "Build in progress";
}

export function deckView(session: SessionView | null, status: RoomStatus | null): DeckView {
  const mode = session ? session.mode ?? "build" : null;
  const tasks = session?.plan?.tasks ?? [];
  const current = mode === "build" ? tasks.find(t => t.status === "running" || t.status === "review") ?? null : null;
  const agents = AGENT_IDS.map((id): DeckAgent => {
    const availability = status?.agents[id]?.state;
    const active = session?.active?.agent === id ? session.active : null;
    const state = availability === "offline" ? "offline" : availability !== "ready" ? "checking" : active ? "busy" : "idle";
    const roles = mode === "debate" ? (session?.judge === id ? ["judge"] : []) : rolesOf(id, session?.roles ?? null);
    const latest = [...(session?.transcript ?? [])].reverse().find(m => m.from === id) ?? null;
    const task = current && current.assignee === id ? { id: current.id, title: current.title, status: current.status } : null;
    return {
      id, name: AGENT_NAMES[id], color: AGENT_COLORS[id], roles, state,
      activity: active?.activity ?? null, since: active?.since ?? null,
      subagents: active?.subagents ?? [], waiting: Boolean(active?.waiting), latest, task,
    };
  });
  const orchestrator = session?.roles?.orchestrator;
  const delegation = current && orchestrator && orchestrator !== current.assignee ? { from: orchestrator, to: current.assignee } : null;
  return { sessionId: session?.id ?? null, mode, status: statusText(session), agents, delegation };
}

export function plateText(agent: DeckAgent): string {
  if (agent.state === "offline") return "offline";
  if (agent.state === "checking") return "checking…";
  const base = agent.state === "busy" ? `${agent.activity ?? "working"}…` : "idle";
  const running = agent.subagents.filter(s => s.status === "running").length;
  if (!running) return agent.waiting ? `${base} · waiting on sub-agents` : base;
  const extra = running > MAX_MINIS ? ` (+${running - MAX_MINIS})` : "";
  return `${base} · ${running} sub-agent${running > 1 ? "s" : ""}${extra}`;
}

export function messageLine(m: Message): { from: string; to: string; text: string } {
  const sender = m.from === "room" ? (m.by ? AGENT_NAMES[m.by] : "Room") : AGENT_NAMES[m.from];
  const receivers = m.to === undefined ? "" : m.to.length ? m.to.map(id => AGENT_NAMES[id]).join(", ") : "you";
  return { from: sender, to: receivers, text: (m.text.split("\n")[0] ?? "").slice(0, 140) };
}

export function latestSeq(messages: Message[]): number {
  return messages.reduce((max, m) => Math.max(max, m.seq ?? 0), 0);
}

// lastSeq === null means "first look at this session": nothing replays.
export function freshPulses(lastSeq: number | null, messages: Message[], max = 8): DeckPulse[] {
  if (lastSeq === null) return [];
  const pulses: DeckPulse[] = [];
  for (const m of messages) {
    if (!m.seq || m.seq <= lastSeq || m.to === undefined) continue;
    const from = m.from === "room" ? m.by : m.from;
    if (!from) continue;
    const kind = m.kind === "assign" ? "assign" : m.kind === "subagent" ? "subagent" : "message";
    pulses.push({ seq: m.seq, from, to: m.to.length ? m.to : "owner", kind, ...(m.sub ? { sub: m.sub } : {}) });
  }
  return pulses.slice(-max);
}

export type DebateRound = "opening" | "critique" | "verdict";
export type DebateRounds = {
  opening: Partial<Record<AgentId, Message>>; critique: Partial<Record<AgentId, Message>>;
  verdict: string | null; live: DebateRound | "done"; speaking: AgentId | null; judge: AgentId;
};

export function debateRounds(session: SessionView): DebateRounds {
  const opening: Partial<Record<AgentId, Message>> = {};
  const critique: Partial<Record<AgentId, Message>> = {};
  for (const m of session.transcript) {
    if (m.from === "room") continue;
    if (!opening[m.from]) opening[m.from] = m;
    else if (!critique[m.from]) critique[m.from] = m;
  }
  const live = session.stage === "opening" || session.stage === "critique" || session.stage === "verdict" ? session.stage : "done";
  return { opening, critique, verdict: session.answer ?? null, live, speaking: session.active?.agent ?? null, judge: session.judge ?? "codex" };
}
