"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { SpotifyPlaybackState } from "@/lib/spotify";
import {
  Play,
  Pause,
  Upload,
  Image as ImageIcon,
  Music,
  RotateCcw,
  Sliders,
  Volume2,
  VolumeX,
  Sparkles,
  Check,
  X,
  Disc3,
  SkipBack,
  SkipForward,
  Grid,
  Compass,
  Layers,
  FileText,
} from "lucide-react";
import {
  AscendAlbumBackdrop,
  type BackdropVariant,
  type BackdropIntensity,
} from "./AscendAlbumBackdrop";

interface CdAlbumState {
  albumTitle: string;
  artistSubtitle: string;
  coverUrl: string;
  audioUrl: string | null;
  volume: number;
}

const DEFAULT_ALBUM_STATE: CdAlbumState = {
  albumTitle: "ASCEND SOUND ARCHIVE",
  artistSubtitle: "CONTINUOUS PROGRESSION · ANALOG AUDIO DIVISION",
  coverUrl: "/retro-cd/cover-multiple-apps.webp",
  audioUrl: null,
  volume: 0.7,
};

const STORAGE_KEY = "ascend_retro_cd_settings";

interface RetroCdPlayerExperienceProps {
  spotifyData?: SpotifyPlaybackState | Partial<SpotifyPlaybackState> | null;
  onSpotifyDataChange?: (data: SpotifyPlaybackState | null) => void;
  onOpenSpotifySetup?: () => void;
  defaultBackdropVariant?: BackdropVariant;
  defaultBackdropIntensity?: BackdropIntensity;
}

