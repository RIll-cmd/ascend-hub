import { NextResponse } from "next/server";
import { getCurrentlyPlaying } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCurrentlyPlaying();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      {
        isPlaying: false,
        title: "Error",
        artist: error?.message || "Failed to fetch Spotify state",
        album: "",
        albumImageUrl: "",
        songUrl: "",
        progressMs: 0,
        durationMs: 0,
        connected: false,
      },
      { status: 200 }
    );
  }
}
