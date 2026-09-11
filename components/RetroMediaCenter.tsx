"use client";
import React, { useState, type CSSProperties } from "react";
import { Play, Pause, Power } from "lucide-react";
import { synth } from "../app/synth";

export interface RetroMediaCenterProps {
  mode?: "all" | "tv-only" | "tv-deck" | "deck-only" | "speakers-only";
  channel?: "pon" | "ambient" | "static" | "video";
  videoSrc?: string;
  initialPlaying?: boolean;
  interactive?: boolean;
  scale?: number;
  className?: string;
  onPlayChange?: (playing: boolean) => void;
  onChannelChange?: (channel: string) => void;
}

/* ==========================================================================
   1. DUAL RABBIT-EAR ANTENNA
   ========================================================================== */
export function RetroAntenna({ className = "" }: { className?: string }) {
  return (
    <div className={`retro-antenna-wrap ${className}`} aria-hidden="true">
      <svg viewBox="0 0 320 120" className="retro-antenna-svg">
        <defs>
          <linearGradient id="antenna-metal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4a4c52" />
            <stop offset="35%" stopColor="#d2d5dc" />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="65%" stopColor="#9a9ca6" />
            <stop offset="100%" stopColor="#2b2d32" />
          </linearGradient>
          <linearGradient id="antenna-tip" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff4d6d" />
            <stop offset="100%" stopColor="#991b30" />
          </linearGradient>
          <filter id="antenna-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#000000" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Antenna Base Mount */}
        <ellipse cx="160" cy="112" rx="24" ry="7" fill="#181a1e" stroke="#343840" strokeWidth="1.5" />
        <ellipse cx="160" cy="110" rx="16" ry="4" fill="#2d3038" />

        {/* Left Rod */}
        <g filter="url(#antenna-shadow)">
          <line x1="154" y1="108" x2="68" y2="12" stroke="url(#antenna-metal)" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="68" cy="12" r="4.5" fill="url(#antenna-tip)" stroke="#ffffff" strokeWidth="0.8" />
          <circle cx="154" cy="108" r="4" fill="#181a1e" stroke="#484d56" strokeWidth="1" />
        </g>

        {/* Right Rod */}
        <g filter="url(#antenna-shadow)">
          <line x1="166" y1="108" x2="252" y2="12" stroke="url(#antenna-metal)" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="252" cy="12" r="4.5" fill="url(#antenna-tip)" stroke="#ffffff" strokeWidth="0.8" />
          <circle cx="166" cy="108" r="4" fill="#181a1e" stroke="#484d56" strokeWidth="1" />
        </g>
      </svg>
    </div>
  );
}

/* ==========================================================================
   2. "PON!" ANIME CRT DISPLAY SCREEN
   ========================================================================== */
