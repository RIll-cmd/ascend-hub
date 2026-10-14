"use client";
import { useState, type CSSProperties } from "react";
import { AGENT_COLORS, debateRounds, messageLine, type DebateRound } from "./deck/deck-view";
import { AGENT_IDS, AGENT_NAMES, type SessionView } from "./room-types";

const ROUNDS: DebateRound[] = ["opening", "critique", "verdict"];
const LABEL: Record<DebateRound, string> = { opening: "Opening", critique: "Critique", verdict: "Verdict" };

function Verdict({ text }: { text: string }) {
  return (
    <div className="agent-room-debate-verdict">
      {text.split("\n").map((line, i) => (line.startsWith("## ") ? <h3 key={i}>{line.slice(3)}</h3> : <p key={i}>{line}</p>))}
    </div>
  );
}

export function DebateView({ session }: { session: SessionView }) {
  const rounds = debateRounds(session);
  const [picked, setPicked] = useState<DebateRound | null>(null);
  const live: DebateRound = rounds.live === "done" ? "verdict" : rounds.live;
  const round = picked ?? live;
  const judgeStatus = rounds.verdict ? "Verdict ready" : rounds.live === "verdict" ? "Writing verdict…" : "Listening";
  return (
    <div className="agent-room-debate">
      <header>
        <h2>{session.task}</h2>
        <span>Round {ROUNDS.indexOf(round) + 1} / 3 · {LABEL[round]}</span>
      </header>
      <div className="agent-room-tabs" role="tablist" aria-label="Debate round">
        {ROUNDS.map(r => (
          <button key={r} role="tab" aria-selected={round === r} onClick={() => setPicked(r === live ? null : r)}>{LABEL[r]}</button>
        ))}
        {picked && <button type="button" className="agent-room-live" onClick={() => setPicked(null)}>Back to live</button>}
      </div>
      {round === "verdict" ? (
        rounds.verdict ? <Verdict text={rounds.verdict} /> : <p className="agent-room-hint">The judge has not written the verdict yet.</p>
      ) : (
        <div className="agent-room-debate-cards">
          {AGENT_IDS.map(id => {
            const message = rounds[round][id];
            const speaking = rounds.speaking === id && rounds.live === round;
            const line = message ? messageLine(message) : null;
            return (
              <article key={id} className="agent-room-debate-card" style={{ "--crt-color": AGENT_COLORS[id] } as CSSProperties}>
                <header>
                  <span className="agent-room-swatch" style={{ background: AGENT_COLORS[id] }} />
                  <b>{AGENT_NAMES[id]}</b>
                  <small>{LABEL[round]}</small>
                  <em>{speaking ? "Speaking…" : message ? "" : "Waiting"}</em>
                </header>
                <div className="agent-room-debate-text">{message?.text ?? ""}</div>
                {message && (
                  <footer>
                    {line?.to && line.to !== "you" ? `→ ${line.to} · ` : ""}
                    {new Date(message.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {message.text.length} chars
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}
      <div className="agent-room-judge">
        <b>JUDGE · {AGENT_NAMES[rounds.judge]}</b> <span>{judgeStatus}</span>
      </div>
    </div>
  );
}
