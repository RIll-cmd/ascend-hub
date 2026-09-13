"use client";

import React, { useState, useEffect } from "react";

interface RetroFlipCalendarProps {
  className?: string;
  onDateClick?: (day: number) => void;
}

export function RetroFlipCalendar({ className = "", onDateClick }: RetroFlipCalendarProps) {
  // Default to September 18, 2024 matching reference Photo 2, with live interactivity
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date(2024, 8, 18));
  const [activeDay, setActiveDay] = useState<number>(18);

  const year = currentDate.getFullYear();
  const monthName = currentDate.toLocaleString("en-US", { month: "long" });

  // Compute month calendar days
  const firstDayIndex = new Date(year, currentDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(year, currentDate.getMonth() + 1, 0).getDate();

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Generate grid slots (empty preceding days + month days)
  const calendarSlots: Array<number | null> = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarSlots.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarSlots.push(d);
  }

  return (
    <div
      className={`retro-desk-calendar ${className}`}
      role="region"
      aria-label={`Desk Calendar - ${monthName} ${year}`}
    >
      <div className="calendar-page-content">
        {/* Calendar Header: Year & Month in Vintage Red Stamp Font (Photo 2) */}
        <header className="calendar-header">
          <span className="calendar-year">{year}</span>
          <span className="calendar-month">{monthName}</span>
        </header>

        {/* Subtle Horizontal Rule Separator */}
        <div className="calendar-divider" aria-hidden="true" />

        {/* Weekday Legend */}
        <div className="calendar-weekdays" aria-hidden="true">
          {weekdays.map((day) => (
            <span key={day} className="calendar-weekday">
              {day}
            </span>
          ))}
        </div>

        {/* Days Matrix Grid */}
        <div className="calendar-grid">
          {calendarSlots.map((day, idx) => {
            if (day === null) {
              return <span key={`empty-${idx}`} className="calendar-cell empty" />;
            }
            const isToday = day === activeDay;
            return (
              <button
                key={`day-${day}`}
                type="button"
                className={`calendar-cell day-number ${isToday ? "is-today" : ""}`}
                onClick={() => {
                  setActiveDay(day);
                  onDateClick?.(day);
                }}
                title={`${monthName} ${day}, ${year}`}
              >
                <span className="day-text">{day}</span>
                {isToday && (
                  <svg
                    className="hand-drawn-circle"
                    viewBox="0 0 38 38"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M 19 4 C 10 4, 4 10, 4 19 C 4 28, 11 34, 21 34 C 30 34, 35 27, 34 18 C 33 9, 26 4, 17 4 C 11 4, 7 8, 8 13"
                      stroke="#c84232"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
