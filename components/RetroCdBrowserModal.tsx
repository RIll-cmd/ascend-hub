"use client";

import React, { useState, useEffect } from "react";
import { ExternalLink, X, RefreshCw } from "lucide-react";
import { RetroCdPlayerExperience } from "./RetroCdPlayerExperience";

interface RetroCdBrowserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl?: string;
}

export function RetroCdBrowserModal({
  open,
  onOpenChange,
  initialUrl = "https://workos.com/launch-week/spring-2026#day-1",
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
            <a
              href={initialUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in a new tab"
              title="Open in new tab"
              className="launch-retro-browser__traffic-control launch-retro-browser__traffic-control--external"
            />
          </div>

          <div className="launch-retro-browser__address font-mono">
            <span className="text-[#a58668] select-none" aria-hidden="true">http://</span>
            <span className="text-[#f5e6d3] font-semibold tracking-wider truncate">workos.com/launch-week/spring-2026#day-1</span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Refresh view"
              title="Refresh page"
              className="launch-retro-browser__action-btn"
            >
              <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
            </button>
            <a
              href={initialUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in new tab"
              title="Open external window"
              className="launch-retro-browser__action-btn"
            >
              <ExternalLink size={13} />
            </a>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              title="Close window"
              className="launch-retro-browser__mobile-close font-mono"
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
