# Hub TV Status and Separate Product Launchers — Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement the approved tasks in order. Check off steps only after verification. This document is a proposal, not authorization to begin implementation.

**Date:** 2026-10-02

**Goal:** Make Hub TVs visually clean and truthful, improve their clicked detail view, and give Vision and Hub genuinely separate, product-specific desktop launch windows.

**Architecture:** Keep Core as the authority for shelf reports and derive one presentation model for both the TV and its detail view. Keep the existing native Windows launcher technology and shared supervisor code, but separate product windows, process ownership, and appearance.

**Tech stack:** Existing React/TypeScript, CSS and motion layer; existing PowerShell/WPF and C# supervisor. Reuse the four local status videos. No new cloud service or desktop framework.

**Spec:** The design brief and acceptance requirements in sections 1–5 below, based on the user's five screenshots and inspected source.

**Status:** Plan only. No application code, installed shortcuts, profiles, or running processes changed for this plan.

## 1. Scope and design brief

The user needs to identify an agent's real status at a glance, click its TV for useful details, and start either desktop product without a generic combined launcher or ambiguous frozen state.

Two independently deliverable tracks:

- **Track A — Hub shelf and detail view:** Preserve the wooden shelf, physical CRTs, wallpaper and existing video assets. Remove external cyan decoration and duplicated status copy; make selection and status independent.
- **Track B — Product launchers:** Preserve the startup engine and recovery controls. Replace the combined two-card window with two distinct native windows, icons, and product-specific information.

### Global constraints

- Do not redesign the standalone Fairy eye, its face tracking, chat, or speech animation in this change.
- Remove the blue rectangular selection outline, external blue shadow and `SELECTED` tag. Keep natural physical TV shadows and light contained inside the screen.
- Do not remove keyboard focus visibility globally. Use a restrained, high-contrast focus indicator on the TV control, visible for keyboard navigation only.
- No additional `NO SIGNAL` box/text over a video that already communicates signal loss.
- Unknown, stale and offline are different facts. Never invent agent completion or connectivity.
- Idle does not mean a task completed successfully. An accessible web UI does not mean Core is connected.
- Keep read-only status views read-only. No new remote commands, shell controls or agent mutations.
- Preserve unrelated Spotify, backdrop, CD-player and other work in the dirty main checkout.
- Planning and UI work must not merge branches, publish changes, rotate credentials, or stop existing user sessions without a separate reason/authorization.

## 2. What inspection found

These are source-level findings, not a claim that every scenario was reproduced live.

| Finding | Relevant source | Planned correction |
|---|---|---|
| Selection explicitly adds a cyan outline, drop shadow and `SELECTED` text. | `app/globals.css`, `.shelf-status-tv-trigger.is-vision-eye-selected` | Remove those rules; use a small bezel selection marker. |
| Text badges and detail copy render over status videos. Unavailable reports have no video mapping. | `components/status/ShelfStatusTv.tsx`, `status-video.ts` | Video-led screen, with explanations in the detail view instead of repeated overlays. |
| `LIVE` depends on `stale`, not on having a valid report. | `ShelfStatusTv.tsx` | Derive freshness explicitly; never display live for missing evidence. |
| A selected TV keeps the Fairy eye layer active, hiding its status video. | `vision-eye-navigation.ts`, `ShelfStatusTv.tsx` | Selection must not replace the authoritative video. |
| The detail panel repeats the same unavailable message and offers another Zoom out action. | `AgentAuxiliaryPanel.tsx`, `agent-auxiliary-model.ts`, `app/page.tsx` | One state, one explanation, one close action. |
| Displayed heartbeat age uses the snapshot's generated time as `now`. | `app/page.tsx` | Use advancing local time and validated timestamps; age cached reports honestly. |
| Both shortcuts open the same XAML and share one application mutex. | `desktop/Start-Ascend.ps1`, `Launcher.xaml` | Separate product windows and per-product ownership locks. |
| Shutdown timeout updates the message but leaves the state at `stopping`; the timer measures time since launch. | `desktop/Supervisor.cs` | Explicit stop-timeout outcome, truthful stage timing and recovery action. |

### Source locations and execution safety

