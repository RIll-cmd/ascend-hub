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
