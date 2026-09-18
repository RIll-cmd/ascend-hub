"use client";

import { useStatusShelf } from "../../app/status/use-status-shelf";
import { StatusServiceTv } from "./StatusServiceTv";

function verifiedAt(timestamp: number | null): string | null {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function StatusShelf() {
  const { current, loading, error, stale, lastSuccessfulAt } = useStatusShelf();
  const verified = verifiedAt(lastSuccessfulAt);

  return (
    <section className="status-shelf" aria-labelledby="status-shelf-title">
      <div className="status-shelf__header">
        <div><p className="status-shelf__eyebrow">LIVE OPERATIONS</p><h2 id="status-shelf-title">Status Shelf</h2></div>
        <p className={`status-shelf__feed ${stale ? "status-shelf__feed--stale" : ""}`} role="status" aria-live="polite">
          {loading && !current && "CONNECTING TO STATUS AUTHORITY"}
          {!loading && !error && current && `LIVE SNAPSHOT${verified ? ` · VERIFIED ${verified}` : ""}`}
          {stale && "SNAPSHOT STALE · CORE STATE MAY HAVE CHANGED"}
          {!stale && error && error}
        </p>
      </div>

      {current ? (
        <div className="status-shelf__grid" aria-label="AI service status screens">
          {current.services.map((service) => <StatusServiceTv key={`${service.serviceId}:${service.instanceId}`} service={service} />)}
          {current.services.length === 0 && <p className="status-shelf__empty">No service instances have reported yet.</p>}
        </div>
      ) : <p className="status-shelf__empty">{error ?? "Opening the status channel…"}</p>}

      {stale && verified && <p className="status-shelf__stale-note">Showing the last confirmed snapshot from {verified}. Individual service states have not been changed by Hub.</p>}
    </section>
  );
}
