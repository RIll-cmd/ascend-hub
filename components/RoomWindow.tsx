"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { roomWindow } from "@/app/room/deck/room-window";
import type { RoomStatus, SessionView } from "@/app/room/room-types";

// at: when the room answered (or failed to). status null: the room is closed.
export type RoomPeek = { status: RoomStatus | null; session: SessionView | null; at: number };

// One slow poll of the Agent Room for the home page: the poster and the shelf's agent TVs both read it. The room page
// itself polls fast.
export function useRoomPeek() {
  const [peek, setPeek] = useState<RoomPeek | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const tickRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      clearTimeout(timer);
      const next: RoomPeek = { status: null, session: null, at: 0 };
      try {
        const [statusRes, sessionRes] = await Promise.all([
          fetch("/api/room", { cache: "no-store" }),
          fetch("/api/room/sessions/current", { cache: "no-store" }),
        ]);
        if (statusRes.ok) {
          next.status = await statusRes.json() as RoomStatus;
          next.session = sessionRes.ok ? (await sessionRes.json() as { session?: SessionView | null }).session ?? null : null;
        }
      } catch { /* closed */ }
      if (!alive) return;
      setPeek({ ...next, at: Date.now() });
      clearTimeout(timer); // a refresh may have overlapped a scheduled tick: keep one chain
      timer = setTimeout(tick, document.hidden ? 30_000 : 5_000);
    };
    tickRef.current = tick;
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await tickRef.current(); } finally { setRefreshing(false); }
  }, []);
  return { peek, refresh, refreshing };
}

// The poster's art: a little picture of the Agent Room that shows what its TVs show.
export function RoomWindow({ peek }: { peek: RoomPeek | null }) {
  const w = roomWindow(peek?.status ?? null, peek?.session ?? null, peek?.at ?? 0);
  const looking = peek === null;
  return (
    <div className="framed-poster-art room-window" data-bug={looking ? "IDLE" : w.bug} style={{ "--banner": looking ? "#5f5e5a" : w.banner } as React.CSSProperties}>
      <div className="room-window-head">
        <span className="room-window-title">AGENT ROOM</span>
        <span className="room-window-bug"><i aria-hidden="true" />{looking ? "…" : w.bug}</span>
      </div>
      <div className="room-window-scene" aria-hidden="true">
        <span className="room-window-shelf room-window-shelf--left" />
        <span className="room-window-shelf room-window-shelf--right" />
        <div className="room-window-bench">
          {w.tvs.map(tv => (
            <span key={tv.id} className="room-window-tv" data-mood={looking ? "idle" : tv.mood} style={{ "--tv": tv.color } as React.CSSProperties}>
              <span className="room-window-screen"><i /><i /></span>
            </span>
          ))}
        </div>
      </div>
      <div className="room-window-lower">
        <b>{looking ? "AGENT ROOM" : w.headline}</b>
        <span>{looking ? "looking in…" : w.sub}</span>
      </div>
      <span className="room-window-enter">ENTER →</span>
      <span className="framed-poster-glass" aria-hidden="true" />
    </div>
  );
}