export function PonScreen({ isPlaying = true }: { isPlaying?: boolean }) {
  return (
    <div className={`pon-screen-wrapper ${isPlaying ? "playing" : "paused"}`}>
      {/* Background Anime Comic Burst */}
      <div className="pon-bg-lines" />
      
      {/* Central "PON!" Graphic (Faithful SVG recreation of reference) */}
      <svg viewBox="0 0 400 300" className="pon-graphic-svg" aria-label="PON! Retro Comic Title">
        <defs>
          <linearGradient id="pon-pink-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ff5292" />
            <stop offset="50%" stopColor="#ff2370" />
            <stop offset="100%" stopColor="#c20048" />
          </linearGradient>
          <linearGradient id="pon-dark-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#252c38" />
            <stop offset="100%" stopColor="#0d1117" />
          </linearGradient>
          <pattern id="pon-hatch" width="4" height="4" patternTransform="rotate(0 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="2" x2="4" y2="2" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
          </pattern>
          <filter id="pon-glow">
            <feGaussianBlur stdDeviation="3" result="glow" />
            <feComposite in="SourceGraphic" in2="glow" operator="over" />
          </filter>
        </defs>

        {/* Deep Outline Drop Shadow */}
        <g transform="translate(6, 8)" opacity="0.65">
          <text
            x="200"
            y="210"
            textAnchor="middle"
            className="pon-text-shadow"
            style={{ font: "900 160px 'Barlow Condensed', sans-serif", letterSpacing: "-4px" }}
          >
            PON!
          </text>
        </g>

        {/* Base Dark Slanted Letters */}
        <text
          x="200"
          y="204"
          textAnchor="middle"
          fill="url(#pon-dark-grad)"
          stroke="#000"
          strokeWidth="10"
          style={{ font: "900 160px 'Barlow Condensed', sans-serif", letterSpacing: "-4px" }}
        >
          PON!
        </text>

        {/* Hot Pink Main Typography with Hatching */}
        <text
          x="196"
          y="200"
          textAnchor="middle"
          fill="url(#pon-pink-grad)"
          stroke="#ffe6f0"
          strokeWidth="3.5"
          filter="url(#pon-glow)"
          style={{ font: "900 160px 'Barlow Condensed', sans-serif", letterSpacing: "-4px" }}
        >
          PON!
        </text>

        {/* Horizontal Scanline Overlay on Text */}
        <text
          x="196"
          y="200"
          textAnchor="middle"
          fill="url(#pon-hatch)"
          style={{ font: "900 160px 'Barlow Condensed', sans-serif", letterSpacing: "-4px" }}
        >
          PON!
        </text>

        {/* CRT Specular Glint Reflection */}
        <path
          d="M 90 70 Q 200 40 310 70 Q 200 110 90 70 Z"
          fill="rgba(255, 255, 255, 0.28)"
          filter="blur(3px)"
        />

        {/* 25% Retro Starburst Discount Badge (Exact from Reference Photo) */}
        <g transform="translate(306, 222) rotate(-8)">
          <path
            d="M 0,-24 L 6,-18 L 14,-22 L 16,-14 L 24,-14 L 21,-6 L 27,-2 L 21,5 L 25,12 L 17,14 L 17,23 L 9,20 L 4,26 L 0,20 L -5,26 L -9,20 L -17,23 L -17,14 L -25,12 L -21,5 L -27,-2 L -21,-6 L -24,-14 L -16,-14 L -14,-22 L -6,-18 Z"
            fill="#ff3b7c"
            stroke="#ffffff"
            strokeWidth="1.8"
            filter="drop-shadow(0 2px 4px rgba(0,0,0,0.6))"
          />
          <text
            x="0"
            y="-4"
            textAnchor="middle"
            fill="#ffffff"
            style={{ font: "800 10px 'IBM Plex Mono', monospace", letterSpacing: "-0.5px" }}
          >
            25%
          </text>
          <text
            x="0"
            y="7"
            textAnchor="middle"
            fill="#ffe4ed"
            style={{ font: "700 7px 'IBM Plex Mono', monospace", letterSpacing: "0.5px" }}
          >
            SUPER
          </text>
        </g>
      </svg>
    </div>
  );
}

/* ==========================================================================
   3. RETRO CRT TELEVISION COMPONENT
   ========================================================================== */
