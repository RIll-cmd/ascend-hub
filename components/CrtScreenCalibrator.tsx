"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sliders,
  Move,
  Copy,
  Check,
  RotateCcw,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  X,
  Tv,
  Grid,
  Sparkles,
  Play
} from "lucide-react";

export interface CrtCalibrationState {
  left: number;       // %
  top: number;        // %
  width: number;      // %
  height: number;     // %
  radiusH: number;    // %
  radiusV: number;    // %
  rotation: number;   // deg
  scale: number;      // multiplier
  skewX: number;      // deg
  mode: "solid-black" | "neon-outline" | "grid" | "video";
  showHandles: boolean;
  isMinimized: boolean;
  isOpen: boolean;
}

export const DEFAULT_CALIBRATION: CrtCalibrationState = {
  left: 31.40,
  top: 27.48,
  width: 31.80,
  height: 36.54,
  radiusH: 10.5,
  radiusV: 8.0,
  rotation: 0,
  scale: 1.0,
  skewX: 0,
  mode: "video",
  showHandles: false,
  isMinimized: false,
  isOpen: false
};

const STORAGE_KEY = "ascend_crt_calibration_v2";

export function useCrtCalibration() {
  const [calib, setCalib] = useState<CrtCalibrationState>(DEFAULT_CALIBRATION);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("ascend_crt_calibration_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Auto-migrate if client has previous uncorrected left offset (34.30)
        if (Math.abs(parsed.left - 34.30) < 0.2) {
          parsed.left = 31.40;
          parsed.width = 31.80;
          parsed.radiusH = 10.5;
        }
        setCalib(prev => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore storage parse errors
    }
  }, []);

  const updateCalib = useCallback((updates: Partial<CrtCalibrationState>) => {
    setCalib(prev => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore quota
      }
      return next;
    });
  }, []);

  const resetCalib = useCallback(() => {
    setCalib(DEFAULT_CALIBRATION);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  return { calib, updateCalib, resetCalib };
}

/* ==========================================================================
   1. ON-SCREEN DIRECT RESIZE & DRAG TRANSFORM OVERLAY
   ========================================================================== */
interface CrtTransformOverlayProps {
  calib: CrtCalibrationState;
  onUpdate: (updates: Partial<CrtCalibrationState>) => void;
  rigRef: React.RefObject<HTMLDivElement | null>;
}

type DragHandleType = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "se" | "sw";

export function CrtTransformOverlay({ calib, onUpdate, rigRef }: CrtTransformOverlayProps) {
  const [activeDrag, setActiveDrag] = useState<DragHandleType | null>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initialLeft: number;
    initialTop: number;
    initialWidth: number;
    initialHeight: number;
    rigWidth: number;
    rigHeight: number;
  }>({
    startX: 0,
    startY: 0,
    initialLeft: 0,
    initialTop: 0,
    initialWidth: 0,
    initialHeight: 0,
    rigWidth: 1,
    rigHeight: 1
  });

  const handleMouseDown = (e: React.MouseEvent, handle: DragHandleType) => {
    e.preventDefault();
    e.stopPropagation();

    if (!rigRef.current) return;
    const rigRect = rigRef.current.getBoundingClientRect();

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialLeft: calib.left,
      initialTop: calib.top,
      initialWidth: calib.width,
      initialHeight: calib.height,
      rigWidth: rigRect.width,
      rigHeight: rigRect.height
    };

    setActiveDrag(handle);
  };

  useEffect(() => {
    if (!activeDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      const {
        startX,
        startY,
        initialLeft,
        initialTop,
        initialWidth,
        initialHeight,
        rigWidth,
        rigHeight
      } = dragStartRef.current;

      const deltaXPercent = ((e.clientX - startX) / rigWidth) * 100;
      const deltaYPercent = ((e.clientY - startY) / rigHeight) * 100;

      let newLeft = initialLeft;
      let newTop = initialTop;
      let newWidth = initialWidth;
      let newHeight = initialHeight;

      switch (activeDrag) {
        case "move":
          newLeft = initialLeft + deltaXPercent;
          newTop = initialTop + deltaYPercent;
          break;
        case "e":
          newWidth = Math.max(5, initialWidth + deltaXPercent);
          break;
        case "w":
          newLeft = initialLeft + deltaXPercent;
          newWidth = Math.max(5, initialWidth - deltaXPercent);
          break;
        case "s":
          newHeight = Math.max(5, initialHeight + deltaYPercent);
          break;
        case "n":
          newTop = initialTop + deltaYPercent;
          newHeight = Math.max(5, initialHeight - deltaYPercent);
          break;
        case "se":
          newWidth = Math.max(5, initialWidth + deltaXPercent);
          newHeight = Math.max(5, initialHeight + deltaYPercent);
          break;
        case "sw":
          newLeft = initialLeft + deltaXPercent;
          newWidth = Math.max(5, initialWidth - deltaXPercent);
          newHeight = Math.max(5, initialHeight + deltaYPercent);
          break;
        case "ne":
          newTop = initialTop + deltaYPercent;
          newWidth = Math.max(5, initialWidth + deltaXPercent);
          newHeight = Math.max(5, initialHeight - deltaYPercent);
          break;
        case "nw":
          newLeft = initialLeft + deltaXPercent;
          newTop = initialTop + deltaYPercent;
          newWidth = Math.max(5, initialWidth - deltaXPercent);
          newHeight = Math.max(5, initialHeight - deltaYPercent);
          break;
      }

      onUpdate({
        left: Number(newLeft.toFixed(2)),
        top: Number(newTop.toFixed(2)),
        width: Number(newWidth.toFixed(2)),
        height: Number(newHeight.toFixed(2))
      });
    };

    const handleMouseUp = () => {
      setActiveDrag(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeDrag, onUpdate]);

  if (!calib.isOpen || !calib.showHandles) return null;

  return (
    <div
      className="crt-transform-box-overlay"
      style={{
        left: `${calib.left}%`,
        top: `${calib.top}%`,
        width: `${calib.width}%`,
        height: `${calib.height}%`,
        borderRadius: `${calib.radiusH}% / ${calib.radiusV}%`,
        transform: `rotate(${calib.rotation}deg) scale(${calib.scale}) skewX(${calib.skewX}deg)`,
      }}
    >
      {/* Dashed calibration border outline */}
      <div className="crt-transform-dashed-border" />

      {/* Center Move Drag Button */}
      <button
        type="button"
        className="crt-transform-move-handle"
        onMouseDown={(e) => handleMouseDown(e, "move")}
        title="Click and drag to move screen position"
      >
        <Move size={14} />
      </button>

      {/* 4 Corner Resize Handles */}
      <div className="crt-handle handle-nw" onMouseDown={(e) => handleMouseDown(e, "nw")} />
      <div className="crt-handle handle-ne" onMouseDown={(e) => handleMouseDown(e, "ne")} />
      <div className="crt-handle handle-se" onMouseDown={(e) => handleMouseDown(e, "se")} />
      <div className="crt-handle handle-sw" onMouseDown={(e) => handleMouseDown(e, "sw")} />

      {/* 4 Edge Resize Handles */}
      <div className="crt-handle handle-n" onMouseDown={(e) => handleMouseDown(e, "n")} />
      <div className="crt-handle handle-s" onMouseDown={(e) => handleMouseDown(e, "s")} />
      <div className="crt-handle handle-e" onMouseDown={(e) => handleMouseDown(e, "e")} />
      <div className="crt-handle handle-w" onMouseDown={(e) => handleMouseDown(e, "w")} />
    </div>
  );
}

/* ==========================================================================
   2. FLOATING CALIBRATION CONTROL PANEL HUD
   ========================================================================== */
interface CrtCalibratorHudProps {
  calib: CrtCalibrationState;
  onUpdate: (updates: Partial<CrtCalibrationState>) => void;
  onReset: () => void;
  currentMediaUrl?: string;
  onTuneMedia?: (url: string, name?: string) => void;
  onOpenTuneModal?: () => void;
}

export function CrtCalibratorHud({
  calib,
  onUpdate,
  onReset,
  currentMediaUrl = "",
  onTuneMedia,
  onOpenTuneModal
}: CrtCalibratorHudProps) {
  const [copied, setCopied] = useState(false);
  const [panelPos, setPanelPos] = useState({ x: 24, y: 80 });
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [ytInput, setYtInput] = useState(currentMediaUrl);
  const panelDragStart = useRef({ mouseX: 0, mouseY: 0, initX: 0, initY: 0 });

  useEffect(() => {
    if (currentMediaUrl) setYtInput(currentMediaUrl);
  }, [currentMediaUrl]);

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    panelDragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initX: panelPos.x,
      initY: panelPos.y
    };
    setIsDraggingPanel(true);
  };

  useEffect(() => {
    if (!isDraggingPanel) return;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - panelDragStart.current.mouseX;
      const dy = e.clientY - panelDragStart.current.mouseY;
      setPanelPos({
        x: Math.max(10, Math.min(window.innerWidth - 340, panelDragStart.current.initX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 100, panelDragStart.current.initY + dy))
      });
    };

    const onMouseUp = () => setIsDraggingPanel(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDraggingPanel]);

  const cssSnippet = `.rig-crt-display-window {
  position: absolute;
  left: ${calib.left.toFixed(2)}%;
  top: ${calib.top.toFixed(2)}%;
  width: ${calib.width.toFixed(2)}%;
  height: ${calib.height.toFixed(2)}%;
  border-radius: ${calib.radiusH.toFixed(1)}% / ${calib.radiusV.toFixed(1)}%;
  transform: rotate(${calib.rotation.toFixed(1)}deg) scale(${calib.scale.toFixed(2)}) skewX(${calib.skewX.toFixed(1)}deg);
  overflow: hidden;
}`;

  const handleCopyCss = async () => {
    let success = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cssSnippet);
        success = true;
      }
    } catch {
      // Ignore
    }
    if (!success) {
      try {
        const el = document.createElement("textarea");
        el.value = cssSnippet;
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      } catch {
        // Ignore
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!calib.isOpen) {
    return (
      <div className="crt-launcher-dock">
        <button
          type="button"
          className="crt-calibrator-launcher-badge crt-tune-launcher-btn"
          onClick={onOpenTuneModal}
          title="Open YouTube / Media Tuner Dialog"
        >
          <Tv size={13} />
          <span>TUNE YOUTUBE</span>
        </button>
        <button
          type="button"
          className="crt-calibrator-launcher-badge"
          onClick={() => onUpdate({ isOpen: true, isMinimized: false })}
          title="Open CRT Screen Calibration Tool"
        >
          <Sliders size={13} />
          <span>CALIBRATE CRT</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`crt-calibrator-hud ${calib.isMinimized ? "minimized" : ""}`}
      style={{ left: `${panelPos.x}px`, top: `${panelPos.y}px` }}
      role="region"
      aria-label="CRT Screen Calibration Tool"
    >
      {/* Drag Handle & Header */}
      <div
        className="crt-calib-header"
        onMouseDown={handleHeaderMouseDown}
        title="Click & drag to reposition control panel"
      >
        <div className="header-title-wrap">
          <Sliders size={13} className="header-icon" />
          <span className="header-title">CRT SCREEN CALIBRATOR</span>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="hud-action-btn"
            onClick={() => onUpdate({ isMinimized: !calib.isMinimized })}
            title={calib.isMinimized ? "Expand Panel" : "Collapse Panel"}
          >
            {calib.isMinimized ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
          </button>
          <button
            type="button"
            className="hud-action-btn"
            onClick={() => onUpdate({ isOpen: false })}
            title="Close Tool (click badge to reopen)"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {!calib.isMinimized && (
        <div className="crt-calib-body">
          {/* Quick YouTube Tuner inside HUD */}
          <div className="calib-section calib-yt-section">
            <div className="section-label">TUNE YOUTUBE / STREAM URL</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (ytInput.trim()) {
                  onTuneMedia?.(ytInput.trim());
                }
              }}
              className="calib-yt-form"
            >
              <div className="calib-yt-input-group">
                <input
                  type="text"
                  className="calib-yt-input"
                  placeholder="Paste YouTube link / ID..."
                  value={ytInput}
                  onChange={(e) => setYtInput(e.target.value)}
                />
                <button type="submit" className="calib-yt-tune-btn">
                  <Play size={10} />
                  <span>PLAY</span>
                </button>
              </div>
            </form>
            <div className="calib-quick-presets">
              <button
                type="button"
                className="calib-preset-chip"
                onClick={() => {
                  const url = "https://www.youtube.com/watch?v=jfKfPfyJRdk";
                  setYtInput(url);
                  onTuneMedia?.(url, "Lofi Girl");
                }}
              >
                ☕ Lofi Girl
              </button>
              <button
                type="button"
                className="calib-preset-chip"
                onClick={() => {
                  const url = "https://www.youtube.com/watch?v=4xDzrJKXOOY";
                  setYtInput(url);
                  onTuneMedia?.(url, "Synthwave");
                }}
              >
                🌆 Synthwave
              </button>
              <button
                type="button"
                className="calib-preset-chip"
                onClick={() => {
                  const url = "https://www.youtube.com/watch?v=9Gj47G2e1Jc";
                  setYtInput(url);
                  onTuneMedia?.(url, "City Pop");
                }}
              >
                📼 City Pop
              </button>
            </div>
          </div>
          {/* Visual Display Mode Selector */}
          <div className="calib-section">
            <div className="section-label">DISPLAY MODE</div>
            <div className="calib-mode-pills">
              <button
                type="button"
                className={`calib-mode-btn ${calib.mode === "solid-black" ? "active" : ""}`}
                onClick={() => onUpdate({ mode: "solid-black" })}
                title="Solid black container (clean CRT background)"
              >
                <Tv size={11} />
                <span>SOLID BLACK</span>
              </button>
              <button
                type="button"
                className={`calib-mode-btn ${calib.mode === "neon-outline" ? "active" : ""}`}
                onClick={() => onUpdate({ mode: "neon-outline" })}
                title="High-contrast cyan border to see bezel contact"
              >
                <Sparkles size={11} />
                <span>NEON RIM</span>
              </button>
              <button
                type="button"
                className={`calib-mode-btn ${calib.mode === "grid" ? "active" : ""}`}
                onClick={() => onUpdate({ mode: "grid" })}
                title="Alignment crosshair grid"
              >
                <Grid size={11} />
                <span>GRID</span>
              </button>
              <button
                type="button"
                className={`calib-mode-btn ${calib.mode === "video" ? "active" : ""}`}
                onClick={() => onUpdate({ mode: "video" })}
                title="Live video preview inside calibrated frame"
              >
                <Play size={11} />
                <span>VIDEO</span>
              </button>
            </div>
          </div>

          {/* Sliders: Position & Dimensions */}
          <div className="calib-section">
            <div className="section-label">POSITION & SIZE (%)</div>
            <div className="calib-slider-grid">
              <CalibSliderRow
                label="X (Left)"
                value={calib.left}
                min={15}
                max={45}
                step={0.05}
                unit="%"
                onChange={(v) => onUpdate({ left: v })}
              />
              <CalibSliderRow
                label="Y (Top)"
                value={calib.top}
                min={10}
                max={40}
                step={0.05}
                unit="%"
                onChange={(v) => onUpdate({ top: v })}
              />
              <CalibSliderRow
                label="Width"
                value={calib.width}
                min={15}
                max={50}
                step={0.05}
                unit="%"
                onChange={(v) => onUpdate({ width: v })}
              />
              <CalibSliderRow
                label="Height"
                value={calib.height}
                min={20}
                max={65}
                step={0.05}
                unit="%"
                onChange={(v) => onUpdate({ height: v })}
              />
            </div>
          </div>

          {/* Sliders: Curvature & Transforms */}
          <div className="calib-section">
            <div className="section-label">BARREL CURVATURE & ROTATION</div>
            <div className="calib-slider-grid">
              <CalibSliderRow
                label="Radius H"
                value={calib.radiusH}
                min={0}
                max={30}
                step={0.5}
                unit="%"
                onChange={(v) => onUpdate({ radiusH: v })}
              />
              <CalibSliderRow
                label="Radius V"
                value={calib.radiusV}
                min={0}
                max={30}
                step={0.5}
                unit="%"
                onChange={(v) => onUpdate({ radiusV: v })}
              />
              <CalibSliderRow
                label="Rotation"
                value={calib.rotation}
                min={-10}
                max={10}
                step={0.1}
                unit="°"
                onChange={(v) => onUpdate({ rotation: v })}
              />
              <CalibSliderRow
                label="Scale"
                value={calib.scale}
                min={0.8}
                max={1.3}
                step={0.01}
                unit="x"
                onChange={(v) => onUpdate({ scale: v })}
              />
            </div>
          </div>

          {/* Quick Transform Handle Toggle */}
          <div className="calib-toggle-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={calib.showHandles}
                onChange={(e) => onUpdate({ showHandles: e.target.checked })}
              />
              <span>SHOW ON-SCREEN DRAG HANDLES</span>
            </label>
            <button
              type="button"
              className="calib-reset-btn"
              onClick={onReset}
              title="Reset coordinates back to defaults"
            >
              <RotateCcw size={11} />
              <span>RESET</span>
            </button>
          </div>

          {/* Live CSS Output Block with Copy Button */}
          <div className="calib-section css-output-section">
            <div className="output-header">
              <span className="section-label">LIVE GENERATED CSS</span>
              <button
                type="button"
                className={`copy-css-btn ${copied ? "copied" : ""}`}
                onClick={handleCopyCss}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                <span>{copied ? "COPIED TO CLIPBOARD!" : "COPY CSS"}</span>
              </button>
            </div>
            <pre className="css-code-preview">{cssSnippet}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

interface CalibSliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (val: number) => void;
}

function CalibSliderRow({ label, value, min, max, step, unit, onChange }: CalibSliderRowProps) {
  return (
    <div className="calib-slider-row">
      <div className="slider-meta">
        <span className="slider-label">{label}</span>
        <div className="slider-num-input-wrap">
          <input
            type="number"
            step={step}
            value={value}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              if (!isNaN(parsed)) onChange(parsed);
            }}
            className="slider-num-input"
          />
          <span className="slider-unit">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="calib-range-slider"
      />
    </div>
  );
}
