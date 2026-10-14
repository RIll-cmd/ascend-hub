# TV status and separate launcher acceptance

Verification started on 2026-10-03 and resumed on 2026-10-05 (Asia/Shanghai) against the approved [phased plan](../superpowers/plans/2026-10-02-tv-status-and-separate-launchers.md).

## Baseline and preservation

Hub source started at `a7cdfe2` with existing Spotify, CD-player, backdrop and texture edits. Changes are kept on `codex/tv-status-and-launchers`; no commits, merges or publishing were performed. Baseline page/CSS copies were used to derive only the TV edits.

Installed shortcuts both target `D:/ascend_hub/.worktrees/desktop-reliability/desktop/Start-Ascend.ps1`, with their own `-Target` and explicit `C:/Users/Cyrill Gerard/.ascend/desktop/profile.json`. That profile selects the Hub desktop-reliability checkout and the Vision desktop-reliability checkout, with its original Python/config/env paths. These paths and user data were preserved. Initial process inspection found no combined launcher owner.

The status changes were mirrored into the installed Hub using checked patches against that checkout's own page/CSS baseline. An independent reviewer verified the source/installed status files and identical baseline-relative edits; unrelated main edits were neither replaced nor transferred.

## Track A evidence

- Status suite: 72/72 in the current Hub checkout and 72/72 in the installed checkout. The current checkout now includes the two authenticated Hub health tests needed by its desktop launcher.
- Final scoped strict TypeScript and changed status/health component/model/test ESLint pass. Source/installed diff checks pass.
- Hub `npm run build` passes. Build output notes its existing route-classification limitation; that is separate from compilation.
- Independent browser acceptance passes 55 assertions: 34 lifecycle/layout/actions, 8 loading/media/playback, 6 actual control accessibility/player independence, 4 advancing age/hung-request recovery, and 3 empty-instance-ID rendering/detail/refresh checks.
- Both task reviews and the scoped accessibility/media re-review passed after fixes. Final review additionally found and fixed an empty instance ID render loop; the actual page guard regression passes in both checkouts.

The browser used controlled local status fixtures for idle, working, stuck, offline, first-load checking, missing reports, stale reports, unavailable/recovered feeds and disappeared instances. It confirmed that TV controls, detail headings and copied status agree on lifecycle/instance/freshness. Missing telemetry uses signal-loss media without inventing an offline report or repeating NO SIGNAL text. Expired evidence ages while refresh is still pending, then the bounded request fails and can recover.

Selection keeps videos mounted and uses a warm bezel light plus a small Fairy cue. Unchanged refresh preserves the original video element and its paused playback position. Media failure preserves working lifecycle/activity and produces a static fallback; a healthy focused player cannot clear an existing shelf player failure. Only blocked autoplay is classified as autoplay failure.

All four TVs open a visible CRT/details dialog with one Close. Mouse interaction, Tab trapping, Escape/focus return, copy feedback, refresh feedback, a 390 px sheet and reduced-motion video pausing were verified. Desktop/mobile screenshots were visually inspected.

| Evidence | Screenshot |
|---|---|
| Shelf before / after | [Before](tv-launcher-assets/shelf-before.png) · [After](tv-launcher-assets/shelf-after.png) |
| Focused details before / after | [Before](tv-launcher-assets/detail-before.png) · [After](tv-launcher-assets/detail-after.png) |
| Mobile sheet | [390 px](tv-launcher-assets/mobile-after.png) |
| Stale report | [Last known](tv-launcher-assets/stale-after.png) |
| Missing telemetry | [Unavailable](tv-launcher-assets/unavailable-after.png) |
| Independent media failure | [Static fallback](tv-launcher-assets/media-failure-after.png) |

## Track B evidence

Completed and independently verified on 2026-10-05. The installed desktop implementation and the consolidated `desktop/` directory are identical across 22 files. Only the existing authenticated Hub health route, runtime helper and two tests were additionally transferred into the current checkout. A final reviewer independently verified those mirrors and the status/page/CSS preservation proof; spec and quality review pass with no open findings.

All final gates passed under Windows PowerShell 5.1 and C:/Python314/python.exe:

