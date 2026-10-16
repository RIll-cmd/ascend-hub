"use client";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { messageLine, plateText, type DeckAgent, type DeckView } from "./deck/deck-view";
import { LimitsBars, RefreshLimits, useLimits } from "./limits-panel";
import { StageSteps, Transcript, type Act } from "./room-parts";
import { AGENT_IDS, AGENT_NAMES, type AgentId, type AgentQuota, type Message, type SessionView } from "./room-types";

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");

export function TopBar({ session, view, running, act, soundOn, onToggleSound }: {
  session: SessionView | null; view: DeckView; running: boolean; act: Act; soundOn: boolean; onToggleSound: () => void;
}) {
  return (
    <header className="agent-room-bar">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- vinext Link does nothing on click in production builds */}
      <a href="/" className="agent-room-back">◂ Shelf</a>
      <span className="agent-room-title">AGENT ROOM{session ? ` · ${session.project}` : ""}</span>
      {session && <StageSteps stage={session.stage} paused={Boolean(session.pause)} mode={session.mode} />}
      <span className="agent-room-status"><i aria-hidden="true" />{view.status}</span>
      <button type="button" className="agent-room-sound" onClick={onToggleSound} aria-pressed={soundOn} aria-label={soundOn ? "Mute room sound" : "Turn on room sound"}>
        {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </button>
      {running && <button className="agent-room-stop" onClick={() => act("/api/room/sessions/current/stop")}>Stop</button>}
    </header>
  );
}

function AgentsHeading() {
  const limits = useLimits(null);
  return <h3 className="agent-room-cards-head">Agents <RefreshLimits {...limits} /></h3>;
}

export function Inspector({ agent, view, session, pinned, onSelect, quota }: {
  agent: DeckAgent | null; view: DeckView; session: SessionView | null; pinned: boolean; onSelect: (id: AgentId) => void;
  quota?: Partial<Record<AgentId, AgentQuota>>;
}) {
  if (!agent) {
    return (
      <section className="agent-room-inspector agent-room-cards" aria-label="Agents">
        <AgentsHeading />
        {view.agents.map(a => {
          const latest = a.latest ? messageLine(a.latest) : null;
          return (
            <button key={a.id} type="button" className="agent-room-card" style={{ borderLeftColor: a.color }} onClick={() => onSelect(a.id)}>
              <span><b style={{ color: a.color }}>{a.name}</b> {a.roles.map(role => <span key={role} className="agent-room-badge">{role}</span>)}</span>
              <small>{plateText(a)}</small>
              <LimitsBars quota={quota} agents={[a.id]} />
              {latest && <small className="agent-room-card-line">{latest.to ? `→ ${latest.to}: ` : ""}{latest.text}</small>}
            </button>
          );
        })}
      </section>
    );
  }
  const latest = agent.latest ? messageLine(agent.latest) : null;
  return (
    <section className="agent-room-inspector" aria-label={`${agent.name} details`} style={{ borderColor: agent.color }}>
      <h2><span className="agent-room-swatch" style={{ background: agent.color }} />{agent.name}</h2>
      <p className="agent-room-badges">{agent.roles.map(role => <span key={role} className="agent-room-badge">{role}</span>)}</p>
      <h3>Current activity</h3>
      <p>{agent.state === "busy" ? `${agent.activity}… since ${clock(agent.since)}` : agent.state}</p>
      {agent.task && <p>Task {agent.task.id}: {agent.task.title} ({agent.task.status})</p>}
      {(agent.subagents.length > 0 || agent.waiting) && (
        <>
          <h3>Sub-agents</h3>
          {agent.waiting && agent.subagents.length === 0 && <p>Waiting on sub-agents…</p>}
          <ul>{agent.subagents.map(s => <li key={s.id}>↳ {s.label}{s.tool ? ` · ${s.tool}` : ""} <small>({s.status})</small></li>)}</ul>
        </>
      )}
      {latest && (
        <>
          <h3>Latest message</h3>
          <blockquote>{agent.latest?.text.slice(0, 600)}</blockquote>
          {latest.to && <p className="agent-room-sent">Sent to {latest.to}</p>}
        </>
      )}
      {session && session.mode !== "debate" && session.roles?.reviewer === agent.id && <p className="agent-room-hint">Reviews every task.</p>}
      {pinned && <button type="button" className="agent-room-link" onClick={() => onSelect(agent.id)}>Show all agents</button>}
    </section>
  );
}

export function Ticker({ messages, onOpen }: { messages: Message[]; onOpen: () => void }) {
  const last = messages.at(-1);
  const line = last ? messageLine(last) : null;
  return (
    <div className="agent-room-ticker">
      <span aria-live="polite">{line ? <><b>{line.from}{line.to ? ` → ${line.to}` : ""}</b> · {line.text}</> : "No messages yet."}</span>
      <button type="button" onClick={onOpen}>Open transcript</button>
    </div>
  );
}

export function TranscriptDrawer({ open, onClose, messages }: { open: boolean; onClose: () => void; messages: Message[] }) {
  const [filter, setFilter] = useState<AgentId | "all">("all");
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button, select")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>("button, select, [tabindex='0']")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const shown = filter === "all" ? messages : messages.filter(m => m.from === filter || m.by === filter || m.to?.includes(filter));
  return (
    <div className="agent-room-drawer" role="dialog" aria-modal="true" aria-label="Transcript" ref={panel}>
      <div className="agent-room-drawer-bar">
        <b>Transcript</b>
        <select aria-label="Filter by agent" value={filter} onChange={e => setFilter(e.target.value as AgentId | "all")}>
          <option value="all">All agents</option>
          {AGENT_IDS.map(id => <option key={id} value={id}>{AGENT_NAMES[id]}</option>)}
        </select>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <Transcript messages={shown} />
    </div>
  );
}
