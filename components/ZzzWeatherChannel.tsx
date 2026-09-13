"use client";

import React, { useEffect, useState } from "react";
import { Cloud, Sun, Wind, Droplets } from "lucide-react";

export function ZzzWeatherChannel() {
  const [timeStr, setTimeStr] = useState("12:00");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="zzz-weather-channel">
      <div className="zzz-weather-header">
        <span className="zzz-weather-city">NEW ERIDU // 6TH STREET</span>
        <span className="zzz-weather-clock">{timeStr}</span>
      </div>

      <div className="zzz-weather-body">
        <div className="zzz-weather-main">
          <div className="zzz-weather-icon-box">
            <Sun size={38} className="text-[#ffaa00] animate-pulse" />
          </div>
          <div className="zzz-weather-temp">
            <b>24°C</b>
            <span>ETHER CLEAR</span>
          </div>
        </div>

        <div className="zzz-weather-stats">
          <div className="zzz-weather-stat-row">
            <span className="label"><Wind size={10} /> HOLLOW ACTIVITY</span>
            <span className="val safe">NORMAL // LEVEL 1</span>
          </div>
          <div className="zzz-weather-stat-row">
            <span className="label"><Droplets size={10} /> HUMIDITY</span>
            <span className="val">58%</span>
          </div>
          <div className="zzz-weather-stat-row">
            <span className="label"><Cloud size={10} /> AIR QUALITY</span>
            <span className="val">OPTIMAL (98 AQI)</span>
          </div>
        </div>
      </div>

      <div className="zzz-weather-ticker">
        <div className="zzz-ticker-text">
          <span>● HIA REPORT: NO HOLLOW SPONTANEOUS FISSURES DETECTED IN DISTRICT 06 ● ENJOY YOUR DAY AT RANDOM PLAY! ●</span>
        </div>
      </div>
    </div>
  );
}
