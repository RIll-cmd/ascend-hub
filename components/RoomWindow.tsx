"use client";
import { useEffect, useState } from "react";
import { roomWindow } from "@/app/room/deck/room-window";
import type { RoomStatus, SessionView } from "@/app/room/room-types";

type Seen = { status: RoomStatus | null; session: SessionView | null } | null;

// The poster's art: a little picture of the Agent Room that shows what its TVs show. Polls slowly; the room page
// itself polls fast.
export function RoomWindow() {
  const [seen, setSeen] = useState<Seen>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const next: Seen = { status: null, session: null };
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
      setSeen(next);
      setNow(Date.now());
      timer = setTimeout(tick, document.hidden ? 30_000 : 5_000);
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const w = roomWindow(seen?.status ?? null, seen?.session ?? null, now);
  const looking = seen === null;
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
