"use client";

import { useState } from "react";
import { X } from "lucide-react";

export interface ShelfTrimEditorProps {
  open: boolean;
  onClose: () => void;
  wallCoverHeight: number;
  wallWidthMode: "full" | "shelf" | "custom";
  wallWidth: number;
  wallOffsetX: number;
  shelfOffsetY: number;
  shelfTopCrop: number;
  showTrimGuides: boolean;
  onWallCoverChange: (val: number) => void;
  onWallWidthModeChange: (mode: "full" | "shelf" | "custom") => void;
  onWallWidthChange: (val: number) => void;
  onWallOffsetXChange: (val: number) => void;
  onShelfOffsetChange: (val: number) => void;
  onShelfTopCropChange: (val: number) => void;
  onToggleTrimGuides: (val: boolean) => void;
  onResetAll: () => void;
  onCopyValues: () => void;
}

export function ShelfTrimEditor({
  open,
  onClose,
  wallCoverHeight,
  wallWidthMode,
  wallWidth,
  wallOffsetX,
  shelfOffsetY,
  shelfTopCrop,
  showTrimGuides,
  onWallCoverChange,
  onWallWidthModeChange,
  onWallWidthChange,
  onWallOffsetXChange,
  onShelfOffsetChange,
  onShelfTopCropChange,
  onToggleTrimGuides,
  onResetAll,
  onCopyValues
}: ShelfTrimEditorProps) {
  const [activeTab, setActiveTab] = useState<"height" | "width" | "offset" | "crop">("height");

  if (!open) return null;

  return (
    <aside className="shelf-calibrator-hud expanded-wall-editor" aria-label="Wall Extension and Shelf Position Editor">
      <div className="shelf-calibrator-header">
        <div className="shelf-calibrator-title">
          <span className="dot" />
          <span>WALL & SHELF TRIM EDITOR</span>
          <span style={{ fontSize: "9px", opacity: 0.5, marginLeft: "4px" }}>[Ctrl+Shift+T]</span>
        </div>
        <div className="shelf-calibrator-actions">
          <button
            type="button"
            className="shelf-calibrator-pill-btn"
            onClick={onCopyValues}
            title="Copy current values to clipboard"
          >
            📋 Copy
          </button>
          <button
            type="button"
            className="shelf-calibrator-close"
            onClick={onClose}
            title="Minimize editor (Press Ctrl+Shift+T to reopen)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* High-visibility summary badges for easy screenshotting */}
      <div className="trim-stats-summary-row">
        <div className={`trim-stat-badge ${activeTab === "height" ? "active" : ""}`} onClick={() => setActiveTab("height")}>
          <span className="stat-label">HEIGHT</span>
          <span className="stat-val">{wallCoverHeight}px</span>
        </div>
        <div className={`trim-stat-badge ${activeTab === "width" ? "active" : ""}`} onClick={() => setActiveTab("width")}>
          <span className="stat-label">WIDTH</span>
          <span className="stat-val">{wallWidthMode === "full" ? "FULL" : `${wallWidth}px`}</span>
        </div>
        <div className={`trim-stat-badge ${activeTab === "offset" ? "active" : ""}`} onClick={() => setActiveTab("offset")}>
          <span className="stat-label">SHELF Y</span>
          <span className="stat-val">{shelfOffsetY}px</span>
        </div>
        <div className={`trim-stat-badge ${activeTab === "crop" ? "active" : ""}`} onClick={() => setActiveTab("crop")}>
          <span className="stat-label">CROP TOP</span>
          <span className="stat-val">{shelfTopCrop}px</span>
        </div>
      </div>

      {/* Active Control Tab: Height */}
      {activeTab === "height" && (
        <div className="trim-tab-content">
          <div className="trim-tab-instruction">
            <span>Extend the background wood wall upward to cover the top workplace:</span>
          </div>
          <div className="shelf-calibrator-slider-row">
            <span className="slider-limit">0px</span>
            <input
              type="range"
              min={0}
              max={600}
              step={1}
              value={wallCoverHeight}
              onChange={(e) => onWallCoverChange(parseInt(e.target.value, 10))}
              className="shelf-offset-slider"
              aria-label="Wall extension height"
            />
            <span className="slider-limit">600px</span>
          </div>
          <div className="shelf-calibrator-buttons" style={{ gridTemplateColumns: "repeat(9, 1fr)" }}>
            <button type="button" onClick={() => onWallCoverChange(wallCoverHeight - 50)} title="Extend 50px less">-50</button>
            <button type="button" onClick={() => onWallCoverChange(wallCoverHeight - 25)} title="Extend 25px less">-25</button>
            <button type="button" onClick={() => onWallCoverChange(wallCoverHeight - 5)} title="Extend 5px less">-5</button>
            <button type="button" onClick={() => onWallCoverChange(wallCoverHeight - 1)} title="Extend 1px less">-1</button>
            <button type="button" onClick={() => onWallCoverChange(wallCoverHeight + 1)} title="Extend 1px more">+1</button>
            <button type="button" onClick={() => onWallCoverChange(wallCoverHeight + 5)} title="Extend 5px more">+5</button>
            <button type="button" onClick={() => onWallCoverChange(wallCoverHeight + 25)} title="Extend 25px more">+25</button>
            <button type="button" onClick={() => onWallCoverChange(wallCoverHeight + 50)} title="Extend 50px more">+50</button>
            <button type="button" className={wallCoverHeight === 21 ? "reset-btn" : ""} onClick={() => onWallCoverChange(21)} title="Reset to CB calibrated 21px">21px</button>
          </div>
        </div>
      )}

      {/* Active Control Tab: Width & Horizontal Alignment */}
      {activeTab === "width" && (
        <div className="trim-tab-content">
          <div className="trim-tab-instruction">
            <span>Pick width & horizontal alignment (not full width):</span>
          </div>
          <div className="trim-preset-row">
            <button
              type="button"
              className={`trim-preset-btn ${wallWidthMode === "custom" && wallWidth === 610 && wallOffsetX === -870 ? "active" : ""}`}
              onClick={() => {
                onWallWidthModeChange("custom");
                onWallWidthChange(610);
                onWallOffsetXChange(-870);
                onWallCoverChange(21);
                onShelfOffsetChange(-2);
              }}
            >
              CB Preset (610px @ -870)
            </button>
            <button
              type="button"
              className={`trim-preset-btn ${wallWidthMode === "shelf" ? "active" : ""}`}
              onClick={() => onWallWidthModeChange("shelf")}
            >
              Shelf (1160px)
            </button>
            <button
              type="button"
              className={`trim-preset-btn ${wallWidthMode === "custom" && !(wallWidth === 610 && wallOffsetX === -870) ? "active" : ""}`}
              onClick={() => onWallWidthModeChange("custom")}
            >
              Custom
            </button>
            <button
              type="button"
              className={`trim-preset-btn ${wallWidthMode === "full" ? "active" : ""}`}
              onClick={() => onWallWidthModeChange("full")}
            >
              Full (100%)
            </button>
          </div>

          {wallWidthMode !== "full" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8px", color: "#a4805c", marginTop: "4px" }}>
                <span>WIDTH: {wallWidth}px</span>
                <span>100px - 2600px</span>
              </div>
              <div className="shelf-calibrator-slider-row">
                <span className="slider-limit">100px</span>
                <input
                  type="range"
                  min={100}
                  max={2600}
                  step={10}
                  value={wallWidth}
                  onChange={(e) => onWallWidthChange(parseInt(e.target.value, 10))}
                  className="shelf-offset-slider"
                  aria-label="Wall width in pixels"
                />
                <span className="slider-limit">2600px</span>
              </div>
              <div className="shelf-calibrator-buttons" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: "8px" }}>
                <button type="button" onClick={() => onWallWidthChange(wallWidth - 100)}>-100</button>
                <button type="button" onClick={() => onWallWidthChange(wallWidth - 25)}>-25</button>
                <button type="button" className={wallWidth === 610 ? "reset-btn" : ""} onClick={() => onWallWidthChange(610)}>610</button>
                <button type="button" onClick={() => onWallWidthChange(1160)}>1160</button>
                <button type="button" onClick={() => onWallWidthChange(wallWidth + 100)}>+100</button>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8px", color: "#a4805c", marginTop: "4px" }}>
                <span>HORIZONTAL OFFSET (X): {wallOffsetX}px</span>
                <span>-1400px to +1400px</span>
              </div>
              <div className="shelf-calibrator-slider-row">
                <span className="slider-limit">-1400px</span>
                <input
                  type="range"
                  min={-1400}
                  max={1400}
                  step={5}
                  value={wallOffsetX}
                  onChange={(e) => onWallOffsetXChange(parseInt(e.target.value, 10))}
                  className="shelf-offset-slider"
                  aria-label="Wall horizontal position"
                />
                <span className="slider-limit">+1400px</span>
              </div>
              <div className="shelf-calibrator-buttons" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
                <button type="button" onClick={() => onWallOffsetXChange(wallOffsetX - 50)}>-50px</button>
                <button type="button" className={wallOffsetX === -870 ? "reset-btn" : ""} onClick={() => onWallOffsetXChange(-870)}>-870</button>
                <button type="button" onClick={() => onWallOffsetXChange(0)}>Center (0)</button>
                <button type="button" onClick={() => onWallOffsetXChange(wallOffsetX + 10)}>+10px</button>
                <button type="button" onClick={() => onWallOffsetXChange(wallOffsetX + 50)}>+50px</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Active Control Tab: Shelf Y */}
      {activeTab === "offset" && (
        <div className="trim-tab-content">
          <div className="trim-tab-instruction">
            <span>Move the entire shelf up or down:</span>
          </div>
          <div className="shelf-calibrator-slider-row">
            <span className="slider-limit">-500px</span>
            <input
              type="range"
              min={-500}
              max={150}
              step={1}
              value={shelfOffsetY}
              onChange={(e) => onShelfOffsetChange(parseInt(e.target.value, 10))}
              className="shelf-offset-slider"
              aria-label="Shelf vertical offset"
            />
            <span className="slider-limit">+150px</span>
          </div>
          <div className="shelf-calibrator-buttons">
            <button type="button" onClick={() => onShelfOffsetChange(shelfOffsetY - 25)} title="Move up 25px">-25</button>
            <button type="button" onClick={() => onShelfOffsetChange(shelfOffsetY - 5)} title="Move up 5px">-5</button>
            <button type="button" onClick={() => onShelfOffsetChange(shelfOffsetY - 1)} title="Move up 1px">-1</button>
            <button type="button" onClick={() => onShelfOffsetChange(shelfOffsetY + 1)} title="Move down 1px">+1</button>
            <button type="button" onClick={() => onShelfOffsetChange(shelfOffsetY + 5)} title="Move down 5px">+5</button>
            <button type="button" onClick={() => onShelfOffsetChange(shelfOffsetY + 25)} title="Move down 25px">+25</button>
            <button type="button" className={shelfOffsetY === -2 ? "reset-btn" : ""} onClick={() => onShelfOffsetChange(-2)} title="Reset to -2px">Reset (-2px)</button>
          </div>
        </div>
      )}

      {/* Active Control Tab: Crop Top */}
      {activeTab === "crop" && (
        <div className="trim-tab-content">
          <div className="trim-tab-instruction">
            <span>Clip/cut the top edge of the shelf container:</span>
          </div>
          <div className="shelf-calibrator-slider-row">
            <span className="slider-limit">0px</span>
            <input
              type="range"
              min={0}
              max={120}
              step={1}
              value={shelfTopCrop}
              onChange={(e) => onShelfTopCropChange(parseInt(e.target.value, 10))}
              className="shelf-offset-slider"
              aria-label="Shelf top clip"
            />
            <span className="slider-limit">120px</span>
          </div>
          <div className="shelf-calibrator-buttons">
            <button type="button" onClick={() => onShelfTopCropChange(shelfTopCrop - 10)} title="Clip 10px less">-10</button>
            <button type="button" onClick={() => onShelfTopCropChange(shelfTopCrop - 1)} title="Clip 1px less">-1</button>
            <button type="button" onClick={() => onShelfTopCropChange(shelfTopCrop + 1)} title="Clip 1px more">+1</button>
            <button type="button" onClick={() => onShelfTopCropChange(shelfTopCrop + 5)} title="Clip 5px more">+5</button>
            <button type="button" onClick={() => onShelfTopCropChange(shelfTopCrop + 10)} title="Clip 10px more">+10</button>
            <button type="button" className={shelfTopCrop === 0 ? "reset-btn" : ""} onClick={() => onShelfTopCropChange(0)} title="Reset to 0px">0px</button>
          </div>
        </div>
      )}

      {/* Footer Controls: Toggle Guides & Reset All */}
      <div className="trim-editor-footer">
        <label className="trim-guide-toggle">
          <input
            type="checkbox"
            checked={showTrimGuides}
            onChange={(e) => onToggleTrimGuides(e.target.checked)}
          />
          <span>Show guides & badges</span>
        </label>
        <button type="button" className="trim-reset-all-btn" onClick={onResetAll}>
          Reset All
        </button>
      </div>
    </aside>
  );
}
