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
   1. AUTHENTIC "PON!" CRT DISPLAY SCREEN
   ========================================================================== */
export function PonScreen({ isPlaying = true }: { isPlaying?: boolean }) {
  return (
    <div className={`pon-screen-wrapper ${isPlaying ? "playing" : "paused"}`}>
      {/* 1:1 Authentic Reference "PON!" Artwork */}
      <img
        src="/retro-media/screen-pon.png"
        alt="PON! Anime Comic CRT Screen"
        className="pon-authentic-img"
        draggable={false}
      />
      {/* Live CRT Phosphor Scanline Overlay */}
      <div className="crt-scanlines" />
      {/* CRT Curved Phosphor Edge Bloom */}
      <div className="crt-phosphor-bloom" />
      {/* Specular Glass Glint Reflection */}
      <div className="crt-glass-reflection" />
    </div>
  );
}

/* ==========================================================================
   2. AUTHENTIC RETRO CRT TELEVISION COMPONENT
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
  const [tunerAngle, setTunerAngle] = useState(0);
  const [vHoldAngle, setVHoldAngle] = useState(0);

  const handleTunerClick = () => {
    if (!interactive) return;
    synth.play("click");
    setTunerAngle(prev => (prev + 45) % 360);
    onChannelClick?.();
  };

  const handleVHoldClick = () => {
    if (!interactive) return;
    synth.play("click");
    setVHoldAngle(prev => (prev + 30) % 360);
    onPowerToggle?.();
  };

  return (
    <div
      className={`retro-tv-1to1 ${powerOn ? "power-on" : "power-off"} ${className}`}
      style={{ aspectRatio: "318 / 276" }}
    >
      {/* 1. Under-layer: Dynamic CRT Display Screen (Positioned inside bezel hole) */}
      <div className="tv-crt-display-window">
        {powerOn ? (
          <div className="crt-screen-content">
            {channel === "pon" && <PonScreen isPlaying={isPlaying} />}
            {channel === "ambient" && (
              <div className="ambient-screen">
                <div className="stars" /><div className="orb" /><div className="mountains back" /><div className="mountains front" />
                <div className="horizon-grid" />
                <div className="transmission">ASCEND<span>CYBERPUNK BROADCAST</span></div>
                <div className="crt-scanlines" />
                <div className="crt-glass-reflection" />
              </div>
            )}
            {channel === "static" && (
              <div className="crt-static-noise">
                <div className="crt-scanlines" />
                <div className="crt-glass-reflection" />
              </div>
            )}
            {channel === "video" && (
              <div className="crt-video-wrap">
                <video
                  src={videoSrc || "https://dotcom.workos.com/images/launch-week/summer-2026/intro.mp4"}
                  autoPlay={isPlaying}
                  loop
                  muted
                  playsInline
                  className="crt-video-player"
                />
                <div className="crt-scanlines" />
                <div className="crt-glass-reflection" />
              </div>
            )}
          </div>
        ) : (
          <div className="crt-powered-off">
            <div className="crt-off-glare" />
          </div>
        )}
      </div>

      {/* 2. Authentic 1:1 Cel-Shaded TV Chassis (Antenna + Frame + Dials + Sliders) */}
      <img
        src="/retro-media/tv-frame.png"
        alt="1:1 Authentic Retro CRT Television"
        className="tv-chassis-frame-img"
        draggable={false}
      />

      {/* 3. Interactive Overlays Mapped to Knobs & Indicators */}
      {/* Top Channel Tuner Dial Hit Area */}
      <button
        type="button"
        className="tv-knob-target knob-tuner"
        onClick={handleTunerClick}
        title="Rotate Tuner Dial (Cycle Channel)"
        aria-label="Rotate Tuner Dial"
      >
        <div
          className="knob-indicator-needle"
          style={{ transform: `rotate(${tunerAngle}deg)` }}
        />
      </button>

      {/* Bottom V-HOLD Fine Tuning Knob Hit Area */}
      <button
        type="button"
        className="tv-knob-target knob-vhold"
        onClick={handleVHoldClick}
        title="Rotate V-Hold Knob (Toggle Power)"
        aria-label="Rotate V-Hold Knob"
      >
        <div
          className="knob-indicator-needle small"
          style={{ transform: `rotate(${vHoldAngle}deg)` }}
        />
      </button>

      {/* TV Power LED Indicator */}
      <div
        className={`tv-power-led-dot ${powerOn ? "active" : ""}`}
        onClick={onPowerToggle}
        title="Toggle Power"
        aria-hidden="true"
      />
    </div>
  );
}

