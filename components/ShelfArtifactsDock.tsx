"use client";

import { useEffect, useState, useRef } from "react";
import { synth } from "../app/synth";

interface ShelfArtifactsDockProps {
  date?: string;
  onTvClick?: () => void;
  videoSrc?: string;
  edit?: boolean;
}

export function ShelfArtifactsDock({
  date = "SEP 12",
  onTvClick,
  videoSrc,
  edit = false
}: ShelfArtifactsDockProps) {
  const [now, setNow] = useState<Date | null>(null);
  const [laserFiring, setLaserFiring] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fireLaser = () => {
    if (laserFiring) return;
    synth.play("laser");
    setLaserFiring(true);
    setTimeout(() => setLaserFiring(false), 500);
  };

  // Clock format calculations
  const monthDay = now
    ? `${String(now.getMonth() + 1).padStart(2, "0")}:${String(now.getDate()).padStart(2, "0")}`
    : "03:17";
  const year = now ? String(now.getFullYear()) : "2026";
  const hours = now ? now.getHours() : 2;
  const mins = now ? now.getMinutes() : 14;
  const isPm = hours >= 12;
  const hour12 = hours % 12 || 12;
  const hourMin = `${String(hour12).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;

  return (
    <div className="launch-artifacts-dock">
      <div className="launch-artifacts-stage">
        <div className="launch-artifacts-frame">
          {/* Base Layer: Artifacts Off */}
          <picture className="launch-art-layer base">
            <source
              media="(min-width: 768px)"
              srcSet="https://dotcom.workos.com/images/launch-week/summer-2026/desktop-artifacts-off.avif"
            />
            <img
              src="https://dotcom.workos.com/images/launch-week/summer-2026/mobile-artifacts-off.avif"
              alt="Retro media shelf with CRT TV, launch countdown clock, AT-ST figurine, TRON poster, VHS tapes, and snacks"
              draggable={false}
              className="launch-art-img"
            />
          </picture>

          {/* Lit Layer: Artifacts On Glow */}
          <picture className="launch-art-layer lit">
            <source
              media="(min-width: 768px)"
              srcSet="https://dotcom.workos.com/images/launch-week/summer-2026/desktop-artifacts-on.avif"
            />
            <img
              src="https://dotcom.workos.com/images/launch-week/summer-2026/mobile-artifacts-on.avif"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="launch-art-img"
            />
          </picture>

          {/* Neon Hiring Sign Glow */}
          <div className="launch-blockbuster-sign" aria-hidden="true">
            <picture className="launch-art-layer">
              <source
                media="(min-width: 768px)"
                srcSet="https://dotcom.workos.com/images/launch-week/summer-2026/desktop-blockbuster-on.avif"
              />
              <img
                src="https://dotcom.workos.com/images/launch-week/summer-2026/mobile-blockbuster-on.avif"
                alt=""
                draggable={false}
                className="launch-art-img"
              />
            </picture>
          </div>

          {/* Precision Digital Clock */}
          <div className="launch-time-clock" aria-label={`Launch countdown clock: ${monthDay} ${year} ${hourMin} ${isPm ? "PM" : "AM"}`}>
            <div className="launch-time-clock__face">
              {/* Month / Day */}
              <div className="launch-time-clock__field">
                <span className="clock-ghost" aria-hidden="true">88:88</span>
                <span className="clock-lit">{monthDay}</span>
              </div>

              {/* Year */}
              <div className="launch-time-clock__field">
                <span className="clock-ghost" aria-hidden="true">8888</span>
                <span className="clock-lit">{year}</span>
              </div>

              {/* Hour / Minute */}
              <div className="launch-time-clock__field">
                <span className="clock-ghost" aria-hidden="true">88:88</span>
                <span className="clock-lit">{hourMin}</span>
              </div>
            </div>

            {/* AM / PM indicator LEDs */}
            <div className="launch-clock-indicators" aria-hidden="true">
              <span className={`clock-dot ${!isPm ? "active" : ""}`} title="AM" />
              <span className={`clock-dot ${isPm ? "active" : ""}`} title="PM" />
            </div>
          </div>

          {/* Interactive AT-ST Figurine Laser Zone */}
          <button
            type="button"
            className="launch-at-at-laser-zone"
            aria-label="Fire laser from AT-ST figurine"
            onClick={fireLaser}
          >
            {laserFiring && (
              <>
                <span className="launch-laser-beam beam-right" />
                <span className="launch-laser-beam beam-left" />
              </>
            )}
          </button>

          {/* Interactive CRT TV Screen */}
          <div className="launch-tv-mask">
            <div
              className="launch-tv-screen"
              onClick={onTvClick}
              role="button"
              tabIndex={0}
              aria-label="Tune into CRT Television"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTvClick?.();
                }
              }}
            >
              <video
                ref={videoRef}
                src={videoSrc || "https://dotcom.workos.com/images/launch-week/summer-2026/intro.mp4"}
                autoPlay
                muted
                loop
                playsInline
                className="launch-tv-video"
              />
              <div className="launch-tv-scanlines" />
              <div className="launch-tv-glass" />
              <div className="launch-tv-play-badge">
                <span>▶ PLAY</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
