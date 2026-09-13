"use client";
import React, { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";
import { Play, Pause, Power, Volume2, VolumeX, Radio, Tv, Link as LinkIcon, Sparkles, X } from "lucide-react";
import { synth } from "../app/synth";
import {
  useCrtCalibration,
  CrtTransformOverlay,
  CrtCalibratorHud,
  type CrtCalibrationState
} from "./CrtScreenCalibrator";
import { zzzAudio } from "./zzzAudio";
import { ZzzDvdBounce } from "./ZzzDvdBounce";
import { ZzzBangbooGame } from "./ZzzBangbooGame";
import { ZzzWeatherChannel } from "./ZzzWeatherChannel";
import { ZzzDesktopAccessories } from "./ZzzDesktopAccessories";

export type CrtChannelType = "av" | "opening" | "video" | "weather" | "game" | "pon" | "ambient" | "static";

export interface RetroMediaCenterProps {
  mode?: "all" | "tv-only" | "tv-deck" | "deck-only" | "speakers-only";
  channel?: CrtChannelType;
  videoSrc?: string;
  initialPlaying?: boolean;
  interactive?: boolean;
  scale?: number;
  className?: string;
  onTvClick?: () => void;
  onPlayChange?: (playing: boolean) => void;
  onChannelChange?: (channel: string) => void;
}

export interface ParsedMedia {
  type: "youtube" | "video";
  id?: string;
  src?: string;
}

export function parseMediaUrl(url?: string): ParsedMedia {
  if (!url || !url.trim()) {
    return { type: "video", src: "https://dotcom.workos.com/images/launch-week/summer-2026/intro.mp4" };
  }
  const clean = url.trim();
  // Check YouTube patterns: watch?v=, embed/, v/, shorts/, live/, or youtu.be/
  const ytRegex = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
  const match = clean.match(ytRegex);
  if (match && match[1]) {
    return { type: "youtube", id: match[1] };
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return { type: "youtube", id: clean };
  }
  return { type: "video", src: clean };
}

export const PRESET_BROADCASTS = [
  { id: "lofi", name: "Lofi Girl · Chill Beats", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk", icon: "☕" },
  { id: "synthwave", name: "Cyberpunk Synthwave Radio", url: "https://www.youtube.com/watch?v=4xDzrJKXOOY", icon: "🌆" },
  { id: "workos", name: "WorkOS Launch Video (MP4)", url: "https://dotcom.workos.com/images/launch-week/summer-2026/intro.mp4", icon: "🚀" },
  { id: "citypop", name: "80s Anime Retro City Pop", url: "https://www.youtube.com/watch?v=9Gj47G2e1Jc", icon: "📼" },
  { id: "space", name: "Deep Space Ambient Chill", url: "https://www.youtube.com/watch?v=5qap5aO4i9A", icon: "🪐" },
];

/* ==========================================================================
   1. AUTHENTIC "PON!" CRT DISPLAY SCREEN
   ========================================================================== */
export function PonScreen({ isPlaying = true }: { isPlaying?: boolean }) {
  return (
    <div className={`pon-screen-wrapper ${isPlaying ? "playing" : "paused"}`}>
      <img
        src="/retro-media/screen-pon.png"
        alt="PON! Anime Comic CRT Screen"
        className="pon-authentic-img"
        draggable={false}
      />
      <div className="crt-scanlines" />
      <div className="crt-phosphor-bloom" />
      <div className="crt-glass-reflection" />
    </div>
  );
}

/* ==========================================================================
   1B. AUTO-LOOPING CLEAN CRT YOUTUBE PLAYER (NO LOGOS, NO ENDSCREEN)
   ========================================================================== */
interface CrtYouTubePlayerProps {
  videoId: string;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
}

export function CrtYouTubePlayer({ videoId, isPlaying, isMuted, volume }: CrtYouTubePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sendCommand = useCallback((func: string, args: any = "") => {
    try {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: "command", func, args }),
          "*"
        );
      }
    } catch {
      // ignore
    }
  }, []);

  // Sync play / pause
  useEffect(() => {
    if (isPlaying) {
      sendCommand("playVideo");
    } else {
      sendCommand("pauseVideo");
    }
  }, [isPlaying, sendCommand]);

  // Sync mute / volume
  useEffect(() => {
    if (isMuted) {
      sendCommand("mute");
    } else {
      sendCommand("unMute");
      sendCommand("setVolume", [volume]);
    }
  }, [isMuted, volume, sendCommand]);

  // Listen for video ending -> instantly loop without showing YouTube end-card recommendations or logos
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data && data.event === "onStateChange") {
          // 0 = ended -> seekTo(0) & playVideo immediately
          if (data.info === 0) {
            sendCommand("seekTo", [0, true]);
            sendCommand("playVideo");
          }
        }
      } catch {
        // ignore non-json messages
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [sendCommand]);

  return (
    <div className="crt-youtube-crop-frame">
      <iframe
        ref={iframeRef}
        key={videoId}
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&modestbranding=1&rel=0&iv_load_policy=3&loop=1&playlist=${videoId}&enablejsapi=1&playsinline=1`}
        title="Retro CRT YouTube Stream"
        className="crt-youtube-iframe"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

/* ==========================================================================
   2. UNIFIED CRT DISPLAY VIEWPORT (BEZEL LOCKED WITH YOUTUBE & MEDIA PLAYER)
   ========================================================================== */
interface CrtViewportProps {
  channel: CrtChannelType;
  powerOn: boolean;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  mediaUrl: string;
  osdText: string | null;
  calibMode?: "solid-black" | "neon-outline" | "grid" | "video";
  interactive?: boolean;
  onScreenClick?: () => void;
  onUnmuteToggle?: () => void;
  onOpenTuneModal?: () => void;
}

export function CrtViewport({
  channel,
  calibMode = "solid-black",
  powerOn,
  isPlaying,
  isMuted,
  volume,
  mediaUrl,
  osdText,
  interactive = true,
  onScreenClick,
  onUnmuteToggle,
  onOpenTuneModal,
}: CrtViewportProps) {
  const parsed = parseMediaUrl(mediaUrl);

  const getVolBars = (vol: number) => {
    const total = 8;
    const filled = Math.round((vol / 100) * total);
    return "■".repeat(filled) + "□".repeat(total - filled);
  };

  return (
    <div
      className={`crt-screen-content ${powerOn ? "power-on" : "power-off"}`}
      onClick={onScreenClick}
      role="region"
      aria-label="CRT Screen Display"
    >
      {powerOn ? (
        <div className="crt-viewport-inner">
          {/* 1. Solid Black Screen (Clean Reverted State Requested by CB) */}
          {calibMode === "solid-black" && (
            <div className="crt-solid-black-container">
              <div className="crt-black-screen-face" />
              <div className="crt-scanlines" />
              <div className="crt-glass-reflection" />
            </div>
          )}

          {/* 2. Neon Boundary Guide (Highlights outer edge to check alignment against silver bezel) */}
          {calibMode === "neon-outline" && (
            <div className="crt-solid-black-container neon-outline-active">
              <div className="crt-black-screen-face" />
              <div className="crt-neon-bezel-rim" />
              <div className="crt-scanlines" />
              <div className="crt-glass-reflection" />
            </div>
          )}

          {/* 3. Calibration Grid Mode */}
          {calibMode === "grid" && (
            <div className="crt-solid-black-container grid-active">
              <div className="crt-black-screen-face" />
              <div className="crt-calib-grid-lines">
                <div className="grid-cross-h" />
                <div className="grid-cross-v" />
                <div className="grid-sub-lines" />
              </div>
              <div className="crt-scanlines" />
              <div className="crt-glass-reflection" />
            </div>
          )}

          {/* 4. Live Video / Broadcast Channels */}
          {calibMode === "video" && (
            <>
              {/* Channel: AV (ZZZ 3D Bouncing Logo) */}
              {channel === "av" && <ZzzDvdBounce isPlaying={isPlaying} />}

              {/* Channel: OPENING (Native High-Res ZZZ Opening WebM) */}
              {channel === "opening" && (
                <div className="crt-video-wrap">
                  <video
                    key="zzz-opening-native"
                    src="/videos/zzz/zzz_opening.webm"
                    autoPlay={isPlaying}
                    loop
                    muted={isMuted}
                    playsInline
                    className="crt-video-player"
                  />
                  <div className="crt-scanlines video-feed-scanlines" />
                  <div className="crt-glass-reflection" />
                </div>
              )}

              {/* Channel: WEATHER (New Eridu Sixth Street Live Report) */}
              {channel === "weather" && <ZzzWeatherChannel />}

              {/* Channel: GAME (Playable Bangboo Arcade Runner) */}
              {channel === "game" && <ZzzBangbooGame />}

              {/* Channel: PON! Anime comic */}
              {channel === "pon" && <PonScreen isPlaying={isPlaying} />}

              {/* Channel: Cyberpunk Ascend Synthwave Broadcast */}
              {channel === "ambient" && (
                <div className="ambient-screen">
                  <div className="stars" />
                  <div className="orb" />
                  <div className="mountains back" />
                  <div className="mountains front" />
                  <div className="horizon-grid" />
                  <div className="transmission">ASCEND<span>CYBERPUNK BROADCAST</span></div>
                  <div className="crt-scanlines" />
                  <div className="crt-glass-reflection" />
                </div>
              )}

              {/* Channel: CRT Analog Static Noise */}
              {channel === "static" && (
                <div className="crt-static-noise">
                  <div className="crt-scanlines" />
                  <div className="crt-glass-reflection" />
                </div>
              )}

              {/* Channel: Functional YouTube / Media Player */}
              {channel === "video" && (
                <div className="crt-video-wrap">
                  {parsed.type === "youtube" ? (
                    <CrtYouTubePlayer
                      key={parsed.id}
                      videoId={parsed.id || ""}
                      isPlaying={isPlaying}
                      isMuted={isMuted}
                      volume={volume}
                    />
                  ) : (
                    <video
                      key={`${parsed.src}-${isMuted}`}
                      src={parsed.src}
                      autoPlay={isPlaying}
                      loop
                      muted={isMuted}
                      playsInline
                      className="crt-video-player"
                    />
                  )}

                  {/* Sub-scanlines specifically mapped over video feed */}
                  <div className="crt-scanlines video-feed-scanlines" />
                  <div className="crt-glass-reflection" />
                </div>
              )}
            </>
          )}

          {/* Master Barrel-Distortion Vignette & Edge Phosphor Curvature */}
          <div className="crt-barrel-vignette" />

          {/* Master Glass Glint & Corner Shadows */}
          <div className="crt-bezel-recess-shadow" />

          {/* Vintage Green Phosphor OSD (On-Screen Display) */}
          {osdText && (
            <div className="crt-retro-osd">
              <span className="osd-text-line">{osdText}</span>
            </div>
          )}

          {/* Autoplay Audio Unmute Prompt Banner */}
          {isMuted && calibMode === "video" && channel === "video" && (
            <button
              type="button"
              className="crt-unmute-pill"
              onClick={(e) => {
                e.stopPropagation();
                onUnmuteToggle?.();
              }}
              title="Click to unmute video audio"
            >
              <VolumeX size={11} />
              <span>MUTED · CLICK TO UNMUTE</span>
            </button>
          )}

          {/* Pause / Play State Center Overlay */}
          {!isPlaying && powerOn && (
            <div className="crt-play-prompt-overlay">
              <div className="crt-play-prompt-circle">
                <Play size={22} className="crt-play-prompt-icon" />
              </div>
              <span className="crt-play-prompt-label">CLICK TO PLAY</span>
            </div>
          )}
        </div>
      ) : (
        <div className="crt-powered-off">
          <div className="crt-off-glare" />
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   3. COMPACT TUNE CUSTOM YOUTUBE / MEDIA MODAL
   ========================================================================== */
interface TuneModalProps {
  isOpen: boolean;
  currentUrl: string;
  onClose: () => void;
  onTune: (url: string, name?: string) => void;
}

export function TuneMediaModal({ isOpen, currentUrl, onClose, onTune }: TuneModalProps) {
  const [inputVal, setInputVal] = useState(currentUrl);

  useEffect(() => {
    setInputVal(currentUrl);
  }, [currentUrl, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      synth.play("click");
      onTune(inputVal.trim());
      onClose();
    }
  };

  return (
    <div className="crt-tune-modal-backdrop" onClick={onClose}>
      <div
        className="crt-tune-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crt-tune-title"
      >
        <div className="crt-tune-modal-header">
          <div className="crt-tune-title" id="crt-tune-title">
            <span className="crt-dot-live" /> TUNE CRT BROADCAST · YOUTUBE / MEDIA
          </div>
          <button
            type="button"
            className="crt-tune-close-btn"
            onClick={() => {
              synth.play("click");
              onClose();
            }}
            aria-label="Close dialog"
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="crt-tune-form">
          <label className="crt-tune-input-label" htmlFor="crt-custom-input">
            ENTER YOUTUBE URL, VIDEO ID, OR DIRECT MP4:
          </label>
          <div className="crt-tune-input-group">
            <input
              id="crt-custom-input"
              type="text"
              className="crt-tune-input"
              placeholder="https://www.youtube.com/watch?v=..."
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              autoFocus
            />
            <button type="submit" className="crt-tune-submit-btn">
              TUNE IN ▶
            </button>
          </div>
        </form>

        <div className="crt-presets-section">
          <div className="crt-presets-title">QUICK TRANSMISSION PRESETS</div>
          <div className="crt-presets-grid">
            {PRESET_BROADCASTS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="crt-preset-card"
                onClick={() => {
                  synth.play("click");
                  setInputVal(preset.url);
                  onTune(preset.url, preset.name);
                  onClose();
                }}
              >
                <span className="preset-icon">{preset.icon}</span>
                <span className="preset-name">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   4. AUTHENTIC RETRO CRT TELEVISION COMPONENT (STANDALONE)
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
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(75);
  const [mediaUrl, setMediaUrl] = useState(videoSrc || "https://dotcom.workos.com/images/launch-week/summer-2026/intro.mp4");
  const [osdText, setOsdText] = useState<string | null>("CH 01 · PON!");
  const [isTuneOpen, setIsTuneOpen] = useState(false);
  const osdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerOsd = (text: string) => {
    setOsdText(text);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => {
      setOsdText(null);
    }, 2800);
  };

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
    <>
      <div
        className={`retro-tv-1to1 ${powerOn ? "power-on" : "power-off"} ${className}`}
        style={{ aspectRatio: "264 / 263" }}
      >
        {/* 1. Under-layer: Dynamic CRT Display Screen (Positioned inside bezel hole) */}
        <div className="tv-crt-display-window">
          <CrtViewport
            channel={channel}
            powerOn={powerOn}
            isPlaying={isPlaying}
            isMuted={isMuted}
            volume={volume}
            mediaUrl={mediaUrl}
            osdText={osdText}
            interactive={interactive}
            onScreenClick={() => {
              if (channel === "video") {
                setIsTuneOpen(true);
              } else {
                handleTunerClick();
              }
            }}
            onUnmuteToggle={() => {
              synth.play("click");
              setIsMuted(m => !m);
              triggerOsd(isMuted ? "AUDIO UNMUTED 🔊" : "AUDIO MUTED 🔇");
            }}
            onOpenTuneModal={() => setIsTuneOpen(true)}
          />
        </div>

        {/* 2. Authentic 1:1 Cel-Shaded TV Chassis (Antenna + Frame + Dials + Sliders) */}
        <img
          src="/retro-media/tv-frame.png"
          alt="1:1 Authentic Retro CRT Television"
          className="tv-chassis-frame-img"
          draggable={false}
        />

        {/* 3. Interactive Overlays Mapped to Knobs & Indicators */}
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
      </div>

      <TuneMediaModal
        isOpen={isTuneOpen}
        currentUrl={mediaUrl}
        onClose={() => setIsTuneOpen(false)}
        onTune={(url, name) => {
          setMediaUrl(url);
          triggerOsd(`TUNED: ${name || "STREAM"} ▶`);
        }}
      />
    </>
  );
}

/* ==========================================================================
   5. AUTHENTIC OXO RETRO DVD / CASSETTE DECK COMPONENT
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
      className={`dvd-player-1to1 retro-dvd-1to1 ${powerOn ? "power-on" : "power-off"} ${className}`}
      style={{ aspectRatio: "445 / 82" }}
    >
      <div className="dvd-tape-cavity-window">
        <div className={`tape-backlight ${powerOn && isPlaying ? "active" : ""}`} />
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

      <img
        src="/retro-media/dvd-frame.png"
        alt="1:1 Retro Cassette / DVD Deck Chassis"
        className="dvd-chassis-frame-img"
        draggable={false}
      />

      <button
        type="button"
        className={`dvd-btn-target btn-power ${powerOn ? "active" : ""}`}
        onClick={() => {
          if (!interactive) return;
          synth.play("thump");
          onPowerToggle?.();
        }}
        title="Toggle Power Relay"
        aria-label="Power Button"
      >
        <span className="power-halo" />
      </button>

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
    </div>
  );
}

/* ==========================================================================
   6. AUTHENTIC STUDIO MONITOR SPEAKER
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
  const isLeft = position === "left";
  return (
    <div
      className={`studio-speaker-1to1 speaker-${position} ${className}`}
      style={{ aspectRatio: isLeft ? "188 / 188" : "154 / 215" }}
    >
      <img
        src={isLeft ? "/retro-media/speaker-left-isolated.png" : "/retro-media/speaker-right-isolated.png"}
        alt={`Studio Monitor Speaker (${position})`}
        className="speaker-chassis-img"
        draggable={false}
      />
      <div
        className={`speaker-acoustic-pulse ${powerOn && isPlaying ? "thumping" : ""}`}
        aria-hidden="true"
      />
    </div>
  );
}

/* ==========================================================================
   7. MASTER UNIFIED RETRO MEDIA CENTER WORKSTATION (HERO SHELF COMPONENT)
   ========================================================================== */
export function RetroMediaCenter({
  mode = "all",
  channel = "av",
  videoSrc,
  initialPlaying = true,
  interactive = true,
  scale = 1,
  className = "",
  onTvClick,
  onPlayChange,
  onChannelChange
}: RetroMediaCenterProps) {
  const [isPlaying, setIsPlaying] = useState(initialPlaying);
  const [powerOn, setPowerOn] = useState(true);
  const [activeChannel, setActiveChannel] = useState<CrtChannelType>(channel);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(75);
  const [mediaUrl, setMediaUrl] = useState(videoSrc || "https://dotcom.workos.com/images/launch-week/summer-2026/intro.mp4");
  const [osdText, setOsdText] = useState<string | null>(null);
  const [isTuneModalOpen, setIsTuneModalOpen] = useState(false);
  const osdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const { calib, updateCalib, resetCalib } = useCrtCalibration();

  useEffect(() => {
    setActiveChannel(channel);
  }, [channel]);

  useEffect(() => {
    setIsPlaying(initialPlaying);
  }, [initialPlaying]);

  useEffect(() => {
    if (videoSrc) setMediaUrl(videoSrc);
  }, [videoSrc]);

  const channels: CrtChannelType[] = ["av", "opening", "video", "weather", "game", "pon", "ambient", "static"];

  const triggerOsd = (text: string) => {
    setOsdText(text);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => {
      setOsdText(null);
    }, 2800);
  };

  const handlePlayToggle = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    zzzAudio.play("click", 0.4);
    triggerOsd(next ? "▶ PLAY" : "❚❚ PAUSE");
    onPlayChange?.(next);
  };

  const handlePowerToggle = () => {
    zzzAudio.play("light_switch", 0.7);
    setPowerOn(p => {
      const next = !p;
      if (next) {
        zzzAudio.play("tv_static", 0.3);
        triggerOsd(`CH 0${channels.indexOf(activeChannel) + 1} · ONLINE`);
      }
      return next;
    });
  };

  const handleNextChannel = () => {
    const nextIdx = (channels.indexOf(activeChannel) + 1) % channels.length;
    const nextChan = channels[nextIdx];
    setActiveChannel(nextChan);
    zzzAudio.play("radio_static", 0.4);
    const names: Record<CrtChannelType, string> = {
      av: "AV 01 · RANDOM PLAY",
      opening: "CH 02 · ZZZ OPENING TAPE",
      video: "CH 03 · YOUTUBE / MEDIA",
      weather: "CH 04 · NEW ERIDU WEATHER",
      game: "CH 05 · BANGBOO JUMP ARCADE",
      pon: "CH 06 · PON! COMIC",
      ambient: "CH 07 · CYBERPUNK BROADCAST",
      static: "CH 08 · ANALOG STATIC"
    };
    triggerOsd(names[nextChan]);
    onChannelChange?.(nextChan);
  };

  const [tunerAngle, setTunerAngle] = useState(0);
  const [vHoldAngle, setVHoldAngle] = useState(0);

  const handleTunerClick = () => {
    if (!interactive) return;
    zzzAudio.play("click", 0.6);
    setTunerAngle(prev => (prev + 45) % 360);
    handleNextChannel();
  };

  const handleVHoldClick = () => {
    if (!interactive) return;
    zzzAudio.play("click", 0.5);
    setVHoldAngle(prev => (prev + 30) % 360);
    handlePowerToggle();
  };

  return (
    <div
      className={`retro-media-center-1to1-root mode-${mode} ${className}`}
      style={{ "--media-scale": scale } as CSSProperties}
    >
      {/* Mode: "all" renders the complete 1:1 workstation rig */}
      {mode === "all" ? (
        <div
          ref={rigRef}
          className={`unified-media-rig ${powerOn ? "power-on" : "power-off"}`}
          style={{ aspectRatio: "641 / 389" }}
        >
          {/* Authentic ZZZ Desktop Accessories (Top-Right LED Clock & Left Desk Calendar) */}
          <ZzzDesktopAccessories />
          {/* 1. CRT Display Window (Calibrated & Locked into Inner Bezel Aperture) */}
          <div
            className="rig-crt-display-window"
            style={{
              left: `${calib.left}%`,
              top: `${calib.top}%`,
              width: `${calib.width}%`,
              height: `${calib.height}%`,
              borderRadius: `${calib.radiusH}% / ${calib.radiusV}%`,
              transform: `rotate(${calib.rotation}deg) scale(${calib.scale}) skewX(${calib.skewX}deg)`,
            }}
          >
            <CrtViewport
              channel={activeChannel}
              calibMode={calib.mode}
              powerOn={powerOn}
              isPlaying={isPlaying}
              isMuted={isMuted}
              volume={volume}
              mediaUrl={mediaUrl}
              osdText={osdText}
              interactive={interactive}
              onScreenClick={() => {
                if (!powerOn) {
                  setPowerOn(true);
                  setIsPlaying(true);
                  triggerOsd("TV POWER ON ⚡");
                  return;
                }
                handlePlayToggle();
              }}
              onUnmuteToggle={() => {
                synth.play("click");
                setIsMuted(m => !m);
                triggerOsd(isMuted ? "AUDIO UNMUTED 🔊" : "AUDIO MUTED 🔇");
              }}
              onOpenTuneModal={() => setIsTuneModalOpen(true)}
            />
          </div>

          {/* Interactive Freeform Drag & Resize Handles Mapped Over CRT Screen */}
          <CrtTransformOverlay
            calib={calib}
            onUpdate={updateCalib}
            rigRef={rigRef}
          />

          {/* 2. Motorized Tape Window (Cassette Chamber) */}
          <div className="rig-tape-cavity-window">
            <div className={`tape-backlight ${powerOn && isPlaying ? "active" : ""}`} />
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

          {/* 3. Master 1:1 Cel-Shaded Chassis Artwork */}
          <img
            src="/retro-media/media-center-frame.png"
            alt="1:1 Retro Media Center Complete Workstation"
            className="unified-rig-chassis-img"
            draggable={false}
          />

          {/* 4. Interactive Physical Controls */}
          {/* TV Rotary Tuner Dial */}
          <button
            type="button"
            className="rig-tv-knob knob-tuner"
            onClick={handleTunerClick}
            title="Rotate Tuner Dial (Cycle Channel)"
            aria-label="Rotate Tuner Dial"
          >
            <div
              className="knob-indicator-needle"
              style={{ transform: `rotate(${tunerAngle}deg)` }}
            />
          </button>

          {/* TV Fine-Tuning V-HOLD Dial */}
          <button
            type="button"
            className="rig-tv-knob knob-vhold"
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
            className={`rig-tv-led ${powerOn ? "active" : ""}`}
            onClick={handlePowerToggle}
            title="Toggle TV Power"
            aria-hidden="true"
          />


          {/* DVD Standby Power Button */}
          <button
            type="button"
            className={`rig-dvd-btn btn-power ${powerOn ? "active" : ""}`}
            onClick={() => {
              if (!interactive) return;
              synth.play("thump");
              handlePowerToggle();
            }}
            title="Toggle Deck Power"
            aria-label="Power Button"
          >
            <span className="power-halo" />
          </button>

          {/* DVD Transport Play/Pause Button */}
          <button
            type="button"
            className={`rig-dvd-btn btn-play ${isPlaying ? "playing" : "paused"}`}
            onClick={() => {
              if (!interactive) return;
              synth.play("click");
              handlePlayToggle();
            }}
            title={isPlaying ? "Pause Tape" : "Play Tape"}
            aria-label="Play / Pause"
          >
            <span className="transport-halo" />
          </button>

          {/* DVD Animated LED VU Spectrum Meter */}
          <div className="rig-vu-meter" aria-hidden="true">
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

          {/* Speaker Acoustic Woofer Pulses */}
          <div
            className={`rig-woofer-pulse left ${powerOn && isPlaying ? "thumping" : ""}`}
            aria-hidden="true"
          />
          <div
            className={`rig-woofer-pulse right ${powerOn && isPlaying ? "thumping" : ""}`}
            aria-hidden="true"
          />

          {/* Ambient Neon Floor Reflection */}
          <div
            className={`rig-floor-glow ${powerOn && isPlaying ? "active" : ""}`}
            onClick={() => {
              if (!interactive) return;
              synth.play("click");
              handlePlayToggle();
            }}
            title="Click to toggle playback"
            role="button"
            tabIndex={0}
          />
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
              videoSrc={mediaUrl}
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
                videoSrc={mediaUrl}
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

      {/* Tune Custom Media Modal */}
      <TuneMediaModal
        isOpen={isTuneModalOpen}
        currentUrl={mediaUrl}
        onClose={() => setIsTuneModalOpen(false)}
        onTune={(url, name) => {
          setMediaUrl(url);
          setActiveChannel("video");
          updateCalib({ mode: "video" });
          setPowerOn(true);
          setIsPlaying(true);
          triggerOsd(`TUNED: ${name || "STREAM"} ▶`);
          onChannelChange?.("video");
        }}
      />

      {/* Floating Interactive Freeform CRT Calibration HUD */}
      <CrtCalibratorHud
        calib={calib}
        onUpdate={updateCalib}
        onReset={resetCalib}
        currentMediaUrl={mediaUrl}
        onTuneMedia={(url, name) => {
          setMediaUrl(url);
          setActiveChannel("video");
          updateCalib({ mode: "video" });
          setPowerOn(true);
          setIsPlaying(true);
          triggerOsd(`TUNED: ${name || "STREAM"} ▶`);
          onChannelChange?.("video");
        }}
        onOpenTuneModal={() => setIsTuneModalOpen(true)}
      />
    </div>
  );
}

export default RetroMediaCenter;
