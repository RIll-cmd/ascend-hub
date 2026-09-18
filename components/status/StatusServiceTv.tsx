"use client";

import type { ShelfServiceStatus } from "../../app/status/shelf-contract";
import { getStatusPresentation, safeStatusText } from "./status-presentation";

interface StatusServiceTvProps {
  service: ShelfServiceStatus;
}

function formatLastSeen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Last seen unavailable";
  return `Last seen ${date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

export function StatusServiceTv({ service }: StatusServiceTvProps) {
  const presentation = getStatusPresentation(service);
  const activity = safeStatusText(service.activity?.label ?? service.activity?.kind);
  const issue = safeStatusText(service.issue?.message ?? service.issue?.code);
  const isOffline = service.state === "offline";

  return (
    <article className={`status-service-tv status-service-tv--${presentation.tone}`} aria-label={presentation.ariaDescription}>
      <div className="status-service-tv__nameplate">
        <span className="status-service-tv__brand">{presentation.brand}</span>
        <span className="status-service-tv__instance">{service.instanceId}</span>
      </div>

      <div className="status-service-tv__cabinet">
        <div className="status-service-tv__screen" aria-hidden="true">
          <div className="status-service-tv__scanlines" />
          <span className={`status-service-tv__glyph status-service-tv__glyph--${presentation.artwork}`}>
            {presentation.artwork === "core" ? "◈" : presentation.artwork === "vision" ? "◉" : "▣"}
          </span>
          <span className="status-service-tv__screen-status">{presentation.symbol} {presentation.label.toUpperCase()}</span>
        </div>
        <div className="status-service-tv__controls" aria-hidden="true"><i /><i /><i /></div>
      </div>

      <div className="status-service-tv__readout">
        <span className="status-service-tv__state"><span aria-hidden="true">{presentation.symbol}</span> {presentation.label}</span>
        {service.state === "working" && activity && <span className="status-service-tv__detail">{activity}</span>}
        {service.state === "stuck" && issue && <span className="status-service-tv__detail status-service-tv__detail--warning">{issue}</span>}
        {isOffline && <span className="status-service-tv__detail">{formatLastSeen(service.lastHeartbeatAt)}</span>}
        {!isOffline && service.state !== "working" && service.state !== "stuck" && <span className="status-service-tv__detail">Heartbeat confirmed</span>}
      </div>
    </article>
  );
}
