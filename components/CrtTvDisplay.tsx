"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Volume2, VolumeX, Radio } from "lucide-react";
import { CRT_VIDEO_CHANNELS, type CrtModelProfile } from "./crt-tv-config";

interface CrtTvDisplayProps {
  instanceId?: string;
  profile?: CrtModelProfile;
  config?: any; // For backward compatibility
  videoSrc?: string;
  onVideoChange?: (newSrc: string) => void;
  className?: string;
}

export function CrtTvDisplay({
  instanceId,
  profile,
  config,
  videoSrc,
  onVideoChange,
  className = ""
}: CrtTvDisplayProps) {
  const model = profile || config;
  const uniqueId = instanceId || model?.id || model?.collectibleId || "crt-instance";
  const defaultVideo = model?.defaultVideo || model?.video || "/videos/tv-1.mp4";

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [currentSrc, setCurrentSrc] = useState(videoSrc || defaultVideo);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Sync external videoSrc prop if it changes
  useEffect(() => {
    if (videoSrc) {
      setCurrentSrc(videoSrc);
    }
  }, [videoSrc]);

  // Synchronize playback across multiple CRT TVs: pause this video if another instance plays
  useEffect(() => {
    const handleRemotePlay = (e: Event) => {
      const customEvent = e as CustomEvent<{ instanceId: string }>;
      if (customEvent.detail?.instanceId !== uniqueId) {
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
  }, [uniqueId]);

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
        // Broadcast to pause any other active TV instance
        window.dispatchEvent(
          new CustomEvent("ascend-crt-play", { detail: { instanceId: uniqueId } })
        );

        video.muted = isMuted;
        await video.play();
        setIsPlaying(true);
      } catch {
        // Fallback to muted playback if browser policy blocks unmuted autoplay
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
  }, [uniqueId, isMuted]);

  // Toggle sound without toggling play/pause
  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
  }, []);

  // Cycle video channel / feed input
  const cycleChannel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const currentIdx = CRT_VIDEO_CHANNELS.findIndex(ch => ch.src === currentSrc);
      const nextIdx = (currentIdx + 1) % CRT_VIDEO_CHANNELS.length;
      const nextChannel = CRT_VIDEO_CHANNELS[nextIdx];

      setCurrentSrc(nextChannel.src);
      onVideoChange?.(nextChannel.src);

      // If already playing, immediately resume playback on new channel
      if (videoRef.current) {
        videoRef.current.src = nextChannel.src;
        videoRef.current.load();
        if (isPlaying) {
          videoRef.current.play().catch(() => {});
        }
      }
    },
    [currentSrc, isPlaying, onVideoChange]
  );

  // Keyboard navigation
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
    } else if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      cycleChannel(e as any);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const currentChannelIndex = CRT_VIDEO_CHANNELS.findIndex(ch => ch.src === currentSrc);
  const channelBadgeText = currentChannelIndex >= 0 ? `CH 0${currentChannelIndex + 1}` : "INPUT";

  if (!model) return null;

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
        src={model.image}
        alt={model.label}
        draggable={false}
      />

      {/* Interactive CRT Curved Screen Overlay */}
      <div
        className={`crt-screen ${isPlaying ? "playing" : "paused"} ${
          isHovered ? "screen-hovered" : ""
        }`}
        style={{
          top: model.screen.top,
          left: model.screen.left,
          width: model.screen.width,
          height: model.screen.height,
          borderRadius: model.screen.radius
        }}
        onClick={togglePlayback}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`${model.label} interactive CRT display (${uniqueId}). ${
          isPlaying ? "Playing video" : "Video paused"
        }. Click or press Space to ${isPlaying ? "pause" : "play"}. Press C to cycle channel.`}
      >
        {/* HTML5 Native Video Element */}
        <video
          ref={videoRef}
          className="crt-video"
          src={currentSrc}
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
          {/* Subtle Top Channel Switcher Badge */}
          <button
            type="button"
            className="crt-channel-badge"
            onClick={cycleChannel}
            title="Click to switch video input channel (or press C)"
            aria-label="Switch video channel"
          >
            <span className="crt-channel-dot" />
            <span>{channelBadgeText}</span>
          </button>

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
