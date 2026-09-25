"use client";

import React, { useState, useEffect } from "react";
import { X, RefreshCw } from "lucide-react";
import { RetroCdPlayerExperience } from "./RetroCdPlayerExperience";

interface RetroCdBrowserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RetroCdBrowserModal({
  open,
  onOpenChange,
}: RetroCdBrowserModalProps) {
  const [mounted, setMounted] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in-0 duration-200 overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Launch Week Spring 2026 — CD Player Experience"
    >
      <div className="launch-retro-browser focus:outline-none animate-in zoom-in-95 duration-200">
        <div className="ascend-cd-deck__header">
          <div className="ascend-cd-deck__leds">
            <div className="ascend-cd-deck__led" title="System Power: Active">
              <span className="ascend-cd-deck__led-dot ascend-cd-deck__led-dot--pwr" />
              <span className="hidden sm:inline">PWR</span>
            </div>
            <div className="ascend-cd-deck__led" title="Laser Servo: Locked">
              <span className="ascend-cd-deck__led-dot ascend-cd-deck__led-dot--laser" />
              <span className="hidden sm:inline">SERVO</span>
            </div>
            <div className="ascend-cd-deck__led" title="Optical Pickup: Ready">
              <span className="ascend-cd-deck__led-dot ascend-cd-deck__led-dot--opt" />
              <span className="hidden sm:inline">OPTICAL</span>
            </div>
          </div>

          <div className="ascend-cd-deck__vfd">
            <span>ASCEND OS // CD-DA TRANSPORT // 44.1kHz 16-BIT LINEAR PCM</span>
          </div>

          <div className="ascend-cd-deck__actions">
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Reset audio player"
              title="Reset player"
              className="ascend-cd-deck__btn"
            >
              <RefreshCw size={11} className={isLoading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">RESET</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Eject / Close Deck"
              title="Close deck"
              className="ascend-cd-deck__btn"
            >
              <X size={12} />
              <span className="hidden sm:inline">EJECT</span>
            </button>
          </div>
        </div>

        <div className="launch-retro-browser__viewport relative">
          <RetroCdPlayerExperience key={iframeKey} />
          <div className="launch-retro-browser__scanlines pointer-events-none" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
