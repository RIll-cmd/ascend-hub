import { NextRequest, NextResponse } from "next/server";
import { getStoredSpotifyTokens, saveSpotifyTokens } from "@/lib/spotify";

export const dynamic = "force-dynamic";

interface SpotifyAuthorizationResponse {
  refresh_token?: string;
  error_description?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const returnedState = searchParams.get("state");
  const expectedState = request.cookies.get("ascend_spotify_oauth_state")?.value;
  const clearState = (response: NextResponse) => {
    response.cookies.set("ascend_spotify_oauth_state", "", {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/api/spotify/callback",
      maxAge: 0,
    });
    return response;
  };

  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return clearState(NextResponse.redirect(new URL("/?spotify=error", request.url)));
  }

  if (error || !code) {
    return clearState(NextResponse.redirect(
      new URL(`/?spotify=error&message=${encodeURIComponent(error || "No code provided")}`, request.url)
    ));
  }

  const creds = getStoredSpotifyTokens();
  if (!creds.clientId || !creds.clientSecret) {
    return clearState(NextResponse.redirect(
      new URL("/?spotify=error&message=Missing+SPOTIFY_CLIENT_ID+or+SPOTIFY_CLIENT_SECRET", request.url)
    ));
  }

  const origin = request.nextUrl.origin.replace("localhost", "127.0.0.1");
  const redirectUri = `${origin}/api/spotify/callback`;
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

    const data = (await res.json()) as SpotifyAuthorizationResponse;
    if (!res.ok || typeof data.refresh_token !== "string") {
      console.error("Spotify token error:", data);
      return clearState(NextResponse.redirect(
        new URL(`/?spotify=error&message=${encodeURIComponent(data.error_description || "Token exchange failed")}`, request.url)
      ));
    }

    saveSpotifyTokens({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      refreshToken: data.refresh_token,
    });

    return clearState(NextResponse.redirect(new URL("/?spotify=connected", request.url)));
  } catch {
    console.error("Spotify OAuth callback failed.");
    return clearState(NextResponse.redirect(new URL("/?spotify=error", request.url)));
  }
}
