# Lightweight Hub — design

Date: 2026-10-14. Status: approved in chat, awaiting spec review.

## Goal

Hub now hosts the Agent Room orchestrator, so it stays open all day. It must use little RAM and load fast without losing features.

## Baseline (measured 2026-10-14, main checkout)

| What | Now |
| --- | --- |
| Hub server (`npm run dev`, Vite dev + Miniflare) | 283 MB working set, 1,091 MB private, plus a `workerd` child (it had crashed, leaving every page at 500 `fetch failed`) |
| Same build under `vinext start` | 140 MB working set, 205 MB private, no `workerd` |
| Agent room process | 36 MB private |
| Home page (production build) | 9.9 MB over 50 requests; load event at 16.4 s |
| Largest home-page downloads | `shelf-assets/boombox-cream.png` 2.2 MB, `ascend-hub-staircase.png` 1.8 MB, `shelf-assets/skateboard-orange.png` 1.6 MB, `shelf-assets/headphones-bottle-orange.png` 1.4 MB, four `TV-STATUS/offline.mp4` loads with `preload="auto"` (about 1 MB) |
| Re-render pressure | `useStatusShelf` sets `nowMs` every second at the top of the 2,600-line `Home` component |
| Room deck | renders every animation frame at up to 60 fps with PCF soft shadows, pixel ratio up to 2 |

The Wrangler production mode (`npm start`) cannot run: Workers assets are capped at 25 MiB and the TV library has larger videos. That is why the desktop launcher uses the dev runtime.

## Design

### 1. Production serving (`npm run serve`)

- New command: `node scripts/run-framework.mjs serve`.
- It starts the agent room process (the same `startAgentRoom()` that `dev` uses).
- It builds first only when the build is stale. Stale means `dist/` is missing, or the stamp file `dist/.build-stamp` differs from the current source stamp. The source stamp is the `HEAD` commit hash plus a hash of `git status --porcelain` output.
- It then runs `vinext start --port 5173 --hostname 127.0.0.1`.
- `vinext start` loads `.env.local` itself, so the room token reaches the room routes.
- Binding to `127.0.0.1` replaces the Vite-only loopback guard: the server is unreachable from the LAN.
- `npm run dev` is unchanged for development.
- `build` writes the stamp after a successful build.

### 2. Lighter images

- Add WebP versions next to the PNGs for the four heavy images (boombox, skateboard, headphones, staircase poster) and the CRT/iMac collectibles (about 150 KB each).
- Each is resized to at most twice its largest displayed CSS size.
- Point the page references (`app/collectibles.ts`, the poster `<img>` in `app/page.tsx`, the deck poster texture) at the WebP files.
- The originals stay in `public/` untouched.
- Target: under 1 MB for the four heavy images combined.

### 3. Lazy status video

- `ShelfStatusTv` videos use `preload="metadata"`.
- A video loads its data only when it actually plays.

### 4. No whole-page tick

- The one-second `nowMs` clock leaves `useStatusShelf`.
- Components that show relative time get it from a small `useNow(intervalMs)` hook, so only they re-render.
- The 3-second status poll stays.

### 5. Cheaper deck

- The scene renders at most 30 fps.
- When nothing is moving (no fresh pulses, no busy agent, no camera drag), it drops to about 5 fps.
- Blinks and gaze still animate at the idle rate.
- Any change in the view model, a pointer event or a resize wakes it back to 30 fps.
- Pixel ratio is capped at 1.5.

## Success criteria

- The Hub server under `npm run serve` stays under 300 MB private after loading `/` and `/room` three times each.
- The home page transfers under 2 MB and its load event fires under 3 s on localhost.
- `/room` works end to end: status, start form, and live deck.
- `/api/room` is unreachable from a LAN address under `serve`.
- Existing test suites, `tsc`, eslint on touched files, and `npm run build` pass.

## Out of scope

- The desktop launcher's runtime choice. Adding a `vinext start` mode lives in `desktop/Supervisor.cs` on Codex's `codex/desktop-reliability` branch, which is blocked; record it as follow-up.
- Removing videos or features.
- CSS pruning.
- Framework changes.
- Copying 1.1 GB of `public/` media into `dist/` on each build (slow builds, not runtime cost).

## Testing

- `run-framework` staleness: a unit test of the stamp function (same input gives same stamp; a changed `HEAD` or dirty state gives a different one).
- `useNow`: a test that a consumer re-renders on tick and `Home`-level state no longer ticks (static check that `useStatusShelf` has no 1-second interval).
- Deck frame pacing: a pure `frameInterval(view, activity)` function, unit tested for 30 fps active and 5 fps idle.
- Images: a test that every `app/collectibles.ts` image path exists in `public/`.
- Live: measure RAM and page load again with the same scripts as the baseline.

## Results (measured 2026-10-14 after implementation)

| What | Before | After |
| --- | --- | --- |
| Hub server | 283 MB working set, 1,091 MB private (`npm run dev`, plus `workerd`) | 117 MB working set, 154 MB private (`npm run serve`, after `/`, `/room` and `/api/room` three times each) |
| Agent room process | 36 MB private | 36 MB private |
| `serve` start | — | first run builds and starts in about 15 s; later runs start in about 2 s |
| Home page (page only) | 9.9 MB, load event 16.4 s | 2.2 MB, load event 0.46 s |
| TV iframe (`/zzz-tv/index.html`) | 10.3 MB (not counted in the first baseline) | 4.8 MB |
| Heavy shelf art and poster | 7.1 MB PNG | 191 KB WebP |
| TV background and anchor | 5.7 MB PNG | 251 KB WebP |
| Status clock | re-renders `Home` every 1 s | every 10 s, every 1 s only while a status detail is open |
| Room deck | up to 60 fps, pixel ratio 2 | 30 fps moving, 8 fps idle, pixel ratio 1.5 |

The home page is just above the 2 MB target. What remains is the page's own JavaScript and CSS (about 1 MB) and the four autoplaying status videos (about 1 MB). The TV iframe's biggest remaining file is the 2.9 MB opening video. Both are features, so they were kept.

`/api/room` refuses LAN connections under `serve`, because the server listens on 127.0.0.1 only.
