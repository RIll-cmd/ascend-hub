# Lightweight Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hub runs from a production build with far less RAM. The home page downloads far less, and the shelf and room deck stop doing work nobody sees.

**Architecture:** A new `serve` mode in `scripts/run-framework.mjs` rebuilds only when the source stamp changed, then runs `vinext start` on 127.0.0.1. The page-side changes are local:
- WebP copies of heavy images;
- `preload="metadata"` on status videos;
- a `useNow` clock owned by `Home`, which ticks every 10 s unless a status TV detail is open;
- a pure frame-pacing function for the room deck.

**Tech Stack:** Node 22+ ESM scripts, Vinext 1.0.1 (`vinext start`), React 19, three 0.186. Tests run with `node --test` and `tsx --test`. WebP files are generated once with the `sharp` copy already in `node_modules`, used from a scratch script that is not committed.

**Spec:** `docs/superpowers/specs/2026-10-14-hub-lightweight-design.md`

## Global Constraints

- Commits carry no Claude co-author or attribution lines (owner rule).
- `npm run dev` behaviour stays unchanged.
- The production server binds `127.0.0.1` only.
- Original PNGs stay in `public/`; WebP files are added beside them.
- Do not add npm dependencies.
- Do not commit `.env.local`, `ASCEND_HANDOFF.md`, or anything under `.sites-runtime/`.
- Hub tests: `npx --no-install tsx --test tests/agent-room/*.test.ts`. Room tests: `node --no-warnings --test tests/agent-room/*.test.mjs`. Status tests: `npm run test:status`. Also `npx --no-install tsc --noEmit` and `npm run build`.

## Review Focus

1. A source file edited twice while uncommitted must still trigger a rebuild. `git status --porcelain` alone would not change, so the stamp hashes `git diff HEAD` too.
2. A failed build under `serve` must not start the old or missing `dist/`; `serve` exits non-zero.
3. Untracked new source files must change the stamp. The stamp includes their names, sizes and mtimes.
4. At the idle frame rate the deck must not skip blinks. The idle interval (125 ms) is shorter than a blink (140 ms).
5. Freshness and age labels in an open status TV detail still update every second.

---

### Task 1: Production `serve` mode with a build stamp

**Files:**
- Create: `scripts/build-stamp.mjs`
- Modify: `scripts/run-framework.mjs`, `package.json` (add `"serve"`), `README.md` (one paragraph)
- Test: `tests/hub/build-stamp.test.mjs`

**Interfaces:**
- Produces:
  - `sourceStamp({ head, diff, untracked }: { head: string; diff: string; untracked: string }): string` returns a hex sha256.
  - `readSourceStamp(root: string): string` runs git and calls `sourceStamp`.
  - `isBuildFresh(root: string, stamp: string): boolean`.
  - `writeBuildStamp(root: string, stamp: string): void`.
  - The stamp file is `dist/.build-stamp`.

- [ ] **Step 1: Write the failing test**

```js
// tests/hub/build-stamp.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { isBuildFresh, sourceStamp, writeBuildStamp } from '../../scripts/build-stamp.mjs';

const base = { head: 'abc123', diff: '', untracked: '' };

test('same sources give the same stamp', () => {
  assert.equal(sourceStamp(base), sourceStamp({ ...base }));
});

test('a new commit, a second edit to a dirty file, or a new untracked file changes the stamp', () => {
  const stamp = sourceStamp(base);
  assert.notEqual(sourceStamp({ ...base, head: 'def456' }), stamp);
  assert.notEqual(sourceStamp({ ...base, diff: '+a' }), sourceStamp({ ...base, diff: '+ab' }));
  assert.notEqual(sourceStamp({ ...base, untracked: 'app/new.ts 10 1' }), stamp);
});

test('a build is fresh only when dist holds the matching stamp', () => {
  const root = mkdtempSync(join(tmpdir(), 'stamp-'));
  assert.equal(isBuildFresh(root, 'x'), false);
  mkdirSync(join(root, 'dist'));
  writeBuildStamp(root, 'x');
  assert.equal(isBuildFresh(root, 'x'), true);
  assert.equal(isBuildFresh(root, 'y'), false);
  writeFileSync(join(root, 'dist', '.build-stamp'), '');
  assert.equal(isBuildFresh(root, ''), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --no-warnings --test tests/hub/build-stamp.test.mjs`
Expected: FAIL. `Cannot find module ... scripts/build-stamp.mjs`.

- [ ] **Step 3: Implement `scripts/build-stamp.mjs`**

