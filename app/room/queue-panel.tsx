"use client";
import { useEffect, useState } from "react";
import { SideSection, type Act } from "./room-parts";

type Item = { id: string; title: string; source: string; addedAt: string };
type Failed = Item & { error: string };
type Schedule = { id: string; title: string; repeat: "once" | "daily" | "weekdays"; nextRun: string };
export type QueueView = { items: Item[]; failed: Failed[]; schedules: Schedule[] };

const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const REPEAT = { once: "once", daily: "every day", weekdays: "weekdays" } as const;

// The room's queue and schedules, refreshed every few seconds; reload() fetches again at once. The page polls once and
// shares it with the panel and the 3D room.
export function useQueue(): [QueueView | null, () => void] {
  const [view, setView] = useState<QueueView | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/room/queue", { cache: "no-store" })
      .then(r => (r.ok ? (r.json() as Promise<QueueView>) : null))
      .then(data => { if (alive && data) setView(data); }, () => {});
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 5_000);
    return () => { alive = false; clearTimeout(first); clearInterval(timer); };
  }, [tick]);
  return [view, () => setTick(t => t + 1)];
}

// Each entry can be removed.
export function QueuePanel({ act, view, reload }: { act: Act; view: QueueView | null; reload: () => void }) {
  if (!view) return null;
  const count = view.items.length + view.schedules.length;
  const remove = (id: string) => void act("/api/room/queue/remove", { id }).then(reload);
  return (
    <SideSection title="Queue" value={count ? `${view.items.length} waiting · ${view.schedules.length} scheduled` : "empty"} open={count > 0 || view.failed.length > 0}>
      <ol className="agent-room-queue" aria-label="Waiting sessions">
        {view.items.map((item, i) => (
          <li key={item.id}>
            <span>{i + 1}. {item.title}</span>
            <small>{item.source.startsWith("schedule:") ? "from a schedule" : "queued"} {when(item.addedAt)}</small>
            <button type="button" aria-label={`Remove ${item.title}`} onClick={() => remove(item.id)}>×</button>
          </li>
        ))}
      </ol>
      {view.items.length === 0 && <p className="agent-room-hint">Nothing waiting. While a session runs, New session queues the next one.</p>}
      {view.schedules.length > 0 && (
        <ul className="agent-room-queue" aria-label="Schedules">
          {view.schedules.map(s => (
            <li key={s.id}>
              <span>{s.title}</span>
              <small>{REPEAT[s.repeat]} · next {when(s.nextRun)}</small>
              <button type="button" aria-label={`Remove schedule ${s.title}`} onClick={() => remove(s.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
      {view.failed.length > 0 && (
        <ul className="agent-room-queue" aria-label="Sessions that could not start">
          {view.failed.map(f => (
            <li key={f.id} className="is-problem">
              <span>{f.title}</span>
              <small>could not start: {f.error}</small>
              <button type="button" aria-label={`Dismiss ${f.title}`} onClick={() => remove(f.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </SideSection>
  );
}
