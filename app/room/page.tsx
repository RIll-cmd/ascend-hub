"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/neo/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/neo/tabs";
import { DebateView } from "./debate-view";
import { WorkflowPanel } from "./workflow-panel";
import { ChecksPanel } from "./checks-panel";
import { LiveDiffPanel } from "./live-diff-panel";
import { FilesPanel } from "./files-panel";
import { QueuePanel } from "./queue-panel";
import { DeckCanvas } from "./deck/DeckCanvas";
import { deckView, freshPulses, latestSeq, type DeckPulse, type DeckView } from "./deck/deck-view";
import { Inspector, LimitsCard, RoomSidebar, SessionCard, TopBar, TranscriptDrawer, type HistoryItem } from "./room-frame";
import { BriefComposer, BriefSettings, GateBar, TaskBoard, Transcript, useBrief, VerdictPanel, WorktreeCleanup } from "./room-parts";
import { RoleSets } from "./role-sets";
import { roomSound, soundPref } from "./room-sound";
import { themePref } from "./theme";
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
        // 401: the room runs, but Hub holds an older ASCEND_ROOM_TOKEN than the room.
        setOffline(statusRes.status === 401 ? "Hub and the room hold different ASCEND_ROOM_TOKEN values. Restart Hub so it reads .env.local again."
          : data.reason ?? "The room process is not running.");
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

// Past sessions for the sidebar, or the ones matching a search of 2+ characters; refreshed every few seconds and whenever
// the live session changes stage. A search waits a moment for typing to stop.
function useHistory(liveKey: string, query: string) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const q = query.trim();
  const searching = q.length >= 2;
  useEffect(() => {
    let alive = true;
    const url = searching ? `/api/room/sessions?q=${encodeURIComponent(q)}` : "/api/room/sessions";
    const load = () => fetch(url, { cache: "no-store" })
      .then(r => (r.ok ? (r.json() as Promise<{ sessions?: HistoryItem[] }>) : null))
      .then(data => { if (alive && data?.sessions) setHistory(data.sessions); }, () => {});
    const first = setTimeout(load, searching ? 250 : 0);
    const timer = setInterval(load, 8_000);
    return () => { alive = false; clearTimeout(first); clearInterval(timer); };
  }, [liveKey, q, searching]);
  return { history, searching };
}

