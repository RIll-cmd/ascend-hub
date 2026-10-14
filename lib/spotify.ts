import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
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
  demoMode?: boolean;
}

export interface SpotifySetupState {
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasRefreshToken: boolean;
  demoMode: boolean;
  clientId?: string;
}

interface SpotifyTokenResponse { access_token?: string; refresh_token?: string }
interface SpotifyTrack {
  name?: string;
  artists?: { name?: string }[];
  album?: { name?: string; images?: { url?: string }[] };
  external_urls?: { spotify?: string };
  duration_ms?: number;
}
interface SpotifyPlaybackResponse {
  item?: SpotifyTrack | null;
  is_playing?: boolean;
  progress_ms?: number;
  device?: { name?: string };
}
interface SpotifyRecentResponse { items?: { track?: SpotifyTrack }[] }

declare global {
  var __spotifyTokens: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    demoMode?: boolean;
    disconnected?: boolean;
  } | undefined;
  var __spotifyLastTrack: Partial<SpotifyPlaybackState> | undefined;
}

export function getStoredSpotifyTokens(): {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  demoMode?: boolean;
} {
  const envClientId = process.env.SPOTIFY_CLIENT_ID;
  const envClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const envRefreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  const memoryTokens = globalThis.__spotifyTokens || {};

  let fileTokens: NonNullable<typeof globalThis.__spotifyTokens> = {};
  try {
    const tokenFile = join(process.cwd(), ".sites-runtime", "spotify-token.json");
    if (existsSync(tokenFile)) {
      fileTokens = JSON.parse(readFileSync(tokenFile, "utf-8"));
    }
  } catch {}

  const disconnected = memoryTokens.disconnected ?? fileTokens.disconnected;
  return {
    clientId: disconnected ? undefined : memoryTokens.clientId || fileTokens.clientId || envClientId,
    clientSecret: disconnected ? undefined : memoryTokens.clientSecret || fileTokens.clientSecret || envClientSecret,
    refreshToken: disconnected ? undefined : memoryTokens.refreshToken || fileTokens.refreshToken || envRefreshToken,
    demoMode:
      memoryTokens.demoMode !== undefined
        ? Boolean(memoryTokens.demoMode)
        : Boolean(fileTokens.demoMode),
  };
}

export function saveSpotifyTokens(tokens: {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  demoMode?: boolean;
}) {
  const current = getStoredSpotifyTokens();
  const merged = {
    ...current,
    ...tokens,
  };

  // Persist first: a failed save must not masquerade as a successful account change.
  const dir = join(process.cwd(), ".sites-runtime");
  mkdirSync(dir, { recursive: true });
  const saved = { ...merged, disconnected: false };
  writeFileSync(join(dir, "spotify-token.json"), JSON.stringify(saved, null, 2), { encoding: "utf-8", mode: 0o600 });
  globalThis.__spotifyTokens = saved;
  return true;
}

export function clearSpotifyTokens() {
  const dir = join(process.cwd(), ".sites-runtime");
  mkdirSync(dir, { recursive: true });
  // A persisted disconnect also stops environment credentials from silently reconnecting.
  const cleared = { demoMode: false, disconnected: true };
  writeFileSync(join(dir, "spotify-token.json"), JSON.stringify(cleared, null, 2), { encoding: "utf-8", mode: 0o600 });
  globalThis.__spotifyTokens = cleared;
  globalThis.__spotifyLastTrack = undefined;
  return true;
}

export async function getSpotifyAccessToken(): Promise<SpotifyTokenResponse | null> {
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

  return (await response.json()) as SpotifyTokenResponse;
}

export async function getCurrentlyPlaying(): Promise<SpotifyPlaybackState> {
  const creds = getStoredSpotifyTokens();
  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    if (creds.demoMode) {
      const now = Date.now();
      const durationMs = 214000;
      const progressMs = now % durationMs;
      return {
        isPlaying: true,
        title: "Drowning in Tears (ZZZ OST)",
        artist: "HOYO-MiX · Zenless Zone Zero",
        album: "Zenless Zone Zero OST",
        albumImageUrl: "https://fastcdn.hoyoverse.com/content-v2/nap/102370/0a3fab8aa62d35d4cb0013bcb90253d6_390791847830884978.png",
        songUrl: "https://open.spotify.com",
        progressMs,
        durationMs,
        connected: true,
        device: "Zenless Zone Zero Vinyl Record",
        lastUpdated: new Date().toISOString(),
        demoMode: true,
      };
    }

    return {
      isPlaying: false,
      title: "Spotify Not Connected",
      artist: "Connect your account on the music TV",
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

  let isPlaying = false;
  let title = "Spotify Ready";
  let artist = "Playback Idle";
  let album = "Spotify";
  let albumImageUrl = "";
  let songUrl = "";
  let progressMs = 0;
  let durationMs = 0;
  let device: string | undefined;

  try {
    const response = await fetch(CURRENTLY_PLAYING_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      cache: "no-store",
    });

    if (response.ok && response.status !== 204) {
      const song = (await response.json().catch(() => null)) as SpotifyPlaybackResponse | null;
      if (song && song.item) {
        isPlaying = Boolean(song.is_playing);
        title = song.item.name || "Unknown Track";
        artist = song.item.artists?.map((a) => a.name).filter(Boolean).join(", ") || "Unknown Artist";
        album = song.item.album?.name || "";
        albumImageUrl = song.item.album?.images?.[0]?.url || "";
        songUrl = song.item.external_urls?.spotify || "";
        progressMs = song.progress_ms || 0;
        durationMs = song.item.duration_ms || 0;
        device = song.device?.name;

        // Cache last played active track so it persists when paused
        if (albumImageUrl) {
          globalThis.__spotifyLastTrack = {
            title,
            artist,
            album,
            albumImageUrl,
            songUrl,
            durationMs,
          };
        }
      }
    }
  } catch (err) {
    console.error("Error fetching currently playing:", err);
  }

  // If no track currently playing or paused with no item, fallback to recently-played or cached last track
  if (!albumImageUrl) {
    const cached = globalThis.__spotifyLastTrack;
    if (cached && cached.albumImageUrl) {
      title = cached.title || title;
      artist = cached.artist || artist;
      album = cached.album || album;
      albumImageUrl = cached.albumImageUrl;
      songUrl = cached.songUrl || songUrl;
      durationMs = cached.durationMs || durationMs;
    } else {
      // Try fetching recently played track from Spotify API
      try {
        const recentRes = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=1", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
          cache: "no-store",
        });
        if (recentRes.ok) {
          const recentData = (await recentRes.json().catch(() => null)) as SpotifyRecentResponse | null;
          const recentItem = recentData?.items?.[0]?.track;
          if (recentItem) {
            title = recentItem.name || "Recent Track";
            artist = recentItem.artists?.map((a) => a.name).filter(Boolean).join(", ") || "Unknown Artist";
            album = recentItem.album?.name || "";
            albumImageUrl = recentItem.album?.images?.[0]?.url || "";
            songUrl = recentItem.external_urls?.spotify || "";
            durationMs = recentItem.duration_ms || 0;
            globalThis.__spotifyLastTrack = {
              title,
              artist,
              album,
              albumImageUrl,
              songUrl,
              durationMs,
            };
          }
        }
      } catch {}
    }
  }

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
    device,
    lastUpdated: new Date().toISOString(),
  };
}
