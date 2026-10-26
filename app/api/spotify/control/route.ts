import { NextRequest, NextResponse } from "next/server";
import { controlPlayback, SPOTIFY_CONTROLS, spotifyTrackUri, type SpotifyControl } from "@/lib/spotify";

export const dynamic = "force-dynamic";

// Play, pause, skip or queue from the music TV: { action, uri? }; uri is a track link or spotify:track: URI.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, message: "Request origin does not match." }, { status: 403 });
  }
  const text = await request.text();
  if (text.length > 1024) return NextResponse.json({ ok: false, message: "Request too large." }, { status: 413 });
  let body: { action?: unknown; uri?: unknown };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 }); }
  if (!SPOTIFY_CONTROLS.includes(body?.action as SpotifyControl)) return NextResponse.json({ ok: false, message: "Unknown action." }, { status: 400 });
  const action = body.action as SpotifyControl;
  const uri = action === "queue" ? spotifyTrackUri(body.uri) : null;
  if (action === "queue" && !uri) return NextResponse.json({ ok: false, message: "Paste a Spotify track link to queue." }, { status: 400 });
  try {
    const result = await controlPlayback(action, uri);
    return NextResponse.json(result, { status: result.ok ? 200 : result.status >= 400 && result.status < 600 ? result.status : 502 });
  } catch {
    return NextResponse.json({ ok: false, message: "Spotify could not be reached." }, { status: 502 });
  }
}
