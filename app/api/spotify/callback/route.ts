import { NextRequest, NextResponse } from "next/server";
import { getStoredSpotifyTokens, saveSpotifyTokens } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/?spotify=error&message=${encodeURIComponent(error || "No code provided")}`, request.url)
    );
  }

  const creds = getStoredSpotifyTokens();
  if (!creds.clientId || !creds.clientSecret) {
    return NextResponse.redirect(
      new URL("/?spotify=error&message=Missing+SPOTIFY_CLIENT_ID+or+SPOTIFY_CLIENT_SECRET", request.url)
    );
  }

  const redirectUri = `${request.nextUrl.origin}/api/spotify/callback`;
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.refresh_token) {
      console.error("Spotify token error:", data);
      return NextResponse.redirect(
        new URL(`/?spotify=error&message=${encodeURIComponent(data.error_description || "Token exchange failed")}`, request.url)
      );
    }

    saveSpotifyTokens({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      refreshToken: data.refresh_token,
    });

    return NextResponse.redirect(new URL("/?spotify=connected", request.url));
  } catch (err: any) {
    console.error("Spotify OAuth callback error:", err);
    return NextResponse.redirect(
      new URL(`/?spotify=error&message=${encodeURIComponent(err.message || "Unknown error")}`, request.url)
    );
  }
}
