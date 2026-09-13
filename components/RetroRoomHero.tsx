"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { RetroMediaCenter, type CrtChannelType } from "./RetroMediaCenter";
import { RetroWallShelf, type ZZZTapeInfo } from "./RetroWallShelf";
import { zzzAudio } from "./zzzAudio";

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
  const [videoSrc, setVideoSrc] = useState(initialVideoSrc);
  const [channel, setChannel] = useState<CrtChannelType>("av");

  const handleTapeSelect = (tape: ZZZTapeInfo) => {
    // Tactile VHS insertion sound effect
    zzzAudio.play("vhs_start", 0.7);

    // Route CRT to video channel with authentic video playback
    if (tape.id === "lycaon") {
      setChannel("opening");
    } else if (tape.id === "rina") {
      setVideoSrc("https://dotcom.workos.com/images/launch-week/summer-2026/intro.mp4");
      setChannel("video");
    } else if (tape.id === "koleda") {
      setChannel("opening");
    }
  };

  return (
    <section
      className={`retro-room-hero-section retro-room-flat ${className}`}
      aria-label="Retro room media workstation"
    >
      <div className="retro-room-flat-stage">
        <aside className="retro-room-wall-shelf-container" aria-label="ZZZ Random Play 3D Tape Shelf">
          <RetroWallShelf onTapeSelect={handleTapeSelect} />
        </aside>

        <div className="retro-room-flat-workstation">
          <RetroMediaCenter
            mode="all"
            channel={channel}
            videoSrc={videoSrc}
            initialPlaying={initialPlaying}
            onChannelChange={(ch) => setChannel(ch as CrtChannelType)}
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
