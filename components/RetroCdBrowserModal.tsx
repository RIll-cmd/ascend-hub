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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-0 duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Launch Week Spring 2026 — CD Player Experience"
    >
      <div className="launch-retro-browser focus:outline-none animate-in zoom-in-95 duration-200">
        <div className="launch-retro-browser__chrome">
          <div className="launch-retro-browser__lights">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close browser window"
              title="Close"
              className="launch-retro-browser__traffic-control launch-retro-browser__traffic-control--close cursor-pointer"
            />
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Reload browser view"
              title="Reload"
              className="launch-retro-browser__traffic-control launch-retro-browser__traffic-control--minimize cursor-pointer"
            />
            <button
              type="button"
              aria-label="Player status: Ready"
              title="Status: Ready"
              className="launch-retro-browser__traffic-control launch-retro-browser__traffic-control--external cursor-default"
            />
          </div>

          <div className="launch-retro-browser__address font-mono flex items-center justify-center">
            <span className="text-[#f5e6d3] font-semibold tracking-widest text-[11px] uppercase select-none">
              COMPACT DISC PLAYER · STEREO AUDIO SYSTEM
            </span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Reload player"
              title="Reload player"
              className="launch-retro-browser__action-btn"
            >
              <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              title="Close window"
              className="launch-retro-browser__action-btn"
            >
              <X size={15} />
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
