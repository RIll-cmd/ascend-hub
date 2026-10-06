import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getStoredSpotifyTokens } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const creds = getStoredSpotifyTokens();
  const clientId = creds.clientId;

  if (!clientId) {
    return NextResponse.redirect(new URL("/?spotify=missing_client_id", request.url));
  }

  const origin = request.nextUrl.origin.replace("localhost", "127.0.0.1");
  const redirectUri = `${origin}/api/spotify/callback`;
  const scope = "user-read-currently-playing user-read-playback-state user-read-recently-played";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: scope,
    redirect_uri: redirectUri,
    show_dialog: "true",
  });
  const state = randomBytes(32).toString("base64url");
  params.set("state", state);

  const response = NextResponse.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
  response.cookies.set("ascend_spotify_oauth_state", state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/spotify/callback",
    maxAge: 10 * 60,
  });
  return response;
}
