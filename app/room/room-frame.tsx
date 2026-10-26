"use client";
import { ChevronLeft, Folder, FolderGit2, GitBranch, Layers, Plus, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { agentMood, messageLine, plateText, type DeckAgent, type DeckView } from "./deck/deck-view";
import { Mascot } from "./mascot";
import { Button } from "@/components/neo/button";
import { Card } from "@/components/neo/card";
import { NativeSelect, NativeSelectOption } from "@/components/neo/native-select";
import { useNow } from "../status/use-now";
import { LimitsBars, RefreshLimits, useLimits } from "./limits-panel";
import { limitsView } from "./limits-view";
import { THEMES, type ThemeId } from "./theme";
import { Markdown } from "./markdown";
import { SideSection, StageSteps, TEMPLATE_LABELS, Transcript, type Act } from "./room-parts";
import { AGENT_IDS, AGENT_NAMES, TERMINAL_STAGES, type AgentId, type AgentQuota, type Message, type SessionView, type Stage } from "./room-types";

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");

export function TopBar({ session, view, running, act }: { session: SessionView | null; view: DeckView; running: boolean; act: Act }) {
  return (
    <header className="agent-room-bar">
      <span className="agent-room-title">{session ? session.project : "New session"}</span>
      {session && <StageSteps stage={session.stage} paused={Boolean(session.pause)} mode={session.mode} />}
      <span className="agent-room-status"><i aria-hidden="true" />{view.status}</span>
      {running && <Button size="sm" variant="danger" onClick={() => act("/api/room/sessions/current/stop")}>Stop</Button>}
    </header>
  );
}

export type HistoryItem = { id: string; mode: "build" | "debate"; project: string; stage: Stage; title: string; createdAt: string; match?: { from: string; snippet: string } };

const historyState = (stage: Stage) => (TERMINAL_STAGES.includes(stage) ? stage : stage.startsWith("gate-") ? "waiting for you" : "running");

// The left column: back to the shelf, a new session, past sessions, and the sound switch.
export function RoomSidebar({ history, query, onQuery, searching, activeId, running, onNew, onOpen, soundOn, onToggleSound, theme, onTheme }: {
  history: HistoryItem[]; query: string; onQuery: (q: string) => void; searching: boolean; activeId: string | null; running: boolean; onNew: () => void; onOpen: (id: string) => void; soundOn: boolean; onToggleSound: () => void;
  theme: ThemeId; onTheme: (id: ThemeId) => void;
}) {
  return (
    <aside className="room-left" aria-label="Sessions">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- vinext Link does nothing on click in production builds */}
      <a href="/" className="room-left-item"><ChevronLeft size={16} aria-hidden="true" /> Shelf</a>
      <Button type="button" className="room-left-new w-full justify-start" onClick={onNew} title={running ? "Queue the next session" : "Start a new session"}>
        <Plus aria-hidden="true" /> New session
      </Button>
      <p className="room-left-label">Sessions</p>
      <input type="search" className="room-history-search" value={query} onChange={e => onQuery(e.target.value)} maxLength={200}
        placeholder="Search tasks and chats" aria-label="Search past sessions" />
      <ul className="room-history" aria-label={searching ? "Matching sessions" : "Past sessions"}>
        {history.map(h => (
          <li key={h.id}>
            <button type="button" className={h.id === activeId ? "is-active" : undefined} onClick={() => onOpen(h.id)} title={h.title}>
              <span>{h.title || h.project}</span>
              <small>{h.mode === "debate" ? "Debate" : h.project} · {historyState(h.stage)}</small>
              {h.match && h.match.snippet !== h.title && (
                <small className="room-history-match">{h.match.from === "task" || h.match.from === "project" ? "" : `${h.match.from}: `}{h.match.snippet}</small>
              )}
            </button>
          </li>
        ))}
        {history.length === 0 && <li className="room-history-empty">{searching ? "No matching sessions." : "No sessions yet."}</li>}
      </ul>
      <label className="room-theme">
        Theme
        <NativeSelect size="sm" aria-label="Theme" value={theme} onChange={e => onTheme(e.target.value as ThemeId)}>
          {THEMES.map(t => <NativeSelectOption key={t.id} value={t.id}>{t.name}</NativeSelectOption>)}
        </NativeSelect>
      </label>
      <div className="room-left-bottom">
        <span className="room-avatar" aria-hidden="true">A</span>
        <span>Agent Room</span>
        <Button type="button" variant={soundOn ? "default" : "neutral"} size="icon-sm" className="ml-auto" onClick={onToggleSound} aria-pressed={soundOn} aria-label={soundOn ? "Mute room sound" : "Turn on room sound"}>
          {soundOn ? <Volume2 /> : <VolumeX />}
        </Button>
      </div>
    </aside>
  );
}

