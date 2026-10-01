# Ascend desktop startup acceptance — 2026-10-01

**Status:** Local implementation acceptance is partial. The separate launchers, health handshakes, and recovery controls are implemented in isolated branches. Physical shortcut click, repeated sign-out/reboot sessions, and a two-hour use session remain owner acceptance. This report distinguishes those from automated fixtures and direct local process checks.

## Verified on this Windows machine

| Check | Result |
|---|---|
| Hub status tests | 41 passed, including two new authenticated health tests. |
| Vision focused tests | 49 passed across startup, Fairy bridge, camera, recovery host, and runtime health. |
| Fairy frontend | TypeScript/Vite build passed from the selected Vision worktree. |
| WPF launcher bootstrap | Windows PowerShell 5.1 `Start-Ascend.ps1 -SelfTest` loaded the XAML, compiled the process supervisor, bound controls, and exited 0. |
| Installer in an isolated test directory | Wrote a profile and two distinct `.lnk` files. Inspected both links: each targets the same launcher with `-Target Vision` or `-Target Hub`. No real desktop shortcut was replaced. |
| Supervisor fixture | A hung Hub hit its three-second startup deadline while Vision reached ready; the snapshot call stayed under one second. Early child exit, wrong health identity, safe diagnostics, and ten successive Hub/Vision fixture start/stop cycles passed. |
| Real local Hub + recovery Vision through supervisor | Hub reached ready and Vision recovery reached degraded but usable in 13.5 seconds. Vision reported chat ready, camera/microphone unavailable, AI configured but untested, and Core unchecked. Authenticated Vision Stop exited gracefully. |
| Real Hub development server | Bound to `127.0.0.1`; authenticated `/api/health` returned 200 with the expected instance/build; wrong token returned 403. An initial dependency optimization was slow but completed. |
| Full Vision one-shot startup | With feedback/hotkey/tray disabled for the test, model warmup, camera initialization, and a bounded one-second run completed with exit 0. |
| Full Fairy health and stop | Full Vision served Fairy with chat and camera ready. On this machine microphone initialization failed, and the corrected health reported microphone unavailable. An authenticated shutdown request returned 202; process cleaned up and exited 0. |

The full TypeScript check for Hub is not green at the starting commit: it reports existing Spotify/page and status-video test type errors outside these launcher changes. `node scripts/run-framework.mjs build` succeeded and included `/api/health`, but starting its Wrangler bundle failed because several bundled videos exceed Wrangler's stated 25 MiB asset limit. The installed profile therefore uses the validated local Vinext development runtime and labels the portable build unverified.

## Open release gates

- Full Vision's sensing and model initialization still run in its original process. The launcher stays responsive and offers chat recovery if it stalls, but a native camera/driver crash can still end full Vision. A separately isolated sensing worker is future work.
- The owner-reported intermittent freeze was not reproduced. Stage markers, elapsed time, timeout, and sanitized diagnostics are in place to capture the next occurrence.
- The built Hub runtime needs a design for large local videos before it can replace the development runtime.
- A human needs to click both installed shortcuts, confirm they open the intended UIs, and verify the 10-cycle/three-reboot/two-hour checks on normal use. The fixture cycles are not physical camera cycles.
- Hub's headless dev process may require Force stop after its graceful 15-second window. Vision has a tested authenticated graceful Stop path.

No GitHub push or production deployment was performed. The original implementation plan is `D:/ascend_hub/docs/superpowers/plans/2026-10-01-ascend-desktop-reliable-startup.md` in the main Hub checkout.