// A past session opened from the sidebar, read-only.
function usePastSession(id: string | null) {
  const [past, setPast] = useState<SessionView | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/room/sessions/${id}`, { cache: "no-store" })
      .then(r => (r.ok ? (r.json() as Promise<{ session?: SessionView }>) : null))
      .then(data => { if (alive) setPast(data?.session ?? null); }, () => {});
    return () => { alive = false; };
  }, [id]);
  return id ? past : null;
}

export default function RoomPage() {
  const { status, session: live, offline, pulses, send } = useRoom();
  // An error belongs to the live session it happened in; once another session is live it no longer applies.
  const [failure, setFailure] = useState<{ text: string; liveId: string | null } | null>(null);
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState<"debate" | "deck" | "workflow" | "checks" | "changes" | "files">("debate");
  const [viewing, setViewing] = useState<string | null>(null);
  // "New session" hides the live session it was pressed over; any newer live session shows again by itself.
  const [freshOver, setFreshOver] = useState<string | null | undefined>(undefined);
  const brief = useBrief(status?.agents, status?.folders, status?.repos, status?.buildsRoot, status?.connectors);
  const liveIdRef = useRef<string | null>(null);
  useEffect(() => { liveIdRef.current = live?.id ?? null; }, [live?.id]);
  const { setTask, setQuestion, setAttachments } = brief;
  const act = useCallback(async (path: string, body?: unknown) => {
    const message = await send(path, body);
    setFailure(message ? { text: message, liveId: liveIdRef.current } : null);
    if (!message && ["/api/room/sessions", "/api/room/queue", "/api/room/schedules"].includes(path)) { setTask(""); setQuestion(""); setAttachments([]); }
  }, [send, setTask, setQuestion, setAttachments]);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const liveRunning = Boolean(live && !TERMINAL_STAGES.includes(live.stage));
  const [query, setQuery] = useState("");
  const { history, searching } = useHistory(`${live?.id ?? ""}:${live?.stage ?? ""}`, query);
  const pastView = usePastSession(viewing && viewing !== live?.id ? viewing : null);
  // What the middle column shows: a past session, a blank new one, or the live session.
  const fresh = freshOver !== undefined && (live?.id ?? null) === freshOver;
  // A blank new session stays blank while another runs, so the next one can be queued.
  const session = viewing && viewing !== live?.id ? pastView : fresh ? null : live;
  const isLive = session !== null && session === live;
  const view = useMemo(() => deckView(session, status), [session, status]);
  const liveView = useMemo(() => deckView(live, status), [live, status]);
  const { soundOn, toggle: toggleSound } = useRoomSound(liveView, pulses);
  const theme = useSyncExternalStore(themePref.subscribe, themePref.get, () => "wood" as const);
  const running = isLive && liveRunning;
  const debate = session?.mode === "debate";
  const focus = view.agents.find(a => a.id === (selected ?? session?.active?.agent)) ?? null;
  const showBoard = Boolean(session?.plan && BOARD_STAGES.includes(session.stage));
  const messages = session?.transcript ?? [];
  // "debate" is the default tab; a build session has no debate view, so it falls back to the deck.
  // Changes exists only while the live build runs; it falls back to the deck when the run ends.
  const shown = (tab === "debate" && !debate) || (tab === "changes" && (debate || !running)) ? "deck" : tab;
  const composing = (!session && !(viewing && viewing !== live?.id)) || (isLive && !liveRunning);
  const openSession = (id: string) => { setViewing(id === live?.id ? null : id); setFreshOver(undefined); setSelected(null); };
  const newSession = () => { setViewing(null); setFreshOver(live?.id ?? null); setSelected(null); };

  return (
    <main className="agent-room room-app" data-theme={theme}>
      <RoomSidebar history={history} query={query} onQuery={setQuery} searching={searching} activeId={session?.id ?? null} running={liveRunning} onNew={newSession} onOpen={openSession} soundOn={soundOn} onToggleSound={toggleSound} theme={theme} onTheme={themePref.set} />
      <section className="room-center" aria-label="Room">
        <TopBar session={session} view={view} running={running} act={act} />
        {offline ? (
          <div className="agent-room-offline" role="status">
            <p>Room offline: {offline}</p>
            <p>It starts with Hub (<code>npm run serve</code> or the desktop shortcut). To start it alone, run <code>node scripts/agent-room/server.mjs</code> in the Hub folder.</p>
          </div>
        ) : (
          <div className="room-center-body">
            {session && (
              <div className="agent-room-tabs">
                <Tabs value={shown} onValueChange={value => setTab(value as typeof tab)} className="w-auto">
                  <TabsList aria-label="View">
                    {debate && <TabsTrigger value="debate">Debate</TabsTrigger>}
                    <TabsTrigger value="deck">Deck</TabsTrigger>
                    <TabsTrigger value="workflow">Workflow</TabsTrigger>
                    {!debate && running && <TabsTrigger value="changes">Changes</TabsTrigger>}
                    {!debate && <TabsTrigger value="files">Files</TabsTrigger>}
                    {!debate && <TabsTrigger value="checks">Checks{session.checkRuns?.length ? ` (${session.checkRuns.length})` : ""}</TabsTrigger>}
                  </TabsList>
                </Tabs>
                <Button type="button" variant="neutral" size="sm" className="ml-auto" onClick={() => setDrawer(true)}>Full transcript</Button>
              </div>
            )}
            {shown === "debate" && session ? <DebateView session={session} />
              : shown === "workflow" && session ? <WorkflowPanel session={session} />
              : shown === "checks" && session ? <ChecksPanel session={session} />
              : shown === "changes" && session ? <LiveDiffPanel sessionId={session.id} />
              : shown === "files" && session && !debate ? <FilesPanel sessionId={session.id} stage={session.stage} />
                : <DeckCanvas view={view} pulses={isLive ? pulses : []} selected={selected} onSelect={setSelected} />}
            {session && <Transcript messages={messages.slice(-80)} />}
            {session && isLive && <GateBar session={session} act={act} />}
            {failure && failure.liveId === (live?.id ?? null) && <p role="alert" className="agent-room-error">{failure.text}</p>}
          </div>
        )}
        {!offline && composing && <div className="room-center-foot"><BriefComposer brief={brief} act={act} busy={liveRunning} /></div>}
      </section>
      <aside className="room-right" aria-label="Details">
        {session && <SessionCard session={session} />}
        <LimitsCard quota={status?.quota} />
        <Inspector agent={focus} view={view} session={session} pinned={selected !== null} onSelect={id => setSelected(current => (current === id ? null : id))} />
        {session && <VerdictPanel session={session} act={isLive ? act : undefined} />}
        {showBoard && session?.plan && <TaskBoard tasks={session.plan.tasks} />}
        {!offline && <QueuePanel act={act} />}
        {composing && <WorktreeCleanup />}
        {composing && <BriefSettings brief={brief} quotaWarning={status?.quotaWarning} />}
        {composing && <RoleSets />}
      </aside>
      <TranscriptDrawer open={drawer} onClose={closeDrawer} messages={messages} />
    </main>
  );
}