- Main Hub checkout: `D:/ascend_hub` — contains unrelated uncommitted changes, including `app/page.tsx` and `app/globals.css`.
- Inspected launcher implementation: `D:/ascend_hub/.worktrees/desktop-reliability`.
- Installed Vision source referenced by the launcher: `D:/ascend-vision/.worktrees/desktop-reliability/ascend-vision`.
- Before execution, verify the active checkout and installed shortcut targets. Apply narrow changes against the appropriate current files; never replace main's page/CSS wholesale with the worktree versions.
- Keep profile paths and existing Vision configuration/data locations intact. Do not create a second installation or change where approved memory is stored.

## 3. Track A design: the TV is the status display

### A. Shelf appearance

- Preserve the real CRT case, shelf lighting and screen effects that do not obscure content.
- Use the supplied `idle.mp4`, `working.mp4`, `stuck.mp4`, and `offline.mp4` from `public/TV-STATUS`.
- Remove external cyan glows and the cubby-sized outline, including on pointer selection.
- Move channel/service identification to a compact label outside the video, aligned with the TV/bezel. Do not cover the character or embedded video text.
- Indicate selection with a small warm bezel light, not a surrounding box. Keyboard focus uses an additional visible neutral/warm marker.
- Retain Fairy navigation as a small selection cue; the selected TV must keep playing its status video. Do not leave an eye covering the status indefinitely.
- Keep the same crop and playback behavior for a given state across shelf and focused views. Re-renders and unchanged polls must not restart the video.

### B. One status model, two consumers

Treat **reported lifecycle**, **report freshness**, and **media availability** separately. Both the TV and details consume the same derived result for the same service instance.

| Evidence | TV visual | Detail view / accessible description |
|---|---|---|
| Fresh idle report | Idle video | Idle; latest report age. No completion claim. |
| Fresh working report | Working video | Working; reported task/progress if supplied. |
| Fresh stuck report | Stuck video | Needs attention; reported issue and retry information if supplied. |
| Fresh offline report | Offline video | Offline, as reported by its producer. |
| First load, no evidence yet | Neutral static CRT/loading treatment | Checking status. No `LIVE` label. |
| Missing instance or unavailable feed, no cached report | Offline/signal-loss video as a visual fallback | Status unavailable, with the actual reason. This is not an offline lifecycle report. |
| Cached report becomes stale | Last-known video with a subdued treatment; one `Last known` label outside the screen | Last known working/idle/etc.; report age and unavailable/stale reason. Never live. |
| Video fails to load or autoplay | Static CRT fallback, no repeated retry loop | Preserve the real lifecycle; explain the media problem separately. |

The signal-loss clip is reused for missing telemetry because it describes a lost signal. It must not rewrite the service's lifecycle to `offline` in data, copied status, or accessibility text.

Freshness rules:

- Validate heartbeat timestamps and expiry values before labeling a report current.
- A successful poll containing an old heartbeat does not refresh that heartbeat's age.
- Age a cached report even if the next request hangs or the tab resumes after being hidden.
- Add a bounded client request timeout and cancellation so an in-flight request cannot block refresh indefinitely.
- Preserve last-known results during refresh; avoid repeatedly flashing a loading screen.
- If the selected instance disappears, show that loss rather than silently displaying a different instance's state.
- Multiple matching instances need deterministic resolution: retain the selected instance where possible; initial selection uses newest valid heartbeat, then instance ID as a stable tie-breaker.

### C. Clicking a TV

Recommended desktop composition:

```text
                   Selected service                  [Close]
        ┌──────────────────┐    Service name
        │                  │    Working
        │  Actual TV with  │    Latest report: 3 seconds ago
        │  status video    │
        │                  │    Current activity, when reported
        └──────────────────┘    Issue, when reported
                                [Refresh] [Copy status]
                                More details ▸
```

- Keep the selected TV clearly visible. Measure layout against the usable viewport and panel area, not an assumed empty screen.
- Put service identity and one status heading first; keep freshness secondary but legible.
- Remove redundant `NO SIGNAL` pills, the repeated status-feed row and decorative privacy/footer copy that does not help this task.
- When unavailable, show a single explanation such as “Cannot reach the status feed. Last report was 2 minutes ago.” Never fabricate the time.
- Hide absent task/progress sections rather than render filler. Put instance ID and diagnostic metadata under More details.
- Keep one Close action, Escape support, focus trapping, and focus return to the originating TV. Allow backdrop dismissal only from the backdrop, not panel interaction.
- Refresh is read-only and shows pending/error feedback. Copy status shows visible “Copied” or an actionable failure message.
- Use a short coordinated transition, approximately 220–320 ms; no long blank period before the panel becomes usable.
- On narrow screens, use a single-column detail sheet with a compact TV above the content, a visible close control, and scrollable details.
- Respect reduced motion; preserve all navigation without zoom animation. Decorative videos should use a representative still/paused frame when reduced motion is requested, with status available as text outside the video.

