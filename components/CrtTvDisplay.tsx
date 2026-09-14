"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Volume2, VolumeX, Play, Pause } from "lucide-react";
import type { CrtTvItem } from "./crt-tv-config";

interface CrtTvDisplayProps {
  config: CrtTvItem;
  className?: string;
}

export function CrtTvDisplay({ config, className = "" }: CrtTvDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Synchronize playback across multiple CRT TVs: pause this video if another TV plays
  useEffect(() => {
    const handleRemotePlay = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id !== config.id) {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
    };

    window.addEventListener("ascend-crt-play", handleRemotePlay);
    return () => {
      window.removeEventListener("ascend-crt-play", handleRemotePlay);
    };
  }, [config.id]);

  // IntersectionObserver: automatically pause video if scrolled out of the viewport
  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting && isPlaying) {
            videoRef.current?.pause();
            setIsPlaying(false);
          }
        });
      },
      { threshold: 0.15 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isPlaying]);

  // Toggle play/pause
  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      try {
        // Broadcast to pause any other active TV
        window.dispatchEvent(
          new CustomEvent("ascend-crt-play", { detail: { id: config.id } })
        );

        video.muted = isMuted;
        await video.play();
        setIsPlaying(true);
      } catch {
        // Browser autoplay restriction fallback: play muted if unmuted fails
        try {
          video.muted = true;
          setIsMuted(true);
          await video.play();
          setIsPlaying(true);
        } catch {
          setIsPlaying(false);
        }
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [config.id, isMuted]);

  // Toggle sound without toggling play/pause
  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
  }, []);

  // Keyboard navigation for accessibility
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      togglePlayback();
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      const video = videoRef.current;
      if (video) {
        video.muted = !video.muted;
        setIsMuted(video.muted);
      }
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`crt-tv-wrapper ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Authentic Physical TV Frame (100% Unmodified PNG Artwork) */}
      <img
        className="crt-tv-frame"
        src={config.image}
        alt={config.label}
        draggable={false}
      />

      {/* Interactive CRT Curved Screen Overlay */}
      <div
        className={`crt-screen ${isPlaying ? "playing" : "paused"} ${
          isHovered ? "screen-hovered" : ""
        }`}
        style={{
          top: config.screen.top,
          left: config.screen.left,
          width: config.screen.width,
          height: config.screen.height,
          borderRadius: config.screen.radius
        }}
        onClick={togglePlayback}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`${config.label} interactive CRT display. ${
          isPlaying ? "Playing video" : "Video paused"
        }. Click or press Space to ${isPlaying ? "pause" : "play"}.`}
      >
        {/* HTML5 Native Video Element */}
        <video
          ref={videoRef}
          className="crt-video"
          src={config.video}
          playsInline
          preload="metadata"
          loop
          onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
          onEnded={() => setIsPlaying(false)}
        />

        {/* Subtle Physical CRT Shader Layers */}
        <div className="crt-effects" aria-hidden="true">
          <div className="crt-scanlines" />
          <div className="crt-glass-reflection" />
          <div className="crt-vignette" />
          <div className="crt-inner-glow" />
        </div>

        {/* Retro Terminal Minimal OSD Controls */}
        <div className="crt-osd" aria-hidden="true">
          {/* Centered Minimal Retro Monospace Play/Pause Indicator */}
          <div className={`crt-play-badge ${isPlaying && !isHovered ? "hidden" : ""}`}>
            <span className="crt-play-text">
              {isPlaying ? "❚❚ PAUSE" : "▶ PLAY"}
            </span>
          </div>

          {/* Minimal Retro Corner Audio Button */}
          <button
            type="button"
            className="crt-sound-btn"
            onClick={toggleMute}
            title={isMuted ? "Unmute audio (M)" : "Mute audio (M)"}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX size={10} /> : <Volume2 size={10} />}
          </button>

          {/* Ultra-Thin Retro CRT Progress Bar */}
          <div className="crt-progress-track">
            <div
              className="crt-progress-fill"
              style={{ width: `${progressPercent}%` }}
            >
              <span className="crt-progress-dot" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
