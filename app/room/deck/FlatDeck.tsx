"use client";
import type { CSSProperties } from "react";
import type { AgentId } from "../room-types";
import { messageLine, plateText, type DeckView } from "./deck-view";

export function FlatDeck({ view, selected, onSelect }: { view: DeckView; selected: AgentId | null; onSelect: (id: AgentId) => void }) {
  const { room } = view;
  const label = room.kind === "idle" ? "Ready room" : room.kind === "coding" ? "Workshop" : "Panel";
  return (
    <div className="agent-room-flatdeck">
      <p className="agent-room-flatroom" role="status">
        <b>{label}</b>{room.task ? ` · ${room.task}` : ""}{room.check ? ` · checks ${room.check === "running" ? "running" : room.check === "pass" ? "passed" : "failed"}` : ""}
        {room.gate && <> · <b>NEEDS YOU</b> {room.gate.line}</>}
      </p>
      {view.agents.map(agent => {
        const latest = agent.latest ? messageLine(agent.latest) : null;
        return (
          <button key={agent.id} type="button" onClick={() => onSelect(agent.id)} aria-pressed={selected === agent.id}
            className={`agent-room-flatcrt${agent.state === "busy" ? " is-busy" : ""}${selected === agent.id ? " is-selected" : ""}`}
            style={{ "--crt-color": agent.color } as CSSProperties}>
            <b>{agent.name}</b>
            <span className="agent-room-badges">{agent.roles.map(role => <span key={role} className="agent-room-badge">{role}</span>)}</span>
            <span className="agent-room-crt-status">{plateText(agent)}</span>
            {latest && <small>{latest.to ? `→ ${latest.to}: ` : ""}{latest.text}</small>}
          </button>
        );
      })}
    </div>
  );
}
