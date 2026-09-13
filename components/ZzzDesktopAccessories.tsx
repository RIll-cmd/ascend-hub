"use client";

import React, { useEffect, useState } from "react";

export function ZzzDesktopAccessories() {
  const [time, setTime] = useState("22:38");
  const [date, setDate] = useState({ year: 2026, month: "September", day: 13, weekday: "Sun" });

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      setDate({
        year: now.getFullYear(),
        month: months[now.getMonth()],
        day: now.getDate(),
        weekday: days[now.getDay()]
      });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* 1. Digital VFD/LED Clock atop the CRT TV (right top) */}
      <div className="zzz-room-alarm-clock" title="Random Play Desktop Quartz Clock">
        <div className="zzz-alarm-case">
          <div className="zzz-alarm-screen">
            <span className="zzz-vfd-digits">{time}</span>
          </div>
          <div className="zzz-alarm-snooze-bar" />
        </div>
      </div>

      {/* 2. Tear-away Retro Desktop Calendar (left beside CRT) */}
      <div className="zzz-room-desk-calendar" title="Sixth Street Tear-Away Calendar">
        <div className="zzz-cal-binding">
          <span className="zzz-cal-ring" />
          <span className="zzz-cal-ring" />
        </div>
        <div className="zzz-cal-header">
          <span className="zzz-cal-year">{date.year}</span>
          <span className="zzz-cal-month">{date.month}</span>
        </div>
        <div className="zzz-cal-body">
          <span className="zzz-cal-big-day">{date.day}</span>
          <span className="zzz-cal-weekday">{date.weekday.toUpperCase()}</span>
        </div>
      </div>
    </>
  );
}
