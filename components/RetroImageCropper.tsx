"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Scissors, Move, RotateCcw, Copy, Check, X, Sliders, Maximize2, ShieldCheck } from "lucide-react";

export interface RoomCropConfig {
  topCutPercent: number;    // e.g. 0 to 30 (%)
  shiftYPercent: number;    // e.g. -20 to 20 (%)
  shelfSeamPx: number;      // base px at 1024 width (e.g. 10 to 45)
  shelfWidthBase: number;   // base width at 1024 (default 822 for speaker+DVD symmetry)
  shelfLeftBase: number;    // base left position at 1024 (default 96 for speaker left corner)
  scale: number;            // e.g. 0.90 to 1.30
}

export const DEFAULT_CROP_CONFIG: RoomCropConfig = {
  topCutPercent: 6.6,       // Permanently calibrated by CB: 6.6%
  shiftYPercent: 0,
  shelfSeamPx: 0,           // Shelf positioned directly below the image
  shelfWidthBase: 832,      // Symmetrical from left edge of speaker to right edge of DVD
  shelfLeftBase: 96,        // Left edge of speaker box
  scale: 1.0,
};

const STORAGE_KEY = "ascend_retro_hero_crop_config_v5";

export function loadSavedCropConfig(): RoomCropConfig {
  if (typeof window === "undefined") return DEFAULT_CROP_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CROP_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      topCutPercent: typeof parsed.topCutPercent === "number" ? parsed.topCutPercent : DEFAULT_CROP_CONFIG.topCutPercent,
      shiftYPercent: typeof parsed.shiftYPercent === "number" ? parsed.shiftYPercent : DEFAULT_CROP_CONFIG.shiftYPercent,
      shelfSeamPx: typeof parsed.shelfSeamPx === "number" ? parsed.shelfSeamPx : DEFAULT_CROP_CONFIG.shelfSeamPx,
      shelfWidthBase: typeof parsed.shelfWidthBase === "number" ? parsed.shelfWidthBase : DEFAULT_CROP_CONFIG.shelfWidthBase,
      shelfLeftBase: typeof parsed.shelfLeftBase === "number" ? parsed.shelfLeftBase : DEFAULT_CROP_CONFIG.shelfLeftBase,
      scale: typeof parsed.scale === "number" ? parsed.scale : DEFAULT_CROP_CONFIG.scale,
    };
  } catch {
    return DEFAULT_CROP_CONFIG;
  }
}

export function saveCropConfig(config: RoomCropConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error("Failed to save crop config", err);
  }
}

interface RetroImageCropperProps {
  isOpen: boolean;
  onClose: () => void;
  config: RoomCropConfig;
  onChange: (cfg: RoomCropConfig) => void;
  stageElementRef?: React.RefObject<HTMLDivElement | null>;
}

