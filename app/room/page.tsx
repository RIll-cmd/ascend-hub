"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BriefForm, Crt, GateBar, StageSteps, TaskBoard, Transcript } from "./room-parts";
import { AGENT_IDS, BOARD_STAGES, TERMINAL_STAGES, type RoomStatus, type SessionView } from "./room-types";

function useRoom() {
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [offline, setOffline] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [statusRes, sessionRes] = await Promise.all([
        fetch("/api/room", { cache: "no-store" }),
        fetch("/api/room/sessions/current", { cache: "no-store" }),
      ]);
      if (!statusRes.ok) {
        const data = await statusRes.json().catch(() => ({})) as { reason?: string };
        setOffline(data.reason ?? "The room process is not running.");
        return;
      }
      setOffline(null);
      setStatus(await statusRes.json() as RoomStatus);
      if (sessionRes.ok) setSession((await sessionRes.json() as { session?: SessionView | null }).session ?? null);
    } catch {
      setOffline("Hub could not be reached.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      await refresh();
      if (alive) timer = setTimeout(tick, document.hidden ? 10_000 : 1_500);
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [refresh]);

  const send = useCallback(async (path: string, body?: unknown) => {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = await res.json().catch(() => ({})) as { message?: string; error?: string };
    await refresh();
    return res.ok ? null : String(data.message ?? data.error ?? `Request failed (${res.status})`);
  }, [refresh]);

  return { status, session, offline, send };
}

export default function RoomPage() {
  const { status, session, offline, send } = useRoom();
  const [error, setError] = useState<string | null>(null);
  const act = useCallback(async (path: string, body?: unknown) => setError(await send(path, body)), [send]);
  const running = Boolean(session && !TERMINAL_STAGES.includes(session.stage));
  const showBoard = Boolean(session?.plan && BOARD_STAGES.includes(session.stage));

  return (
    <main className="agent-room">
      <header className="agent-room-bar">
        <Link href="/" className="agent-room-back">◂ Shelf</Link>
        <span>AGENT ROOM{session ? ` · ${session.project}` : ""}</span>
        {running && <button className="agent-room-stop" onClick={() => act("/api/room/sessions/current/stop")}>Stop</button>}
      </header>
      {offline ? (
        <div className="agent-room-offline" role="status">
          <p>Room offline: {offline}</p>
          <p>It starts with <code>npm run dev</code>. To start it alone, run <code>node scripts/agent-room/server.mjs</code> in the Hub folder.</p>
        </div>
      ) : (
        <>
          <section className="agent-room-crts" aria-label="Agents">
            {AGENT_IDS.map(id => <Crt key={id} id={id} availability={status?.agents[id]} session={session} />)}
          </section>
          <div className={`agent-room-body${showBoard ? " has-board" : ""}`}>
            <div className="agent-room-main">
              {session && <StageSteps stage={session.stage} paused={Boolean(session.pause)} />}
              {session && <Transcript messages={session.transcript} />}
              {session && <GateBar session={session} act={act} />}
              {!running && <BriefForm agents={status?.agents} act={act} />}
              {error && <p role="alert" className="agent-room-error">{error}</p>}
            </div>
            {showBoard && session?.plan && <TaskBoard tasks={session.plan.tasks} />}
          </div>
        </>
      )}
    </main>
  );
}