## 4. Track B design: two launchers, shared reliable engine

### A. Ascend Vision — companion launch window

**Identity:** The existing Fairy eye is the focal point. Deep indigo, pearl-white lettering and restrained blue light within the eye; no generic dashboard cards or rapidly spinning decoration.

**Suggested palette:** background `#090D1B`, surface `#171C35`, pearl `#ECEEFF`, indigo `#747DFF`, secondary text `#AEB8D1`. Verify contrast in implementation.

**Layout:** A centered, quiet eye above a left-aligned readiness summary. One dominant action, then small recovery/diagnostic controls. Use Segoe UI for readable native text; artwork stays separate from state logic.

```text
 Ascend Vision
              [Fairy eye]
 Ready to talk
 Chat available · Camera unavailable
 Microphone unavailable · Core sign-in required

             [Open Vision]
 [Start chat only]   [Diagnostics]   [Stop Vision]
```

- Primary action changes with state: Start Vision → Starting… → Open Vision.
- Starting shows the actual stage and its elapsed time, with Cancel available.
- Chat-only recovery clearly lists unavailable camera/voice features; it is not presented as full readiness.
- Camera/mic/Core information comes only from verified health fields. Unknown capabilities say Not checked, not Ready.
- Launcher artwork must not load ML models, access the camera, or call the AI provider.
- Use a distinct eye-style shortcut, title-bar and taskbar icon. Preserve the existing Fairy design rather than generate a different eye.

### B. Ascend Hub — operations launch window

**Identity:** A compact retro equipment console matching Hub's CRT shelves: charcoal, aged ivory, muted brass and restrained green/amber indicators. Different composition from Vision, not merely a recolored eye window.

**Suggested palette:** case `#201C17`, display `#0D1410`, ivory `#E7D8BA`, brass `#BE995F`, signal green `#ACC69D`. Verify contrast in implementation.

**Layout:** Console title and a compact local-runtime display, followed by a stage/readiness list and one large launch/open control. Segoe UI for actions/body and Consolas for short technical values only.

```text
 Ascend Hub                         [CRT icon]
 ┌ Local runtime ─────────────────────────────┐
 │ Ready                                     │
 │ Hub interface       Available             │
 │ Core/status feed    Not checked           │
 └───────────────────────────────────────────┘
 [Open Hub]                [Stop Hub]
 [Diagnostics]             [Retry when failed]
```

- Distinguish local UI availability from Core connection and remote agent statuses.
- Do not paint all agents offline when Core cannot be read. Do not add another credential store solely for the launcher.
- A startup failure names the failing stage and next action; technical details expand on demand.
- Use a distinct CRT/console icon across shortcut, title bar and taskbar.

### C. Process and shortcut behavior

- `Ascend Vision.lnk` opens only the Vision window; `Ascend Hub.lnk` opens only the Hub window. Both can run simultaneously.
- Share `Supervisor.cs` and process-host code. Do not fork two engines or maintain duplicate startup logic.
- Use a per-owner, per-product single-instance lock and activation signal. A second click restores/focuses the existing product window rather than starting another process tree.
- Detect the old combined launcher during upgrade and ask the user to close it before starting a conflicting owner. Do not bypass its lock and duplicate the apps.
- Closing one launcher must never dispose or stop the other app. If its own app is running, offer Cancel or Stop this app and close; remain responsive while stopping.
- Preserve explicit profile arguments, process identity checks, authenticated local health probes and Windows Job Object ownership.
- Never identify a kill target by broad executable name. Force stop applies only to the process tree owned by that product instance.
- Keep the native launcher lightweight. Electron/Tauri packaging or embedding the web UI is outside this change.

### D. Fix the misleading shutdown experience

The screenshot's 1927 seconds is not reliable evidence that shutdown itself took 1927 seconds: current code calculates elapsed time from application startup.