export function RetroTv({
  channel = "pon",
  isPlaying = true,
  powerOn = true,
  videoSrc,
  onChannelClick,
  onPowerToggle,
  interactive = true,
  className = ""
}: {
  channel?: "pon" | "ambient" | "static" | "video";
  isPlaying?: boolean;
  powerOn?: boolean;
  videoSrc?: string;
  onChannelClick?: () => void;
  onPowerToggle?: () => void;
  interactive?: boolean;
  className?: string;
}) {
  const [sliderA, setSliderA] = useState(65);
  const [sliderB, setSliderB] = useState(48);
  const [sliderC, setSliderC] = useState(78);

  return (
    <div className={`retro-tv-chassis ${powerOn ? "power-on" : "power-off"} ${className}`}>
      {/* Rabbit-Ear Antenna on Top */}
      <RetroAntenna />

      {/* Main Cabinet Body */}
      <div className="retro-tv-body">
        {/* Curved Glass CRT Screen Section */}
        <div className="retro-crt-housing">
          <div className="retro-crt-bezel">
            <div className="retro-crt-screen">
              {powerOn ? (
                <>
                  {channel === "pon" && <PonScreen isPlaying={isPlaying} />}
                  {channel === "ambient" && (
                    <div className="ambient-screen">
                      <div className="stars" /><div className="orb" /><div className="mountains back" /><div className="mountains front" />
                      <div className="horizon-grid" /><div className="transmission">ASCEND<span>CYBERPUNK BROADCAST</span></div>
                    </div>
                  )}
                  {channel === "static" && (
                    <div className="crt-static-noise" />
                  )}
                  {channel === "video" && (
                    <video
                      src={videoSrc || "https://dotcom.workos.com/images/launch-week/summer-2026/intro.mp4"}
                      autoPlay={isPlaying}
                      loop
                      muted
                      playsInline
                      className="crt-video-player"
                    />
                  )}

                  {/* CRT Scanlines, Phosphor Grain & Vignette */}
                  <div className="crt-scanlines" />
                  <div className="crt-phosphor-bloom" />
                  <div className="crt-glass-reflection" />
                </>
              ) : (
                <div className="crt-powered-off">
                  <div className="crt-off-glare" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right TV Control Panel */}
        <div className="retro-tv-controls">
          {/* Top Rotary Channel Dial */}
          <div className="tuner-dial-section">
            <span className="dial-label">TUNER</span>
            <button
              type="button"
              className="rotary-dial"
              title="Click to switch channel"
              onClick={() => {
                if (!interactive) return;
                synth.play("click");
                onChannelClick?.();
              }}
              aria-label="Channel Selector Rotary Dial"
            >
              <div className="dial-face">
                <div className="dial-notch" />
                <div className="dial-notch" style={{ transform: "rotate(45deg)" }} />
                <div className="dial-notch" style={{ transform: "rotate(90deg)" }} />
                <div className="dial-notch" style={{ transform: "rotate(135deg)" }} />
                <div className="dial-indicator" />
              </div>
            </button>
          </div>

          {/* Bottom Rotary Fine Tuning Knob */}
          <div className="tuner-dial-section">
            <span className="dial-label">V-HOLD</span>
            <button
              type="button"
              className="rotary-dial dial-small"
              title="Click to toggle power"
              onClick={() => {
                if (!interactive) return;
                synth.play("click");
                onPowerToggle?.();
              }}
              aria-label="Fine Tuning Dial"
            >
              <div className="dial-face">
                <div className="dial-notch" />
                <div className="dial-notch" style={{ transform: "rotate(60deg)" }} />
                <div className="dial-indicator" />
              </div>
            </button>
          </div>

          {/* Speaker Slats */}
          <div className="tv-speaker-slats">
            <span /><span /><span /><span /><span /><span />
          </div>

          {/* RGB Color / Brightness Slider Controls (Exact from reference) */}
          <div className="tv-sliders-panel">
            <div className="slider-track red">
              <div
                className="slider-thumb"
                style={{ bottom: `${sliderA}%` }}
                onClick={() => setSliderA(v => (v > 80 ? 30 : v + 25))}
              />
            </div>
            <div className="slider-track green">
              <div
                className="slider-thumb"
                style={{ bottom: `${sliderB}%` }}
                onClick={() => setSliderB(v => (v > 80 ? 25 : v + 25))}
              />
            </div>
            <div className="slider-track blue">
              <div
                className="slider-thumb"
                style={{ bottom: `${sliderC}%` }}
                onClick={() => setSliderC(v => (v > 80 ? 35 : v + 25))}
              />
            </div>
          </div>

          {/* TV Power LED */}
          <div
            className={`tv-power-indicator ${powerOn ? "active" : ""}`}
            onClick={onPowerToggle}
            title="Toggle TV Power"
          >
            <i className="power-led-dot" />
            <span>POWER</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   4. DVD / VCR PLAYER DECK COMPONENT
   ========================================================================== */
export function DvdPlayer({
  isPlaying = true,
  powerOn = true,
  onPlayToggle,
  onPowerToggle,
  interactive = true,
  className = ""
}: {
  isPlaying?: boolean;
  powerOn?: boolean;
  onPlayToggle?: () => void;
  onPowerToggle?: () => void;
  interactive?: boolean;
  className?: string;
}) {
  return (
    <div className={`dvd-player-chassis ${powerOn ? "power-on" : "power-off"} ${className}`}>
      {/* Golden Cartridge resting on top left */}
      <div className="gold-cartridge-prop" title="Retro ROM Cartridge" aria-hidden="true">
        <div className="cartridge-body">
          <div className="cartridge-notch" />
          <div className="cartridge-label">SONIC '26</div>
        </div>
      </div>

      <div className="dvd-front-panel">
        {/* Left Section: Dual Circular Bass / Speaker Ports */}
        <div className="dvd-left-ports">
          <div className="mini-sub-port">
            <div className="port-rim" />
            <div className="port-cone" />
            <div className="port-cap" />
          </div>
          <div className="mini-sub-port">
            <div className="port-rim" />
            <div className="port-cone" />
            <div className="port-cap" />
          </div>
        </div>

        {/* Center-Left: Power Button with Green Ring */}
        <div className="dvd-power-section">
          <button
            type="button"
            className={`dvd-power-btn ${powerOn ? "active" : ""}`}
            onClick={() => {
              if (!interactive) return;
              synth.play("thump");
              onPowerToggle?.();
            }}
            title="Toggle Deck Power"
            aria-label="Power Button"
          >
            <Power size={13} className="power-icon" />
          </button>
        </div>

        {/* Center: Motorized Cassette / Disc Slot with Glowing Red Tape Window */}
        <div className="dvd-slot-section">
          <div className="tape-slot-housing">
            <div className="tape-window-glass">
              {/* Glowing Red Backlight Cavity */}
              <div className={`tape-backlight ${powerOn && isPlaying ? "active" : ""}`} />

              {/* Left Tape Reel */}
              <div className={`tape-reel left ${powerOn && isPlaying ? "spinning" : ""}`}>
                <div className="reel-teeth" />
                <div className="reel-hub" />
              </div>

              {/* Right Tape Reel */}
              <div className={`tape-reel right ${powerOn && isPlaying ? "spinning" : ""}`}>
                <div className="reel-teeth" />
                <div className="reel-hub" />
              </div>
            </div>
            <div className="slot-tray-line" />
          </div>
        </div>

        {/* Center-Right: Transport Keys & OXO Branding */}
        <div className="dvd-controls-section">
          <div className="transport-buttons">
            <button
              type="button"
              className={`transport-btn ${isPlaying ? "active" : ""}`}
              onClick={() => {
                if (!interactive) return;
                synth.play("click");
                onPlayToggle?.();
              }}
              title={isPlaying ? "Pause" : "Play"}
              aria-label="Play / Pause"
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} fill="currentColor" />}
            </button>
          </div>

          {/* "OXO" Retro Brand Logo (Exact from reference) */}
          <div className="oxo-brand-logo" aria-label="OXO Brand">
            <span className="oxo-o1">O</span>
            <span className="oxo-x">X</span>
            <span className="oxo-o2">O</span>
          </div>
        </div>

        {/* Right Section: Animated LED VU Equalizer Spectrum Meter */}
        <div className="dvd-vu-meter-section">
          <div className="vu-meter-display">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(barIdx => (
              <div key={barIdx} className="vu-meter-column">
                {[1, 2, 3, 4, 5].map(segIdx => {
                  const segColor = segIdx >= 5 ? "red" : segIdx >= 4 ? "yellow" : "green";
                  return (
                    <span
                      key={segIdx}
                      className={`vu-segment ${segColor} ${powerOn && isPlaying ? `bounce-${(barIdx + segIdx) % 4}` : ""}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <div className="dvd-eject-bars">
            <span /><span /><span />
          </div>
        </div>
      </div>

      {/* Atmospheric Neon Floor Glow: "Press to Play" */}
      <div
        className={`press-to-play-glow ${powerOn && isPlaying ? "active" : ""}`}
        onClick={() => {
          if (!interactive) return;
          synth.play("click");
          onPlayToggle?.();
        }}
        title="Click to toggle playback"
      >
        <span className="glow-text">Press to Play</span>
      </div>
    </div>
  );
}

/* ==========================================================================
   5. STUDIO BOOKSHELF SPEAKER COMPONENT
   ========================================================================== */
export function StudioSpeaker({
  position = "left",
  isPlaying = true,
  powerOn = true,
  className = ""
}: {
  position?: "left" | "right";
  isPlaying?: boolean;
  powerOn?: boolean;
  className?: string;
}) {
  return (
    <div className={`studio-speaker-cabinet speaker-${position} ${className}`}>
      {/* Top Silk Dome Tweeter */}
      <div className="speaker-tweeter-housing">
        <div className="tweeter-bracket">
          <div className="tweeter-dome" />
          <div className="tweeter-lens" />
        </div>
      </div>

      {/* Large Bass Woofer Cone (Pulses with audio) */}
      <div className="speaker-woofer-housing">
        <div className="woofer-surround">
          <div className={`woofer-cone ${powerOn && isPlaying ? "pulsing" : ""}`}>
            <div className="woofer-rib-rings" />
            <div className="woofer-dust-cap" />
          </div>
        </div>
      </div>

      {/* Bottom Bass Reflex Vent */}
      <div className="speaker-bass-vent" />

      {/* Coiled Audio Snake Cable (Left Speaker only, exact from reference) */}
      {position === "left" && (
        <div className="speaker-coiled-cable" aria-hidden="true">
          <svg viewBox="0 0 100 45" className="cable-svg">
            <path
              d="M 5 25 C 20 5, 45 5, 55 25 C 65 40, 30 42, 22 28 C 15 15, 75 10, 85 24 C 92 34, 70 38, 62 26 C 55 16, 95 18, 98 28"
              fill="none"
              stroke="#1a1c22"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M 5 25 C 20 5, 45 5, 55 25 C 65 40, 30 42, 22 28 C 15 15, 75 10, 85 24 C 92 34, 70 38, 62 26 C 55 16, 95 18, 98 28"
              fill="none"
              stroke="#383c47"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   6. COMPLETE ALL-IN-ONE RETRO MEDIA CENTER STATION
   ========================================================================== */
export function RetroMediaCenter({
  mode = "all",
  channel = "pon",
  videoSrc,
  initialPlaying = true,
  interactive = true,
  scale = 1,
  className = "",
  onPlayChange,
  onChannelChange
}: RetroMediaCenterProps) {
  const [isPlaying, setIsPlaying] = useState(initialPlaying);
  const [powerOn, setPowerOn] = useState(true);
  const [activeChannel, setActiveChannel] = useState<"pon" | "ambient" | "static" | "video">(channel);

  const channels: Array<"pon" | "ambient" | "static" | "video"> = ["pon", "ambient", "static", "video"];

  const handlePlayToggle = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    onPlayChange?.(next);
  };

  const handlePowerToggle = () => {
    setPowerOn(p => !p);
  };

  const handleNextChannel = () => {
    const nextIdx = (channels.indexOf(activeChannel) + 1) % channels.length;
    const nextChan = channels[nextIdx];
    setActiveChannel(nextChan);
    onChannelChange?.(nextChan);
  };

  return (
    <div
      className={`retro-media-center-root mode-${mode} ${className}`}
      style={{ "--media-scale": scale } as CSSProperties}
    >
      {/* 1. Left Bookshelf Speaker */}
      {(mode === "all" || mode === "speakers-only") && (
        <StudioSpeaker
          position="left"
          isPlaying={isPlaying}
          powerOn={powerOn}
        />
      )}

      {/* 2. Center Stack: TV + DVD Player + Glow */}
      {mode !== "speakers-only" && (
        <div className="center-media-stack">
          {/* CRT Television */}
          {(mode === "all" || mode === "tv-only" || mode === "tv-deck") && (
            <RetroTv
              channel={activeChannel}
              isPlaying={isPlaying}
              powerOn={powerOn}
              videoSrc={videoSrc}
              onChannelClick={handleNextChannel}
              onPowerToggle={handlePowerToggle}
              interactive={interactive}
            />
          )}

          {/* DVD / VCR Player Deck */}
          {(mode === "all" || mode === "tv-deck" || mode === "deck-only") && (
            <DvdPlayer
              isPlaying={isPlaying}
              powerOn={powerOn}
              onPlayToggle={handlePlayToggle}
              onPowerToggle={handlePowerToggle}
              interactive={interactive}
            />
          )}
        </div>
      )}

      {/* 3. Right Bookshelf Speaker */}
      {(mode === "all" || mode === "speakers-only") && (
        <StudioSpeaker
          position="right"
          isPlaying={isPlaying}
          powerOn={powerOn}
        />
      )}
    </div>
  );
}

export default RetroMediaCenter;
