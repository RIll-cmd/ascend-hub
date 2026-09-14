export interface CrtTvScreenConfig {
  top: string;
  left: string;
  width: string;
  height: string;
  radius: string;
}

export interface CrtTvItem {
  id: string;
  collectibleId: string;
  label: string;
  image: string;
  video: string;
  screen: CrtTvScreenConfig;
}

export const CRT_TELEVISIONS: CrtTvItem[] = [
  {
    id: "tv-top-left",
    collectibleId: "imac-g3-bondi",
    label: "Bondi Blue iMac G3",
    image: "/crt-tvs-and-imac/imac1-removebg-preview.png",
    video: "/videos/tv-1.mp4",
    screen: {
      top: "16.5%",
      left: "17.0%",
      width: "66.0%",
      height: "49.5%",
      radius: "9% / 8%"
    }
  },
  {
    id: "tv-top-right",
    collectibleId: "imac-g3-astronaut",
    label: "iMac G3 & Astronaut",
    image: "/crt-tvs-and-imac/imac2-removebg-preview.png",
    video: "/videos/tv-2.mp4",
    screen: {
      top: "21.5%",
      left: "20.0%",
      width: "60.0%",
      height: "44.5%",
      radius: "9% / 8%"
    }
  },
  {
    id: "tv-bottom-left",
    collectibleId: "crt-vintage-1",
    label: "Vintage Wood-Trim CRT",
    image: "/crt-tvs-and-imac/crt1-removebg-preview.png",
    video: "/videos/tv-3.mp4",
    screen: {
      top: "17.0%",
      left: "14.0%",
      width: "72.0%",
      height: "51.0%",
      radius: "11% / 9%"
    }
  },
  {
    id: "tv-bottom-right",
    collectibleId: "crt-studio-monitor",
    label: "Studio Pushbutton Monitor",
    image: "/crt-tvs-and-imac/crt3-removebg-preview.png",
    video: "/videos/tv-4.mp4",
    screen: {
      top: "17.0%",
      left: "15.0%",
      width: "70.0%",
      height: "51.0%",
      radius: "10% / 8%"
    }
  }
];

export function findCrtConfigByCollectibleId(collectibleId: string): CrtTvItem | undefined {
  return CRT_TELEVISIONS.find(tv => tv.collectibleId === collectibleId);
}
