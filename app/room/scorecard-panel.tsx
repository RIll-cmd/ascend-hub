"use client";

import { useState } from "react";
import { SideSection } from "./room-parts";
import { useScorecard, type ScoreDays } from "./use-scorecard";
import { roleGrid, scoreRows } from "./scorecard-view";
import { AGENT_NAMES } from "./room-types";

const WINDOWS: { days: ScoreDays; label: string }[] = [{ days: "7", label: "7 days" }, { days: "30", label: "30 days" }, { days: "all", label: "All" }];

export function ScorecardSection() {
  const [days, setDays] = useState<ScoreDays>("7");
  const { card, failed } = useScorecard(days);
  const rows = card ? scoreRows(card) : [];
  return (
    <SideSection title="Scorecard" value={card ? `${card.sessions} session${card.sessions === 1 ? "" : "s"}` : undefined}>
      <div className="scorecard">
        <div className="scorecard-windows" role="group" aria-label="Scorecard window">
          {WINDOWS.map(w => (
            <button key={w.days} type="button" aria-pressed={days === w.days} onClick={() => setDays(w.days)}>{w.label}</button>
          ))}
        </div>
        {failed && <p className="scorecard-note">Could not read the scorecard. Is the agent room running?</p>}
        {card && rows.length === 0 && <p className="scorecard-note">No agent work in this window.</p>}
        {rows.length > 0 && (
          <table className="scorecard-table">
            <caption className="sr-only">Coder results per agent</caption>
            <thead><tr><th scope="col">Agent</th><th scope="col">First try</th><th scope="col">Checks green</th><th scope="col">Stalls</th><th scope="col">Lost</th><th scope="col" title="Tokens per task done, not counting sessions it led">Tokens</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.agent}>
                  <th scope="row">{r.name}</th><td>{r.firstTryText}</td><td>{r.checksText}</td><td>{r.stalls}</td>
                  <td title="Tasks moved to another coder">{r.reassignedAway}</td><td>{r.tokensPerPass}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {card && roleGrid(card).map(({ role, cells }) => (
          <p key={role} className="scorecard-role"><b>{role}</b> {cells.map(c => `${AGENT_NAMES[c.agent]} ${c.text}`).join(" · ")}</p>
        ))}
        {card && card.weekly.length > 0 && <ul className="scorecard-weekly">{card.weekly.map(line => <li key={line}>{line}</li>)}</ul>}
        {card && card.endings.length > 0 && (
          <details className="scorecard-endings">
            <summary>{card.endings.length} ended badly</summary>
            <ul>{card.endings.map(e => <li key={e.id}>{e.stage} after {e.lastStage ?? "start"}: {e.task || "(no task)"}</li>)}</ul>
          </details>
        )}
      </div>
    </SideSection>
  );
}
