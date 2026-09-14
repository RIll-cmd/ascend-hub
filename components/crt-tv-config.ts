export interface CrtTvScreenConfig {
  top: string;
  left: string;
  width: string;
  height: string;
  radius: string;
}

export interface CrtModelProfile {
  collectibleId: string;
  label: string;
  image: string;
  defaultVideo: string;
  screen: CrtTvScreenConfig;
}

export const CRT_VIDEO_CHANNELS = [
  { id: "ch-1", label: "CH 01 · FEED A", src: "/videos/tv-1.mp4" },
  { id: "ch-2", label: "CH 02 · FEED B", src: "/videos/tv-2.mp4" },
  { id: "ch-3", label: "CH 03 · FEED C", src: "/videos/tv-3.mp4" },
  { id: "ch-4", label: "CH 04 · FEED D", src: "/videos/tv-4.mp4" },
];

export const CRT_MODEL_PROFILES: Record<string, CrtModelProfile> = {
  "imac-g3-bondi": {
    collectibleId: "imac-g3-bondi",
    label: "Bondi Blue iMac G3",
    image: "/crt-tvs-and-imac/imac1-removebg-preview.png",
    defaultVideo: "/videos/tv-1.mp4",
    screen: {
      top: "16.5%",
      left: "17.0%",
      width: "66.0%",
      height: "49.5%",
      radius: "9% / 8%"
    }
  },
  "imac-g3-astronaut": {
    collectibleId: "imac-g3-astronaut",
    label: "iMac G3 & Astronaut",
    image: "/crt-tvs-and-imac/imac2-removebg-preview.png",
    defaultVideo: "/videos/tv-2.mp4",
    screen: {
      top: "21.5%",
      left: "20.0%",
      width: "60.0%",
      height: "44.5%",
      radius: "9% / 8%"
    }
  },
  "imac-g3-angled": {
    collectibleId: "imac-g3-angled",
    label: "iMac G3 Profile",
    image: "/crt-tvs-and-imac/imac3-removebg-preview.png",
    defaultVideo: "/videos/tv-1.mp4",
    screen: {
      top: "23.0%",
      left: "22.0%",
      width: "57.0%",
      height: "43.0%",
      radius: "9% / 8%"
    }
  },
  "crt-vintage-1": {
    collectibleId: "crt-vintage-1",
    label: "Vintage Wood-Trim CRT",
    image: "/crt-tvs-and-imac/crt1-removebg-preview.png",
    defaultVideo: "/videos/tv-3.mp4",
    screen: {
      top: "17.0%",
      left: "14.0%",
      width: "72.0%",
      height: "51.0%",
      radius: "11% / 9%"
    }
  },
  "crt-dual-knob": {
    collectibleId: "crt-dual-knob",
    label: "Dual-Knob CRT TV",
    image: "/crt-tvs-and-imac/crt2-removebg-preview.png",
    defaultVideo: "/videos/tv-4.mp4",
    screen: {
      top: "16.0%",
      left: "15.0%",
      width: "70.0%",
      height: "51.0%",
      radius: "10% / 8%"
    }
  },
  "crt-studio-monitor": {
    collectibleId: "crt-studio-monitor",
    label: "Studio Pushbutton CRT",
    image: "/crt-tvs-and-imac/crt3-removebg-preview.png",
    defaultVideo: "/videos/tv-4.mp4",
    screen: {
      top: "17.0%",
      left: "15.0%",
      width: "70.0%",
      height: "51.0%",
      radius: "10% / 8%"
    }
  },
  "crt-vhf-uhf": {
    collectibleId: "crt-vhf-uhf",
    label: "Classic VHF/UHF CRT TV",
    image: "/crt-tvs-and-imac/crt4-removebg-preview.png",
    defaultVideo: "/videos/tv-3.mp4",
    screen: {
      top: "15.0%",
      left: "13.0%",
      width: "74.0%",
      height: "52.0%",
      radius: "11% / 9%"
    }
  }
};

export function getCrtProfile(collectibleId: string): CrtModelProfile | undefined {
  return CRT_MODEL_PROFILES[collectibleId];
}

// Backward compatibility helper
export function findCrtConfigByCollectibleId(collectibleId: string) {
  const profile = getCrtProfile(collectibleId);
  if (!profile) return undefined;
  return {
    id: profile.collectibleId,
    ...profile,
    video: profile.defaultVideo
  };
}
