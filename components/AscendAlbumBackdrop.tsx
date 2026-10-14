"use client";

import React, { useId, useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export type BackdropVariant =
  | "paper"
  | "paper-grid"
  | "paper-radial"
  | "paper-hybrid"
  // Legacy aliases for backward compatibility:
  | "grid"
  | "radial"
  | "hybrid";

export type BackdropIntensity = "subtle" | "medium" | "strong";

export interface AscendAlbumBackdropProps {
  /**
   * The structural material variant:
   * - "paper": Pure Texturelabs-style distressed matte paper sheet (grain, density variation, folds, subtle grunge)
   * - "paper-grid" / "grid": Distressed paper sheet + faint embedded graph paper matrix
   * - "paper-radial" / "radial": Distressed paper sheet + faint embedded technical drafting circles & conic rays
   * - "paper-hybrid" / "hybrid": Distressed paper sheet + subtle embedded grid and drafting guides
   * @default "paper-grid"
   */
  variant?: BackdropVariant;
  /**
   * Overall texture contrast & distress intensity.
   * @default "medium"
   */
  intensity?: BackdropIntensity;
  /**
   * Custom path override for scanned paper texture asset.
   * @default "/textures/paper-base.webp"
   */
  paperTextureUrl?: string;
  /**
   * Custom path override for print distress texture asset.
   * @default "/textures/print-distress.webp"
   */
  distressTextureUrl?: string;
  /**
   * Custom path override for subtle grunge texture asset.
   * @default "/textures/subtle-grunge.webp"
   */
  grungeTextureUrl?: string;
  /**
   * Optional extra container classes.
   */
  className?: string;
  /**
   * Optional children rendered inside the backdrop stack.
   */
  children?: React.ReactNode;
}

// 8 Localized, Asymmetric Distress & Wear Zones
// Varies in scale: some 2-5px micro-flecks, some 15-40px soft patches, faint stains & scanner glass fibers
const LOCAL_DISTRESS_ZONES = [
  // Zone 1: Faint upper-left moisture mark / diffuse wash patch (1000x800 coordinate scale)
  { type: "patch", cx: 165, cy: 175, rx: 42, ry: 26, opacity: 0.05, blur: 10 },
  // Zone 2: Micro ink speckle cluster (tight grouping)
  { type: "speck", cx: 785, cy: 142, r: 1.8, opacity: 0.15 },
  { type: "speck", cx: 789, cy: 146, r: 1.2, opacity: 0.12 },
  { type: "speck", cx: 782, cy: 149, r: 1.5, opacity: 0.14 },
  { type: "speck", cx: 793, cy: 141, r: 1.0, opacity: 0.10 },
  // Zone 3: Soft horizontal paper scuff / worn rub zone
  { type: "patch", cx: 140, cy: 520, rx: 55, ry: 18, opacity: 0.045, blur: 8 },
  // Zone 4: Faded scanner bed glass scratch / stray paper fiber
  { type: "fiber", d: "M 825 580 Q 832 588 824 596", strokeWidth: 0.55, opacity: 0.14 },
  // Zone 5: Light ink droplet with soft diffuse bleed halo
  { type: "speck", cx: 318, cy: 685, r: 2.2, opacity: 0.13 },
  { type: "patch", cx: 318, cy: 685, rx: 14, ry: 12, opacity: 0.04, blur: 6 },
  // Zone 6: Lower-edge stray specks
  { type: "speck", cx: 654, cy: 735, r: 1.6, opacity: 0.12 },
  { type: "speck", cx: 660, cy: 739, r: 1.1, opacity: 0.09 },
  // Zone 7: Extremely faint dried watermark arc / ring artifact
  { type: "fiber", d: "M 880 270 Q 895 285 890 305", strokeWidth: 0.6, opacity: 0.09 },
  // Zone 8: Asymmetric bottom-left paper edge friction scuff
  { type: "patch", cx: 90, cy: 740, rx: 48, ry: 32, opacity: 0.05, blur: 12 },
];

export function AscendAlbumBackdrop({
  variant = "paper-grid",
  intensity = "medium",
  paperTextureUrl = "/textures/paper-base.webp",
  distressTextureUrl = "/textures/print-distress.webp",
  grungeTextureUrl = "/textures/subtle-grunge.webp",
  className,
  children,
}: AscendAlbumBackdropProps) {
  const uid = useId();
  const cleanUid = uid.replace(/:/g, "");
  const paperToothFilterId = `paper-tooth-${cleanUid}`;
  const densityFilterId = `density-cloud-${cleanUid}`;
  const gridPatternSmallId = `grid-sm-${cleanUid}`;
  const gridPatternMajorId = `grid-lg-${cleanUid}`;

  // Track availability of local raster assets in /public/textures/
  const [loadedTextures, setLoadedTextures] = useState<{
    paperBase: boolean;
    printDistress: boolean;
    subtleGrunge: boolean;
  }>({
    paperBase: true,
    printDistress: false,
    subtleGrunge: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const probe = (url: string, key: "paperBase" | "printDistress" | "subtleGrunge") => {
      const img = new window.Image();
      img.onload = () => setLoadedTextures((prev) => ({ ...prev, [key]: true }));
      img.onerror = () => setLoadedTextures((prev) => ({ ...prev, [key]: false }));
      img.src = url;
    };

    probe(paperTextureUrl, "paperBase");
    probe(distressTextureUrl, "printDistress");
    probe(grungeTextureUrl, "subtleGrunge");
  }, [paperTextureUrl, distressTextureUrl, grungeTextureUrl]);

  // Normalize variant aliases
  const normalizedVariant = useMemo<"paper" | "grid" | "radial" | "hybrid">(() => {
    switch (variant) {
      case "paper":
        return "paper";
      case "paper-grid":
      case "grid":
        return "grid";
      case "paper-radial":
      case "radial":
        return "radial";
      case "paper-hybrid":
      case "hybrid":
      default:
        return "hybrid";
    }
  }, [variant]);

  // Calibrated material strength (perceptual presence without flattening Spotify dynamic color)
  const multipliers = useMemo(() => {
    switch (intensity) {
      case "subtle":
        return {
          rasterPaperOpacity: 0.12,
          midScalePaperOpacity: 0.035,
          rasterDistressOpacity: 0.08,
          rasterGrungeOpacity: 0.04,
          proceduralGrainOpacity: 0.065,
          densityOpacity: 0.06,
          foldOpacity: 0.035,
          localDistressOpacity: 0.09,
          gridSmallOpacity: 0.018,
          gridMajorOpacity: 0.04,
          radialOpacity: 0.03, // Softened 15%
          concentricOpacity: 0.042, // Softened 15%
          cropOpacity: 0.07,
          edgeWearOpacity: 0.10,
        };
      case "strong":
        return {
          rasterPaperOpacity: 0.24,
          midScalePaperOpacity: 0.075,
          rasterDistressOpacity: 0.16,
          rasterGrungeOpacity: 0.08,
          proceduralGrainOpacity: 0.14,
          densityOpacity: 0.13,
          foldOpacity: 0.07,
          localDistressOpacity: 0.18,
          gridSmallOpacity: 0.04,
          gridMajorOpacity: 0.08,
          radialOpacity: 0.055, // Softened 15%
          concentricOpacity: 0.072, // Softened 15%
          cropOpacity: 0.16,
          edgeWearOpacity: 0.22,
        };
      case "medium":
      default:
        return {
          rasterPaperOpacity: 0.17,
          midScalePaperOpacity: 0.05,
          rasterDistressOpacity: 0.12,
          rasterGrungeOpacity: 0.06,
          proceduralGrainOpacity: 0.10,
          densityOpacity: 0.09,
          foldOpacity: 0.048,
          localDistressOpacity: 0.13,
          gridSmallOpacity: 0.026,
          gridMajorOpacity: 0.058,
          radialOpacity: 0.038, // Softened 15%
          concentricOpacity: 0.051, // Softened 15%
          cropOpacity: 0.11,
          edgeWearOpacity: 0.15,
        };
    }
  }, [intensity]);

  const showGrid = normalizedVariant === "grid" || normalizedVariant === "hybrid";
  const showRadial = normalizedVariant === "radial" || normalizedVariant === "hybrid";

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[1] size-full overflow-hidden select-none",
        className
      )}
      aria-hidden="true"
    >
      {/* ==============================================================
          LAYER 1: REAL Scanned Paper Stock Texture Asset (Primary Base)
          Photographic scan of heavy matte paper stock with visible fibers
          ============================================================== */}
      {loadedTextures.paperBase && (
        <>
          <div
            className="pointer-events-none absolute inset-0 size-full select-none"
            style={{
              backgroundImage: `url(${paperTextureUrl})`,
              backgroundPosition: "center",
              backgroundSize: "cover",
              backgroundRepeat: "no-repeat",
              opacity: multipliers.rasterPaperOpacity,
              mixBlendMode: "overlay",
            }}
          />

          {/* LAYER 1.2: Secondary Scaled Raster Paper Layer (Mid-Scale Texturelabs Detail)
              Re-samples the real scanned paper asset at 64% scale & offset position.
              Naturally creates irregular 10–50px fiber clusters & cloudy wear without repetitive tiling. */}
          <div
            className="pointer-events-none absolute inset-0 size-full select-none"
            style={{
              backgroundImage: `url(${paperTextureUrl})`,
              backgroundPosition: "38% 42%",
              backgroundSize: "64% 64%",
              backgroundRepeat: "repeat",
              opacity: multipliers.midScalePaperOpacity,
              mixBlendMode: "soft-light",
            }}
          />
        </>
      )}

      {/* ==============================================================
          LAYER 1.5: Fine Paper Grain & Fibrous Paper Tooth (Procedural Fallback/Enhancement)
          Dual-frequency pulp fibers and micro-surface lighting
          ============================================================== */}
      <svg
        className="pointer-events-none absolute inset-0 size-full select-none"
        style={{
          opacity: loadedTextures.paperBase
            ? multipliers.proceduralGrainOpacity * 0.55
            : multipliers.proceduralGrainOpacity,
          mixBlendMode: "overlay",
        }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id={paperToothFilterId} x="0%" y="0%" width="100%" height="100%">
            {/* Fine microscopic tooth */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.75"
              numOctaves="4"
              result="fineTooth"
            />
            {/* Directional paper pulp fibers (subtle horizontal stretch) */}
            <feTurbulence
              type="turbulence"
              baseFrequency="0.04 0.65"
              numOctaves="3"
              result="pulpFibers"
            />
            {/* Composite fine tooth with pulp fibers */}
            <feComposite
              in="fineTooth"
              in2="pulpFibers"
              operator="arithmetic"
              k1="0.3"
              k2="0.65"
              k3="0.25"
              k4="0"
              result="paperMatrix"
            />
            <feColorMatrix type="saturate" values="0" result="monoPaper" />
            {/* Micro-diffuse surface lighting creates tactile embossed paper tooth */}
            <feDiffuseLighting
              in="monoPaper"
              lightingColor="#ffffff"
              surfaceScale="1.1"
              diffuseConstant="1.2"
              result="litPaper"
            >
              <feDistantLight azimuth="55" elevation="65" />
            </feDiffuseLighting>
            <feBlend in="litPaper" in2="monoPaper" mode="multiply" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter={`url(#${paperToothFilterId})`} />
      </svg>

      {/* ==============================================================
          LAYER 2: REAL Scanned Print Distress Asset (If present)
          Grayscale worn ink, faded patches, and irregular print distribution
          ============================================================== */}
      {loadedTextures.printDistress && (
        <div
          className="pointer-events-none absolute inset-0 size-full select-none"
          style={{
            backgroundImage: `url(${distressTextureUrl})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            opacity: multipliers.rasterDistressOpacity,
            mixBlendMode: "multiply",
          }}
        />
      )}

      {/* ==============================================================
          LAYER 2.5: Asymmetric Broad Tonal Inconsistency & Cloudy Density
          Accidentally uneven ink coverage, soft faded patches, non-uniform absorption
          ============================================================== */}
      <div
        className="pointer-events-none absolute inset-0 size-full"
        style={{
          opacity: multipliers.densityOpacity,
          mixBlendMode: "overlay",
        }}
      >
        {/* Asymmetric darker ink wash pools (strictly non-mirrored) */}
        <div
          className="absolute inset-0 size-full"
          style={{
            background: `
              radial-gradient(ellipse 58% 48% at 18% 26%, rgba(0, 0, 0, 0.55) 0%, transparent 72%),
              radial-gradient(ellipse 52% 42% at 86% 74%, rgba(0, 0, 0, 0.44) 0%, transparent 68%),
              radial-gradient(circle at 44% 10%, rgba(0, 0, 0, 0.30) 0%, transparent 56%)
            `,
          }}
        />
        {/* Asymmetric washed / sun-bleached print density variations */}
        <div
          className="absolute inset-0 size-full"
          style={{
            background: `
              radial-gradient(ellipse 68% 54% at 68% 22%, rgba(255, 255, 255, 0.38) 0%, transparent 68%),
              radial-gradient(ellipse 48% 44% at 14% 84%, rgba(255, 255, 255, 0.32) 0%, transparent 64%)
            `,
          }}
        />

        {/* Low-frequency organic density cloud filter (offset for asymmetry) */}
        <svg
          className="pointer-events-none absolute inset-0 size-full opacity-65"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id={densityFilterId} x="0%" y="0%" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.0032 0.0041"
                numOctaves="3"
                result="densityClouds"
              />
              <feColorMatrix type="saturate" values="0" />
            </filter>
          </defs>
          <rect width="100%" height="100%" filter={`url(#${densityFilterId})`} />
        </svg>
      </div>

      {/* ==============================================================
          LAYER 3: REAL Scanned Subtle Grunge Texture Asset (If present)
          Irregular specks, worn scanner edges, and soft stains
          ============================================================== */}
      {loadedTextures.subtleGrunge && (
        <div
          className="pointer-events-none absolute inset-0 size-full select-none"
          style={{
            backgroundImage: `url(${grungeTextureUrl})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            opacity: multipliers.rasterGrungeOpacity,
            mixBlendMode: "soft-light",
          }}
        />
      )}

      {/* ==============================================================
          LAYER 3.5: Irregular & Partially Broken Paper Folds / Seams
          Asymmetric positions, varied widths, soft angle offsets, and broken mid-crease
          ============================================================== */}
      <div
        className="pointer-events-none absolute inset-0 size-full"
        style={{
          opacity: multipliers.foldOpacity,
          mixBlendMode: "overlay",
        }}
      >
        {/* Vertical Fold A (~23.2% - wider 52px crease, comes and goes naturally) */}
        <div
          className="absolute inset-y-0 left-[23.2%] w-13 -translate-x-1/2"
          style={{
            transform: "rotate(0.35deg)",
            transformOrigin: "center top",
            background:
              "linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.44) 41%, rgba(255, 255, 255, 0.28) 49%, transparent 100%)",
            maskImage:
              "linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.85) 18%, rgba(0,0,0,0.06) 32%, rgba(0,0,0,0.14) 44%, rgba(0,0,0,0.92) 58%, rgba(0,0,0,0.70) 76%, rgba(0,0,0,0.12) 90%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.85) 18%, rgba(0,0,0,0.06) 32%, rgba(0,0,0,0.14) 44%, rgba(0,0,0,0.92) 58%, rgba(0,0,0,0.70) 76%, rgba(0,0,0,0.12) 90%, transparent 100%)",
          }}
        />

        {/* Vertical Fold B (~70.6% - narrower 30px crease, breaks and almost disappears in upper-mid) */}
        <div
          className="absolute inset-y-0 left-[70.6%] w-8 -translate-x-1/2"
          style={{
            transform: "rotate(-0.25deg)",
            transformOrigin: "center bottom",
            background:
              "linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.32) 46%, rgba(255, 255, 255, 0.18) 56%, transparent 100%)",
            maskImage:
              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.80) 24%, rgba(0,0,0,0.55) 38%, rgba(0,0,0,0.03) 50%, rgba(0,0,0,0.07) 64%, rgba(0,0,0,0.68) 78%, rgba(0,0,0,0.35) 92%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.80) 24%, rgba(0,0,0,0.55) 38%, rgba(0,0,0,0.03) 50%, rgba(0,0,0,0.07) 64%, rgba(0,0,0,0.68) 78%, rgba(0,0,0,0.35) 92%, transparent 100%)",
          }}
        />

        {/* Horizontal Seam (~53.1% - subtle 24px crease with gentle intermittent fade) */}
        <div
          className="absolute inset-x-0 top-[53.1%] h-6 -translate-y-1/2"
          style={{
            transform: "rotate(-0.20deg)",
            transformOrigin: "left center",
            background:
              "linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.30) 43%, rgba(255, 255, 255, 0.19) 53%, transparent 100%)",
            maskImage:
              "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.70) 14%, rgba(0,0,0,0.18) 32%, rgba(0,0,0,0.04) 48%, rgba(0,0,0,0.22) 65%, rgba(0,0,0,0.78) 84%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.70) 14%, rgba(0,0,0,0.18) 32%, rgba(0,0,0,0.04) 48%, rgba(0,0,0,0.22) 65%, rgba(0,0,0,0.78) 84%, transparent 100%)",
          }}
        />
      </div>

      {/* ==============================================================
          LAYER 4: Localized Distress & Wear Zones (Not Global Noise)
          8 targeted subtle zones: faint stains, speck clusters, scan fibers, worn scuffs
          ============================================================== */}
      <svg
        className="pointer-events-none absolute inset-0 size-full select-none"
        viewBox="0 0 1000 800"
        preserveAspectRatio="none"
        style={{ mixBlendMode: "overlay" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id={`stain-blur-lg-${cleanUid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <filter id={`stain-blur-md-${cleanUid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        {LOCAL_DISTRESS_ZONES.map((item, idx) => {
          if (item.type === "patch") {
            return (
              <ellipse
                key={`distress-patch-${idx}`}
                cx={item.cx}
                cy={item.cy}
                rx={item.rx}
                ry={item.ry}
                fill="#000000"
                filter={`url(#${item.blur && item.blur > 8 ? `stain-blur-lg-${cleanUid}` : `stain-blur-md-${cleanUid}`})`}
                style={{ opacity: item.opacity * (multipliers.localDistressOpacity / 0.13) }}
              />
            );
          }
          if (item.type === "fiber") {
            return (
              <path
                key={`distress-fiber-${idx}`}
                d={item.d}
                fill="none"
                stroke="#ffffff"
                strokeWidth={item.strokeWidth}
                strokeLinecap="round"
                style={{ opacity: item.opacity * (multipliers.localDistressOpacity / 0.13) }}
              />
            );
          }
          return (
            <circle
              key={`distress-speck-${idx}`}
              cx={item.cx}
              cy={item.cy}
              r={item.r}
              fill="currentColor"
              className="text-white"
              style={{ opacity: item.opacity * (multipliers.localDistressOpacity / 0.13) }}
            />
          );
        })}
      </svg>

      {/* ==============================================================
          LAYER 5: Embedded & Softened Technical Structure (Grid / Radial)
          Soften contrast by ~15%, add 0.4px micro-blur and non-uniform line fading
          ============================================================== */}
      {showGrid && (
        <svg
          className="pointer-events-none absolute inset-0 size-full select-none transition-opacity duration-500"
          style={{
            mixBlendMode: "overlay",
            filter: "blur(0.35px)",
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Small Grid Unit: 36px x 36px (Soft printed ink) */}
            <pattern
              id={gridPatternSmallId}
              width="36"
              height="36"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 36 0 L 0 0 0 36"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-white"
                style={{ opacity: multipliers.gridSmallOpacity }}
              />
            </pattern>

            {/* Major Grid Unit: 144px x 144px (4x4 small cells) */}
            <pattern
              id={gridPatternMajorId}
              width="144"
              height="144"
              patternUnits="userSpaceOnUse"
            >
              <rect
                width="144"
                height="144"
                fill={`url(#${gridPatternSmallId})`}
              />
              <path
                d="M 144 0 L 0 0 0 144"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.75"
                className="text-white"
                style={{ opacity: multipliers.gridMajorOpacity }}
              />
              {/* Millimeter Intersection Plus Markers */}
              <path
                d="M -2.5 0 L 2.5 0 M 0 -2.5 L 0 2.5"
                stroke="currentColor"
                strokeWidth="0.9"
                className="text-[#ffd8af]"
                style={{ opacity: multipliers.gridMajorOpacity * 1.2 }}
              />
            </pattern>
          </defs>

          <rect width="100%" height="100%" fill={`url(#${gridPatternMajorId})`} />
        </svg>
      )}

      {showRadial && (
        <div
          className="pointer-events-none absolute inset-0 size-full select-none transition-opacity duration-500"
          style={{
            mixBlendMode: "overlay",
            filter: "blur(0.4px)", // Eliminates razor-sharp vector look, simulates paper fiber absorption
            maskImage:
              "radial-gradient(circle at 49% 47%, white 25%, rgba(255,255,255,0.75) 60%, rgba(255,255,255,0.45) 100%)",
            WebkitMaskImage:
              "radial-gradient(circle at 49% 47%, white 25%, rgba(255,255,255,0.75) 60%, rgba(255,255,255,0.45) 100%)",
          }}
        >
          {/* Faint repeating conic drafting rays radiating from CD spindle center */}
          <div
            className="absolute inset-0 size-full"
            style={{
              opacity: multipliers.radialOpacity,
              backgroundImage: `
                repeating-conic-gradient(
                  from 0deg at 50% 48%,
                  rgba(255, 255, 255, 0.35) 0deg,
                  rgba(255, 255, 255, 0.35) 0.10deg,
                  transparent 0.10deg,
                  transparent 15deg
                )
              `,
            }}
          />

          {/* Embedded concentric guide rings with irregular dash gaps */}
          <div className="absolute top-[48%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            {/* Ring 1 (Inner clearance) */}
            <div
              className="size-[280px] rounded-full border border-dashed border-white transition-all duration-700"
              style={{
                opacity: multipliers.concentricOpacity * 1.05,
              }}
            />
            {/* Ring 2 (CD Platter alignment - subtle dashed breaks) */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[480px] rounded-full border border-white"
              style={{
                opacity: multipliers.concentricOpacity * 0.75,
              }}
            />
            {/* Ring 3 (Jewel case boundary) */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[680px] rounded-full border border-dashed border-white"
              style={{
                opacity: multipliers.concentricOpacity * 0.6,
              }}
            />
            {/* Ring 4 (Outer ambient soundstage) */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[920px] rounded-full border border-white"
              style={{
                opacity: multipliers.concentricOpacity * 0.45,
              }}
            />

            {/* Soft Axis Guides */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[920px] h-[0.75px] bg-gradient-to-r from-transparent via-white to-transparent"
              style={{ opacity: multipliers.concentricOpacity * 0.55 }}
            />
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[920px] w-[0.75px] bg-gradient-to-b from-transparent via-white to-transparent"
              style={{ opacity: multipliers.concentricOpacity * 0.55 }}
            />
          </div>
        </div>
      )}

      {/* Subtle traditional printer corner crop marks (minimal, authentic) */}
      <div
        className="pointer-events-none absolute inset-0 size-full select-none"
        style={{
          opacity: multipliers.cropOpacity,
          mixBlendMode: "overlay",
        }}
      >
        <div className="absolute top-5 left-5 size-4 border-t border-l border-white" />
        <div className="absolute top-5 right-5 size-4 border-t border-r border-white" />
        <div className="absolute bottom-5 left-5 size-4 border-b border-l border-white" />
        <div className="absolute bottom-5 right-5 size-4 border-b border-r border-white" />
      </div>

      {/* ==============================================================
          LAYER 6: Asymmetric Scanned Edge Wear & Corner Toning
          Subtle dirty scanner edges and non-uniform corner aging (not a dark vignette)
          ============================================================== */}
      <div
        className="pointer-events-none absolute inset-0 size-full"
        style={{
          opacity: multipliers.edgeWearOpacity * 3.5,
        }}
      >
        {/* Asymmetric dirty scan bed accumulation (concentrated on bottom & left edges) */}
        <div
          className="absolute inset-0 size-full"
          style={{
            background: `
              linear-gradient(0deg, rgba(0, 0, 0, 0.22) 0%, transparent 8%),
              linear-gradient(90deg, rgba(0, 0, 0, 0.16) 0%, transparent 6%),
              radial-gradient(circle at 2% 98%, rgba(0, 0, 0, 0.28) 0%, transparent 35%),
              radial-gradient(circle at 98% 3%, rgba(0, 0, 0, 0.18) 0%, transparent 28%)
            `,
          }}
        />
        {/* Mild center focus falloff */}
        <div
          className="absolute inset-0 size-full"
          style={{
            background:
              "radial-gradient(circle at 50% 48%, transparent 54%, rgba(0, 0, 0, 0.15) 100%)",
          }}
        />
      </div>

      {children}
    </div>
  );
}
