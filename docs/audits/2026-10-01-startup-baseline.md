# Ascend desktop startup baseline — 2026-10-01

The owner reports that Vision/Hub startup sometimes freezes partway through. This audit records what was checked before the separate launchers were implemented. The actual intermittent freeze was not reproduced by these read-only checks; no camera or live model was started.

## Confirmed facts

| Check | Result |
|---|---|
| `D:/ascend-vision/run_live_camera.bat` target | It changes into `D:/ascend-vision/phone_watch`, which does not exist. This is a broken path if that wrapper is used. |
| Selected Vision runtime | `D:/ascend-vision/ascend-vision/.venv/Scripts/python.exe` exists. Its focused startup tests passed: 42/42. |
| Vision model assets | The selected checkout has `models/yolo26n.pt`, `models/hand_landmarker.task`, and `models/face_landmarker.task`. Presence does not prove model initialization will finish. |
| Fairy build | `D:/ascend-vision/ascend-vision/fairy-ui/dist/index.html` exists. The selected launcher build must still match its source. |
| Vision env/config | Both `config.yaml` and owner-managed `.env` exist at the nested checkout. Values were not inspected or copied. |
| Hub dependencies/build | Root `node_modules/vinext/dist/cli.js` and `dist/server/wrangler.json` exist. The built bundle predates this branch and does not contain the new health route. |
| Hub baseline tests | 39/39 status tests passed in an isolated worktree using the root dependency installation. |
| Hub full TypeScript check | Fails on pre-existing Spotify/page and status-video test type errors in the starting commit. No errors were reported in the newly added health files. This is not evidence of the reported startup freeze. |
| Hub development runtime | After an initial dependency optimization, a loopback-only Vinext run served authenticated `GET /api/health` with HTTP 200 and the expected instance/build IDs. A wrong token returned 403. The first run without explicit desktop bindings returned 503; desktop bindings were added to `vite.config.ts`. |
| Hub built runtime | `node scripts/run-framework.mjs build` completed, including `/api/health`, but Wrangler rejected the built asset directory at startup: `SHOWS/SHOW 9.mp4` is 52.7 MiB while its stated asset limit is 25 MiB. Several other SHOWS/COMMERCIALS files also exceed 25 MiB. This blocks the portable profile until video delivery is redesigned or assets are transformed. |

## Startup boundaries

Vision imports camera/ML libraries at module load and warms the detector before the Fairy HTTP server starts. Therefore, a slow import or warmup can make the UI appear to freeze before a browser page exists. Existing `CameraCapture` translates device failures into `CaptureError`, but the full Vision run exits on an uncaught startup exception. The planned launcher keeps its own UI responsive and reports the last known startup stage; the chat recovery host gives a useful mode if full Vision cannot initialize.

Hub's local launch documentation uses a Vinext development server on port 5173; `npm start` uses an existing Wrangler build. Hub shelf availability depends on Core and is not itself a Hub liveness test. The new launcher needs its own identity-checked health endpoint.

## Unknown until acceptance

- Which existing command the owner used during the freeze.
- Whether the stalled process is Python model initialization, camera access, Node/Vinext startup, or the browser UI.
- A matching thread stack or elapsed-time trace from the affected run.
- Whether the Hub development runtime remains stable over repeated long-running sessions; its first dependency optimization was noticeably slow.

The acceptance run must capture stage, elapsed time, process liveness, and an owner-safe diagnostic code when a stall occurs. Until then, the obsolete batch path is a separate confirmed defect, not an explanation for every freeze.
