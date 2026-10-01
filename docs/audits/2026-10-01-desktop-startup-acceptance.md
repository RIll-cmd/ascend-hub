# Ascend desktop startup acceptance — 2026-10-01

**Status:** Local implementation acceptance is partial. The separate launchers, health handshakes, and recovery controls are implemented in isolated branches. Physical shortcut click, repeated sign-out/reboot sessions, and a two-hour use session remain owner acceptance. This report distinguishes those from automated fixtures and direct local process checks.

## Verified on this Windows machine

| Check | Result |
|---|---|
| Hub status tests | 41 passed, including two new authenticated health tests. |
| Vision focused tests | 49 passed across startup, Fairy bridge, camera, recovery host, and runtime health. |
| Full Vision suite | 1,124 passed, 20 skipped, one dependency deprecation warning. |
| Fairy frontend | TypeScript/Vite build passed from the selected Vision worktree. |
| WPF launcher bootstrap | Windows PowerShell 5.1 `Start-Ascend.ps1 -SelfTest` loaded the XAML, compiled the process supervisor, bound controls, and exited 0. |
| Installer in an isolated test directory | Wrote a profile and two distinct `.lnk` files. Inspected both links: each targets the same launcher with `-Target Vision` or `-Target Hub`. No real desktop shortcut was replaced. |
| Supervisor fixture | A hung Hub hit its three-second startup deadline while Vision reached ready; the snapshot call stayed under one second. Early child exit, wrong health identity, safe diagnostics, and ten successive Hub/Vision fixture start/stop cycles passed. |
| Real local Hub + recovery Vision through supervisor | Hub reached ready and Vision recovery reached degraded but usable in 13.5 seconds. Vision reported chat ready, camera/microphone unavailable, AI configured but untested, and Core unchecked. Authenticated Vision Stop exited gracefully. |
| Real Hub development server | Bound to `127.0.0.1`; authenticated `/api/health` returned 200 with the expected instance/build; wrong token returned 403. An initial dependency optimization was slow but completed. |
| Installed local shortcuts/profile | Two new desktop links and a profile were created without replacing existing links. Vision code uses the isolated checkout but its original `config.yaml` and `.env`, preserving the existing data paths. The installed-profile supervisor check reached Hub ready and Vision recovery usable in 14.1 seconds, then stopped Vision gracefully. This was a scripted check, not a physical shortcut click. |
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

## Follow-up after first desktop screenshot — 2026-10-02

The owner's first Hub shortcut click showed `supervisor-error` within two seconds, a misleading missing-profile message, clipped controls, and `Â·` text. The installed profile existed. The shortcut did not pass its path explicitly; a missing profile was collapsed to a generic error. The layout test reproduced the clipped force-stop action at the old window size. The text was a UTF-8 character interpreted by Windows PowerShell 5.1 without a byte-order mark.

The shortcuts now pass the absolute profile path; the supervisor reports `profile-missing` with repair guidance. Both action cards size to their content, with vertical scrolling at compact window sizes, and the launcher script uses ASCII separators. An attempted forced reinstall found a separate Windows EFS behavior: `File.Replace` was denied in this owner's encrypted LocalAppData folder. The installer now retains a backup and falls back to copy-overwrite only for that access-denied case. The encrypted-folder installer test, ordinary installer test, layout test, ten-cycle supervisor fixture, launcher self-check, and a live Hub plus Vision recovery run using the reinstalled profile passed. The live run took 50.4 seconds for both services to become usable and shut down its owned processes afterward. The new shortcuts and profile were verified on disk. A new physical Explorer shortcut click remains the next acceptance check; this report does not claim the earlier on-screen failure is resolved until that click succeeds.
