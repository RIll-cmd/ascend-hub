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
    const body = await request.json();
    const { clientId, clientSecret, demoMode, action } = body;

    if (action === "disconnect") {
      clearSpotifyTokens();
      return NextResponse.json({
        success: true,
        message: "Spotify disconnected and configuration reset",
      });
    }

    saveSpotifyTokens({
      clientId: clientId ? String(clientId).trim() : undefined,
      clientSecret: clientSecret ? String(clientSecret).trim() : undefined,
      demoMode: demoMode !== undefined ? Boolean(demoMode) : undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Spotify configuration saved successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to save configuration" },
      { status: 400 }
    );
  }
}
