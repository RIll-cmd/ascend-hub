"use client";

import React, { useId } from "react";
import { cn } from "@/lib/utils";
import { NoiseTexture } from "./noise-texture";

export interface CrtScreenOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Enable scanlines layer @default true */
  showScanlines?: boolean;
  /** Enable phosphor noise grain layer @default true */
  showNoise?: boolean;
  /** Enable curved spherical glass glare layer @default true */
  showGlare?: boolean;
  /** Enable aperture grille RGB chromatic mask @default true */
  showApertureGrille?: boolean;
  /** Opacity multiplier for scanlines (0 to 1) @default 0.6 */
  scanlineIntensity?: number;
  /** Opacity multiplier for noise grain (0 to 1) @default 0.25 */
  noiseIntensity?: number;
  /** Extra class names */
  className?: string;
}

/**
 * Authentic CRT Glass & Screen Texture Overlay
 * Combines Magic UI SVG fractal noise with React Bits CRT shader primitives:
 * - Alternating scanline raster with subtle interlaced timing
 * - Convex spherical glass specular glare
 * - Trinitron-style RGB phosphor subpixel aperture mask
 * - Recessed bezel edge shadow vignette
 */
export function CrtScreenOverlay({
  showScanlines = true,
  showNoise = true,
  showGlare = true,
  showApertureGrille = true,
  scanlineIntensity = 0.6,
  noiseIntensity = 0.25,
  className,
  ...props
}: CrtScreenOverlayProps) {
  const gradientId = useId();

  return (
    <div
      className={cn(
        "crt-screen-overlay-container pointer-events-none absolute inset-0 z-10 select-none overflow-hidden rounded-[inherit]",
        className
      )}
      aria-hidden="true"
      {...props}
    >
      {/* 1. Magic UI Fractal Noise (Phosphor Grain Layer) */}
      {showNoise && (
        <NoiseTexture
          className="crt-noise-layer pointer-events-none absolute inset-0 size-full mix-blend-overlay"
          frequency={0.65}
          octaves={4}
          slope={0.25}
          noiseOpacity={noiseIntensity}
        />
      )}

      {/* 2. RGB Aperture Grille / Subpixel Triad Mask */}
      {showApertureGrille && (
        <div className="crt-aperture-grille pointer-events-none absolute inset-0 size-full mix-blend-color-dodge opacity-15" />
      )}

      {/* 3. Horizontal Scanline Raster */}
      {showScanlines && (
        <div
          className="crt-scanline-raster pointer-events-none absolute inset-0 size-full"
          style={{ opacity: scanlineIntensity }}
        />
      )}

      {/* 4. Convex Spherical Curved Glass Glare (Specular Highlights) */}
      {showGlare && (
        <>
          {/* Upper-left primary ambient glare curve */}
          <div className="crt-spherical-glare-primary pointer-events-none absolute inset-0 size-full" />
          {/* Lower diagonal secondary rim reflection */}
          <div className="crt-spherical-glare-secondary pointer-events-none absolute inset-0 size-full" />
        </>
      )}

      {/* 5. Deep Bezel Recess Vignette Shadow (Edges Falloff) */}
      <div className="crt-bezel-shadow pointer-events-none absolute inset-0 size-full" />
    </div>
  );
}
