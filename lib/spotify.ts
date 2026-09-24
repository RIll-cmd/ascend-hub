import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const CURRENTLY_PLAYING_ENDPOINT = "https://api.spotify.com/v1/me/player/currently-playing";

export interface SpotifyPlaybackState {
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  albumImageUrl: string;
  songUrl: string;
  progressMs: number;
  durationMs: number;
  connected: boolean;
  device?: string;
  lastUpdated?: string;
}

export function getStoredSpotifyTokens(): {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
} {
  const envClientId = process.env.SPOTIFY_CLIENT_ID;
  const envClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const envRefreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (envClientId && envClientSecret && envRefreshToken) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      refreshToken: envRefreshToken,
    };
  }

  try {
    const tokenFile = join(process.cwd(), ".sites-runtime", "spotify-token.json");
    if (existsSync(tokenFile)) {
      const data = JSON.parse(readFileSync(tokenFile, "utf-8"));
      return {
        clientId: envClientId || data.clientId,
        clientSecret: envClientSecret || data.clientSecret,
        refreshToken: envRefreshToken || data.refreshToken,
      };
    }
  } catch (_) {}

  return {
    clientId: envClientId,
    clientSecret: envClientSecret,
    refreshToken: envRefreshToken,
  };
}

export function saveSpotifyTokens(tokens: {
  clientId?: string;
  clientSecret?: string;
  refreshToken: string;
}) {
  try {
    const dir = join(process.cwd(), ".sites-runtime");
    const tokenFile = join(dir, "spotify-token.json");
    let existing = {};
    if (existsSync(tokenFile)) {
      try {
        existing = JSON.parse(readFileSync(tokenFile, "utf-8"));
      } catch (_) {}
    }
    writeFileSync(tokenFile, JSON.stringify({ ...existing, ...tokens }, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Failed to save Spotify token:", err);
    return false;
  }
}

export async function getSpotifyAccessToken() {
  const creds = getStoredSpotifyTokens();
  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    return null;
  }

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("Spotify token refresh failed:", response.status, errText);
    return null;
  }

  return response.json();
}

export async function getCurrentlyPlaying(): Promise<SpotifyPlaybackState> {
  const creds = getStoredSpotifyTokens();
  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    return {
      isPlaying: false,
      title: "Spotify Not Connected",
      artist: "Configure SPOTIFY_CLIENT_ID & REFRESH_TOKEN",
      album: "Ascend Hub",
      albumImageUrl: "",
      songUrl: "",
      progressMs: 0,
      durationMs: 0,
      connected: false,
    };
  }

  const tokenData = await getSpotifyAccessToken();
  if (!tokenData?.access_token) {
    return {
      isPlaying: false,
      title: "Spotify Auth Error",
      artist: "Check credentials or reconnect Spotify",
      album: "Ascend Hub",
      albumImageUrl: "",
      songUrl: "",
      progressMs: 0,
      durationMs: 0,
      connected: false,
    };
  }

  const response = await fetch(CURRENTLY_PLAYING_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
    cache: "no-store",
  });

  if (response.status === 204 || response.status > 400) {
    return {
      isPlaying: false,
      title: "Nothing Playing",
      artist: "Spotify Ready",
      album: "Ascend Hub",
      albumImageUrl: "",
      songUrl: "",
      progressMs: 0,
      durationMs: 0,
      connected: true,
      lastUpdated: new Date().toISOString(),
    };
  }

  const song = await response.json();
  if (!song || !song.item) {
    return {
      isPlaying: false,
      title: "Nothing Playing",
      artist: "Spotify Ready",
      album: "Ascend Hub",
      albumImageUrl: "",
      songUrl: "",
      progressMs: 0,
      durationMs: 0,
      connected: true,
      lastUpdated: new Date().toISOString(),
    };
  }

  const isPlaying = Boolean(song.is_playing);
  const title = song.item.name || "Unknown Track";
  const artist =
    song.item.artists?.map((a: { name: string }) => a.name).join(", ") || "Unknown Artist";
  const album = song.item.album?.name || "";
  const albumImageUrl = song.item.album?.images?.[0]?.url || "";
  const songUrl = song.item.external_urls?.spotify || "";
  const progressMs = song.progress_ms || 0;
  const durationMs = song.item.duration_ms || 0;

  return {
    isPlaying,
    title,
    artist,
    album,
    albumImageUrl,
    songUrl,
    progressMs,
    durationMs,
    connected: true,
    device: song.device?.name,
    lastUpdated: new Date().toISOString(),
  };
}