- Track startup, uptime and shutdown durations separately. Show only the duration relevant to the current state; freeze completed/failure durations.
- Continue nonblocking observation while stopping; do not freeze the UI or disable diagnostics.
- At the existing 15-second shutdown deadline, transition from Stopping to an explicit `stop_failed` state with “Could not stop Hub” and a Force stop action.
- If the owned process later exits, transition to Stopped and clear URL/capability readiness. Do not remain in a permanent failure state after exit.
- During Stopping/stop_failed, disable Open and Start to avoid launching duplicates or opening a shutting-down UI.
- Force stop must verify the owned process tree exited before claiming Stopped. Surface failure if it did not.
- Keep startup deadline/retry behavior bounded. No infinite restart loop disguised by animation.

## 5. Acceptance criteria

### TV and clicked view

- No cyan cubby outline, external blue shadow or `SELECTED` label in idle, hover, selected or clicked states.
- Keyboard focus remains clearly visible without recreating the persistent selection box.
- The screen does not duplicate the offline video's embedded signal-loss message.
- All four reported lifecycle states select the correct video; selection never hides that state.
- Missing/stale/invalid reports never say Live. Cached reports remain explicitly last known.
- TV, detail heading, accessibility label and copied status agree on service, instance, lifecycle and freshness.
- Clicking any of the four TVs leaves its video visible and opens useful, uncluttered details.
- No clipped controls at 390 px width; keyboard, Escape, focus return and reduced motion work.

### Launchers

- Two shortcuts, two visually distinct windows and icons; each operates only its own app.
- Repeated clicks activate the correct existing window without duplicate workers or browser launches.
- Missing profile, startup timeout, degraded/chat-only operation, shutdown timeout and force-stop failure all have truthful, actionable states.
- Neither slow startup nor slow shutdown blocks window interaction.
- Open is enabled only when the product is usable, not merely because an old URL remains in memory.
- Both product windows can run together; stopping or closing one does not affect the other.
- Layout remains usable at Windows 100%, 150% and 200% scaling, with keyboard navigation and accessible labels.

## 6. Implementation phases

### Phase 0 — Confirm the execution baseline

**Files:** Current Git status; installed shortcut targets; existing desktop README and profile schema. Read profile structure without exposing secrets.

- [x] Record the source checkout used by each installed shortcut and the current process owner.
- [x] Account for uncommitted page/CSS changes; establish a narrow implementation diff without overwriting unrelated work.
- [x] Capture before screenshots for shelf, clicked view and both shortcut flows.
- [x] Confirm the four supplied video assets and existing Fairy artwork are readable locally.

**Exit:** Known source targets, preserved user changes, and a baseline against which the redesign can be checked.

### Phase 1 — Shared, truthful TV presentation

**Files:** `components/status/status-presentation.ts`, `status-video.ts`, `shelf-tv-assignment.ts`, `agent-auxiliary-model.ts`; `app/status/shelf-runtime.ts`, `use-status-shelf.ts`; associated `tests/status/*.test.ts`.

**Boundary:** Introduce a pure `deriveShelfTvPresentation` function accepting the selected report, fetch state and `nowMs`. Return lifecycle (nullable), freshness (`loading/current/stale/unavailable`), video source (nullable), heading, explanation and accessible description. Feed this same result to both views; media-loading failure remains a separate UI concern.

- [x] Add failing behavior tests for missing report + successful fetch, stale heartbeat + successful poll, unavailable feed + cached report, invalid timestamp, and selection of multiple instances.
- [x] Implement derivation without changing the Core contract or overwriting lifecycle with transport state.
- [x] Add advancing time-based freshness, bounded request cancellation, and stable instance selection.
- [x] Run `npm run test:status`; verify all four video mappings and no false completion/live claims.

**Exit:** Truthful state and video selection independent of visual layout.

### Phase 2 — Clean shelf and focused details

**Files:** `components/status/ShelfStatusTv.tsx`, `AgentAuxiliaryPanel.tsx`, `vision-eye-navigation.ts`, `shelf-tv-focus.ts`; targeted edits in `app/page.tsx` and `app/globals.css`; existing status/focus/navigation tests.

- [x] Remove persistent cyan selection styles, duplicate on-screen status overlays and the SELECTED pseudo-element.
- [x] Keep status video visible during selection; add the restrained bezel cue and keyboard-only focus treatment.
- [x] Bind TV and panel to Phase 1's shared result; preserve video playback on unrelated re-renders.
- [x] Recompose the focused TV and panel, with one Close action, real refresh/copy feedback, optional diagnostic details and narrow-screen layout.
- [x] Handle media load failure and reduced motion without changing the reported lifecycle.
- [x] Verify DOM/accessibility behavior and capture desktop/narrow-screen screenshots using controlled state fixtures.