- `Test-Supervisor.ps1`, including deterministic cancellation/generation races, kernel termination error with late exit, frozen lifecycle clocks and descendants remaining after the parent exits. The ordinary shutdown test waits for the actual 15-second deadline, then observes a later exit.
- `Test-Installer.ps1`, using temporary profiles and shortcuts to verify target, explicit profile, working directory, backup behavior and distinct icons.
- Both product `-SelfTest` invocations, which load native identity, XAML and bindings without starting the configured applications.
- `Test-LauncherLayout.ps1`, covering nine synthetic states, minimum/default widths, wrapping, recovery actions, unknown capabilities, WPF focus traversal and 100/150/200% transforms.
- `Test-NativeLaunchers.ps1`, which launches real offscreen WPF windows through cloned fixture shortcuts. Both windows run together, repeat Vision clicks restore its owner, stopping/closing Hub preserves Vision, and Vision closes after graceful fixture shutdown. Both windows are resized to 420 x 460; their actual Closing paths scroll the decision into the viewport and focus Cancel closing. Start/Open remain disabled during shutdown while diagnostics and Force stop remain usable.
- The final consolidated Hub build, 72 status/health tests, scoped strict TypeScript, changed-code ESLint and diff checks.

Vision uses the existing Fairy fallback eye geometry in an indigo/pearl composition, with separate verified chat, camera, microphone and Core labels. Hub uses a charcoal/brass console with separate interface and Core/status-feed labels. Unknown or absent capabilities say Not checked. Shared presentation/resources and one supervisor/process-host implementation serve both product windows. Static artwork performs no runtime readiness checks.

Each Windows owner/product has its own mutex, activation signal, native icon and AppUserModelID. A legacy combined owner is rejected with a close-first message. Disposal and force stop apply only to the product's owned Windows Job Object. Cancelled process creation retains the returned job until its emptiness is verified. Startup, uptime and shutdown clocks freeze separately; stop_failed displays the failed duration while continuing to observe a later exit. Post-ready failures preserve the completed startup duration and frozen uptime.

| Native evidence | Screenshot |
|---|---|
| Original combined launcher | [Before](tv-launcher-assets/launcher-before.png) |
| Vision ready | [100%](tv-launcher-assets/vision-ready-100.png) · [200%](tv-launcher-assets/vision-ready-200.png) |
| Hub ready | [100%](tv-launcher-assets/hub-ready-100.png) · [150%](tv-launcher-assets/hub-ready-150.png) |
| Explicit shutdown failure | [Vision](tv-launcher-assets/vision-stop_failed-100.png) · [Hub](tv-launcher-assets/hub-stop_failed-100.png) |

The 22 native captures render the actual XAML with synthetic states and opaque backgrounds. Scaled captures include the full composition. These images support the layout tests; process and recovery acceptance comes from the runtime fixtures above.

Both existing desktop shortcuts now use their distinct installed `desktop/assets/hub.ico` and `vision.ico` files. Only IconLocation changed. Target, Arguments, WorkingDirectory and Description were checked against the recorded baseline before and after saving. Original links are backed up at `C:/Users/Cyrill Gerard/.ascend/desktop/shortcut-backups/20261005T124920Z-67ea9221/`. The installed profile SHA256 remains `8A84C7972A959186D858A6D8DEEABB7DCC4F6597C9C94B7E8B52CDEC9EF72CFD`; its existing configuration, env and data paths were preserved. Existing shortcuts use the updated installed script on their next launch.

## Existing checks and environmental limits

Whole-project TypeScript still reports existing Spotify unknown-response typing errors. Whole-page ESLint also retains existing effects, notify-before-declaration and quoted-copy findings outside these edits; scoped changed status code checks pass. Validation used a temporary config excluding linked worktrees and scratch artifacts because the repository config includes them.

Actual camera/microphone/model/provider startup and live Core connectivity were not exercised. Scale checks use WPF transforms/render DPI, without changing Windows display settings; physical DPI behavior and Explorer/taskbar grouping remain manual checks. Cloned shortcut flows were tested through the Windows shell with fixture profiles, rather than starting the live installed Vision configuration. All destructive shutdown checks used owned fixture process trees. The existing headless Hub runtime may require Force stop after its bounded graceful-stop failure; the launcher now presents that recovery explicitly.