/* ==========================================================================
   3. AUTHENTIC DVD / VCR PLAYER DECK COMPONENT
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
    <div
      className={`dvd-player-1to1 ${powerOn ? "power-on" : "power-off"} ${className}`}
      style={{ aspectRatio: "532 / 127" }}
    >
      {/* 1. Under-layer: Motorized Red Tape Chamber with Spinning Cassette Reels */}
      <div className="dvd-tape-cavity-window">
        {/* Glowing Red Backlight Chamber */}
        <div className={`tape-backlight ${powerOn && isPlaying ? "active" : ""}`} />

        {/* Rotating Cassette Tape Reels */}
        <div className="tape-reels-container">
          <div className={`tape-reel left ${powerOn && isPlaying ? "spinning" : ""}`}>
            <div className="reel-teeth" />
            <div className="reel-hub" />
          </div>
          <div className={`tape-reel right ${powerOn && isPlaying ? "spinning" : ""}`}>
            <div className="reel-teeth" />
            <div className="reel-hub" />
          </div>
        </div>
      </div>

      {/* 2. Authentic 1:1 Cel-Shaded DVD Deck Frame with Gold Cartridge & OXO Logo */}
      <img
        src="/retro-media/dvd-frame.png"
        alt="1:1 Authentic DVD Player Deck"
        className="dvd-chassis-frame-img"
        draggable={false}
      />

      {/* 3. Interactive Live Overlays */}
      {/* Power Button Overlay */}
      <button
        type="button"
        className={`dvd-btn-target btn-power ${powerOn ? "active" : ""}`}
        onClick={() => {
          if (!interactive) return;
          synth.play("thump");
          onPowerToggle?.();
        }}
        title="Toggle Deck Power"
        aria-label="Power Button"
      >
        <span className="power-halo" />
      </button>

      {/* Transport Play/Pause Button Overlay */}
      <button
        type="button"
        className={`dvd-btn-target btn-play-pause ${isPlaying ? "playing" : "paused"}`}
        onClick={() => {
          if (!interactive) return;
          synth.play("click");
          onPlayToggle?.();
        }}
        title={isPlaying ? "Pause Tape" : "Play Tape"}
        aria-label="Play / Pause"
      >
        <span className="transport-halo" />
      </button>

      {/* Animated LED VU Spectrum Meter Overlay */}
      <div className="dvd-vu-meter-overlay" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6, 7].map(col => (
          <div key={col} className="vu-bar-column">
            {[4, 3, 2, 1, 0].map(row => {
              const segColor = row >= 4 ? "red" : row >= 3 ? "yellow" : "green";
              return (
                <span
                  key={row}
                  className={`vu-dot ${segColor} ${
                    powerOn && isPlaying ? `bounce-${(col + row) % 4}` : ""
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* 4. Atmospheric Neon Floor Reflection: "Press to Play" */}
      <div
        className={`press-to-play-floor-glow ${powerOn && isPlaying ? "active" : ""}`}
        onClick={() => {
          if (!interactive) return;
          synth.play("click");
          onPlayToggle?.();
        }}
        title="Click to toggle playback"
        role="button"
        tabIndex={0}
      />
    </div>
  );
}

/* ==========================================================================
   4. AUTHENTIC STUDIO BOOKSHELF SPEAKER COMPONENT
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
  const imgSrc =
    position === "left"
      ? "/retro-media/speaker-left-isolated.png"
      : "/retro-media/speaker-right-isolated.png";

  return (
    <div
      className={`studio-speaker-1to1 speaker-${position} ${
        powerOn && isPlaying ? "thumping" : ""
      } ${className}`}
    >
      <img
        src={imgSrc}
        alt={`${position === "left" ? "Left" : "Right"} Studio Monitor Speaker`}
        className="speaker-chassis-img"
        draggable={false}
      />
    </div>
  );
}

/* ==========================================================================
   5. COMPLETE 1:1 RETRO MEDIA CENTER STATION
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

  React.useEffect(() => {
    setActiveChannel(channel);
  }, [channel]);

  React.useEffect(() => {
    setIsPlaying(initialPlaying);
  }, [initialPlaying]);

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
      className={`retro-media-center-1to1-root mode-${mode} ${className}`}
      style={{ "--media-scale": scale } as CSSProperties}
    >
      {/* Mode: "all" renders the full, perfectly composed 1:1 anime setup */}
      {mode === "all" ? (
        <div className="media-rig-composite">
          {/* Left Speaker with Coiled Snake Cable */}
          <div className="rig-left-speaker">
            <StudioSpeaker
              position="left"
              isPlaying={isPlaying}
              powerOn={powerOn}
            />
          </div>

          {/* Center Column: CRT Television stacked on DVD Player */}
          <div className="rig-center-stack">
            <RetroTv
              channel={activeChannel}
              isPlaying={isPlaying}
              powerOn={powerOn}
              videoSrc={videoSrc}
              onChannelClick={handleNextChannel}
              onPowerToggle={handlePowerToggle}
              interactive={interactive}
            />
            <DvdPlayer
              isPlaying={isPlaying}
              powerOn={powerOn}
              onPlayToggle={handlePlayToggle}
              onPowerToggle={handlePowerToggle}
              interactive={interactive}
            />
          </div>

          {/* Right Speaker */}
          <div className="rig-right-speaker">
            <StudioSpeaker
              position="right"
              isPlaying={isPlaying}
              powerOn={powerOn}
            />
          </div>
        </div>
      ) : (
        /* Standalone Modular Layouts */
        <div className="modular-layout-container">
          {mode === "speakers-only" && (
            <div className="speakers-pair">
              <StudioSpeaker position="left" isPlaying={isPlaying} powerOn={powerOn} />
              <StudioSpeaker position="right" isPlaying={isPlaying} powerOn={powerOn} />
            </div>
          )}

          {mode === "tv-only" && (
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

          {mode === "tv-deck" && (
            <div className="tv-deck-stack">
              <RetroTv
                channel={activeChannel}
                isPlaying={isPlaying}
                powerOn={powerOn}
                videoSrc={videoSrc}
                onChannelClick={handleNextChannel}
                onPowerToggle={handlePowerToggle}
                interactive={interactive}
              />
              <DvdPlayer
                isPlaying={isPlaying}
                powerOn={powerOn}
                onPlayToggle={handlePlayToggle}
                onPowerToggle={handlePowerToggle}
                interactive={interactive}
              />
            </div>
          )}

          {mode === "deck-only" && (
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
    </div>
  );
}

export default RetroMediaCenter;