**Exit:** Track A can ship independently; all shelf/detail acceptance criteria pass.

### Phase 3 — Product isolation and bounded shutdown

**Files:** `desktop/Start-Ascend.ps1`, `Supervisor.cs`, `ProcessHost.cs`, `Install-Ascend.ps1`; `desktop/tests/Test-Supervisor.ps1`, `Test-Installer.ps1`, `fixture_server.py`.

- [x] Add fixture coverage for simultaneous product owners, repeated launch, close-one-keeps-other, delayed shutdown, timeout and late exit.
- [x] Introduce per-product locks/activation and product-scoped disposal, including a safe legacy combined-window transition.
- [x] Track lifecycle-specific durations and implement stop_failed plus continued exit observation.
- [x] Clear stale URL/capabilities and verify force-stop completion before displaying Stopped.
- [x] Run the supervisor and installer fixture suites before connecting redesigned UI.

**Exit:** Shared engine supports two independent windows with truthful states and no cross-product shutdown.

### Phase 4 — Separate native designs and shortcut assets

**Files:** Create `desktop/VisionLauncher.xaml`, `HubLauncher.xaml`, `LauncherResources.xaml`, and product icons under `desktop/assets/`. Modify `desktop/Start-Ascend.ps1`, `Install-Ascend.ps1`, `README.md`, `tests/Test-LauncherLayout.ps1`.

- [x] Build the Vision eye-led composition and Hub console composition using section 4's roles, colors and actions.
- [x] Bind both to the same tested supervisor snapshot/actions, without duplicating the engine.
- [x] Provide loading, ready, degraded, missing-profile, failed, stopping and stop_failed visual states for each product.
- [x] Apply distinct installed shortcut and window icons; preserve explicit profile paths and working directories.
- [x] Check WPF control names, action bindings, keyboard focus, text wrapping, minimum size and 100/150/200% scaling.
- [x] Update installation/recovery documentation; keep legacy layout only if required by a documented transition, not as the default shortcut UI.

**Exit:** Track B has two tailored, independent launchers, with all controls usable during slow operations.

### Phase 5 — Integrated acceptance and handoff

- [x] Run status and desktop fixture tests, plus targeted lint/type/build checks appropriate to changed files. Separate pre-existing failures from regressions.
- [x] Test shelf state fixtures: idle, working, stuck, offline, loading, unavailable, stale, video failure and recovered feed.
- [x] Test mouse/keyboard TV selection, repeat click, close/reopen, resizing, reduced motion and focus return.
- [ ] Manual installed-profile Explorer/taskbar and physical-display check. Shell-launched cloned fixture shortcuts already verify both windows, repeat activation, stop/timeout and scoped close; live Vision hardware was kept out of destructive fixtures.
- [x] Compare final screenshots with the requested removals and the two distinct visual identities. Fix functional/visual defects in one bounded pass, then confirm.
- [x] Record verified results and remaining hardware/environment limitations in `docs/audits/2026-10-02-tv-launcher-acceptance.md`.

**Exit:** No completion claim based on screenshots alone; state transitions, ownership and recovery have evidence.

## 7. Rollout and rollback

- Deliver Track A and Track B separately so either can be reviewed or reverted without undoing the other.
- Keep code changes grouped by phase; commit only scoped files when commit authority is provided. No pushing or merging as part of this plan.
- Before shortcut replacement, preserve existing shortcut arguments/profile and installer output for recovery. Do not delete user configuration, memory or app data.
- Test both new product windows against fixtures before replacing installed shortcuts.
- Roll back the launcher only after closing the corresponding owner cleanly; never run legacy and new owners concurrently for the same product.
- Reverting visual code must not require a Core schema rollback, because this plan does not change that schema.

## Recommended order

**Truthful TV state → clean shelf and click view → launcher ownership/shutdown fixes → distinct launcher designs → combined acceptance.**

The design skills informed the separation of identities, restrained decoration, accessible interaction and explicit failure states. The user approved implementation on 2026-10-03. Checked items have recorded evidence in docs/audits/2026-10-02-tv-launcher-acceptance.md; final verification completed on 2026-10-05. The remaining manual Explorer/physical-DPI/hardware limitations are recorded there.
