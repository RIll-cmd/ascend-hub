"use client";

import React, { useState, useEffect } from "react";
import { Disc3, Radio, Music2 } from "lucide-react";

interface RetroMediaHudProps {
  title?: string;
  artist?: string;
  isPlaying?: boolean;
  duration?: number;
  currentTime?: number;
  className?: string;
  onHudClick?: (e?: React.MouseEvent) => void;
}

export function RetroMediaHud({
  title = "Perpetual Motion",
  artist = "LukHash",
  isPlaying = true,
  duration = 188,
  currentTime = 56,
  className = "",
  onHudClick,
}: RetroMediaHudProps) {
  const [trackSeconds, setTrackSeconds] = useState(currentTime);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTrackSeconds(prev => (prev + 1) % duration);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, duration]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const progressPercent = Math.min(100, (trackSeconds / duration) * 100);

  return (
    <div
      className={`retro-media-hud-layer ${isPlaying ? "is-playing" : "is-paused"} ${className}`}
      onClick={onHudClick}
      role="group"
      aria-label={`Now Playing: ${title} by ${artist}`}
    >
      {/* Top Left Neon Cyber Badge from Image 2 */}
      <div className="retro-hud-badge-top-left" aria-hidden="true">
        <div className="retro-hud-badge-star">
          <div className="badge-inner-gear">ZZ</div>
        </div>
        <div className="retro-hud-badge-text">
          <span className="badge-neon-script">better than reality</span>
        </div>
      </div>

      {/* Bottom Track HUD Overlay from Image 2 */}
      <div className="retro-hud-track-bar">
        {/* Spinning Vinyl / Cassette Spool */}
        <div className={`retro-hud-vinyl-spool ${isPlaying ? "spinning" : ""}`}>
          <div className="vinyl-groove-ring">
            <div className="vinyl-center-hole" />
          </div>
        </div>

        {/* Track Title & Artist Info */}
        <div className="retro-hud-track-meta">
          <span className="retro-hud-artist">{artist}</span>
          <span className="retro-hud-title">{title}</span>

          {/* Timecode & Progress Bar */}
          <div className="retro-hud-time-row">
            <div className="retro-hud-progress-rail">
              <div
                className="retro-hud-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="retro-hud-timecode">
              {formatTime(trackSeconds)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
