import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveSpotifyTokens, getStoredSpotifyTokens, clearSpotifyTokens } from "../../lib/spotify";

test("Spotify settings persist, partial saves keep credentials, and disconnect overrides environment tokens", () => {
  const previousCwd = process.cwd();
  const previousMemory = globalThis.__spotifyTokens;
  const envNames = ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REFRESH_TOKEN"];
  const previousEnv = envNames.map((name) => process.env[name]);
  const directory = mkdtempSync(join(tmpdir(), "ascend-spotify-"));
  try {
    process.chdir(directory);
    globalThis.__spotifyTokens = undefined;
    envNames.forEach((name) => { delete process.env[name]; });
    saveSpotifyTokens({ clientId: "test-id", clientSecret: "test-secret", refreshToken: "test-token" });
    saveSpotifyTokens({ demoMode: false });
    globalThis.__spotifyTokens = undefined;
    assert.equal(getStoredSpotifyTokens().clientSecret, "test-secret");
    assert.equal(getStoredSpotifyTokens().refreshToken, "test-token");
    process.env.SPOTIFY_REFRESH_TOKEN = "environment-token";
    clearSpotifyTokens();
    globalThis.__spotifyTokens = undefined;
    assert.equal(getStoredSpotifyTokens().refreshToken, undefined);
    assert.equal(getStoredSpotifyTokens().clientId, undefined);
    assert.equal(JSON.parse(readFileSync(join(directory, ".sites-runtime", "spotify-token.json"), "utf8")).disconnected, true);
    saveSpotifyTokens({ clientId: "new-id", clientSecret: "new-secret", refreshToken: "new-token" });
    assert.equal(getStoredSpotifyTokens().refreshToken, "new-token");
  } finally {
    process.chdir(previousCwd);
    globalThis.__spotifyTokens = previousMemory;
    envNames.forEach((name, index) => {
      if (previousEnv[index] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[index];
    });
  }
});

test("a persistence failure leaves the previous in-memory settings intact", () => {
  const previousCwd = process.cwd();
  const previousMemory = globalThis.__spotifyTokens;
  const directory = mkdtempSync(join(tmpdir(), "ascend-spotify-failure-"));
  try {
    process.chdir(directory);
    globalThis.__spotifyTokens = { clientId: "existing-id" };
    writeFileSync(join(directory, ".sites-runtime"), "blocking-file");
    assert.throws(() => saveSpotifyTokens({ clientId: "replacement-id" }));
    assert.equal(globalThis.__spotifyTokens.clientId, "existing-id");
    assert.throws(() => clearSpotifyTokens());
    assert.equal(globalThis.__spotifyTokens.clientId, "existing-id");
  } finally {
    process.chdir(previousCwd);
    globalThis.__spotifyTokens = previousMemory;
  }
});
