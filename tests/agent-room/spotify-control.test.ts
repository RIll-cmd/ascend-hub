import assert from "node:assert/strict";
import test from "node:test";
import { controlPlayback, spotifyTrackUri } from "../../lib/spotify";

const ID = "4uLU6hMCjMI75M1A2tKUQC";

test("a track to queue is a spotify:track URI or an open.spotify.com track link", () => {
  assert.equal(spotifyTrackUri(`spotify:track:${ID}`), `spotify:track:${ID}`);
  assert.equal(spotifyTrackUri(` https://open.spotify.com/track/${ID}?si=abc `), `spotify:track:${ID}`);
  assert.equal(spotifyTrackUri(`https://open.spotify.com/intl-de/track/${ID}`), `spotify:track:${ID}`);
  assert.equal(spotifyTrackUri(`https://open.spotify.com/album/${ID}`), null);
  assert.equal(spotifyTrackUri(`https://evil.example/track/${ID}`), null);
  assert.equal(spotifyTrackUri("spotify:track:short"), null);
  assert.equal(spotifyTrackUri(42), null);
});

test("each control calls the player endpoint, and Spotify's refusals become plain sentences", async () => {
  globalThis.__spotifyTokens = { clientId: "c", clientSecret: "s", refreshToken: "r", disconnected: false };
  const calls: { url: string; method?: string; auth?: string }[] = [];
  let reply = new Response(null, { status: 204 });
  const deps = {
    token: async () => ({ access_token: "at" }),
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, auth: (init?.headers as Record<string, string>)?.Authorization });
      return reply;
    }) as typeof fetch,
  };
  try {
    for (const action of ["play", "pause", "next", "previous"] as const) assert.deepEqual(await controlPlayback(action, null, deps), { ok: true, status: 204 });
    assert.deepEqual(await controlPlayback("queue", `spotify:track:${ID}`, deps), { ok: true, status: 204 });
    assert.deepEqual(calls.map(c => `${c.method} ${c.url.replace("https://api.spotify.com/v1/me/player", "")}`),
      ["PUT /play", "PUT /pause", "POST /next", "POST /previous", `POST /queue?uri=spotify%3Atrack%3A${ID}`]);
    assert.ok(calls.every(c => c.auth === "Bearer at"));
    assert.equal((await controlPlayback("queue", null, deps)).status, 400);
    reply = new Response(JSON.stringify({ error: { status: 404, message: "Player command failed: No active device found", reason: "NO_ACTIVE_DEVICE" } }), { status: 404 });
    assert.match((await controlPlayback("play", null, deps)).message ?? "", /No active Spotify device/);
    reply = new Response(JSON.stringify({ error: { status: 403, reason: "PREMIUM_REQUIRED" } }), { status: 403 });
    assert.match((await controlPlayback("next", null, deps)).message ?? "", /only with Premium/);
    reply = new Response(JSON.stringify({ error: { status: 403, message: "Insufficient client scope" } }), { status: 403 });
    assert.match((await controlPlayback("next", null, deps)).message ?? "", /Reconnect Spotify so Hub may control playback/);
    assert.equal((await controlPlayback("play", null, { ...deps, token: async () => null })).status, 401);
    // disconnected keeps any credentials stored on this machine out of the test.
    globalThis.__spotifyTokens = { demoMode: true, disconnected: true };
    const demo = await controlPlayback("play", null, deps);
    assert.equal(demo.status, 409);
    assert.match(demo.message ?? "", /Demo mode/);
  } finally {
    globalThis.__spotifyTokens = undefined;
  }
});
