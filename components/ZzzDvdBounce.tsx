"use client";

import React, { useEffect, useRef } from "react";

interface ZzzDvdBounceProps {
  isPlaying?: boolean;
}

export function ZzzDvdBounce({ isPlaying = true }: ZzzDvdBounceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!isPlaying) return;
    const container = containerRef.current;
    const logo = logoRef.current;
    if (!container || !logo) return;

    let posX = Math.random() * 80 + 20;
    let posY = Math.random() * 80 + 20;
    let velX = 1.6;
    let velY = 1.2;
    let animId: number;

    const colors = ["#ffffff", "#d7f300", "#00f0ff", "#ff5533", "#ff77aa", "#55ff77"];
    let colorIdx = 0;

    const step = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const lw = logo.clientWidth || 70;
      const lh = logo.clientHeight || 45;

      posX += velX;
      posY += velY;

      let bounced = false;

      if (posX + lw >= cw) {
        posX = cw - lw;
        velX = -velX;
        bounced = true;
      } else if (posX <= 0) {
        posX = 0;
        velX = -velX;
        bounced = true;
      }

      if (posY + lh >= ch) {
        posY = ch - lh;
        velY = -velY;
        bounced = true;
      } else if (posY <= 0) {
        posY = 0;
        velY = -velY;
        bounced = true;
      }

      if (bounced) {
        colorIdx = (colorIdx + 1) % colors.length;
        logo.style.filter = `drop-shadow(0 0 8px ${colors[colorIdx]})`;
      }

      logo.style.transform = `translate3d(${posX}px, ${posY}px, 0)`;
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);

    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  return (
    <div className="zzz-dvd-bounce-container" ref={containerRef}>
      <img
        ref={logoRef}
        src="/images/zzz-tv/zzz_logo_white_out.png"
        alt="ZZZ Bouncing Logo"
        className="zzz-bouncing-logo-img"
        draggable={false}
      />
      <div className="zzz-dvd-overlay-label">AV 01 · RANDOM PLAY</div>
    </div>
  );
}