```js
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAMP = join('dist', '.build-stamp');

export function sourceStamp({ head, diff, untracked }) {
  return createHash('sha256').update(`${head}\0${diff}\0${untracked}`).digest('hex');
}

// The diff catches repeated edits to an already-dirty file; names, sizes and mtimes catch new untracked files.
export function readSourceStamp(root) {
  const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)
    .map(file => { const s = statSync(join(root, file)); return `${file} ${s.size} ${s.mtimeMs}`; }).join('\n');
  return sourceStamp({ head: git('rev-parse', 'HEAD').trim(), diff: git('diff', 'HEAD', '--binary'), untracked });
}

export function isBuildFresh(root, stamp) {
  const file = join(root, STAMP);
  return Boolean(stamp) && existsSync(file) && readFileSync(file, 'utf8').trim() === stamp;
}

export function writeBuildStamp(root, stamp) {
  writeFileSync(join(root, STAMP), `${stamp}\n`);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --no-warnings --test tests/hub/build-stamp.test.mjs`
Expected: PASS 3/3.

- [ ] **Step 5: Wire `serve` into `scripts/run-framework.mjs`**

Allow `serve` in the command check:

```js
if (!["dev", "build", "serve"].includes(command)) throw new Error("Expected dev, build or serve.");
```

Insert this before the final vinext import block:

```js
// serve: production build on loopback only. Rebuilds only when sources changed since the last build.
if (command === "serve" && !managedLinux) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const stamp = readSourceStamp(root);
  if (!isBuildFresh(root, stamp)) {
    const built = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "build"], { cwd: root, stdio: "inherit" });
    if (built.status !== 0) process.exit(built.status ?? 1);
    writeBuildStamp(root, stamp);
  }
  startAgentRoom();
}
```

Change the CLI argument line so `serve` maps to `vinext start`:

```js
const vinextCommand = command === "serve" ? "start" : command;
process.argv = [process.execPath, fileURLToPath(cli), vinextCommand,
  ...(!managedLinux && command === "dev" ? ["--port", "5173", "--host", "0.0.0.0"] : []),
  ...(!managedLinux && command === "serve" ? ["--port", "5173", "--hostname", "127.0.0.1"] : []), ...args];
```

Add the import: `import { isBuildFresh, readSourceStamp, writeBuildStamp } from "./build-stamp.mjs";`

The stamp is read before the build. A build that changes tracked files would change the next stamp and trigger one extra rebuild. That is acceptable: builds write only to ignored `dist/`.

- [ ] **Step 6: Add the npm script and README paragraph**

`package.json` scripts: `"serve": "node scripts/run-framework.mjs serve",`

README, under the run/dev section:

> `npm run serve` runs Hub from a production build on `http://127.0.0.1:5173`, together with the agent room. It rebuilds only when the source changed since the last build. Use it for everyday use; it needs far less memory than `npm run dev`. It listens on this computer only.

- [ ] **Step 7: Live check**

Stop anything on 5173 first. Run `npm run serve` in the background.
- The first run builds.
- `curl http://127.0.0.1:5173/`, `/room` and `/api/room` each return 200.
- `curl http://<LAN IP>:5173/` is refused.

Stop it and run again: there's no rebuild, and it starts in under 5 s. Stop it.

- [ ] **Step 8: Commit**

```bash
git add scripts/build-stamp.mjs scripts/run-framework.mjs package.json README.md tests/hub/build-stamp.test.mjs
git commit -m "feat(hub): serve mode runs the production build on loopback and rebuilds only when sources change"
```

---

### Task 2: WebP images for the heavy shelf art

**Files:**
- Create: `public/shelf-assets/{boombox-cream,skateboard-orange,headphones-bottle-orange}.webp`, `public/ascend-hub-staircase.webp`, `public/crt-tvs-and-imac/*-removebg-preview.webp`
- Modify: `app/collectibles.ts`, `app/page.tsx` (poster `<img>`), `app/room/deck/room.ts` (poster texture), `components/crt-tv-config.ts`
- Test: `tests/status/collectible-assets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: WebP paths with the same base names as the PNGs.

- [ ] **Step 1: Write the failing test**

```ts
// tests/status/collectible-assets.test.ts
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import test from "node:test";
import { COLLECTIBLES } from "../../app/collectibles";

const heavy = ["boombox", "headphones", "skateboard"];

test("every collectible image exists in public", () => {
  for (const c of COLLECTIBLES) for (const src of [c.offSrc, c.onSrc]) assert.ok(existsSync(`public${src}`), src);
});

