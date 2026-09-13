"use client";

import React, { useState, useEffect } from "react";

interface RetroLedClockProps {
  className?: string;
}

export function RetroLedClock({ className = "" }: RetroLedClockProps) {
  const [time, setTime] = useState<{ hours: string; minutes: string; seconds: string }>({
    hours: "22",
    minutes: "39",
    seconds: "00",
  });
  const [showSeconds, setShowSeconds] = useState(false);
  const [colonBlink, setColonBlink] = useState(true);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, "0");
      const m = String(now.getMinutes()).padStart(2, "0");
      const s = String(now.getSeconds()).padStart(2, "0");
      setTime({ hours: h, minutes: m, seconds: s });
      setColonBlink(prev => !prev);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`retro-led-chassis-clock ${className}`}
      onClick={() => setShowSeconds(s => !s)}
      title="Retro LED Digital Clock (Click to toggle seconds)"
      role="timer"
      aria-label={`Current time: ${time.hours}:${time.minutes}`}
    >
      <div className="led-clock-outer-bezel">
        <div className="led-clock-glass-face">
          <div className="led-clock-grid-bg" />
          <div className="led-clock-digits-display">
            {/* Hours */}
            <span className="led-digit-group">{time.hours}</span>

            {/* Pulsing Dot-Matrix Colon */}
            <span className={`led-digit-colon ${colonBlink ? "lit" : "dim"}`}>:</span>

            {/* Minutes */}
            <span className="led-digit-group">{time.minutes}</span>

            {/* Optional Seconds */}
            {showSeconds && (
              <span className="led-digit-seconds">
                <span className="colon-sec">.</span>
                {time.seconds}
              </span>
            )}
          </div>
          {/* Subtle Glass Reflection */}
          <div className="led-clock-glare" />
        </div>
      </div>
    </div>
  );
}
