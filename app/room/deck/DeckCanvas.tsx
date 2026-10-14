"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { AgentId } from "../room-types";
import { plateText, type DeckPulse, type DeckView } from "./deck-view";
import { FlatDeck } from "./FlatDeck";
import { createDeck, type Deck } from "./scene";

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribe = (onChange: () => void) => {
  const query = matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const forcedFlat = () => matchMedia(REDUCED).matches || new URLSearchParams(location.search).get("deck") === "flat";

export function DeckCanvas({ view, pulses, selected, onSelect }: {
  view: DeckView; pulses: DeckPulse[]; selected: AgentId | null; onSelect: (id: AgentId) => void;
}) {
  const flat = useSyncExternalStore(subscribe, forcedFlat, () => false);
  const [failed, setFailed] = useState(false);
  const deckRef = useRef<Deck | null>(null);
  const plates = useRef<Partial<Record<AgentId, HTMLButtonElement | null>>>({});
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; });

  // A ref callback, not an effect: the deck lives exactly as long as the canvas element.
  const attach = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    let deck: Deck;
    try {
      deck = createDeck(canvas, { onLost: () => setFailed(true) });
    } catch {
      setFailed(true);
      return;
    }
    deck.onSelect(id => onSelectRef.current(id));
    deck.onFrame(positions => {
      for (const p of positions) {
        const plate = plates.current[p.id];
        if (!plate) continue;
        plate.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
        plate.style.visibility = p.visible ? "visible" : "hidden";
      }
    });
    deckRef.current = deck;
    return () => { deck.dispose(); deckRef.current = null; };
  }, []);

  useEffect(() => { deckRef.current?.update(view, pulses); }, [view, pulses]);
  useEffect(() => { deckRef.current?.select(selected); }, [selected]);

  if (flat || failed) return <FlatDeck view={view} selected={selected} onSelect={onSelect} />;
  return (
    <div className="agent-room-deck">
      <canvas ref={attach} className="agent-room-deck-canvas" aria-hidden="true" />
      {view.agents.map(agent => (
        <button key={agent.id} type="button" ref={el => { plates.current[agent.id] = el; }}
          className={`agent-room-plate${selected === agent.id ? " is-selected" : ""}`}
          style={{ "--plate": agent.color } as CSSProperties} onClick={() => onSelect(agent.id)} aria-pressed={selected === agent.id}>
          <b>{agent.name}</b>
          <span>{plateText(agent)}</span>
        </button>
      ))}
    </div>
  );
}