export function RetroImageCropper({
  isOpen,
  onClose,
  config,
  onChange,
  stageElementRef,
}: RetroImageCropperProps) {
  const [copied, setCopied] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [activeDrag, setActiveDrag] = useState<"top" | "pan" | "shelf" | null>(null);
  const [mounted, setMounted] = useState(false);
  const dragStartYRef = useRef(0);
  const dragInitialConfigRef = useRef<RoomCropConfig>(config);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcut ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleSave = () => {
    saveCropConfig(config);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleCopyCss = () => {
    const css = `/* Ascend OS Retro Room Hero Crop Calibration */
.retro-room-hero-section {
  margin-top: -${config.topCutPercent.toFixed(1)}vw;
  transform: translateY(${config.shiftYPercent.toFixed(1)}%);
}
.retro-room-stage {
  transform: scale(${config.scale.toFixed(2)});
}
.cabinet-shell.launch-cabinet-stack {
  margin-top: calc(-1 * (100vw * (${config.shelfSeamPx} / 1024)));
}`;
    navigator.clipboard?.writeText(css);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleReset = () => {
    onChange(DEFAULT_CROP_CONFIG);
    saveCropConfig(DEFAULT_CROP_CONFIG);
  };

  const setPreset = (preset: "seated" | "full" | "postersOnly") => {
    let next: RoomCropConfig;
    if (preset === "seated") {
      next = { topCutPercent: 6.6, shiftYPercent: 0, shelfSeamPx: 0, shelfWidthBase: 822, shelfLeftBase: 96, scale: 1.0 };
    } else if (preset === "full") {
      next = { topCutPercent: 0, shiftYPercent: 0, shelfSeamPx: 0, shelfWidthBase: 822, shelfLeftBase: 96, scale: 1.0 };
    } else {
      next = { topCutPercent: 12.0, shiftYPercent: 0, shelfSeamPx: 0, shelfWidthBase: 822, shelfLeftBase: 96, scale: 1.0 };
    }
    onChange(next);
  };

  // Direct Mouse Drag logic on canvas
  const startDrag = (mode: "top" | "pan" | "shelf", e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDrag(mode);
    dragStartYRef.current = e.clientY;
    dragInitialConfigRef.current = { ...config };
  };

  const onGlobalMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!activeDrag) return;
      const deltaY = e.clientY - dragStartYRef.current;
      const stageHeight = stageElementRef?.current?.clientHeight || 600;

      if (activeDrag === "top") {
        // Dragging top cut line: moving down increases topCutPercent
        const deltaPercent = (deltaY / stageHeight) * 100;
        const nextVal = Math.max(0, Math.min(25, dragInitialConfigRef.current.topCutPercent + deltaPercent));
        onChange({ ...config, topCutPercent: Math.round(nextVal * 10) / 10 });
      } else if (activeDrag === "pan") {
        // Dragging canvas up/down: moving mouse moves shiftYPercent
        const deltaPercent = (deltaY / stageHeight) * 100;
        const nextVal = Math.max(-15, Math.min(15, dragInitialConfigRef.current.shiftYPercent + deltaPercent));
        onChange({ ...config, shiftYPercent: Math.round(nextVal * 10) / 10 });
      } else if (activeDrag === "shelf") {
        // Dragging shelf seam line: moving up increases shelf overlap
        const deltaPx = Math.round(-deltaY * 0.4);
        const nextVal = Math.max(-20, Math.min(60, dragInitialConfigRef.current.shelfSeamPx + deltaPx));
        onChange({ ...config, shelfSeamPx: nextVal });
      }
    },
    [activeDrag, config, onChange, stageElementRef]
  );

  const onGlobalMouseUp = useCallback(() => {
    if (activeDrag) {
      setActiveDrag(null);
      // auto persist on release
      saveCropConfig(config);
    }
  }, [activeDrag, config]);

  useEffect(() => {
    if (activeDrag) {
      window.addEventListener("mousemove", onGlobalMouseMove);
      window.addEventListener("mouseup", onGlobalMouseUp);
      return () => {
        window.removeEventListener("mousemove", onGlobalMouseMove);
        window.removeEventListener("mouseup", onGlobalMouseUp);
      };
    }
  }, [activeDrag, onGlobalMouseMove, onGlobalMouseUp]);

  if (!isOpen) return null;

  return (
    <div className="retro-crop-suite-root">
      {/* 1. On-Canvas Interactive Guidelines & Drag Handles */}
      <div className="crop-canvas-overlay" onMouseDown={e => startDrag("pan", e)} title="Click and drag anywhere to pan vertically">
        {/* Top Cut Guideline with Scissor Handle */}
        <div
          className={`crop-guideline crop-top-line ${activeDrag === "top" ? "is-dragging" : ""}`}
          style={{ top: `${config.topCutPercent}%` }}
          onMouseDown={e => startDrag("top", e)}
        >
          <div className="crop-handle-badge">
            <Scissors size={13} />
            <span>DRAG TO CUT TOP: {config.topCutPercent.toFixed(1)}%</span>
          </div>
          <div className="crop-guideline-bar" />
        </div>

        {/* Center Pan Indicator */}
        <div className="crop-pan-indicator">
          <Move size={14} />
          <span>DRAG IMAGE TO PAN VERTICALLY ({config.shiftYPercent > 0 ? `+${config.shiftYPercent.toFixed(1)}%` : `${config.shiftYPercent.toFixed(1)}%`})</span>
        </div>

        {/* Shelf Seam Guideline */}
        <div
          className={`crop-guideline crop-shelf-line ${activeDrag === "shelf" ? "is-dragging" : ""}`}
          style={{ bottom: `${(config.shelfSeamPx / 575) * 100}%` }}
          onMouseDown={e => startDrag("shelf", e)}
        >
          <div className="crop-guideline-bar shelf-bar" />
          <div className="crop-handle-badge shelf-badge">
            <Sliders size={13} />
            <span>SHELF CONTACT SEAM: {config.shelfSeamPx}px</span>
          </div>
        </div>
      </div>

      {/* 2. Floating Precision HUD Panel (Portal to document.body for clean fixed viewport positioning) */}
      {mounted &&
        createPortal(
          <aside className="crop-hud-palette" aria-label="Image Cropper and Position Suite">
            <div className="crop-hud-header">
              <div className="crop-hud-title">
                <Scissors size={16} className="text-neon-cyan" />
                <span>FREE-CUT & POSITION SUITE</span>
              </div>
              <button type="button" className="crop-hud-close-btn" onClick={onClose} title="Close Suite (Esc)">
                <X size={15} />
              </button>
            </div>

            <p className="crop-hud-hint">
              Drag handles directly on the canvas or use the precision sliders below to seat the image on the shelves.
            </p>

            {/* Sliders & Controls */}
            <div className="crop-controls-list">
              {/* Top Cut */}
              <div className="crop-control-group">
                <div className="crop-control-label">
                  <span>✂️ Cut Upper Part (Posters)</span>
                  <strong>{config.topCutPercent.toFixed(1)}%</strong>
                </div>
                <div className="crop-slider-row">
                  <button
                    type="button"
                    className="nudge-btn"
                    onClick={() => onChange({ ...config, topCutPercent: Math.max(0, config.topCutPercent - 0.5) })}
                  >
                    -0.5%
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="25"
                    step="0.2"
                    value={config.topCutPercent}
                    onChange={e => onChange({ ...config, topCutPercent: parseFloat(e.target.value) })}
                    className="crop-range-slider"
                  />
                  <button
                    type="button"
                    className="nudge-btn"
                    onClick={() => onChange({ ...config, topCutPercent: Math.min(25, config.topCutPercent + 0.5) })}
                  >
                    +0.5%
                  </button>
                </div>
              </div>

              {/* Shift Y */}
              <div className="crop-control-group">
                <div className="crop-control-label">
                  <span>↕ Move / Pan Y</span>
                  <strong>{config.shiftYPercent.toFixed(1)}%</strong>
                </div>
                <div className="crop-slider-row">
                  <button
                    type="button"
                    className="nudge-btn"
                    onClick={() => onChange({ ...config, shiftYPercent: Math.max(-15, config.shiftYPercent - 0.5) })}
                  >
                    -0.5%
                  </button>
                  <input
                    type="range"
                    min="-15"
                    max="15"
                    step="0.2"
                    value={config.shiftYPercent}
                    onChange={e => onChange({ ...config, shiftYPercent: parseFloat(e.target.value) })}
                    className="crop-range-slider"
                  />
                  <button
                    type="button"
                    className="nudge-btn"
                    onClick={() => onChange({ ...config, shiftYPercent: Math.min(15, config.shiftYPercent + 0.5) })}
                  >
                    +0.5%
                  </button>
                </div>
              </div>

              {/* Shelf Contact Seam */}
              <div className="crop-control-group">
                <div className="crop-control-label">
                  <span>🗄️ Shelf Contact Seam</span>
                  <strong>{config.shelfSeamPx}px</strong>
                </div>
                <div className="crop-slider-row">
                  <button
                    type="button"
                    className="nudge-btn"
                    onClick={() => onChange({ ...config, shelfSeamPx: config.shelfSeamPx - 1 })}
                  >
                    -1px
                  </button>
                  <input
                    type="range"
                    min="-10"
                    max="50"
                    step="1"
                    value={config.shelfSeamPx}
                    onChange={e => onChange({ ...config, shelfSeamPx: parseInt(e.target.value, 10) })}
                    className="crop-range-slider"
                  />
                  <button
                    type="button"
                    className="nudge-btn"
                    onClick={() => onChange({ ...config, shelfSeamPx: config.shelfSeamPx + 1 })}
                  >
                    +1px
                  </button>
                </div>
              </div>

              {/* Shelf Width (Base) */}
              <div className="crop-control-group">
                <div className="crop-control-label">
                  <span>📐 Shelf Width (Speaker/DVD)</span>
                  <strong>{((config.shelfWidthBase / 1024) * 100).toFixed(1)}% ({config.shelfWidthBase}px)</strong>
                </div>
                <div className="crop-slider-row">
                  <button
                    type="button"
                    className="nudge-btn"
                    onClick={() => onChange({ ...config, shelfWidthBase: config.shelfWidthBase - 4 })}
                  >
                    -4px
                  </button>
                  <input
                    type="range"
                    min="700"
                    max="960"
                    step="2"
                    value={config.shelfWidthBase}
                    onChange={e => onChange({ ...config, shelfWidthBase: parseInt(e.target.value, 10) })}
                    className="crop-range-slider"
                  />
                  <button
                    type="button"
                    className="nudge-btn"
                    onClick={() => onChange({ ...config, shelfWidthBase: config.shelfWidthBase + 4 })}
                  >
                    +4px
                  </button>
                </div>
              </div>

              {/* Shelf Horizontal Offset */}
              <div className="crop-control-group">
                <div className="crop-control-label">
                  <span>↔ Shelf Left Offset</span>
                  <strong>{((config.shelfLeftBase / 1024) * 100).toFixed(1)}% ({config.shelfLeftBase}px)</strong>
                </div>
                <div className="crop-slider-row">
                  <button
                    type="button"
                    className="nudge-btn"
                    onClick={() => onChange({ ...config, shelfLeftBase: config.shelfLeftBase - 2 })}
                  >
                    -2px
                  </button>
                  <input
                    type="range"
                    min="40"
                    max="160"
                    step="1"
                    value={config.shelfLeftBase}
                    onChange={e => onChange({ ...config, shelfLeftBase: parseInt(e.target.value, 10) })}
                    className="crop-range-slider"
                  />
                  <button
                    type="button"
                    className="nudge-btn"
                    onClick={() => onChange({ ...config, shelfLeftBase: config.shelfLeftBase + 2 })}
                  >
                    +2px
                  </button>
                </div>
              </div>

              {/* Zoom / Scale */}
              <div className="crop-control-group">
                <div className="crop-control-label">
                  <span>🔍 Zoom / Scale</span>
                  <strong>{(config.scale * 100).toFixed(0)}%</strong>
                </div>
                <div className="crop-slider-row">
                  <button
                    type="button"
                    className="nudge-btn"
                    onClick={() => onChange({ ...config, scale: Math.max(0.9, config.scale - 0.02) })}
                  >
                    -2%
                  </button>
                  <input
                    type="range"
                    min="0.9"
                    max="1.25"
                    step="0.01"
                    value={config.scale}
                    onChange={e => onChange({ ...config, scale: parseFloat(e.target.value) })}
                    className="crop-range-slider"
                  />
                  <button
                    type="button"
                    className="nudge-btn"
                    onClick={() => onChange({ ...config, scale: Math.min(1.25, config.scale + 0.02) })}
                  >
                    +2%
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="crop-presets-bar">
              <span className="presets-title">PRESETS:</span>
              <button type="button" className="preset-chip" onClick={() => setPreset("seated")}>
                🗄️ Seat on Shelves
              </button>
              <button type="button" className="preset-chip" onClick={() => setPreset("full")}>
                🖼️ Full Room
              </button>
              <button type="button" className="preset-chip" onClick={() => setPreset("postersOnly")}>
                ✂️ Cut Posters
              </button>
            </div>

            {/* Actions Footer */}
            <div className="crop-hud-actions">
              <button type="button" className="crop-action-btn primary" onClick={handleSave}>
                {savedNotice ? <Check size={14} /> : <ShieldCheck size={14} />}
                <span>{savedNotice ? "Saved to Browser!" : "Save Changes"}</span>
              </button>
              <button type="button" className="crop-action-btn secondary" onClick={handleCopyCss}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? "Copied CSS!" : "Copy CSS"}</span>
              </button>
              <button type="button" className="crop-action-btn tertiary" onClick={handleReset} title="Reset to Defaults">
                <RotateCcw size={14} />
              </button>
            </div>
          </aside>,
          document.body
        )}
    </div>
  );
}
