"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DebateView } from "./debate-view";
import { WorkflowPanel } from "./workflow-panel";
import { DeckCanvas } from "./deck/DeckCanvas";
import { deckView, freshPulses, latestSeq, type DeckPulse, type DeckView } from "./deck/deck-view";
import { Inspector, Ticker, TopBar, TranscriptDrawer } from "./room-frame";
import { BriefForm, GateBar, TaskBoard, Transcript, VerdictPanel } from "./room-parts";
import { roomSound, soundPref } from "./room-sound";
import { soundCues } from "./room-sound-cues";
import { BOARD_STAGES, TERMINAL_STAGES, type AgentId, type RoomStatus, type SessionView } from "./room-types";

function useRoom() {
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [pulses, setPulses] = useState<DeckPulse[]>([]);
  const seen = useRef<{ id: string | null; seq: number | null }>({ id: null, seq: null });

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
      if (!sessionRes.ok) return;
      const next = (await sessionRes.json() as { session?: SessionView | null }).session ?? null;
      const messages = next?.transcript ?? [];
      // First sight of a session seeds the cursor, so a reload never replays old pulses.
      const lastSeq = next && seen.current.id === next.id ? seen.current.seq : null;
      const fresh = freshPulses(lastSeq, messages);
      seen.current = { id: next?.id ?? null, seq: latestSeq(messages) };
      // A new session clears the previous session's batch; otherwise only a non-empty batch replaces it.
      setPulses(prev => (fresh.length || (lastSeq === null && prev.length) ? fresh : prev));
      setSession(next);
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

  return { status, session, offline, pulses, send };
}

// Plays one cue per kind of event for each new poll result; the ambience ducks while the room waits for the owner.
function useRoomSound(view: DeckView, pulses: DeckPulse[]) {
  const soundOn = useSyncExternalStore(soundPref.subscribe, soundPref.get, () => false);
  const prevView = useRef<DeckView | null>(null);
  const lastPulses = useRef(pulses);
  useEffect(() => {
    roomSound.enable(soundOn);
    return () => roomSound.enable(false);
  }, [soundOn]);
  useEffect(() => {
    const fresh = pulses !== lastPulses.current ? pulses : [];
    lastPulses.current = pulses;
    const cues = soundCues(prevView.current, view, fresh);
    prevView.current = view;
    if (soundOn) cues.forEach(cue => roomSound.play(cue));
    roomSound.duck(view.status === "Waiting for you" || view.status === "Paused");
  }, [view, pulses, soundOn]);
  const toggle = useCallback(() => {
    if (!soundOn) roomSound.enable(true); // created inside the click so browsers allow audio
    soundPref.set(!soundOn);
  }, [soundOn]);
  return { soundOn, toggle };
}

export default function RoomPage() {
  const { status, session, offline, pulses, send } = useRoom();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState<"debate" | "deck" | "workflow">("debate");
  const act = useCallback(async (path: string, body?: unknown) => setError(await send(path, body)), [send]);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const view = useMemo(() => deckView(session, status), [session, status]);
  const { soundOn, toggle: toggleSound } = useRoomSound(view, pulses);
  const running = Boolean(session && !TERMINAL_STAGES.includes(session.stage));
  const debate = session?.mode === "debate";
  const focus = view.agents.find(a => a.id === (selected ?? session?.active?.agent)) ?? null;
  const showBoard = Boolean(session?.plan && BOARD_STAGES.includes(session.stage));
  const messages = session?.transcript ?? [];
  // "debate" is the default tab; a build session has no debate view, so it falls back to the deck.
  const shown = tab === "debate" && !debate ? "deck" : tab;

  return (
    <main className="agent-room">
      <TopBar session={session} view={view} running={running} act={act} soundOn={soundOn} onToggleSound={toggleSound} />
      {offline ? (
        <div className="agent-room-offline" role="status">
          <p>Room offline: {offline}</p>
          <p>It starts with Hub (<code>npm run serve</code> or the desktop shortcut). To start it alone, run <code>node scripts/agent-room/server.mjs</code> in the Hub folder.</p>
        </div>
      ) : (
        <div className="agent-room-layout">
          <section className="agent-room-stage" aria-label="Room">
            {session && (
              <div className="agent-room-tabs" role="tablist" aria-label="View">
                {debate && <button role="tab" aria-selected={shown === "debate"} onClick={() => setTab("debate")}>Debate</button>}
                <button role="tab" aria-selected={shown === "deck"} onClick={() => setTab("deck")}>Deck</button>
                <button role="tab" aria-selected={shown === "workflow"} onClick={() => setTab("workflow")}>Workflow</button>
              </div>
            )}
            {shown === "debate" && session ? <DebateView session={session} />
              : shown === "workflow" && session ? <WorkflowPanel session={session} />
                : <DeckCanvas view={view} pulses={pulses} selected={selected} onSelect={setSelected} />}
            <Ticker messages={messages} onOpen={() => setDrawer(true)} />
            {session && <Transcript messages={messages.slice(-80)} />}
          </section>
          <aside className="agent-room-side">
            <Inspector agent={focus} view={view} session={session} pinned={selected !== null} onSelect={id => setSelected(current => (current === id ? null : id))} />
            {session && <GateBar session={session} act={act} />}
            {session && <VerdictPanel session={session} />}
            {showBoard && session?.plan && <TaskBoard tasks={session.plan.tasks} />}
            {!running && <BriefForm agents={status?.agents} folders={status?.folders} repos={status?.repos} act={act} />}
            {error && <p role="alert" className="agent-room-error">{error}</p>}
          </aside>
        </div>
      )}
      <TranscriptDrawer open={drawer} onClose={closeDrawer} messages={messages} />
    </main>
  );
}
