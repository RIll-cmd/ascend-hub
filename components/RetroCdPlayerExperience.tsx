"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";

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

export function RetroCdPlayerExperience() {
  const [albumState, setAlbumState] = useState<CdAlbumState>(DEFAULT_ALBUM_STATE);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);
  const [audioUploadName, setAudioUploadName] = useState<string | null>(null);

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
  }, [isPlaying, albumState.audioUrl, stopProceduralSynth, startProceduralSynth]);

  // Optical Disc Spin & VU Meters Animation Loop
  useEffect(() => {
    if (!isPlaying) {
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
  }, [isPlaying]);

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
        backgroundImage: `
          linear-gradient(rgba(255, 255, 255, 0.006), rgba(255, 255, 255, 0.006)),
          repeating-linear-gradient(90deg, transparent 0, transparent 3px, rgba(255, 255, 255, 0.008) 4px),
          radial-gradient(circle at 50% 48%, rgba(93, 54, 31, 0.12) 0%, transparent 55%)
        `,
      }}
    >
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
              border: "1px solid rgba(158, 104, 66, 0.12)",
              background: "radial-gradient(circle at 50% 50%, rgba(93, 54, 31, 0.04) 0%, transparent 68%)",
              boxShadow: "inset 0 0 30px rgba(0, 0, 0, 0.65)",
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
                        transition: isPlaying ? "none" : "transform 0.6s ease-out",
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
                        <span className="font-mono text-[9px] tracking-[0.22em] text-[#d79351] uppercase font-bold text-center">
                          ASCEND OS · CONTINUOUS PROGRESSION
                        </span>

                        {/* Center Spindle Hole (15mm Clear Polycarbonate Ring) */}
                        <div className="relative size-20 rounded-full border border-white/30 bg-[#070504]/90 flex items-center justify-center shadow-2xl">
                          <div className="size-10 rounded-full border border-white/20 bg-transparent" />
                        </div>

                        <span className="font-mono text-[8px] tracking-[0.18em] text-[#d6c8b9]/80 uppercase text-center font-medium">
                          DIGITAL AUDIO · 44.1 kHz PCM
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
                    src={albumState.coverUrl}
                    alt={albumState.albumTitle}
                    draggable={false}
                    className="h-full w-full object-cover transition-opacity duration-300"
                  />

                  {/* Hover Overlay for Customizing Cover */}
                  <div
                    onClick={() => setCustomizerOpen(true)}
                    className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-opacity duration-200 z-30 backdrop-blur-xs text-white"
                    title="Click to replace cover photo"
                  >
                    <div className="p-3 rounded-full bg-[#110c08]/90 border border-[rgba(153,92,48,0.45)] shadow-md">
                      <ImageIcon size={22} className="text-[#d79351]" />
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-widest bg-[#110c08]/95 px-3 py-1.5 rounded-[3px] border border-[rgba(153,92,48,0.35)] font-bold text-[#d6c8b9]">
                      REPLACE COVER PHOTO
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
      <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-[940px] px-3 sm:px-4">
        <div
          className="relative overflow-hidden rounded-[6px] border p-2 sm:p-2.5"
          style={{
            background:
              "linear-gradient(180deg, #18110b 0%, #120d09 45%, #0c0805 100%)",
            borderColor: "rgba(153, 92, 48, 0.38)",
            boxShadow:
              "inset 0 1px 0 rgba(255, 255, 255, 0.04), inset 0 -1px 0 rgba(0, 0, 0, 0.6), 0 8px 24px rgba(0, 0, 0, 0.65)",
          }}
        >
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 sm:gap-3">
            {/* Group 1: Track Display & Level Meters */}
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
              {/* Recessed Track Display */}
              <div
                className="flex flex-col justify-center rounded-[3px] px-2.5 py-1.5 shrink-0"
                style={{
                  background: "#080604",
                  border: "1px solid rgba(153, 92, 48, 0.35)",
                  boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.95)",
                }}
              >
                <div className="flex items-center gap-2 font-mono text-[9px] font-semibold tracking-wider">
                  <span className="text-[#8f8174]">TRACK</span>
                  <span className="text-[#eba763]">01</span>
                  <span className="text-[#55463a]">/</span>
                  <span className="text-[#d79351]">
                    {formatTime(audioCurrentTime)}
                  </span>
                </div>
                <div className="font-mono text-[8px] tracking-[0.14em] text-[#d6c8b9] uppercase truncate max-w-[130px] sm:max-w-[160px] mt-0.5">
                  {albumState.albumTitle}
                </div>
              </div>

              {/* Stereo L/R Level Meters */}
              <div
                className="flex flex-col gap-1 rounded-[3px] py-1 pl-2.5 sm:pl-3 border-l shrink-0"
                style={{
                  borderLeftColor: "rgba(177, 119, 76, 0.14)",
                }}
              >
                {/* Channel L */}
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[8px] text-[#8f8174] w-2.5">L</span>
                  <div className="flex items-center gap-[2px]">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span
                        key={`vu-l-${i}`}
                        className="h-2 w-1 rounded-[1px] transition-colors duration-75"
                        style={{
                          backgroundColor:
                            i < vuLeft
                              ? i >= 10
                                ? "#e27439"
                                : "#d79351"
                              : "rgba(208, 181, 153, 0.10)",
                          boxShadow:
                            i < vuLeft
                              ? "0 0 2px rgba(215, 147, 81, 0.25)"
                              : "none",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Channel R */}
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[8px] text-[#8f8174] w-2.5">R</span>
                  <div className="flex items-center gap-[2px]">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span
                        key={`vu-r-${i}`}
                        className="h-2 w-1 rounded-[1px] transition-colors duration-75"
                        style={{
                          backgroundColor:
                            i < vuRight
                              ? i >= 10
                                ? "#e27439"
                                : "#d79351"
                              : "rgba(208, 181, 153, 0.10)",
                          boxShadow:
                            i < vuRight
                              ? "0 0 2px rgba(215, 147, 81, 0.25)"
                              : "none",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Group 2: Transport Buttons, Customize, and Volume */}
            <div className="flex items-center gap-2 sm:gap-2.5 ml-auto">
              {/* Transport Buttons: [ Previous ] [ Play ] [ Next ] */}
              <div
                className="flex items-center gap-1.5 pl-2.5 sm:pl-3 border-l shrink-0"
                style={{ borderLeftColor: "rgba(177, 119, 76, 0.14)" }}
              >
                <button
                  type="button"
                  onClick={() => setAudioCurrentTime(0)}
                  className="ascend-cd-deck__btn px-2.5 py-1"
                  title="Previous track / Restart"
                  aria-label="Previous track"
                >
                  <SkipBack size={12} />
                </button>

                {/* Main Play / Pause Tactile Switch */}
                <button
                  type="button"
                  onClick={togglePlay}
                  className="ascend-cd-deck__btn px-3 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-all"
                  aria-label={isPlaying ? "Pause playback" : "Start playback"}
                  title={isPlaying ? "Pause playback" : "Start playback"}
                  style={{
                    borderColor: isPlaying ? "rgba(215, 147, 81, 0.5)" : undefined,
                    color: isPlaying ? "#eba763" : undefined,
                  }}
                >
                  {isPlaying ? (
                    <>
                      <Pause size={12} className="text-[#d79351]" />
                      <span>PAUSE</span>
                    </>
                  ) : (
                    <>
                      <Play size={12} className="text-[#56b347]" fill="#56b347" />
                      <span>PLAY</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setAudioCurrentTime(0)}
                  className="ascend-cd-deck__btn px-2.5 py-1"
                  title="Next track"
                  aria-label="Next track"
                >
                  <SkipForward size={12} />
                </button>
              </div>

              {/* Customize Button */}
              <div
                className="flex items-center pl-2.5 sm:pl-3 border-l shrink-0"
                style={{ borderLeftColor: "rgba(177, 119, 76, 0.14)" }}
              >
                <button
                  type="button"
                  onClick={() => setCustomizerOpen(prev => !prev)}
                  className="ascend-cd-deck__btn px-2.5 py-1"
                  aria-label="Open album customizer"
                  title="Customize cover photo & audio"
                  style={{
                    borderColor: customizerOpen ? "rgba(215, 147, 81, 0.6)" : undefined,
                    color: customizerOpen ? "#eba763" : undefined,
                  }}
                >
                  <Sliders size={12} className={customizerOpen ? "text-[#eba763]" : "text-[#8f8174]"} />
                  <span className="hidden sm:inline">CUSTOMIZE</span>
                </button>
              </div>

              {/* Volume Button */}
              <div
                className="flex items-center pl-2.5 sm:pl-3 border-l shrink-0"
                style={{ borderLeftColor: "rgba(177, 119, 76, 0.14)" }}
              >
                <button
                  type="button"
                  onClick={() => setIsMuted(prev => !prev)}
                  className="ascend-cd-deck__btn p-1.5"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                  title={isMuted ? "Unmute audio" : "Mute audio"}
                >
                  {isMuted ? <VolumeX size={13} className="text-[#e27439]" /> : <Volume2 size={13} />}
                </button>
              </div>
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
