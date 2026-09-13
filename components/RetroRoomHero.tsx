"use client";

import { ChevronDown } from "lucide-react";
import { RetroMediaCenter } from "./RetroMediaCenter";

interface RetroRoomHeroProps {
  initialVideoSrc?: string;
  initialPlaying?: boolean;
  onExploreCabinet?: () => void;
  className?: string;
}

export function RetroRoomHero({
  initialVideoSrc = "https://www.youtube.com/watch?v=4xDzrJKXOOY",
  initialPlaying = true,
  onExploreCabinet,
  className = "",
}: RetroRoomHeroProps) {
  return (
    <section
      className={`retro-room-hero-section retro-room-flat ${className}`}
      aria-label="Retro room media workstation"
    >
      <div className="retro-room-flat-stage">
        <img
          src="/retro-media/retro-room-background-v2.png"
          alt="Retro room with bookshelves, framed posters, a wooden speaker, and a clear desk"
          className="retro-room-flat-backdrop"
          draggable={false}
          fetchPriority="high"
        />
        <div className="retro-room-flat-workstation">
          <RetroMediaCenter
            mode="all"
            channel="video"
            videoSrc={initialVideoSrc}
            initialPlaying={initialPlaying}
          />
        </div>
      </div>
      {onExploreCabinet && (
        <button
          type="button"
          className="retro-room-flat-explore"
          onClick={onExploreCabinet}
        >
          <ChevronDown size={14} />
          EXPLORE CABINET
        </button>
      )}
    </section>
  );
}