// The right column's first card, like an environment summary: what this session works on.
// Saves the whole session (facts, plan, summary or verdict, every message) as a Markdown file.
async function exportSession(session: SessionView): Promise<string | null> {
  const res = await fetch(`/api/room/sessions/${session.id}/export`, { cache: "no-store" }).catch(() => null);
  const data = res?.ok ? (await res.json() as { markdown?: string }) : null;
  if (!data?.markdown) return "The export failed. Is the room running?";
  const url = URL.createObjectURL(new Blob([data.markdown], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `room-${session.project}-${session.id}.md`;
  link.click();
  URL.revokeObjectURL(url);
  return null;
}

export function SessionCard({ session }: { session: SessionView }) {
  const kind = session.mode === "debate" ? "Debate" : TEMPLATE_LABELS[session.template ?? "feature"];
  const [error, setError] = useState<string | null>(null);
  return (
    <SideSection title="Session" value={historyState(session.stage)} open>
      <ul className="room-env">
        <li><Folder size={15} aria-hidden="true" /> {session.project}</li>
        <li title={session.repo?.dir ?? session.projectDir}><FolderGit2 size={15} aria-hidden="true" /> {session.repo?.dir ?? session.projectDir}</li>
        {session.repo && <li><GitBranch size={15} aria-hidden="true" /> {session.repo.branch}</li>}
        <li><Layers size={15} aria-hidden="true" /> {kind}</li>
      </ul>
      <Button variant="neutral" size="sm" className="self-start" onClick={() => void exportSession(session).then(setError)}
        title="The task, plan, summary or verdict and every message, as one Markdown file">Export .md</Button>
      <Button variant="neutral" size="sm" className="self-start" onClick={() => window.open(`/room/summary/${session.id}`, "_blank", "noopener")}
        title="What the session came to on one read-only page, without the conversation; print it or save it as PDF to share">Summary page</Button>
      {error && <p role="alert" className="agent-room-error">{error}</p>}
    </SideSection>
  );
}

// Subscription limits as a card: the fullest window as its value, every bar inside.
export function LimitsCard({ quota }: { quota?: Partial<Record<AgentId, AgentQuota>> }) {
  const limits = useLimits(null);
  const nowMs = useNow(30_000);
  const top = limitsView(quota, nowMs).flatMap(a => a.bars.map(b => ({ a, b }))).filter(x => x.b.percent !== null)
    .sort((x, y) => (y.b.percent ?? 0) - (x.b.percent ?? 0))[0];
  return (
    <SideSection title="Limits" value={top ? `${top.a.name} ${top.b.label.toLowerCase()} ${top.b.percent}%` : "no reading"}>
      <LimitsBars quota={quota} nowMs={nowMs} />
      <RefreshLimits {...limits} />
    </SideSection>
  );
}

export function Inspector({ agent, view, session, pinned, onSelect }: {
  agent: DeckAgent | null; view: DeckView; session: SessionView | null; pinned: boolean; onSelect: (id: AgentId) => void;
}) {
  if (!agent) {
    const busy = view.agents.filter(a => a.state === "busy").length;
    return (
      <SideSection title="Agents" value={busy ? `${busy} working` : "idle"} open>
        <ul className="agent-room-agent-rows">
          {view.agents.map(a => (
            <li key={a.id}>
              <button type="button" className="agent-room-agent-row" onClick={() => onSelect(a.id)} title={`Show ${a.name}'s details`}>
                <Mascot mood={agentMood(a, view)} color={a.color} name={a.name} />
                <b>{a.name}</b>
                <span className="agent-room-agent-state">{plateText(a)}</span>
              </button>
            </li>
          ))}
        </ul>
      </SideSection>
    );
  }
  const latest = agent.latest ? messageLine(agent.latest) : null;
  return (
    <Card size="sm" className="agent-room-inspector gap-1 bg-secondary-background px-4" aria-label={`${agent.name} details`}>
      {pinned && <Button type="button" variant="neutral" size="xs" className="self-start" onClick={() => onSelect(agent.id)}><ChevronLeft aria-hidden="true" /> All agents</Button>}
      <h2><Mascot mood={agentMood(agent, view)} color={agent.color} name={agent.name} />{agent.name}</h2>
      <p className="agent-room-badges">{agent.roles.map(role => <span key={role} className="agent-room-badge">{role}</span>)}</p>
      <h3>Current activity</h3>
      <p>{agent.state === "busy" ? `${agent.activity}… since ${clock(agent.since)}` : agent.state}</p>
      {agent.task && <p>Task {agent.task.id}: {agent.task.title} ({agent.task.status})</p>}
      {view.screen?.agent === agent.id && (
        <a href={view.screen.url} target="_blank" rel="noreferrer" title="Open the latest capture">
          {/* eslint-disable-next-line @next/next/no-img-element -- a live capture from the room, not a static asset */}
          <img className="agent-room-live-screen" src={view.screen.url} alt={`The app as ${agent.name} is changing it`} />
        </a>
      )}
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
          <div className="room-agent-latest"><Markdown text={agent.latest?.text.slice(0, 1200) ?? ""} foldCode={6} /></div>
          {latest.to && <p className="agent-room-sent">Sent to {latest.to}</p>}
        </>
      )}
      {session && session.mode !== "debate" && session.roles?.reviewer === agent.id && <p className="agent-room-hint">Reviews every task.</p>}
    </Card>
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
        <NativeSelect size="sm" aria-label="Filter by agent" value={filter} onChange={e => setFilter(e.target.value as AgentId | "all")}>
          <NativeSelectOption value="all">All agents</NativeSelectOption>
          {AGENT_IDS.map(id => <NativeSelectOption key={id} value={id}>{AGENT_NAMES[id]}</NativeSelectOption>)}
        </NativeSelect>
        <Button type="button" variant="neutral" size="sm" onClick={onClose}>Close</Button>
      </div>
      <Transcript messages={shown} />
    </div>
  );
}
