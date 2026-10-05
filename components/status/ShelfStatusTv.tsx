"use client";

import { useEffect, useRef, useState } from "react";
import type { ShelfServiceStatus } from "../../app/status/shelf-contract";
import type { CrtModelProfile } from "../crt-tv-config";
import type { ShelfTvAssignment } from "./shelf-tv-assignment";
import { deriveShelfTvPresentation, type ShelfTvPresentation } from "./status-presentation";
import type { StatusVideoPresentation } from "./status-video";
import { VisionEyeEntity } from "./VisionEyeEntity";
import type { TvSignalScreenMode, VisionEyeDirection } from "./vision-eye-navigation";

export type StatusMediaIssue = "unavailable" | "autoplay" | null;

export function classifyStatusMediaFailure(error: unknown, previous: StatusMediaIssue): Exclude<StatusMediaIssue, null> {
  if (previous === "unavailable") return previous;
  return error instanceof DOMException && error.name === "NotAllowedError" ? "autoplay" : "unavailable";
}

interface ShelfStatusTvProps {
  assignment: ShelfTvAssignment;
  profile: CrtModelProfile;
  service: ShelfServiceStatus | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  presentation?: ShelfTvPresentation;
  nowMs?: number;
  reduceMotion?: boolean;
  signalMode?: TvSignalScreenMode;
  signalDirection?: VisionEyeDirection | null;
  signalActivating?: boolean;
  mediaId?: string;
  onMediaStatusChange?: (serviceId: ShelfTvAssignment["serviceId"], issue: StatusMediaIssue, mediaId: string) => void;
}

const SERVICE_LABELS: Record<ShelfTvAssignment["serviceId"], string> = {
  "ascend-core": "Ascend Core", "ascend-vision": "Ascend Vision",
  "codex-cli": "Codex CLI", "antigravity-cli": "Antigravity",
};

export function getShelfTvAccessibleLabel(assignment: ShelfTvAssignment, presentation: ShelfTvPresentation | undefined,
  mediaIssue: StatusMediaIssue = null): string {
  const media = mediaIssue === "unavailable" ? " Status video unavailable."
    : mediaIssue === "autoplay" ? " Status video playback was blocked." : "";
  return `Open ${assignment.channel} ${SERVICE_LABELS[assignment.serviceId]} status details. ${presentation?.accessibleDescription ?? "Checking status."}${media}`;
}

// A source-keyed child keeps media state and playback independent of polling and selection.
function StatusVideo({ video, reduceMotion, onIssue }: {
  video: StatusVideoPresentation;
  reduceMotion: boolean;
  onIssue: (issue: StatusMediaIssue) => void;
}) {
  const element = useRef<HTMLVideoElement>(null);
  const [issue, setIssue] = useState<StatusMediaIssue>(null);
  const issueCallback = useRef(onIssue);
  useEffect(() => { issueCallback.current = onIssue; }, [onIssue]);
  useEffect(() => { issueCallback.current(issue); }, [issue]);
  useEffect(() => () => issueCallback.current(null), []);

  useEffect(() => {
    const media = element.current;
    if (!media) return;
    let cancelled = false;
    const prepare = () => {
      media.muted = true;
      media.playbackRate = video.playbackRate;
      if (reduceMotion) {
        media.pause();
        // Decode a real frame rather than hiding the video or leaving its black first frame.
        if (Number.isFinite(media.duration) && media.duration > 0) {
          media.currentTime = Math.min(1, media.duration / 2);
        }
      } else {
        media.play()?.catch((error: unknown) => {
          if (cancelled) return;
          setIssue(current => classifyStatusMediaFailure(error, current));
        });
      }
    };
    if (media.readyState >= 2) prepare();
    media.addEventListener("loadeddata", prepare);
    return () => { cancelled = true; media.removeEventListener("loadeddata", prepare); };
  }, [reduceMotion, video.playbackRate]);

  return <>
    <video ref={element} className={`shelf-status-tv__video${issue ? " is-unavailable" : ""}`}
      src={video.src} style={{ objectPosition: video.objectPosition }}
      autoPlay={!reduceMotion} loop muted playsInline preload="auto" tabIndex={-1} aria-hidden="true"
      onError={() => setIssue("unavailable")} />
    {issue ? <div className="shelf-status-tv__static" aria-hidden="true" /> : null}
  </>;
}

export function ShelfStatusTv({ assignment, profile, service, loading, error, stale,
  presentation: suppliedPresentation, nowMs, reduceMotion = false, signalMode = "default",
  signalDirection = null, signalActivating = false, mediaId = assignment.serviceId, onMediaStatusChange }: ShelfStatusTvProps) {
  const [initialNowMs] = useState(() => Date.now());
  const presentation = suppliedPresentation ?? deriveShelfTvPresentation({ service, loading, error, stale, nowMs: nowMs ?? initialNowMs });
  const [mediaIssue, setMediaIssue] = useState<StatusMediaIssue>(null);
  const mediaDescription = mediaIssue === "unavailable" ? " Status video unavailable."
    : mediaIssue === "autoplay" ? " Status video playback was blocked." : "";
  const handleIssue = (issue: StatusMediaIssue) => {
    setMediaIssue(issue);
    onMediaStatusChange?.(assignment.serviceId, issue, mediaId);
  };

  return (
    <div className="crt-tv-wrapper shelf-status-tv" data-freshness={presentation.freshness}>
      {/* Artwork coordinates retain the calibrated CRT crop. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="crt-tv-frame" src={profile.image} alt="" draggable={false} aria-hidden="true" />
      <div className={`crt-screen shelf-status-tv__screen shelf-status-tv__screen--${presentation.lifecycle ?? "unavailable"}${presentation.freshness === "stale" ? " shelf-status-tv__screen--stale" : ""}`}
        style={{ top: profile.screen.top, left: profile.screen.left, width: profile.screen.width,
          height: profile.screen.height, borderRadius: profile.screen.radius }}
        role="status" aria-label={`${SERVICE_LABELS[assignment.serviceId]}. ${presentation.accessibleDescription}${mediaDescription}`}>
        <div className="shelf-status-tv__normal-content">
          {presentation.video ? <StatusVideo key={presentation.video.src} video={presentation.video}
            reduceMotion={reduceMotion} onIssue={handleIssue} />
            : <div className="shelf-status-tv__static" aria-hidden="true" />}
        </div>
        {signalMode !== "default" ? <div className="shelf-status-tv__entity-layer" aria-hidden="true">
          <VisionEyeEntity mode={signalMode} direction={signalDirection} channel={assignment.channel} activating={signalActivating} />
        </div> : null}
        <div className="crt-effects" aria-hidden="true">
          <div className="crt-scanlines" /><div className="crt-glass-reflection" />
          <div className="crt-vignette" /><div className="crt-inner-glow" />
        </div>
      </div>
      <span className="shelf-status-tv__bezel-label" aria-hidden="true">
        {assignment.channel} · {SERVICE_LABELS[assignment.serviceId]}
        {presentation.freshness === "stale" ? <em>Last known</em> : null}
      </span>
      <span className={`shelf-status-tv__selection-light${signalMode !== "default" ? " is-on" : ""}`} aria-hidden="true" />
      <span className="sr-only">{presentation.heading}{mediaDescription}</span>
    </div>
  );
}
