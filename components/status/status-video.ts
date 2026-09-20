import type { ServiceState } from "../../app/status/shelf-contract";

export interface StatusVideoPresentation {
  src: string;
  objectPosition: string;
  playbackRate: number;
}

const STATUS_VIDEOS: Record<ServiceState, StatusVideoPresentation> = {
  idle: {
    src: "/TV-STATUS/idle.mp4",
    objectPosition: "50% 48%",
    playbackRate: 1,
  },
  working: {
    src: "/TV-STATUS/working.mp4",
    objectPosition: "50% 48%",
    playbackRate: 1,
  },
  stuck: {
    src: "/TV-STATUS/stuck.mp4",
    objectPosition: "50% 50%",
    playbackRate: 0.82,
  },
  offline: {
    src: "/TV-STATUS/offline.mp4",
    objectPosition: "50% 50%",
    playbackRate: 1,
  },
};

export function getStatusVideo(state: ServiceState | "unavailable"): StatusVideoPresentation | null {
  return state === "unavailable" ? null : STATUS_VIDEOS[state];
}