test("the heavy shelf art is served as WebP under 400 KB each", () => {
  for (const id of heavy) {
    const c = COLLECTIBLES.find(item => item.id === id)!;
    assert.match(c.offSrc, /\.webp$/);
    assert.ok(statSync(`public${c.offSrc}`).size < 400 * 1024, c.offSrc);
  }
});
```

(Use the actual export name from `app/collectibles.ts`; check it with `grep -n "export" app/collectibles.ts` before writing.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx --no-install tsx --test tests/status/collectible-assets.test.ts`
Expected: the first test passes; the second fails on `/\.webp$/`.

- [ ] **Step 3: Measure display sizes**

With a server running, read each image's largest `getBoundingClientRect()` width and height on `/`. Read the poster at its framed size. Target size = `min(natural, 2 × displayed)`.

- [ ] **Step 4: Generate the WebP files**

Use a scratch script (not committed) that calls `sharp(src).resize({ width, height, fit: "inside", withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90 })`. It writes each `.webp` beside its `.png`.

- [ ] **Step 5: Point the references at WebP**

In `app/collectibles.ts`, the poster `<img src>` in `app/page.tsx`, `room.ts`'s `TextureLoader().load(...)`, and `components/crt-tv-config.ts`, change `.png` to `.webp` for the generated files only.

- [ ] **Step 6: Run tests**

Run: `npx --no-install tsx --test tests/status/collectible-assets.test.ts`, then `npm run test:status`.
Expected: all pass.

- [ ] **Step 7: Visual check**

Load `/` and `/room` and compare the shelf and the poster with before; there should be no visible loss.

- [ ] **Step 8: Commit**

```bash
git add public/shelf-assets/*.webp public/ascend-hub-staircase.webp public/crt-tvs-and-imac/*.webp app/collectibles.ts app/page.tsx app/room/deck/room.ts components/crt-tv-config.ts tests/status/collectible-assets.test.ts
git commit -m "perf(hub): serve the shelf art and poster as resized WebP"
```

---

### Task 3: Status TV video loads lazily

**Files:**
- Modify: `components/status/ShelfStatusTv.tsx:89`
- Test: `tests/status/status-video.test.ts` (append)

- [ ] **Step 1: Write the failing test** (append)

```ts
test("status TV video only preloads metadata", async () => {
  const source = await readFile("components/status/ShelfStatusTv.tsx", "utf8");
  assert.match(source, /<video[\s\S]*?preload="metadata"/);
  assert.doesNotMatch(source, /preload="auto"/);
});
```

(Add `import { readFile } from "node:fs/promises";` if the file lacks it.)

- [ ] **Step 2: Run** `npx --no-install tsx --test tests/status/status-video.test.ts`. Expected: FAIL on `preload="metadata"`.
- [ ] **Step 3:** In `ShelfStatusTv.tsx`, change `preload="auto"` to `preload="metadata"`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add components/status/ShelfStatusTv.tsx tests/status/status-video.test.ts
git commit -m "perf(hub): status TV videos preload metadata only"
```

---

### Task 4: The shelf clock no longer re-renders Home every second

**Files:**
- Create: `app/status/use-now.ts`
- Modify: `app/status/use-status-shelf.ts` (remove `nowMs`, `setNowMs`, the 1 s `setInterval` and its cleanup, and `updateClock`; keep polling), `app/page.tsx` (use `useNow` after `focusedStatusTv` and replace the five `shelfStatus.nowMs` uses)
- Test: `tests/status/use-now.test.ts`

**Interfaces:**
- Produces:
  - `statusClockMs(detailOpen: boolean): number`, which returns 1000 when open and 10000 when closed.
  - `useNow(intervalMs: number): number`, which ticks at `intervalMs`, refreshes immediately on `visibilitychange` and window `focus`, and returns `Date.now()`-based ms.

- [ ] **Step 1: Write the failing test**

```ts
// tests/status/use-now.test.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { statusClockMs } from "../../app/status/use-now";

test("the shelf clock ticks every second only while a status TV detail is open", () => {
  assert.equal(statusClockMs(true), 1_000);
  assert.equal(statusClockMs(false), 10_000);
});

test("the status poll hook no longer owns a clock", async () => {
  const source = await readFile("app/status/use-status-shelf.ts", "utf8");
  assert.doesNotMatch(source, /setInterval|nowMs/);
});
```

- [ ] **Step 2: Run** `npx --no-install tsx --test tests/status/use-now.test.ts`. Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement `app/status/use-now.ts`**

```ts
"use client";

import { useEffect, useState } from "react";

