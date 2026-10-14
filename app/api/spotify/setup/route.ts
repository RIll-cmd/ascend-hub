import { NextRequest, NextResponse } from "next/server";
import { getStoredSpotifyTokens, saveSpotifyTokens, clearSpotifyTokens } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET() {
  const tokens = getStoredSpotifyTokens();
  return NextResponse.json({
    hasClientId: Boolean(tokens.clientId),
    hasClientSecret: Boolean(tokens.clientSecret),
    hasRefreshToken: Boolean(tokens.refreshToken),
    demoMode: Boolean(tokens.demoMode),
    clientId: tokens.clientId ? `${tokens.clientId.slice(0, 6)}...` : undefined,
  });
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ success: false, error: "Request origin does not match." }, { status: 403 });
    }
    const text = await request.text();
    if (text.length > 2048) {
      return NextResponse.json({ success: false, error: "Spotify settings are too large." }, { status: 413 });
    }
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid Spotify settings." }, { status: 400 });
    }
    const { clientId, clientSecret, demoMode, action } = body;

    if (action === "disconnect") {
      clearSpotifyTokens();
      return NextResponse.json({
        success: true,
        message: "Spotify disconnected and configuration reset",
      });
    }

    if ((clientId !== undefined && (typeof clientId !== "string" || clientId.trim().length > 128)) ||
        (clientSecret !== undefined && (typeof clientSecret !== "string" || clientSecret.trim().length > 256)) ||
        (demoMode !== undefined && typeof demoMode !== "boolean")) {
      return NextResponse.json({ success: false, error: "Invalid Spotify settings." }, { status: 400 });
    }
    const settings = {
      ...(typeof clientId === "string" && clientId.trim() ? { clientId: clientId.trim() } : {}),
      ...(typeof clientSecret === "string" && clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
      ...(typeof demoMode === "boolean" ? { demoMode } : {}),
    };
    if (Object.keys(settings).length === 0) {
      return NextResponse.json({ success: false, error: "No Spotify settings were provided." }, { status: 400 });
    }
    saveSpotifyTokens(settings);

    return NextResponse.json({
      success: true,
      message: "Spotify configuration saved successfully",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not save Spotify settings. Please try again." },
      { status: 500 }
    );
  }
}
