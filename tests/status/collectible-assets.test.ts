import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import test from "node:test";
import { COLLECTIBLES } from "../../app/collectibles";

const heavy = ["boombox", "headphones", "skateboard"];

test("every local collectible image exists in public", () => {
  for (const c of COLLECTIBLES) for (const src of [c.offSrc, c.onSrc]) if (src.startsWith("/")) assert.ok(existsSync(`public${src}`), src);
});

test("the heavy shelf art is served as WebP under 400 KB each", () => {
  for (const id of heavy) {
    const c = COLLECTIBLES.find(item => item.id === id)!;
    assert.match(c.offSrc, /\.webp$/);
    assert.ok(statSync(`public${c.offSrc}`).size < 400 * 1024, c.offSrc);
  }
});

test("the TV iframe background and anchor art are served as WebP", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile("public/zzz-tv/index.html", "utf8");
  const anchors = await readFile("public/zzz-tv/script/anchor_config.js", "utf8");
  const weather = await readFile("public/zzz-tv/script/weather_channel.js", "utf8");
  assert.match(html, /resource\/image\/zzz_background_crt_cutout_blur\.webp/);
  assert.doesNotMatch(anchors + weather, /von_lycaon\.png/);
  assert.ok(statSync("public/zzz-tv/resource/image/zzz_background_crt_cutout_blur.webp").size < 700 * 1024);
  assert.ok(statSync("public/zzz-tv/resource/anchor/von_lycaon.webp").size < 200 * 1024);
});
