import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface YouTubeVideoItem {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
  duration: string;
  views?: string;
  isLive: boolean;
}

const DEFAULT_FEATURED: YouTubeVideoItem[] = [
  {
    id: "jfKfPfyJRdk",
    title: "lofi hip hop radio 📚 - beats to relax/study to",
    author: "Lofi Girl",
    thumbnail: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg",
    duration: "LIVE",
    isLive: true,
  },
  {
    id: "4xDzrJKXOOY",
    title: "synthwave radio 🌌 - chill synth / retro beats",
    author: "Lofi Girl",
    thumbnail: "https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg",
    duration: "LIVE",
    isLive: true,
  },
  {
    id: "5yx6BWlEVcY",
    title: "Chillhop Radio - jazzy & lofi hip hop beats",
    author: "Chillhop Music",
    thumbnail: "https://i.ytimg.com/vi/5yx6BWlEVcY/hqdefault.jpg",
    duration: "LIVE",
    isLive: true,
  },
  {
    id: "BnnbP7pCIvQ",
    title: "I Really Want to Stay At Your House - Cyberpunk Edgerunners",
    author: "Rosa Walton & Hallie Coggins",
    thumbnail: "https://i.ytimg.com/vi/BnnbP7pCIvQ/hqdefault.jpg",
    duration: "4:06",
    isLive: false,
  },
  {
    id: "suOoY5m2A78",
    title: "Beneath the Mask - Persona 5 OST (Rainy Day)",
    author: "Shoji Meguro / Atlus Sound Team",
    thumbnail: "https://i.ytimg.com/vi/suOoY5m2A78/hqdefault.jpg",
    duration: "4:39",
    isLive: false,
  },
  {
    id: "s4V6gI-T1wY",
    title: "Zenless Zone Zero OST - Drowning in Tears",
    author: "HOYO-MiX",
    thumbnail: "https://i.ytimg.com/vi/s4V6gI-T1wY/hqdefault.jpg",
    duration: "3:34",
    isLive: false,
  },
];

function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  // Direct 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  // Standard URLs
  const patterns = [
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/))([a-zA-Z0-9_-]{11})/,
    /music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match && match[1]) return match[1];
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";

  // If no query, return curated defaults
  if (!q) {
    return NextResponse.json({
      success: true,
      query: "",
      results: DEFAULT_FEATURED,
      isDirectMatch: false,
    });
  }

  // Check if input is a direct YouTube link or ID
  const directId = extractYouTubeId(q);
  if (directId) {
    return NextResponse.json({
      success: true,
      query: q,
      results: [
        {
          id: directId,
          title: `Direct YouTube Stream (${directId})`,
          author: "YouTube User Input",
          thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
          duration: "Ready",
          isLive: false,
        },
        ...DEFAULT_FEATURED.filter((v) => v.id !== directId),
      ],
      isDirectMatch: true,
    });
  }

  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      throw new Error(`YouTube responded with ${res.status}`);
    }

    const html = await res.text();
    const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
    if (!match) {
      return NextResponse.json({
        success: true,
        query: q,
        results: DEFAULT_FEATURED,
        isDirectMatch: false,
      });
    }

    const data = JSON.parse(match[1]);
    const contents =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents;
    const itemSection = contents?.find((c: any) => c.itemSectionRenderer)?.itemSectionRenderer
      ?.contents;

    const results: YouTubeVideoItem[] = [];
    if (Array.isArray(itemSection)) {
      for (const item of itemSection) {
        const v = item.videoRenderer;
        if (v && v.videoId && v.title) {
          const isLive = Boolean(
            v.badges?.some(
              (b: any) =>
                b.metadataBadgeRenderer?.label === "LIVE" ||
                b.metadataBadgeRenderer?.style === "BADGE_STYLE_TYPE_LIVE_NOW"
            )
          );
          const duration =
            isLive
              ? "LIVE"
              : v.lengthText?.simpleText ||
                v.lengthText?.runs?.[0]?.text ||
                "Video";
          const title =
            v.title?.runs?.map((r: any) => r.text).join("") ||
            v.title?.simpleText ||
            "Untitled";
          const author =
            v.ownerText?.runs?.map((r: any) => r.text).join("") ||
            v.shortBylineText?.runs?.map((r: any) => r.text).join("") ||
            "YouTube Creator";
          const thumbnail =
            v.thumbnail?.thumbnails?.[v.thumbnail.thumbnails.length - 1]?.url ||
            `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
          const views =
            v.viewCountText?.simpleText ||
            v.shortViewCountText?.simpleText ||
            "";

          results.push({
            id: v.videoId,
            title,
            author,
            thumbnail,
            duration,
            views,
            isLive,
          });

          if (results.length >= 15) break;
        }
      }
    }

    return NextResponse.json({
      success: true,
      query: q,
      results: results.length > 0 ? results : DEFAULT_FEATURED,
      isDirectMatch: false,
    });
  } catch (error: any) {
    console.error("YouTube search error:", error);
    return NextResponse.json({
      success: false,
      error: error?.message || "Failed to search YouTube",
      results: DEFAULT_FEATURED,
      isDirectMatch: false,
    });
  }
}
