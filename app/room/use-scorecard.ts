"use client";

import { useEffect, useState } from "react";
import type { Scorecard } from "./room-types";

export type ScoreDays = "7" | "30" | "all";

// Reads saved sessions only; it never runs an agent turn.
export function useScorecard(days: ScoreDays) {
  const [card, setCard] = useState<Scorecard | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/room/scorecard?days=${days}`, { cache: "no-store" })
      .then(res => (res.ok ? (res.json() as Promise<{ scorecard?: Scorecard }>) : null))
      .then(data => { if (live) { setCard(data?.scorecard ?? null); setFailed(!data?.scorecard); } },
        () => { if (live) { setCard(null); setFailed(true); } });
    return () => { live = false; };
  }, [days]);
  return { card, failed };
}
