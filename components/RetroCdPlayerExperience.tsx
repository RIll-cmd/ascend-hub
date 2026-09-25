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
} from "lucide-react";

interface CdAlbumState {
  albumTitle: string;
  artistSubtitle: string;
  coverUrl: string;
  audioUrl: string | null;
  useProceduralSynth: boolean;
  volume: number;
}

const DEFAULT_ALBUM_STATE: CdAlbumState = {
  albumTitle: "multiple apps",
  artistSubtitle: "RUN ON WEB, MOBILE, AND DESKTOP WITH SEPARATE SESSIONS ACROSS USERS.",
  coverUrl: "/retro-cd/cover-multiple-apps.webp",
  audioUrl: null,
  useProceduralSynth: true,
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

  // Load persisted state on client mount
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
      // fallback to default
    }
  }, []);

  // Save changes to localStorage
  const saveAlbumState = useCallback((updates: Partial<CdAlbumState>) => {
    setAlbumState(prev => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            albumTitle: next.albumTitle,
            artistSubtitle: next.artistSubtitle,
            coverUrl: next.coverUrl.startsWith("data:") ? next.coverUrl : next.coverUrl,
            audioUrl: next.audioUrl?.startsWith("blob:") ? null : next.audioUrl,
            useProceduralSynth: next.useProceduralSynth,
            volume: next.volume,
          })
        );
      } catch {
        // quota exceeded or private mode
      }
      return next;
    });
  }, []);

  // Web Audio Procedural Lo-Fi Synth
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

    // Warm filter for analog tape feel
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(750, ctx.currentTime);
    filter.Q.setValueAtTime(2.5, ctx.currentTime);

    master.connect(filter);
    filter.connect(ctx.destination);
    synthNodesRef.current.masterGain = master;

    // Vintage Neo-Soul / Lo-Fi Chord progressions
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

  // Master Play / Pause toggle
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      if (audioRef.current && albumState.audioUrl) {
        audioRef.current.pause();
      }
      stopProceduralSynth();
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

  // Continuous CD Rotation while playing
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      lastTimeRef.current = null;
      return;
    }

    const animate = (timestamp: number) => {
      if (lastTimeRef.current != null) {
        const delta = timestamp - lastTimeRef.current;
        setRotationDeg(prev => (prev + delta * 0.36) % 360);
      }
      lastTimeRef.current = timestamp;
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  // Handle master volume adjustments
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

  // Clean up Web Audio on unmount
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

  // Handle Cover Art Upload
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

  // Handle Audio File Upload
  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setAudioUploadName(file.name);
    saveAlbumState({
      audioUrl: objectUrl,
      useProceduralSynth: false,
      albumTitle: file.name.replace(/\.[^/.]+$/, ""),
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

  // Reset to default
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

  // Format MM:SS for LCD
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden select-none bg-[#07131d]">
      {/* Hidden audio element for custom tracks */}
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

      {/* Blueprint Grid Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <img
          src="/retro-cd/bg-multiple-apps.webp"
          alt="Blueprint Stage Background"
          className="h-full w-full object-cover"
        />
        {/* Paper Texture Overlay with blend mode */}
        <img
          src="/retro-cd/paper-texture.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-80 mix-blend-hard-light pointer-events-none"
        />
      </div>

      {/* 3D Jewel Case and Disc Stage (Perfect WorkOS Proportions) */}
      <div className="relative z-10 flex h-full w-full items-center justify-center -translate-y-4">
        <div
          className="relative flex items-center justify-center"
          style={{ width: "320px", height: "300px" }}
        >
          {/* Perspective Container */}
          <div
            className="absolute top-0 left-0 flex origin-center rounded-[3px] select-none"
            style={{
              width: "575px",
              height: "535px",
              perspective: "1800px",
              transform: "scale(0.55)",
              transformStyle: "preserve-3d",
              left: "-127px",
              top: "-117px",
            }}
          >
            <div
              className="flex size-full origin-center"
              style={{
                transformStyle: "preserve-3d",
                transform: "translateX(-155px) rotate(-5deg)",
              }}
            >
              {/* Left Spine with authentic molded ridges */}
              <div
                className="relative z-0"
                style={{
                  width: "48px",
                  height: "523px",
                  background:
                    "linear-gradient(90deg, #545454 0%, #3e3e3e 10%, #343434 50%, #242424 100%)",
                  boxShadow:
                    "inset -2px 0px 5px 0px rgba(0, 0, 0, 0.5), -10px 20px 50px 0px rgba(0, 0, 0, 0.3)",
                }}
              >
                <div
                  className="w-full h-full"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, transparent 0px, transparent 2px, rgba(0, 0, 0, 0.8) 2px, rgba(0, 0, 0, 0.8) 4px)",
                  }}
                />
                <div className="absolute inset-y-0 left-0 w-[2px] bg-white/10" />
                <div className="absolute inset-y-0 right-0 w-[1px] bg-black/80" />
              </div>

              {/* Tray Background */}
              <div
                className="absolute top-[6px] right-[2px] bottom-[6px] left-[48px] z-0 overflow-hidden rounded-[3px]"
                style={{
                  background: "#1a1a1a",
                  boxShadow:
                    "inset 0px 0px 20px 0px rgba(0, 0, 0, 0.8), 0px 20px 50px 0px rgba(0, 0, 0, 0.5)",
                }}
              >
                <div className="absolute inset-0 border-[6px] border-[#0a0a0a]" />
                <div className="absolute inset-[6px] rounded-r-[2px] border border-[#222]" />

                {/* Circular Indentation for CD */}
                <div className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#222]" />

                {/* Plastic Tray Locking Tabs */}
                <div className="absolute top-0 right-[20%] h-[8px] w-[40px] bg-[#111] border-x border-b border-[#2a2a2a] rounded-b-[2px]" />
                <div className="absolute right-[20%] bottom-0 h-[8px] w-[40px] bg-[#111] border-x border-t border-[#2a2a2a] rounded-t-[2px]" />
                <div className="absolute top-1/2 right-0 h-[40px] w-[8px] -translate-y-1/2 bg-[#111] border-y border-l border-[#2a2a2a] rounded-l-[2px]" />
              </div>

              {/* Optical CD Disc Layer (Peeking Out) */}
              <div
                className="absolute top-[6px] right-0 bottom-[6px] left-[48px] z-10 flex items-center justify-center transition-transform duration-700 ease-out"
                style={{
                  transform: "translateX(395px) translateZ(0.5px) scale(1.1)",
                }}
              >
                <div className="relative flex aspect-square w-[506px] items-center justify-center rounded-full shadow-2xl select-none">
                  {/* Outer CD Clear Plastic Ring */}
                  <div className="absolute inset-[-0.4%] flex items-center justify-center rounded-full bg-gray-200/30 ring-1 ring-slate-300/30 ring-inset" />

                  {/* CD Disc Face */}
                  <div className="relative h-full w-full rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-neutral-900" />
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        transform: `rotate(${rotationDeg}deg) translateZ(0px)`,
                        transition: isPlaying ? "none" : "transform 0.5s ease-out",
                      }}
                    >
                      <img
                        src="/retro-cd/cd-multiple-apps.png"
                        alt="Optical CD Disc"
                        draggable={false}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Center Spindle Hub */}
              <div
                className="pointer-events-none absolute top-[6px] right-0 bottom-[6px] left-[48px] z-[15] flex items-center justify-center"
                style={{ transform: "translateZ(1px)" }}
              >
                <div className="relative h-[90px] w-[90px] rounded-full border border-[#222] bg-[#111]/80 backdrop-blur-xs flex items-center justify-center shadow-lg">
                  <div className="absolute h-[40px] w-[40px] rounded-full border border-[#0a0a0a] bg-black/60" />
                  <div className="flex h-[24px] w-[24px] items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a]">
                    <div className="h-[12px] w-[12px] rounded-full bg-[#222] shadow-inner" />
                  </div>
                </div>
              </div>

              {/* Front Acrylic Door (3D Angled -25deg with Album Art) */}
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

                  {/* Dynamic Editable Badge Hover Overlay */}
                  <div
                    onClick={() => setCustomizerOpen(true)}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2 cursor-pointer transition-opacity duration-200 z-30 backdrop-blur-xs text-white"
                    title="Click to customize album cover and audio"
                  >
                    <div className="p-3 rounded-full bg-black/70 border border-white/20 shadow-xl">
                      <ImageIcon size={28} className="text-[#33dd33]" />
                    </div>
                    <span className="font-mono text-xs uppercase tracking-widest bg-black/80 px-3 py-1 rounded border border-white/10 font-semibold">
                      REPLACE COVER PHOTO
                    </span>
                  </div>
                </div>

                {/* Hinge Arms */}
                <div className="absolute top-0 -left-[48px] z-20 h-[6px] w-[48px] bg-black/40 border-t border-white/20" />
                <div className="absolute bottom-0 -left-[48px] z-20 h-[6px] w-[48px] bg-black/40 border-b border-black/80" />

                {/* Transparent Acrylic Glare and Plastic Borders */}
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute inset-x-0 top-0 h-[6px] bg-white/10 border-b border-white/15" />
                  <div className="absolute inset-x-0 bottom-0 h-[6px] bg-black/30 border-t border-white/10" />
                  <div className="absolute top-[6px] bottom-[6px] left-0 w-[6px] bg-black/40" />
                  <div className="absolute top-[6px] right-0 bottom-[6px] w-[6px] bg-white/10" />

                  {/* Molded Booklet Retention Tabs */}
                  <div className="absolute top-[15%] right-[6px] h-[35px] w-[5px] bg-white/15 rounded-l-[1px]" />
                  <div className="absolute right-[6px] bottom-[15%] h-[35px] w-[5px] bg-white/15 rounded-l-[1px]" />
                  <div className="absolute top-[6px] left-[15%] h-[4px] w-[25px] bg-white/20 rounded-b-[1px]" />
                  <div className="absolute bottom-[6px] left-[15%] h-[4px] w-[25px] bg-white/20 rounded-t-[1px]" />

                  {/* 1px Specular Border */}
                  <div className="absolute inset-0 rounded-[2px] border border-white/30" />

                  {/* Diagonal Acrylic Reflection Glare */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.03) 40%, transparent 60%)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tactile Retro Player Control Dock */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100vw-32px)]">
        <div className="relative overflow-hidden rounded-[8px] border border-[#666]/50 bg-gradient-to-b from-[#6a6a6a] via-[#585858] to-[#484848] p-[3px] shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.25)]">
          {/* Subtle Horizontal Brush Ridges */}
          <div
            className="pointer-events-none absolute inset-0 rounded-[8px] opacity-[0.04]"
            aria-hidden="true"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(255,255,255,0.6) 1px, transparent 2px)",
              backgroundSize: "3px 100%",
            }}
          />

          <div className="relative flex items-center gap-1.5 sm:gap-2 rounded-[5px] border border-[#1a1a1a] bg-gradient-to-b from-[#1e1e1e] to-[#141414] p-1.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]">
            {/* Play / Pause Tactile Button */}
            <div className="rounded-[4px] bg-[#0a0a0a] p-[1px] pb-[2px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.04)]">
              <button
                type="button"
                onClick={togglePlay}
                className="group flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[3px] border border-t-[#5a5a5a] border-x-[#444] border-b-[#2a2a2a] bg-[#3d3d3d] px-3 py-2 font-sans text-[9px] font-semibold tracking-[0.15em] uppercase text-[#ccc] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(0,0,0,0.5)] transition-colors duration-75 hover:text-white active:translate-y-[1px] active:bg-[#2a2a2a] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.7)] sm:gap-2 sm:px-4 sm:py-2 sm:text-[10px] sm:tracking-[0.2em]"
                aria-label={isPlaying ? "Pause track" : "Play demo track"}
              >
                {isPlaying ? (
                  <>
                    <Pause size={12} className="text-[#33dd33]" />
                    <span>PAUSE DEMO</span>
                  </>
                ) : (
                  <>
                    <Play size={12} className="opacity-80 group-hover:text-[#33dd33]" />
                    <span>PLAY DEMO</span>
                  </>
                )}
              </button>
            </div>

            {/* Phosphor Green Digital LCD Screen */}
            <div className="flex items-center gap-2 self-stretch rounded-[3px] border border-[#0a0a0a] bg-[#060806] px-2.5 shadow-[inset_0_1px_4px_rgba(0,0,0,0.9)] sm:px-3.5">
              <span
                className="font-mono text-[9px] leading-none tracking-[0.2em] whitespace-nowrap select-none font-bold"
                style={{
                  color: "#33dd33",
                  textShadow:
                    "0 0 6px rgba(51,221,51,0.6), 0 0 12px rgba(51,221,51,0.25)",
                }}
              >
                {isPlaying
                  ? albumState.audioUrl
                    ? `TRK ${formatTime(audioCurrentTime)}`
                    : "SYNTH CHORDS"
                  : "DAY 01"}
              </span>

              {isPlaying && (
                <span className="flex h-1.5 w-1.5 rounded-full bg-[#33dd33] animate-pulse shadow-[0_0_6px_#33dd33]" />
              )}
            </div>

            {/* Customizer Drawer Trigger Button */}
            <div className="rounded-[4px] bg-[#0a0a0a] p-[1px] pb-[2px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.04)]">
              <button
                type="button"
                onClick={() => setCustomizerOpen(prev => !prev)}
                className={`group flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[3px] border border-t-[#5a5a5a] border-x-[#444] border-b-[#2a2a2a] ${
                  customizerOpen ? "bg-[#252525] text-white border-green-500/50" : "bg-[#3d3d3d] text-[#ccc]"
                } px-2.5 py-2 font-sans text-[9px] font-semibold tracking-[0.15em] uppercase shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(0,0,0,0.5)] transition-colors duration-75 hover:text-white active:translate-y-[1px] active:bg-[#2a2a2a] sm:gap-2 sm:px-3 sm:py-2 sm:text-[10px] sm:tracking-[0.15em]`}
                aria-label="Customize cover photo and music"
              >
                <Sliders size={12} className={customizerOpen ? "text-[#33dd33]" : "opacity-80"} />
                <span className="hidden xs:inline">CUSTOMIZE</span>
              </button>
            </div>

            {/* Mute / Unmute Button */}
            <div className="rounded-[4px] bg-[#0a0a0a] p-[1px] pb-[2px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.04)]">
              <button
                type="button"
                onClick={() => setIsMuted(prev => !prev)}
                className="flex cursor-pointer items-center justify-center rounded-[3px] border border-t-[#5a5a5a] border-x-[#444] border-b-[#2a2a2a] bg-[#3d3d3d] p-2 text-[#ccc] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(0,0,0,0.5)] hover:text-white active:translate-y-[1px] active:bg-[#2a2a2a]"
                aria-label={isMuted ? "Unmute audio" : "Mute audio"}
                title={isMuted ? "Unmute audio" : "Mute audio"}
              >
                {isMuted ? <VolumeX size={12} className="text-red-400" /> : <Volume2 size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Album & Music Customizer Drawer Panel */}
      {customizerOpen && (
        <div className="absolute inset-x-3 bottom-20 z-40 sm:inset-x-auto sm:right-6 sm:w-96 rounded-xl border border-zinc-700/80 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4 duration-200 text-zinc-200 font-sans text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Disc3 size={16} className="text-[#33dd33]" />
              <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-zinc-100">
                CD MASTERING · CUSTOMIZER
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCustomizerOpen(false)}
              className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800"
              aria-label="Close customizer"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-3 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* 1. Cover Photo Section */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                <ImageIcon size={12} className="text-amber-400" />
                <span>Album Cover Photo</span>
              </label>

              <div className="flex items-center gap-3">
                <div className="relative size-12 rounded border border-zinc-700 overflow-hidden bg-black shrink-0">
                  <img
                    src={albumState.coverUrl}
                    alt="Preview"
                    className="h-full w-full object-cover"
                  />
                  {imageUploadLoading && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <div className="size-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5">
                  <label className="flex items-center justify-center gap-1.5 w-full cursor-pointer rounded border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 px-3 py-1.5 text-[11px] font-medium text-zinc-200 transition-colors">
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
                    className="w-full rounded border border-zinc-800 bg-zinc-900/90 px-2 py-1 text-[10px] text-zinc-300 placeholder-zinc-500 focus:border-amber-400/50 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 2. Music Track Section */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                <Music size={12} className="text-[#33dd33]" />
                <span>Audio Track & Music</span>
              </label>

              <div className="space-y-2">
                <label className="flex items-center justify-center gap-1.5 w-full cursor-pointer rounded border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 px-3 py-1.5 text-[11px] font-medium text-zinc-200 transition-colors">
                  <Upload size={12} />
                  <span className="truncate">
                    {audioUploadName ? `Uploaded: ${audioUploadName}` : "Upload MP3 / Audio File"}
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
                    saveAlbumState({ audioUrl: val || null, useProceduralSynth: !val });
                  }}
                  className="w-full rounded border border-zinc-800 bg-zinc-900/90 px-2 py-1 text-[10px] text-zinc-300 placeholder-zinc-500 focus:border-[#33dd33]/50 focus:outline-none"
                />

                {!albumState.audioUrl && (
                  <div className="flex items-center gap-2 rounded bg-emerald-950/40 border border-emerald-800/40 p-2 text-[10px] text-emerald-300">
                    <Sparkles size={12} className="shrink-0 text-emerald-400" />
                    <span>Default mode: Built-in analog lo-fi synth chord progression is active.</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Album Metadata */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                Album Title
              </label>
              <input
                type="text"
                value={albumState.albumTitle}
                onChange={(e) => saveAlbumState({ albumTitle: e.target.value })}
                className="w-full rounded border border-zinc-800 bg-zinc-900/90 px-2.5 py-1 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none font-medium"
              />
            </div>

            {/* Reset Defaults Button */}
            <div className="pt-2 flex items-center justify-between border-t border-zinc-800/80 text-[11px]">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <RotateCcw size={12} />
                <span>Reset to Default</span>
              </button>

              <button
                type="button"
                onClick={() => setCustomizerOpen(false)}
                className="flex items-center gap-1 rounded bg-[#33dd33]/20 border border-[#33dd33]/40 px-3 py-1 font-mono text-[10px] font-bold text-[#33dd33] hover:bg-[#33dd33]/30 transition-colors"
              >
                <Check size={12} />
                <span>APPLY & CLOSE</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
