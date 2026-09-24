"use client";

import type { ShelfServiceStatus } from "../../app/status/shelf-contract";
import type { CrtModelProfile } from "../crt-tv-config";
import type { ShelfTvAssignment } from "./shelf-tv-assignment";
import { getStatusPresentation, safeStatusText } from "./status-presentation";
import { getStatusVideo } from "./status-video";
import { VisionEyeEntity } from "./VisionEyeEntity";
import type { TvSignalScreenMode, VisionEyeDirection } from "./vision-eye-navigation";

interface ShelfStatusTvProps {
  assignment: ShelfTvAssignment;
  profile: CrtModelProfile;
  service: ShelfServiceStatus | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  signalMode: TvSignalScreenMode;
  signalDirection: VisionEyeDirection | null;
  signalActivating: boolean;
}

const SERVICE_LABELS: Record<ShelfTvAssignment["serviceId"], string> = {
  "ascend-core": "ASCEND CORE",
  "ascend-vision": "ASCEND VISION",
  "codex-cli": "CODEX CLI",
  "antigravity-cli": "ANTIGRAVITY",
};

function lastSeenLabel(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "LAST SEEN UNKNOWN";
  return `SEEN ${value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function ShelfStatusTv({
  assignment,
  profile,
  service,
  loading,
  error,
  stale,
  signalMode,
  signalDirection,
  signalActivating,
}: ShelfStatusTvProps) {
  const presentation = service ? getStatusPresentation(service) : null;
  const state = service?.state ?? "unavailable";
  const statusVideo = getStatusVideo(state);
  const activity = safeStatusText(service?.activity?.label ?? service?.activity?.kind, 34);
  const issue = safeStatusText(service?.issue?.message ?? service?.issue?.code, 34);
  const detail = service
    ? service.state === "offline"
      ? lastSeenLabel(service.lastHeartbeatAt)
      : service.state === "working"
        ? activity ?? "OPERATION ACTIVE"
        : service.state === "stuck"
          ? issue ?? "ATTENTION REQUIRED"
          : "HEARTBEAT CONFIRMED"
    : loading
      ? "OPENING STATUS CHANNEL"
      : error
        ? "AUTHORITY UNAVAILABLE"
        : "NO INSTANCE REPORTED";
  const stateLabel = presentation?.label.toUpperCase() ?? (loading ? "CONNECTING" : "NO SIGNAL");
  const symbol = presentation?.symbol ?? "·";
  const ariaLabel = service
    ? `${presentation?.ariaDescription}${stale ? ", stale snapshot" : ""}. ${detail}`
    : `${SERVICE_LABELS[assignment.serviceId]}, ${detail}`;

  return (
    <div className="crt-tv-wrapper shelf-status-tv">
      {/* Calibrated screen coordinates depend on the source artwork's exact box. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="crt-tv-frame" src={profile.image} alt="" draggable={false} aria-hidden="true" />
      <div
        className={`crt-screen shelf-status-tv__screen shelf-status-tv__screen--${state}${stale ? " shelf-status-tv__screen--stale" : ""}`}
        style={{
          top: profile.screen.top,
          left: profile.screen.left,
          width: profile.screen.width,
          height: profile.screen.height,
          borderRadius: profile.screen.radius,
        }}
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
      >
        <div
          className={`shelf-status-tv__normal-content${signalMode === "default" ? "" : " is-suppressed"}`}
          aria-hidden={signalMode !== "default"}
        >
          {statusVideo ? (
            <video
              key={statusVideo.src}
              className="shelf-status-tv__video"
              src={statusVideo.src}
              style={{ objectPosition: statusVideo.objectPosition }}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              tabIndex={-1}
              aria-hidden="true"
              onLoadedMetadata={(event) => {
                event.currentTarget.muted = true;
                event.currentTarget.playbackRate = statusVideo.playbackRate;
              }}
            />
          ) : null}
          <div className="shelf-status-tv__signal" aria-hidden="true">
            <div className="shelf-status-tv__heading">
              <span><i />{assignment.channel}</span>
              <span>{stale ? "STALE" : "LIVE"}</span>
            </div>
            <strong className="shelf-status-tv__service">{SERVICE_LABELS[assignment.serviceId]}</strong>
            <div className="shelf-status-tv__state">
              <b>{symbol}</b>
              <span>{stateLabel}</span>
            </div>
            <span className="shelf-status-tv__detail">{detail}</span>
          </div>
        </div>
        {signalMode !== "default" ? (
          <div className="shelf-status-tv__entity-layer">
            <VisionEyeEntity
              mode={signalMode}
              direction={signalDirection}
              channel={assignment.channel}
              activating={signalActivating}
            />
          </div>
        ) : null}
        <div className="crt-effects" aria-hidden="true">
          <div className="crt-scanlines" />
          <div className="crt-glass-reflection" />
          <div className="crt-vignette" />
          <div className="crt-inner-glow" />
        </div>
      </div>
    </div>
  );
}
