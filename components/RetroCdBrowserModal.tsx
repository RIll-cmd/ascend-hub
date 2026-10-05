"use client";

import React, { useState, useEffect } from "react";
import { X, RefreshCw, Disc, Sparkles, ExternalLink } from "lucide-react";
import { RetroCdPlayerExperience } from "./RetroCdPlayerExperience";

import type { SpotifyPlaybackState } from "@/lib/spotify";

interface RetroCdBrowserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spotifyData?: SpotifyPlaybackState | Partial<SpotifyPlaybackState> | null;
  onOpenSpotifySetup?: () => void;
}

export function RetroCdBrowserModal({
  open,
  onOpenChange,
  spotifyData,
  onOpenSpotifySetup,
}: RetroCdBrowserModalProps) {
  const [mounted, setMounted] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [liveSpotifyData, setLiveSpotifyData] = useState<
    SpotifyPlaybackState | Partial<SpotifyPlaybackState> | null
  >(spotifyData || null);
  const [spotifyMenuOpen, setSpotifyMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Synchronize when prop changes
  useEffect(() => {
    if (spotifyData) {
      setLiveSpotifyData(spotifyData);
    }
  }, [spotifyData]);

  // Live polling while modal is open to keep header VFD & LEDs in sync
  useEffect(() => {
    if (!open) return;
    let isMounted = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/spotify/currently-playing");
        if (res.ok) {
          const data = (await res.json()) as SpotifyPlaybackState | null;
          if (isMounted) {
            setLiveSpotifyData(data);
          }
        }
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const handleRefresh = () => {
    setIsLoading(true);
    setIframeKey(k => k + 1);
  };

  if (!mounted || !open) return null;

  const isConnected = Boolean(liveSpotifyData?.connected);
  const isPlaying = Boolean(liveSpotifyData?.isPlaying);
  const hasCover = Boolean(liveSpotifyData?.albumImageUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in-0 duration-200 overflow-hidden"
      style={{
        backgroundColor: "rgba(18, 12, 10, 0.94)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Launch Week Spring 2026 — CD Player Experience"
    >
      {/* Ambient Room Spill Glow from Active Album Art (Quiet Deep Espresso Hue) */}
      {hasCover && (
        <div
          className="pointer-events-none absolute -inset-28 opacity-20 filter blur-[130px] saturate-[1.1] brightness-[0.45] transition-all duration-1000 scale-105"
          style={{
            backgroundImage: `url(${liveSpotifyData?.albumImageUrl})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />
      )}

      <div className="launch-retro-browser focus:outline-none animate-in zoom-in-95 duration-200 relative">
        <div className="ascend-cd-deck__header relative">
          <div className="ascend-cd-deck__leds">
            <div className="ascend-cd-deck__led ascend-cd-deck__led--active" title="System Power: Active">
              <span className="ascend-cd-deck__led-dot ascend-cd-deck__led-dot--pwr" />
              <span className="hidden sm:inline">PWR</span>
            </div>
            <div className="ascend-cd-deck__led ascend-cd-deck__led--active" title="Laser Servo: Locked">
              <span className="ascend-cd-deck__led-dot ascend-cd-deck__led-dot--laser" />
              <span className="hidden sm:inline">SERVO</span>
            </div>
            <div className="ascend-cd-deck__led ascend-cd-deck__led--active" title="Optical Pickup: Ready">
              <span className="ascend-cd-deck__led-dot ascend-cd-deck__led-dot--opt" />
              <span className="hidden sm:inline">OPTICAL</span>
            </div>

            {/* Interactive Spotify Indicator LED */}
            <button
              type="button"
              onClick={() => setSpotifyMenuOpen(prev => !prev)}
              className={`ascend-cd-deck__led cursor-pointer hover:bg-[#1a120c] px-1 py-0.5 rounded transition-colors focus:outline-none ${
                isConnected ? "ascend-cd-deck__led--active" : "ascend-cd-deck__led--dim"
              }`}
              title={
                isConnected
                  ? `Spotify Synced: ${liveSpotifyData?.title} by ${liveSpotifyData?.artist} (Click to manage)`
                  : "Spotify Sync: Offline (Click to quick-connect or demo)"
              }
              aria-label="Spotify connection status and menu"
              aria-expanded={spotifyMenuOpen}
            >
              <span
                className={`ascend-cd-deck__led-dot ${
                  isPlaying
                    ? "ascend-cd-deck__led-dot--laser"
                    : isConnected
                    ? "ascend-cd-deck__led-dot--opt"
                    : "opacity-30 bg-[#74685e]"
                }`}
              />
              <span className="hidden sm:inline">SPOTIFY</span>
              {isConnected && (
                <span className="hidden md:inline text-[7px] text-[#56b347] font-bold ml-0.5">●</span>
              )}
            </button>
          </div>

          <div className="ascend-cd-deck__vfd">
            <span>
              {isConnected && liveSpotifyData?.title
                ? `SPOTIFY // ${(liveSpotifyData.title || "").toUpperCase()} // ${(liveSpotifyData.artist || "").toUpperCase()}`
                : "ASCEND OS // CD-DA TRANSPORT // 44.1kHz 16-BIT LINEAR PCM"}
            </span>
          </div>

          <div className="ascend-cd-deck__actions">
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Reset audio player"
              title="Reset player"
              className="ascend-cd-deck__btn"
            >
              <RefreshCw size={10} className={isLoading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">RESET</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Eject / Close Deck"
              title="Close deck"
              className="ascend-cd-deck__btn"
            >
              <X size={11} />
              <span className="hidden sm:inline">EJECT</span>
            </button>
          </div>
        </div>

        {/* Quick Spotify Header Dropdown Menu */}
        {spotifyMenuOpen && (
          <div className="absolute top-12 left-4 z-50 w-72 rounded-[4px] border border-[rgba(153,92,48,0.4)] bg-[#140e0a]/98 p-3 shadow-2xl backdrop-blur-md animate-in fade-in-50 zoom-in-95 duration-150 font-mono text-[10px] text-[#d6c8b9]">
            <div className="flex items-center justify-between pb-2 border-b border-[rgba(153,92,48,0.2)]">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <Disc size={13} className={isPlaying ? "animate-spin" : ""} />
                <span>SPOTIFY QUICK SYNC</span>
              </div>
              <button
                type="button"
                onClick={() => setSpotifyMenuOpen(false)}
                className="text-[#8f8174] hover:text-white p-0.5"
                aria-label="Close menu"
              >
                <X size={12} />
              </button>
            </div>

            <div className="mt-2.5 space-y-2">
              {isConnected ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-1.5 rounded bg-black/60 border border-zinc-800">
                    {liveSpotifyData?.albumImageUrl && (
                      <img
                        src={liveSpotifyData.albumImageUrl}
                        alt="Album art"
                        className="size-8 rounded-[2px] object-cover shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[#eba763] font-medium truncate">{liveSpotifyData?.title}</div>
                      <div className="text-[#8f8174] text-[8px] truncate">{liveSpotifyData?.artist}</div>
                    </div>
                  </div>
                  <div className="text-[8px] text-[#56b347] flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-[#56b347] animate-pulse" />
                    <span>Live synced with CD Cover & Background</span>
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    {liveSpotifyData?.demoMode ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch("/api/spotify/setup", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ demoMode: false }),
                          });
                          const res = await fetch("/api/spotify/currently-playing");
                          if (res.ok) setLiveSpotifyData(await res.json());
                        }}
                        className="flex-1 py-1 px-2 rounded-[2px] border border-[rgba(153,92,48,0.35)] bg-[#1d140e] hover:bg-[#281b13] text-[#d6c8b9] text-[9px]"
                      >
                        Exit Demo
                      </button>
                    ) : (
                      <a
                        href="/api/spotify/login"
                        className="flex-1 text-center py-1 px-2 rounded-[2px] border border-[rgba(153,92,48,0.35)] bg-[#1d140e] hover:bg-[#281b13] text-[#d6c8b9] text-[9px]"
                      >
                        Re-Link
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
                        if (res.ok) setLiveSpotifyData(await res.json());
                        setSpotifyMenuOpen(false);
                      }}
                      className="py-1 px-2 rounded-[2px] border border-red-900/40 bg-red-950/40 hover:bg-red-950/70 text-red-300 text-[9px]"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[9px] text-[#8f8174] leading-relaxed">
                    Connect Spotify to sync the CD cover art and dynamic blurred background in real-time.
                  </p>
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
                        setLiveSpotifyData(data);
                      }
                      setSpotifyMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-[2px] border border-emerald-500/40 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 text-[9px] font-bold shadow"
                  >
                    <Sparkles size={11} />
                    <span>⚡ 1-Click Instant Preview (ZZZ OST)</span>
                  </button>
                  {onOpenSpotifySetup ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSpotifyMenuOpen(false);
                        onOpenSpotifySetup();
                      }}
                      className="w-full text-center py-1 px-2 rounded-[2px] border border-[rgba(153,92,48,0.35)] bg-[#1d140e] hover:bg-[#281b13] text-[#d6c8b9] text-[9px]"
                    >
                      Connect Spotify Account →
                    </button>
                  ) : (
                    <a
                      href="/api/spotify/login"
                      className="block text-center py-1 px-2 rounded-[2px] border border-[rgba(153,92,48,0.35)] bg-[#1d140e] hover:bg-[#281b13] text-[#d6c8b9] text-[9px]"
                    >
                      Connect Spotify Account →
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="launch-retro-browser__viewport relative">
          <RetroCdPlayerExperience
            key={iframeKey}
            spotifyData={liveSpotifyData}
            onSpotifyDataChange={(newData) => setLiveSpotifyData(newData)}
            onOpenSpotifySetup={onOpenSpotifySetup}
          />
          <div className="launch-retro-browser__scanlines pointer-events-none" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
