import { NextRequest, NextResponse } from "next/server";
import { getStoredSpotifyTokens } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const creds = getStoredSpotifyTokens();
  const clientId = searchParams.get("client_id") || creds.clientId;

  if (!clientId) {
    return NextResponse.redirect(new URL("/?spotify=missing_client_id", request.url));
  }

  const origin = request.nextUrl.origin.replace("localhost", "127.0.0.1");
  const redirectUri = `${origin}/api/spotify/callback`;
  const scope = "user-read-currently-playing user-read-playback-state";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: scope,
    redirect_uri: redirectUri,
    show_dialog: "true",
  });

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}