// Relative ages need second precision only in an open status detail; elsewhere a slow tick keeps Home from re-rendering.
export function statusClockMs(detailOpen: boolean): number {
  return detailOpen ? 1_000 : 10_000;
}

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [intervalMs]);
  return now;
}
```

- [ ] **Step 4: Remove the clock from `use-status-shelf.ts`**

Delete `const [nowMs, setNowMs] = useState(...)`, `const updateClock = ...`, `const clock = setInterval(updateClock, 1_000);`, the `updateClock();` call in `refreshWhenVisible`, and `clearInterval(clock);`. Return `{ ...state, refresh: poll }`. Drop `useState` from the import if it's now unused.

- [ ] **Step 5: Use `useNow` in `app/page.tsx`**

Right after the `focusedStatusTv` state declaration (around line 366):

```ts
const nowMs = useNow(statusClockMs(focusedStatusTv !== null));
```

Replace every `shelfStatus.nowMs` with `nowMs`, including the `useMemo` dependency list. Import `{ statusClockMs, useNow }` from `"./status/use-now"`.

- [ ] **Step 6: Run** `npx --no-install tsx --test tests/status/use-now.test.ts`, `npm run test:status` and `npx --no-install tsc --noEmit`. Expected: all pass.
- [ ] **Step 7: Live check.** Open a status TV detail; `XS AGO` counts each second. Close it; the shelf still shows status.
- [ ] **Step 8: Commit**

```bash
git add app/status/use-now.ts app/status/use-status-shelf.ts app/page.tsx tests/status/use-now.test.ts
git commit -m "perf(hub): shelf clock ticks every 10s unless a status detail is open"
```

---

### Task 5: Room deck frame pacing

**Files:**
- Modify: `app/room/deck/deck-view.ts` (add `frameIntervalMs`), `app/room/deck/scene.ts` (use it; pixel ratio 1.5)
- Test: `tests/agent-room/deck-view.test.ts` (append)

**Interfaces:**
- Produces: `frameIntervalMs(moving: boolean): number` returns `33` when moving and `125` when idle.

- [ ] **Step 1: Write the failing test** (append)

```ts
test("the deck renders at 30 fps while moving and 8 fps idle, fast enough to show a 140 ms blink", () => {
  assert.equal(frameIntervalMs(true), 33);
  assert.equal(frameIntervalMs(false), 125);
  assert.ok(frameIntervalMs(false) < 140);
});
```

(Add `frameIntervalMs` to the existing import from `../../app/room/deck/deck-view`.)

- [ ] **Step 2: Run** `npx --no-install tsx --test tests/agent-room/deck-view.test.ts`. Expected: FAIL. `frameIntervalMs` is not a function.

- [ ] **Step 3: Implement in `deck-view.ts`**

```ts
// Frame budget for the deck: smooth while something moves, a trickle when idle (still under one 140 ms blink).
export function frameIntervalMs(moving: boolean): number {
  return moving ? 33 : 125;
}
```

- [ ] **Step 4: Use it in `scene.ts`**

Replace `if (!moving && now - lastRender < 33) return;` with:

```ts
if (now - lastRender < frameIntervalMs(moving)) return;
```

Import `frameIntervalMs` from `./deck-view`. Change `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));` to `Math.min(window.devicePixelRatio, 1.5)`.

- [ ] **Step 5: Run** the deck-view and deck-draw tests and `tsc`. Expected: PASS.
- [ ] **Step 6: Live check.** On `/room`, CRTs blink and look around, pulses still glide, and the drag tilt still eases.
- [ ] **Step 7: Commit**

```bash
git add app/room/deck/deck-view.ts app/room/deck/scene.ts tests/agent-room/deck-view.test.ts
git commit -m "perf(agent-room): deck renders at 30 fps moving, 8 fps idle, pixel ratio 1.5"
```

---

### Task 6: Measure against the baseline and record

**Files:**
- Modify: `docs/superpowers/specs/2026-10-14-hub-lightweight-design.md` (add a Results section), `ASCEND_HANDOFF.md` (Current session; stays uncommitted)

- [ ] **Step 1:** Run `npm run serve`. Load `/` and `/room` three times each. Record the server's working set and private memory (PowerShell `Get-Process`).
- [ ] **Step 2:** In the browser pane, run the same performance script as the baseline on `/`: requests, transferred KB, load event, and JS heap. Also count the resources of the `/zzz-tv/index.html` iframe, which the baseline did not count.
- [ ] **Step 3:** Run all suites, `tsc`, eslint on touched files, and `npm run build`.
- [ ] **Step 4:** Write a Results table into the spec. Commit:

```bash
git add docs/superpowers/specs/2026-10-14-hub-lightweight-design.md
git commit -m "docs: lightweight Hub results"
```