export function RetroCdPlayerExperience({
  spotifyData = null,
  onSpotifyDataChange,
  onOpenSpotifySetup,
  defaultBackdropVariant = "paper-grid",
  defaultBackdropIntensity = "medium",
}: RetroCdPlayerExperienceProps) {
  const [albumState, setAlbumState] = useState<CdAlbumState>(DEFAULT_ALBUM_STATE);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);
  const [audioUploadName, setAudioUploadName] = useState<string | null>(null);

  // Spotify live synchronization state
  const [spotifyState, setSpotifyState] = useState<SpotifyPlaybackState | Partial<SpotifyPlaybackState> | null>(spotifyData);
  const [spotifySyncEnabled, setSpotifySyncEnabled] = useState<boolean>(true);

  // Editorial Technical Poster Texture state
  const [backdropVariant, setBackdropVariant] = useState<BackdropVariant>(defaultBackdropVariant);
  const [backdropIntensity, setBackdropIntensity] = useState<BackdropIntensity>(defaultBackdropIntensity);

  // VU Meter state (Left and Right levels: 0 to 12)
  const [vuLeft, setVuLeft] = useState(0);
  const [vuRight, setVuRight] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const synthNodesRef = useRef<{
    oscillators: OscillatorNode[];
    gains: GainNode[];
    masterGain: GainNode | null;
    timer: number | null;
  }>({ oscillators: [], gains: [], masterGain: null, timer: null });
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // Load saved state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setAlbumState(prev => ({
          ...prev,
          ...parsed,
          audioUrl: parsed.audioUrl?.startsWith("blob:") ? null : parsed.audioUrl,
        }));
      }
    } catch {
      // fallback
    }
  }, []);

  const saveAlbumState = useCallback((updates: Partial<CdAlbumState>) => {
    setAlbumState(prev => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            albumTitle: next.albumTitle,
            artistSubtitle: next.artistSubtitle,
            coverUrl: next.coverUrl,
            audioUrl: next.audioUrl?.startsWith("blob:") ? null : next.audioUrl,
            volume: next.volume,
          })
        );
      } catch {}
      return next;
    });
  }, []);

  // Load saved Spotify sync preference
  useEffect(() => {
    try {
      const savedSync = localStorage.getItem("ascend_retro_cd_spotify_sync");
      if (savedSync !== null) {
        setSpotifySyncEnabled(savedSync === "true");
      }
    } catch {}
  }, []);

  // Load saved Backdrop texture settings
  useEffect(() => {
    try {
      const savedVar = localStorage.getItem("ascend_album_backdrop_variant") as BackdropVariant | null;
      if (
        savedVar &&
        ["paper", "paper-grid", "paper-radial", "paper-hybrid", "grid", "radial", "hybrid"].includes(savedVar)
      ) {
        setBackdropVariant(savedVar);
      }
      const savedInt = localStorage.getItem("ascend_album_backdrop_intensity") as BackdropIntensity | null;
      if (savedInt && ["subtle", "medium", "strong"].includes(savedInt)) {
        setBackdropIntensity(savedInt);
      }
    } catch {}
  }, []);

  const handleVariantChange = (v: BackdropVariant) => {
    setBackdropVariant(v);
    try {
      localStorage.setItem("ascend_album_backdrop_variant", v);
    } catch {}
  };

  const handleIntensityChange = (i: BackdropIntensity) => {
    setBackdropIntensity(i);
    try {
      localStorage.setItem("ascend_album_backdrop_intensity", i);
    } catch {}
  };

  // Sync spotifyData prop when updated from parent
  useEffect(() => {
    if (spotifyData) {
      setSpotifyState(spotifyData);
    }
  }, [spotifyData]);

  // Fast live poller for Spotify currently playing state (every 2.5s)
  useEffect(() => {
    let isMounted = true;
    const pollSpotify = async () => {
      try {
        const res = await fetch("/api/spotify/currently-playing");
        if (res.ok) {
          const data = (await res.json()) as SpotifyPlaybackState | null;
          if (isMounted) {
            setSpotifyState(data);
            onSpotifyDataChange?.(data);
          }
        }
      } catch {}
    };

    pollSpotify();
    const interval = setInterval(pollSpotify, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [onSpotifyDataChange]);

  // Computed Spotify & Playback properties
  const isSpotifyActive = Boolean(
    spotifySyncEnabled &&
    spotifyState?.connected &&
    Boolean(spotifyState?.albumImageUrl)
  );
  const activeCoverUrl = isSpotifyActive
    ? spotifyState!.albumImageUrl
    : albumState.coverUrl;
  const activeTitle = isSpotifyActive
    ? (spotifyState?.title || albumState.albumTitle).toUpperCase()
    : albumState.albumTitle;
  const activeArtist = isSpotifyActive
    ? (spotifyState?.artist || albumState.artistSubtitle).toUpperCase()
    : albumState.artistSubtitle;
  const effectiveIsPlaying = isSpotifyActive
    ? Boolean(spotifyState?.isPlaying || isPlaying)
    : isPlaying;
  const effectiveTime = isSpotifyActive && spotifyState?.progressMs
    ? Math.floor(spotifyState.progressMs / 1000)
    : audioCurrentTime;
  const effectiveDuration = isSpotifyActive && spotifyState?.durationMs
    ? Math.floor(spotifyState.durationMs / 1000)
    : (audioRef.current?.duration && !isNaN(audioRef.current.duration)
        ? Math.floor(audioRef.current.duration)
        : 214);
  const progressPercent = effectiveDuration > 0
    ? Math.min(100, Math.max(0, (effectiveTime / effectiveDuration) * 100))
    : 0;

  // Web Audio Synth Engine
  const stopProceduralSynth = useCallback(() => {
    if (synthNodesRef.current.timer) {
      window.clearInterval(synthNodesRef.current.timer);
      synthNodesRef.current.timer = null;
    }
    if (synthNodesRef.current.masterGain && audioCtxRef.current) {
      synthNodesRef.current.masterGain.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.2);
    }
    synthNodesRef.current.oscillators.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    synthNodesRef.current.oscillators = [];
    synthNodesRef.current.gains = [];
  }, []);

  const startProceduralSynth = useCallback(() => {
    stopProceduralSynth();

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContextClass();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.setTargetAtTime(isMuted ? 0 : albumState.volume * 0.22, ctx.currentTime, 0.3);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(780, ctx.currentTime);
    filter.Q.setValueAtTime(2.2, ctx.currentTime);

    master.connect(filter);
    filter.connect(ctx.destination);
    synthNodesRef.current.masterGain = master;

    // Neo-Soul ambient synth chords
    const chords = [
      [146.83, 174.61, 220.0, 261.63, 329.63],
      [98.0, 174.61, 246.94, 329.63],
      [130.81, 164.81, 196.0, 246.94, 293.66],
      [110.0, 196.0, 261.63, 329.63, 493.88],
    ];

    let chordIdx = 0;

    const playChord = (freqs: number[]) => {
      if (!ctx || !synthNodesRef.current.masterGain) return;
      const now = ctx.currentTime;

      synthNodesRef.current.gains.forEach(g => {
        g.gain.setTargetAtTime(0, now, 0.3);
      });

      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = i % 2 === 0 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime((Math.random() - 0.5) * 8, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.setTargetAtTime(1 / freqs.length, now + 0.05, 0.4);

        osc.connect(gain);
        gain.connect(master);
        osc.start(now);

        synthNodesRef.current.oscillators.push(osc);
        synthNodesRef.current.gains.push(gain);
      });
    };

    playChord(chords[0]);
    synthNodesRef.current.timer = window.setInterval(() => {
      chordIdx = (chordIdx + 1) % chords.length;
      playChord(chords[chordIdx]);
    }, 3200);
  }, [albumState.volume, isMuted, stopProceduralSynth]);

  const togglePlay = useCallback(() => {
    if (isSpotifyActive) {
      setIsPlaying(prev => !prev);
    } else {
      if (isPlaying) {
        setIsPlaying(false);
        if (audioRef.current && albumState.audioUrl) {
          audioRef.current.pause();
        }
        stopProceduralSynth();
        setVuLeft(0);
        setVuRight(0);
      } else {
        setIsPlaying(true);
        if (albumState.audioUrl && audioRef.current) {
          audioRef.current.play().catch(() => {
            startProceduralSynth();
          });
        } else {
          startProceduralSynth();
        }
      }
    }
  }, [isSpotifyActive, isPlaying, albumState.audioUrl, stopProceduralSynth, startProceduralSynth]);

  // Optical Disc Spin & VU Meters Animation Loop
  useEffect(() => {
    if (!effectiveIsPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      lastTimeRef.current = null;
      setVuLeft(0);
      setVuRight(0);
      return;
    }

    let vuTick = 0;
    const animate = (timestamp: number) => {
      if (lastTimeRef.current != null) {
        const delta = timestamp - lastTimeRef.current;
        setRotationDeg(prev => (prev + delta * 0.36) % 360);
      }
      lastTimeRef.current = timestamp;

      // Realistic bouncing VU meters
      vuTick++;
      if (vuTick % 4 === 0) {
        const base = Math.sin(timestamp * 0.005) * 2 + 7;
        const jitterL = Math.floor(Math.random() * 4);
        const jitterR = Math.floor(Math.random() * 4);
        setVuLeft(Math.min(12, Math.max(2, Math.floor(base + jitterL))));
        setVuRight(Math.min(12, Math.max(2, Math.floor(base + jitterR))));
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [effectiveIsPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : albumState.volume;
    }
    if (synthNodesRef.current.masterGain && audioCtxRef.current) {
      synthNodesRef.current.masterGain.gain.setTargetAtTime(
        isMuted ? 0 : albumState.volume * 0.22,
        audioCtxRef.current.currentTime,
        0.1
      );
    }
  }, [albumState.volume, isMuted]);

  useEffect(() => {
    return () => {
      stopProceduralSynth();
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch {}
      }
    };
  }, [stopProceduralSynth]);

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageUploadLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        saveAlbumState({ coverUrl: dataUrl });
      }
      setImageUploadLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setAudioUploadName(file.name);
    saveAlbumState({
      audioUrl: objectUrl,
      albumTitle: file.name.replace(/\.[^/.]+$/, "").toUpperCase(),
    });

    if (isPlaying) {
      stopProceduralSynth();
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          audioRef.current.play().catch(() => {});
        }
      }, 100);
    }
  };

  const handleResetDefaults = () => {
    stopProceduralSynth();
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setAlbumState(DEFAULT_ALBUM_STATE);
    setAudioUploadName(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden select-none"
      style={{
        backgroundColor: "#0b0705",
      }}
    >
      {/* Dynamic Blurred Song Photo Ambient Stage Background */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none">
        {activeCoverUrl ? (
          <>
            {/* Primary Deep Color Diffusion */}
            <div
              className="absolute -inset-16 sm:-inset-24 transition-all duration-1000 ease-out"
              style={{
                backgroundImage: `url(${activeCoverUrl})`,
                backgroundPosition: "center",
                backgroundSize: "cover",
                filter: "blur(56px) saturate(1.85) brightness(0.66)",
                transform: effectiveIsPlaying ? "scale(1.30)" : "scale(1.24)",
                opacity: 0.95,
              }}
            />

            {/* Secondary Vibrant Optical Bloom */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] sm:w-[920px] h-[720px] sm:h-[920px] rounded-full transition-all duration-1000 ease-out pointer-events-none"
              style={{
                backgroundImage: `url(${activeCoverUrl})`,
                backgroundPosition: "center",
                backgroundSize: "cover",
                filter: "blur(88px) saturate(2.2) brightness(0.58)",
                opacity: effectiveIsPlaying ? 0.85 : 0.65,
                transform: effectiveIsPlaying ? "scale(1.08)" : "scale(1)",
              }}
            />
          </>
        ) : null}

        {/* Smoked Vintage Hardware Vignette & Brushed Texture */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 48%, rgba(11, 7, 5, 0.08) 0%, rgba(11, 7, 5, 0.38) 50%, rgba(11, 7, 5, 0.78) 85%, #0b0705 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.006), rgba(255, 255, 255, 0.006)),
              repeating-linear-gradient(90deg, transparent 0, transparent 3px, rgba(255, 255, 255, 0.008) 4px)
            `,
          }}
        />
      </div>

      {/* Editorial / Technical Album-Poster Texture Layer (Layers 1-6) */}
      <AscendAlbumBackdrop
        variant={backdropVariant}
        intensity={backdropIntensity}
      />

      {albumState.audioUrl && (
        <audio
          ref={audioRef}
          src={albumState.audioUrl}
          loop
          onTimeUpdate={() => {
            if (audioRef.current) {
              setAudioCurrentTime(audioRef.current.currentTime);
            }
          }}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* 3D Jewel Case and Optical Disc Stage */}
      <div className="relative z-10 flex h-full w-full items-center justify-center translate-y-2">
        <div
          className="relative flex items-center justify-center"
          style={{ width: "360px", height: "330px" }}
        >
          {/* Subtle CD Platter / Transport Tray Grounding Outline */}
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full select-none"
            style={{
              width: "480px",
              height: "480px",
              border: "1px solid rgba(158, 104, 66, 0.025)",
              background: "radial-gradient(circle at 50% 50%, rgba(93, 54, 31, 0.01) 0%, transparent 80%)",
              boxShadow: "inset 0 0 28px rgba(0, 0, 0, 0.16)",
              opacity: 0.58,
              maskImage: "radial-gradient(circle at 50% 50%, black 72%, rgba(0,0,0,0.6) 88%, transparent 100%)",
              WebkitMaskImage: "radial-gradient(circle at 50% 50%, black 72%, rgba(0,0,0,0.6) 88%, transparent 100%)",
            }}
          />

          {/* Perspective Container */}
          <div
            className="absolute top-0 left-0 flex origin-center rounded-[3px] select-none"
            style={{
              width: "575px",
              height: "535px",
              perspective: "1800px",
              transform: "scale(0.63)",
              transformStyle: "preserve-3d",
              left: "-108px",
              top: "-102px",
            }}
          >
            <div
              className="flex size-full origin-center"
              style={{
                transformStyle: "preserve-3d",
                transform: "translateX(-155px) rotate(-5deg)",
              }}
            >
              {/* Left Spine with machined ridges */}
              <div
                className="relative z-0"
                style={{
                  width: "48px",
                  height: "523px",
                  background:
                    "linear-gradient(90deg, #44372e 0%, #2f251e 15%, #241c16 50%, #16100c 100%)",
                  boxShadow:
                    "inset -2px 0px 5px 0px rgba(0, 0, 0, 0.6), -10px 20px 50px 0px rgba(0, 0, 0, 0.5)",
                }}
              >
                <div
                  className="w-full h-full"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, transparent 0px, transparent 2px, rgba(0, 0, 0, 0.85) 2px, rgba(0, 0, 0, 0.85) 4px)",
                  }}
                />
                <div className="absolute inset-y-0 left-0 w-[2px] bg-amber-500/20" />
                <div className="absolute inset-y-0 right-0 w-[1px] bg-black/90" />
              </div>

              {/* Charcoal Audio Tray */}
              <div
                className="absolute top-[6px] right-[2px] bottom-[6px] left-[48px] z-0 overflow-hidden rounded-[3px]"
                style={{
                  background: "#14100d",
                  boxShadow:
                    "inset 0px 0px 24px 0px rgba(0, 0, 0, 0.9), 0px 20px 50px 0px rgba(0, 0, 0, 0.6)",
                }}
              >
                <div className="absolute inset-0 border-[6px] border-[#0a0705]" />
                <div className="absolute inset-[6px] rounded-r-[2px] border border-[#221812]" />

                {/* Circular CD Bed Indentation */}
                <div className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#2b1f18]" />

                {/* Tray Locking Tabs */}
                <div className="absolute top-0 right-[20%] h-[8px] w-[40px] bg-[#0c0907] border-x border-b border-[#2b1f18] rounded-b-[2px]" />
                <div className="absolute right-[20%] bottom-0 h-[8px] w-[40px] bg-[#0c0907] border-x border-t border-[#2b1f18] rounded-t-[2px]" />
                <div className="absolute top-1/2 right-0 h-[40px] w-[8px] -translate-y-1/2 bg-[#0c0907] border-y border-l border-[#2b1f18] rounded-l-[2px]" />
              </div>

              {/* Ascend Holographic Optical CD Disc */}
              <div
                className="absolute top-[6px] right-0 bottom-[6px] left-[48px] z-10 flex items-center justify-center transition-transform duration-700 ease-out"
                style={{
                  transform: "translateX(395px) translateZ(0.5px) scale(1.1)",
                }}
              >
                <div className="relative flex aspect-square w-[506px] items-center justify-center rounded-full shadow-[0_25px_60px_rgba(0,0,0,0.85)] select-none">
                  {/* Outer Polycarbonate Beveled Ring */}
                  <div className="absolute inset-[-0.5%] flex items-center justify-center rounded-full bg-slate-200/25 ring-1 ring-white/30 ring-inset" />

                  {/* CD Disc Body */}
                  <div className="relative h-full w-full rounded-full overflow-hidden border border-white/20">
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        transform: `rotate(${rotationDeg}deg) translateZ(0px)`,
                        transition: effectiveIsPlaying ? "none" : "transform 0.6s ease-out",
                      }}
                    >
                      {/* Mirror Silver Substrate Base */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-[#99a2ad] via-[#cbd5e1] to-[#88929e]" />

                      {/* Concentric Audio Track Grooves */}
                      <div
                        className="absolute inset-0 rounded-full opacity-60"
                        style={{
                          backgroundImage:
                            "repeating-radial-gradient(circle at 50% 50%, transparent 0px, transparent 1px, rgba(0, 0, 0, 0.35) 1px, rgba(0, 0, 0, 0.35) 2px)",
                        }}
                      />

                      {/* Shimmering Holographic Diffraction Grating */}
                      <div
                        className="absolute inset-0 rounded-full mix-blend-screen opacity-70"
                        style={{
                          background: `
                            conic-gradient(
                              from 0deg at 50% 50%,
                              rgba(255, 69, 0, 0.45) 0deg,
                              rgba(255, 187, 0, 0.45) 45deg,
                              rgba(0, 240, 255, 0.45) 90deg,
                              rgba(176, 38, 255, 0.45) 135deg,
                              rgba(0, 255, 136, 0.45) 180deg,
                              rgba(255, 69, 0, 0.45) 225deg,
                              rgba(255, 187, 0, 0.45) 270deg,
                              rgba(0, 240, 255, 0.45) 315deg,
                              rgba(255, 69, 0, 0.45) 360deg
                            )
                          `,
                        }}
                      />

                      {/* Radial Optical Reflection Flares */}
                      <div
                        className="absolute inset-0 rounded-full opacity-40 mix-blend-overlay"
                        style={{
                          background:
                            "conic-gradient(from 45deg at 50% 50%, white 0deg, transparent 40deg, white 90deg, transparent 130deg, white 180deg, transparent 220deg, white 270deg, transparent 310deg, white 360deg)",
                        }}
                      />

                      {/* Center Clamping Hub & Typography */}
                      <div className="absolute inset-[24%] rounded-full border border-[rgba(153,92,48,0.35)] bg-radial from-[#181310] to-[#0c0907] flex flex-col items-center justify-between p-7 shadow-inner">
                        <span className="font-mono text-[9px] tracking-[0.22em] text-[#d79351] uppercase font-bold text-center truncate max-w-[200px]">
                          {isSpotifyActive ? (spotifyState?.album || "SPOTIFY STREAM").toUpperCase() : "ASCEND OS · CONTINUOUS PROGRESSION"}
                        </span>

                        {/* Center Spindle Hole (15mm Clear Polycarbonate Ring) */}
                        <div className="relative size-20 rounded-full border border-white/30 bg-[#070504]/90 flex items-center justify-center shadow-2xl">
                          <div className="size-10 rounded-full border border-white/20 bg-transparent" />
                        </div>

                        <span className="font-mono text-[8px] tracking-[0.18em] text-[#d6c8b9]/80 uppercase text-center font-medium truncate max-w-[200px]">
                          {isSpotifyActive ? (spotifyState?.artist || "AUDIO STREAM").toUpperCase() : "DIGITAL AUDIO · 44.1 kHz PCM"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Center Spindle Teeth Hub */}
              <div
                className="pointer-events-none absolute top-[6px] right-0 bottom-[6px] left-[48px] z-[15] flex items-center justify-center"
                style={{ transform: "translateZ(1px)" }}
              >
                <div className="relative h-[90px] w-[90px] rounded-full border border-[#3b2a20] bg-[#1a1410]/90 backdrop-blur-xs flex items-center justify-center shadow-lg">
                  <div className="absolute h-[40px] w-[40px] rounded-full border border-[#160f0b] bg-[#0c0907]" />
                  <div className="flex h-[24px] w-[24px] items-center justify-center rounded-full border border-[#4a3528] bg-[#080605]">
                    <div className="h-[12px] w-[12px] rounded-full bg-[#1e1713] shadow-inner" />
                  </div>
                </div>
              </div>

              {/* Front Acrylic Door (-25deg with User Album Cover) */}
              <div
                className="relative z-20 group"
                style={{
                  width: "527px",
                  height: "535px",
                  transform: "translateZ(1.5px) rotate3d(0, 1, 0, -25deg)",
                  transformOrigin: "left center",
                  transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {/* Album Cover Art */}
                <div className="absolute top-[4px] right-[4px] bottom-[4px] left-[4px] overflow-hidden rounded-[2px] bg-black shadow-2xl">
                  <img
                    src={activeCoverUrl}
                    alt={activeTitle}
                    draggable={false}
                    className="h-full w-full object-cover transition-all duration-700 ease-out"
                  />

                  {/* Spotify Live Synchronized Pill Badge */}
                  {isSpotifyActive && (
                    <div className="absolute top-3 right-3 z-25 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/85 backdrop-blur-md border border-[#56b347]/50 shadow-xl pointer-events-none animate-in fade-in-0 duration-300">
                      <span className={`size-1.5 rounded-full bg-[#56b347] ${effectiveIsPlaying ? "animate-ping" : ""}`} />
                      <span className="font-mono text-[8px] font-bold tracking-wider text-[#56b347] uppercase">
                        {effectiveIsPlaying ? "SPOTIFY PLAYING" : "SPOTIFY SYNC"}
                      </span>
                    </div>
                  )}

                  {/* Hover Overlay for Customizing Cover */}
                  <div
                    onClick={() => setCustomizerOpen(true)}
                    className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-opacity duration-200 z-30 backdrop-blur-xs text-white"
                    title={isSpotifyActive ? "Click to customize album cover or Spotify sync" : "Click to replace cover photo"}
                  >
                    <div className="p-3 rounded-full bg-[#110c08]/90 border border-[rgba(153,92,48,0.45)] shadow-md">
                      <ImageIcon size={22} className="text-[#d79351]" />
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-widest bg-[#110c08]/95 px-3 py-1.5 rounded-[3px] border border-[rgba(153,92,48,0.35)] font-bold text-[#d6c8b9]">
                      {isSpotifyActive ? "CUSTOMIZE / SPOTIFY SYNC" : "REPLACE COVER PHOTO"}
                    </span>
                  </div>
                </div>

                {/* Hinge Bracket */}
                <div className="absolute top-0 -left-[48px] z-20 h-[6px] w-[48px] bg-black/50 border-t border-[rgba(153,92,48,0.25)]" />
                <div className="absolute bottom-0 -left-[48px] z-20 h-[6px] w-[48px] bg-black/50 border-b border-black/90" />

                {/* Acrylic Glare & Bevels */}
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute inset-x-0 top-0 h-[6px] bg-white/10 border-b border-white/15" />
                  <div className="absolute inset-x-0 bottom-0 h-[6px] bg-black/40 border-t border-white/10" />
                  <div className="absolute top-[6px] bottom-[6px] left-0 w-[6px] bg-black/50" />
                  <div className="absolute top-[6px] right-0 bottom-[6px] w-[6px] bg-white/10" />

                  {/* Booklet Tabs */}
                  <div className="absolute top-[15%] right-[6px] h-[35px] w-[5px] bg-white/20 rounded-l-[1px]" />
                  <div className="absolute right-[6px] bottom-[15%] h-[35px] w-[5px] bg-white/20 rounded-l-[1px]" />
                  <div className="absolute top-[6px] left-[15%] h-[4px] w-[25px] bg-white/20 rounded-b-[1px]" />
                  <div className="absolute bottom-[6px] left-[15%] h-[4px] w-[25px] bg-white/20 rounded-t-[1px]" />

                  {/* Specular Perimeter Border */}
                  <div className="absolute inset-0 rounded-[2px] border border-white/25" />

                  {/* Diagonal Reflection Streak */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(130deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.03) 38%, transparent 58%)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ascend OS Audiophile Transport Console Faceplate */}
      <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-[880px] px-3 sm:px-4">
        <div
          className="relative overflow-hidden rounded-[4px] border p-2 sm:p-2.5"
          style={{
            background:
              "linear-gradient(180deg, #17100b 0%, #100b07 50%, #090604 100%)",
            borderColor: "rgba(144, 91, 52, 0.28)",
            boxShadow:
              "inset 0 1px 0 rgba(255, 255, 255, 0.018), inset 0 -1px 0 rgba(0, 0, 0, 0.55), 0 5px 14px rgba(0, 0, 0, 0.35)",
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 w-full">
            {/* Sector 1: Track Display & Level Meters */}
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 justify-self-start">
              {/* Recessed Track Display with Playback Timeline */}
              <div
                className="flex flex-col justify-center rounded-[3px] px-2.5 py-1.5 shrink-0 min-w-[170px] sm:min-w-[205px]"
                style={{
                  background: "#090705",
                  border: "1px solid rgba(151, 91, 43, 0.30)",
                  boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.85)",
                }}
              >
                {/* Status & Time Row */}
                <div className="flex items-center justify-between font-mono text-[9px] font-semibold tracking-wider">
                  <span className="text-[#86796d]">
                    {isSpotifyActive ? "SPOTIFY" : "TRACK"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#d28a49]">
                      {isSpotifyActive ? (effectiveIsPlaying ? "PLAY" : "IDLE") : "01"}
                    </span>
                    <span className="text-[#55463a]">/</span>
                    <span className="text-[#d28a49] font-medium">
                      {formatTime(effectiveTime)}
                    </span>
                  </div>
                </div>

                {/* Track Title */}
                <div className="font-mono text-[8px] tracking-[0.14em] text-[#d0b79f] uppercase truncate max-w-[145px] sm:max-w-[180px] mt-0.5 font-medium">
                  {activeTitle}
                </div>

                {/* Thin Amber Playback Timeline: 00:00 ───────●─────── 03:42 */}
                <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-[rgba(144,91,52,0.14)]">
                  <span className="font-mono text-[7.5px] text-[#d28a49] w-6 shrink-0 text-left">
                    {formatTime(effectiveTime)}
                  </span>
                  <div className="relative flex-1 h-[2px] bg-[rgba(190,155,120,0.14)] rounded-[1px] overflow-visible">
                    <div
                      className="h-full bg-[#b8753f] rounded-l-[1px] transition-all duration-200"
                      style={{ width: `${progressPercent}%` }}
                    />
                    <span
                      className="absolute top-1/2 -translate-y-1/2 -ml-[1.75px] w-[3.5px] h-[3.5px] rounded-full bg-[#eba763] pointer-events-none transition-all duration-200"
                      style={{ left: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="font-mono text-[7.5px] text-[#9c8a7c] w-6 shrink-0 text-right font-medium">
                    {formatTime(effectiveDuration)}
                  </span>
                </div>
              </div>

              {/* Minor Divider: Between Metadata and Meter */}
              <div
                className="w-[1px] h-7 shrink-0 hidden sm:block"
                style={{ backgroundColor: "rgba(144, 91, 52, 0.13)" }}
              />

              {/* Stereo L/R Level Meters */}
              <div className="flex flex-col gap-1 py-1 shrink-0">
                {/* Channel L */}
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[8px] text-[#948174] w-2.5 font-medium">L</span>
                  <div className="flex items-center gap-[2px]">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span
                        key={`vu-l-${i}`}
                        className="h-2 w-[1.5px] rounded-[0.5px] transition-colors duration-75"
                        style={{
                          backgroundColor:
                            i < vuLeft
                              ? i >= 10
                                ? "#df6c30"
                                : i >= 8
                                ? "#d98542"
                                : "#c9975e"
                              : "rgba(195, 172, 150, 0.14)",
                          boxShadow:
                            i < vuLeft
                              ? "0 0 1px rgba(200, 135, 75, 0.3)"
                              : "none",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Channel R */}
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[8px] text-[#948174] w-2.5 font-medium">R</span>
                  <div className="flex items-center gap-[2px]">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span
                        key={`vu-r-${i}`}
                        className="h-2 w-[1.5px] rounded-[0.5px] transition-colors duration-75"
                        style={{
                          backgroundColor:
                            i < vuRight
                              ? i >= 10
                                ? "#df6c30"
                                : i >= 8
                                ? "#d98542"
                                : "#c9975e"
                              : "rgba(195, 172, 150, 0.14)",
                          boxShadow:
                            i < vuRight
                              ? "0 0 1px rgba(200, 135, 75, 0.3)"
                              : "none",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Sector 2: Centered Transport Group with Major Divider & Optical Shift */}
            <div className="flex items-center justify-center justify-self-center shrink-0 -translate-x-0 sm:-translate-x-3.5">
              <div className="flex items-center gap-2 sm:gap-2.5">
                {/* Major Divider: Before Transport */}
                <div
                  className="w-[1px] h-8 shrink-0 hidden sm:block"
                  style={{ backgroundColor: "rgba(153, 92, 48, 0.22)" }}
                />

                <div className="flex items-center gap-1 sm:gap-1.5">
                  {/* Previous Track */}
                  <button
                    type="button"
                    onClick={() => setAudioCurrentTime(0)}
                    className="ascend-cd-deck__transport-btn px-2.5 py-1"
                    title="Previous track / Restart"
                    aria-label="Previous track"
                  >
                    <SkipBack size={12} />
                  </button>

                  {/* Main Play / Pause Tactile Switch */}
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="ascend-cd-deck__transport-btn px-3 py-1 font-mono text-[9.5px] font-bold tracking-wider uppercase gap-1.5"
                    aria-label={effectiveIsPlaying ? "Pause playback" : "Start playback"}
                    title={effectiveIsPlaying ? "Pause playback" : "Start playback"}
                    style={{
                      borderColor: effectiveIsPlaying ? "rgba(180, 115, 60, 0.55)" : undefined,
                      color: effectiveIsPlaying ? "#eba763" : undefined,
                    }}
                  >
                    {effectiveIsPlaying ? (
                      <>
                        <Pause size={11} className="text-[#d28a49]" />
                        <span>PAUSE</span>
                      </>
                    ) : (
                      <>
                        <Play size={11} className="text-[#56b347]" fill="#56b347" />
                        <span>PLAY</span>
                      </>
                    )}
                  </button>

                  {/* Next Track */}
                  <button
                    type="button"
                    onClick={() => setAudioCurrentTime(0)}
                    className="ascend-cd-deck__transport-btn px-2.5 py-1"
                    title="Next track"
                    aria-label="Next track"
                  >
                    <SkipForward size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* Sector 3: Customize & Volume with Major/Minor Dividers */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 justify-self-end">
              {/* Major Divider: Before Customize */}
              <div
                className="w-[1px] h-8 shrink-0 hidden sm:block"
                style={{ backgroundColor: "rgba(153, 92, 48, 0.22)" }}
              />

              {/* Customize Button */}
              <button
                type="button"
                onClick={() => setCustomizerOpen(prev => !prev)}
                className="ascend-cd-deck__transport-btn px-2.5 py-1 gap-1.5"
                aria-label="Open album customizer"
                title="Customize cover photo & audio"
                style={{
                  borderColor: customizerOpen ? "rgba(180, 115, 60, 0.55)" : undefined,
                  color: customizerOpen ? "#eba763" : undefined,
                }}
              >
                <Sliders size={11} className={customizerOpen ? "text-[#eba763]" : "text-[#86796d]"} />
                <span className="hidden sm:inline text-[#d0b79f]">CUSTOMIZE</span>
              </button>

              {/* Minor Divider: Before Volume */}
              <div
                className="w-[1px] h-6 shrink-0 hidden sm:block"
                style={{ backgroundColor: "rgba(144, 91, 52, 0.13)" }}
              />

              {/* Volume Button */}
              <button
                type="button"
                onClick={() => setIsMuted(prev => !prev)}
                className="ascend-cd-deck__transport-btn p-1.5 w-7 h-7"
                aria-label={isMuted ? "Unmute" : "Mute"}
                title={isMuted ? "Unmute audio" : "Mute audio"}
              >
                {isMuted ? <VolumeX size={12} className="text-[#e27439]" /> : <Volume2 size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Album Customizer Drawer Panel */}
      {customizerOpen && (
        <div
          className="absolute inset-x-3 bottom-20 z-40 sm:inset-x-auto sm:right-6 sm:w-96 rounded-[6px] border p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4 duration-200 text-[#d6c8b9] font-sans text-xs"
          style={{
            background: "rgba(16, 11, 7, 0.98)",
            borderColor: "rgba(153, 92, 48, 0.4)",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
          }}
        >
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(153,92,48,0.2)]">
            <div className="flex items-center gap-2">
              <Disc3 size={15} className="text-[#d79351]" />
              <span className="font-mono text-[10px] font-bold tracking-wider uppercase text-[#d6c8b9]">
                ASCEND DECK · CUSTOMIZER
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCustomizerOpen(false)}
              className="text-[#8f8174] hover:text-[#d6c8b9] p-1 rounded hover:bg-[#21160f]"
              aria-label="Close customizer"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-3 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* 0. Spotify Synchronization Section */}
            <div className="space-y-2 rounded-[4px] border border-[rgba(153,92,48,0.25)] bg-[#120d09]/80 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2 rounded-full ${
                      spotifyState?.connected
                        ? spotifyState.isPlaying
                          ? "bg-[#56b347] shadow-[0_0_8px_#56b347]"
                          : "bg-[#d79351] shadow-[0_0_6px_#d79351]"
                        : "bg-[#55463a]"
                    }`}
                  />
                  <span className="font-mono text-[9px] font-bold tracking-wider uppercase text-[#d6c8b9]">
                    SPOTIFY SYNC
                  </span>
                  {spotifyState?.connected && (
                    <span className="rounded-[2px] bg-[#1f150e] border border-[rgba(153,92,48,0.3)] px-1.5 py-0.5 font-mono text-[7px] text-[#eba763]">
                      {spotifyState.demoMode ? "DEMO MODE" : "CONNECTED"}
                    </span>
                  )}
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={spotifySyncEnabled}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setSpotifySyncEnabled(val);
                      try {
                        localStorage.setItem("ascend_retro_cd_spotify_sync", String(val));
                      } catch {}
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-4 bg-[#21160f] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#d6c8b9] after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#d79351]" />
                </label>
              </div>

              {spotifyState?.connected ? (
                <div className="text-[10px] space-y-2 text-[#8f8174]">
                  <div className="flex items-center gap-2.5 p-2 rounded bg-black/50 border border-zinc-800">
                    {spotifyState.albumImageUrl ? (
                      <img
                        src={spotifyState.albumImageUrl}
                        alt="Current cover"
                        className="size-9 rounded-[2px] object-cover shrink-0 border border-zinc-700/60"
                      />
                    ) : (
                      <div className="size-9 rounded-[2px] bg-zinc-900 flex items-center justify-center text-zinc-600 shrink-0">
                        <Disc3 size={16} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[#eba763] font-medium truncate">{spotifyState.title}</div>
                      <div className="text-[#8f8174] text-[9px] truncate">{spotifyState.artist}</div>
                    </div>
                  </div>
                  <p className="text-[9px] text-[#8f8174]/80">
                    {spotifySyncEnabled
                      ? "✓ Active: Album cover art, blurred song photo background, and track titles are synced live."
                      : "Sync disabled. Using custom uploaded cover and audio archive."}
                  </p>
                  <div className="flex gap-1.5 pt-1">
                    {spotifyState.demoMode ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch("/api/spotify/setup", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ demoMode: false }),
                          });
                          const res = await fetch("/api/spotify/currently-playing");
                          if (res.ok) {
                            const data = (await res.json()) as SpotifyPlaybackState | null;
                            setSpotifyState(data);
                            onSpotifyDataChange?.(data);
                          }
                        }}
                        className="flex-1 px-2 py-1 rounded-[3px] border border-[rgba(153,92,48,0.35)] bg-[#18110b] hover:bg-[#21160f] text-[9px] font-mono text-[#d6c8b9] transition-colors"
                      >
                        Turn Off Demo
                      </button>
                    ) : (
                      <a
                        href="/api/spotify/login"
                        className="flex-1 text-center px-2 py-1 rounded-[3px] border border-[rgba(153,92,48,0.35)] bg-[#18110b] hover:bg-[#21160f] text-[9px] font-mono text-[#d6c8b9] transition-colors"
                      >
                        Re-Authorize
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch("/api/spotify/setup", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "disconnect" }),
                        });
                        const res = await fetch("/api/spotify/currently-playing");
                        if (res.ok) {
                          const data = (await res.json()) as SpotifyPlaybackState | null;
                          setSpotifyState(data);
                          onSpotifyDataChange?.(data);
                        }
                      }}
                      className="px-2 py-1 rounded-[3px] border border-red-900/40 bg-red-950/30 hover:bg-red-950/60 text-[9px] font-mono text-red-300 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[9px] text-[#8f8174]">
                    Spotify is not connected. Enable Instant Preview or connect your Spotify account to sync live artwork.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch("/api/spotify/setup", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ demoMode: true }),
                        });
                        const res = await fetch("/api/spotify/currently-playing");
                        if (res.ok) {
                          const data = (await res.json()) as SpotifyPlaybackState | null;
                          setSpotifyState(data);
                          onSpotifyDataChange?.(data);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-[3px] border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/50 text-[10px] font-mono font-medium text-emerald-300 transition-colors shadow"
                    >
                      <Sparkles size={11} />
                      <span>⚡ 1-Click Instant Preview (ZZZ OST)</span>
                    </button>
                    {onOpenSpotifySetup ? (
                      <button
                        type="button"
                        onClick={onOpenSpotifySetup}
                        className="w-full text-center px-2 py-1 rounded-[3px] border border-[rgba(153,92,48,0.35)] bg-[#18110b] hover:bg-[#21160f] text-[9px] font-mono text-[#d6c8b9] transition-colors"
                      >
                        Connect Real Spotify Account →
                      </button>
                    ) : (
                      <a
                        href="/api/spotify/login"
                        className="w-full text-center px-2 py-1 rounded-[3px] border border-[rgba(153,92,48,0.35)] bg-[#18110b] hover:bg-[#21160f] text-[9px] font-mono text-[#d6c8b9] transition-colors"
                      >
                        Connect Real Spotify Account →
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 0.5 Printed Paper & Distress Texture Controls (Texturelabs Style) */}
            <div className="space-y-2.5 rounded-[4px] border border-[rgba(153,92,48,0.25)] bg-[#120d09]/80 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[#d6c8b9]">
                  <FileText size={12} className="text-[#d79351]" />
                  <span className="font-mono text-[9px] font-bold tracking-wider uppercase">
                    PRINTED PAPER & DISTRESS
                  </span>
                </div>
                <span className="rounded-[2px] bg-[#1f150e] border border-[rgba(153,92,48,0.3)] px-1.5 py-0.5 font-mono text-[7px] text-[#eba763] uppercase">
                  {backdropVariant.replace("paper-", "")} · {backdropIntensity}
                </span>
              </div>

              {/* Material & Structural Variant Selector */}
              <div className="space-y-1">
                <span className="font-mono text-[8px] uppercase tracking-wider text-[#8f8174]">
                  Paper & Print Variant
                </span>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { id: "paper", label: "Paper", icon: FileText },
                    { id: "paper-grid", label: "Grid", icon: Grid },
                    { id: "paper-radial", label: "Radial", icon: Compass },
                    { id: "paper-hybrid", label: "Hybrid", icon: Layers },
                  ].map(({ id, label, icon: Icon }) => {
                    const isSelected =
                      backdropVariant === id ||
                      (id === "paper-grid" && backdropVariant === "grid") ||
                      (id === "paper-radial" && backdropVariant === "radial") ||
                      (id === "paper-hybrid" && backdropVariant === "hybrid");
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleVariantChange(id as BackdropVariant)}
                        className={`px-1.5 py-1.5 rounded-[3px] font-mono text-[8px] font-semibold uppercase transition-all flex items-center justify-center gap-1 border ${
                          isSelected
                            ? "bg-[#281b13] border-[#d79351] text-[#eba763] shadow-inner"
                            : "bg-[#18110b] border-[rgba(153,92,48,0.25)] text-[#8f8174] hover:text-[#d6c8b9]"
                        }`}
                        aria-pressed={isSelected}
                      >
                        <Icon size={9} />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Texture Intensity Selector */}
              <div className="space-y-1">
                <span className="font-mono text-[8px] uppercase tracking-wider text-[#8f8174]">
                  Texture Intensity
                </span>
                <div className="grid grid-cols-3 gap-1">
                  {(["subtle", "medium", "strong"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => handleIntensityChange(lvl)}
                      className={`px-2 py-1 rounded-[3px] font-mono text-[8.5px] uppercase transition-all border ${
                        backdropIntensity === lvl
                          ? "bg-[#281b13] border-[#d79351] text-[#eba763]"
                          : "bg-[#18110b] border-[rgba(153,92,48,0.25)] text-[#8f8174] hover:text-[#d6c8b9]"
                      }`}
                      aria-pressed={backdropIntensity === lvl}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 1. Cover Photo Section */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#8f8174]">
                <ImageIcon size={12} className="text-[#d79351]" />
                <span>Album Cover Photo</span>
              </label>

              <div className="flex items-center gap-3">
                <div className="relative size-12 rounded-[3px] border border-[rgba(153,92,48,0.3)] overflow-hidden bg-black shrink-0">
                  <img
                    src={albumState.coverUrl}
                    alt="Preview"
                    className="h-full w-full object-cover"
                  />
                  {imageUploadLoading && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <div className="size-4 border-2 border-[#d79351]/30 border-t-[#d79351] rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5">
                  <label className="flex items-center justify-center gap-1.5 w-full cursor-pointer rounded-[3px] border border-[rgba(153,92,48,0.35)] bg-[#18110b] hover:bg-[#21160f] px-3 py-1.5 text-[10px] font-medium text-[#d6c8b9] transition-colors">
                    <Upload size={12} />
                    <span>Upload Image (PNG/JPG)</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCoverUpload}
                    />
                  </label>

                  <input
                    type="text"
                    placeholder="Or paste image URL..."
                    value={albumState.coverUrl.startsWith("data:") ? "" : albumState.coverUrl}
                    onChange={(e) => {
                      if (e.target.value.trim()) {
                        saveAlbumState({ coverUrl: e.target.value.trim() });
                      }
                    }}
                    className="w-full rounded-[3px] border border-[rgba(153,92,48,0.25)] bg-[#0d0906] px-2 py-1 text-[10px] text-[#d6c8b9] placeholder-[#8f8174]/70 focus:border-[#d79351]/60 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 2. Music Track Section */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#8f8174]">
                <Music size={12} className="text-[#d79351]" />
                <span>Audio Track & Music</span>
              </label>

              <div className="space-y-2">
                <label className="flex items-center justify-center gap-1.5 w-full cursor-pointer rounded-[3px] border border-[rgba(153,92,48,0.35)] bg-[#18110b] hover:bg-[#21160f] px-3 py-1.5 text-[10px] font-medium text-[#d6c8b9] transition-colors">
                  <Upload size={12} />
                  <span className="truncate">
                    {audioUploadName ? `Loaded: ${audioUploadName}` : "Upload MP3 / Audio File"}
                  </span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleAudioUpload}
                  />
                </label>

                <input
                  type="text"
                  placeholder="Or paste streaming audio URL..."
                  value={albumState.audioUrl || ""}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    saveAlbumState({ audioUrl: val || null });
                  }}
                  className="w-full rounded-[3px] border border-[rgba(153,92,48,0.25)] bg-[#0d0906] px-2 py-1 text-[10px] text-[#d6c8b9] placeholder-[#8f8174]/70 focus:border-[#d79351]/60 focus:outline-none"
                />

                {!albumState.audioUrl && (
                  <div className="flex items-center gap-2 rounded-[3px] bg-[#18110b] border border-[rgba(153,92,48,0.2)] p-2 text-[10px] text-[#d79351]">
                    <Sparkles size={12} className="shrink-0 text-[#d79351]" />
                    <span>Default mode: Built-in analog lo-fi synth chord progression is active.</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Album Metadata */}
            <div className="space-y-2">
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#8f8174]">
                Album Title
              </label>
              <input
                type="text"
                value={albumState.albumTitle}
                onChange={(e) => saveAlbumState({ albumTitle: e.target.value })}
                className="w-full rounded-[3px] border border-[rgba(153,92,48,0.25)] bg-[#0d0906] px-2.5 py-1 text-xs text-[#d6c8b9] focus:border-[#d79351]/60 focus:outline-none font-medium"
              />
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-between border-t border-[rgba(153,92,48,0.2)] text-[10px]">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="flex items-center gap-1.5 text-[#8f8174] hover:text-[#d6c8b9] transition-colors"
              >
                <RotateCcw size={11} />
                <span>Reset to Default</span>
              </button>

              <button
                type="button"
                onClick={() => setCustomizerOpen(false)}
                className="flex items-center gap-1 rounded-[3px] bg-[#241a14] border border-[rgba(153,92,48,0.45)] px-3 py-1 font-mono text-[9px] font-bold text-[#eba763] hover:bg-[#322319] transition-colors"
              >
                <Check size={11} />
                <span>APPLY & CLOSE</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
