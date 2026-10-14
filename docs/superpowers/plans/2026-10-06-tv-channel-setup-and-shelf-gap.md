# TV channel setup, YouTube broadcast design, and left shelf gap

**Status:** Implemented in `codex/tv-channel-setup`; local verification recorded below.
**Date:** 2026-10-06
**Execution clarification:** User chose “Shelves span the window.” Baseline measurement found equal 180px outside margins at 1920px. Change the cabinet outer width to 100%; retain existing uniform stage scaling and compartment proportions. This supersedes preserving the previous right-edge placement.
**Goal:** Make Spotify and weather independently configurable through their TV channels, bring YouTube into the same broadcast design family, and remove the unwanted blank strip outside the cabinet’s left edge.
**Architecture:** Extend the existing plain JavaScript TV iframe and reuse Hub’s same-origin API routes. Keep provider credentials on the server. Use a small parent/iframe bridge only for Spotify navigation and restoring the channel after authorization.
**Tech stack:** Existing React/Vinext host, plain JavaScript TV modules, scoped CSS, existing Spotify routes, Visual Crossing Timeline API, YouTube IFrame Player API.
**Spec:** The user’s four screenshots and latest request; clarified shelf defect is the blank strip **outside** the cabinet’s left edge. The user will remove the header separately.

## 1. Scope and protected areas

This revision changes four areas only: music-channel account controls, weather-channel setup, YouTube channel presentation, and the responsible shelf edge layout rule.

- Do not remove or redesign the Hub header in this task. Validate the TV flows with the header hidden so its eventual removal cannot break setup.
- Preserve the room backdrop, physical TV assets, glass shape, reflections, scanlines, cabinet wood, shelf compartments, item placement, lighting, and camera behavior.
- Preserve the previous Fairy selector and clicked-TV zoom changes. Do not redesign status TVs, launchers, Vision, or Core.
- Work against the deployed `public/zzz-tv` runtime. Do not edit the `vendor/zzz-tv-reference` mirror or replace the iframe with a new React dashboard.
- Preserve existing uncommitted changes in `app/page.tsx`, `app/globals.css`, `components/status/AgentAuxiliaryPanel.tsx`, and the associated status test.
- Before execution, confirm the running application’s checkout. A shortcut or old development server can show another checkout; review against the actual revised runtime before declaring completion.

## 2. What the current code establishes

The pictured TV is `/zzz-tv/index.html`, embedded by `app/page.tsx`. Its active channel implementations are `media-listeners.js`, `weather_channel.js`, `youtube_player.js`, and `yt_tuner.js`. The separate React weather component is not the pictured forecast.

Spotify already has setup, login, callback, and currently-playing routes. The music channel currently tells disconnected users to connect in the header. The host’s OAuth return handler currently opens the host modal; this must instead be able to restore the music screen.

The active weather module uses Visual Crossing, including keys embedded in client-side settings. The screenshot’s OpenWeather footer does not match that implementation. Retain Visual Crossing for this change, identify it accurately in setup and attribution, and remove the embedded credentials from the touched runtime. Do not silently migrate providers.

YouTube currently has a separate tuner panel, emoji presets, and generic result cards. Player errors can open that tuner even after the user switches channels. The raw error in the screenshot belongs to YouTube’s embedded document; its internal typography cannot be restyled by Hub CSS. Hub needs its own surrounding failure slate driven by player events.

The cabinet uses a 1160px internal stage, scaled to its viewport. Several shell and stage rules contribute to alignment. The outside-left gap is confirmed by the user, but its exact CSS cause has not yet been measured. A single-sided padding or offset fix must not be guessed from source alone.

## 3. Shared visual direction

The existing music and weather screens are the design source. Use their self-hosted condensed fonts, dark broadcast plates, strong title hierarchy, and restrained accents. Keep green dot-matrix input labels as channel OSD rather than using them for every form field.

| Element | Treatment |
| --- | --- |
| Primary titles | Existing Impact/Miland-style condensed face; off-white |
| Supporting text | Existing readable channel font; fewer words, clear hierarchy |
| Panels | Dark, lightly translucent broadcast plates with thin dividers |
| Music actions | Existing lime artist-strip treatment, integrated with the record/banner |
| Weather actions | Forecast plate geometry, lime labels, yellow emphasis |
| YouTube actions | Condensed broadcast strips; lime channel tag; small red brand mark |
| Focus | Visible inset outline within the glass, distinct from hover |
| Loading/error | Short channel-specific text in the same plate, without a generic toast stack |

Create `public/zzz-tv/style/channel-ui.css`, linked after the existing stylesheet. Scope all new rules to channel-specific classes inside the TV. Do not rebuild the full compiled SCSS bundle for this bounded revision: it contains manually appended tuner styles. New tuner markup should use the new scoped classes so the old generic styles no longer control it.

Use a consistent safe inset inside the curved glass, initially 8% horizontally and 7% vertically, then adjust against screenshots. Size by the actual screen container rather than the browser viewport. Forms can scroll internally where necessary; keep the primary action and Back reachable. Confirm usable control sizes on the actual TV at desktop and mobile sizes. If the smallest rendered TV cannot support readable inputs, resolve that explicitly during the design checkpoint using the existing TV presentation; do not ship unreadable miniature controls or add an unrelated page modal.

## 4. Spotify: connection as part of the music broadcast

### Disconnected screen

Keep the record, existing background, artist strip, track strip, and lime baseline. Replace the truncated instruction with a real button integrated into that lower third:

```text
[lime tag]  SPOTIFY
[title]     Connect Spotify                 [small connection icon]
[subtitle]  Link your account to this TV
```

The entire intended banner action is keyboard accessible. Do not add an unrelated floating pill above the TV or a second button outside the glass.

### Connection flow

1. Click Connect Spotify; fetch `/api/spotify/setup`.
2. If the existing required credentials are present, start OAuth directly.
3. If credentials are missing, replace the music information area with an in-screen setup plate. Show Client ID, masked Client Secret, callback address with a small Copy action, and **Save & connect** / **Back**.
4. Treat Client Secret as required for the current callback implementation. The existing host form’s optional wording must not be copied into the TV flow.
5. Save through the existing setup route. Only after success, request top-level navigation to the existing login route. Keep credentials out of iframe messages.
6. Before navigation, store only a return intent in session storage: music channel and account outcome view. On return, the host consumes `spotify=connected|error|missing_client_id`, waits for TV readiness, selects music, and sends a sanitized result.
7. Success shows Connected in the music banner. Cancellation or failure keeps a clear retry action inside the TV. No automatic reopening of the host modal for this TV-originated flow.

### Connected behavior

While playing, retain track, artist, album artwork, progress, and visualizer. A small account affordance belongs in the existing label/banner area and opens an in-screen account plate. When idle, say **Spotify connected / Nothing playing** rather than presenting an error or fabricated song.

The account plate offers Disconnect and Back. Disconnect uses the existing route, then returns to the disconnected banner. Request failures do not claim the account was disconnected. A failed refresh should distinguish temporary connection trouble from confirmed disconnected state.

### Files and interface

- `public/zzz-tv/script/media-listeners.js`: disconnected banner and accurate connected/idle/error presentation.
- New `public/zzz-tv/script/channel-setup.js`: bounded setup/account DOM and request state; use real buttons and labels.
- `public/zzz-tv/script/app.js`: mount setup controls and readiness message.
- `public/zzz-tv/script/tv.js`: add `selectInput(type)` using the same stop-media, OSD, input-change event, and content-switch lifecycle as `nextInput()`. Reject unknown inputs rather than cycling the dial repeatedly.
- `app/page.tsx`: validated navigation/return bridge and TV-originated callback handling; preserve unrelated state and header controls.
- Existing Spotify routes: reuse contracts; make a save failure explicit if the touched persistence path currently reports success after a failed write.

Proposed bridge messages contain no secrets:

```ts
type TvToHost =
  | { type: 'TV_READY' }
  | { type: 'SPOTIFY_AUTHORIZE'; returnInput: 'music' };
type HostToTv =
  | { type: 'SELECT_INPUT'; input: 'music' }
  | { type: 'SPOTIFY_AUTH_RESULT'; outcome: 'connected' | 'error' | 'missing_client_id' };
```

Validate origin and source on both sides, use `location.origin` as the target origin, and queue restore until the iframe is ready. The host recognizes only these navigation requests; it does not accept arbitrary redirect URLs.

## 5. Weather: setup inside the forecast channel

### Missing-key screen

Retain the forecast backdrop and NEWS / WEATHER FORECAST lower third. Show a dark plate in the forecast area:

```text
WEATHER FORECAST
Forecast needs setup
Add your Visual Crossing key to receive local weather.
[ Set up forecast ]
```

Do not fill the current temperature with invented live values. Missing data is an explicit setup state.

### Setup plate

Use the same plate proportions and typography as the forecast cards. Fields: masked **Visual Crossing API key**, **Location** (current configured location; existing default Manila), and a compact Celsius/Fahrenheit choice. Primary action **Save & check**; secondary **Back**. A small provider help link belongs beside the key label, not in a large instructional block.

Saving validates the candidate configuration against the provider before replacing a previously working configuration. Invalid key, unknown location, network timeout, and quota trouble get different concise messages. A network failure must not be mislabeled as an invalid key.

Once ready, keep the current weather composition: large today temperature, condition icon, three stacked forecast days, news strip. Add only a small Settings action aligned with the location/provider line. Update provider attribution accurately. Keep old forecast data during temporary failures only with a visible last-updated/stale indication; never present it as newly fetched.

### Server contract and persistence

Create `lib/weather.ts`, `app/api/weather/setup/route.ts`, and `app/api/weather/current/route.ts`. Reuse the existing renderer’s normalized weather shape instead of rewriting its graphics.

```ts
type WeatherSetup = {
  configured: boolean;
  provider: 'visual-crossing';
  location: string;
  units: 'metric' | 'us';
  source: 'local' | 'environment' | 'none';
};
type WeatherRequestState = 'ready' | 'missing-key' | 'invalid-key' | 'unavailable';
// GET setup returns WeatherSetup; never returns the saved key.
// POST setup receives { apiKey, location, units }; returns sanitized setup/state.
// GET current returns state, fetchedAt, stale, and normalized data when available.
```

Store local desktop configuration in ignored `.sites-runtime/weather-config.json`, with `VISUAL_CROSSING_API_KEY` as an environment fallback. Report write failures honestly. Do not put keys in client bundles, local storage, console logs, query strings to Hub, or postMessage. Provider URLs containing the key remain server-side and must not appear in returned error text.

Use a bounded provider timeout of 10 seconds, reuse the existing hourly channel refresh, and cache successful forecasts for 15 minutes per effective configuration. A failed replacement key leaves the saved working configuration intact. A successful save invalidates the relevant old cache. Avoid automatic geolocation prompts; the explicit location field is sufficient for this revision.

`weather_channel.js` switches to `/api/weather/current` and renders missing/invalid/unavailable states plus the existing successful forecast. Remove touched hardcoded keys and credential-bearing settings logs in this file and `app.js`; preserve unrelated wallpaper settings. Missing provider values remain unavailable, rather than being coerced into believable temperatures.

## 6. YouTube: a broadcast channel rather than a generic panel

### Watching

Successful video remains the main picture. Preserve the existing physical TV and CRT effects. A compact lower third briefly identifies the video and author using the same dark strip and condensed title language as music. A small **Choose video** control appears through intentional hover, touch, or keyboard focus, and stays discoverable when idle. Do not leave a large dashboard over playback.

### Choosing a video

Replace the current tuner’s generic panel with an in-glass broadcast selection screen:

```text
[YOUTUBE]                          [Back]
[ Search title or paste link               ] [Tune]
--------------------------------------------------
[thumbnail] Video title                  [duration]
            Channel name
--------------------------------------------------
[thumbnail] Video title                  [duration]
            Channel name
```

Show two or three readable rows, with internal scrolling for more results. Use proper buttons for selection. Remove emoji preset pills; if retaining presets, render them as a short broadcast category row rather than a competing pill toolbar. Preserve current-video context while choosing; do not interrupt playback until another video is selected.

Search has distinct loading, empty-result, failed-request, and recommended-preset states. Recommendations returned as fallback must be labeled as recommendations, not passed off as matches. Hardcoded live IDs must not be advertised as confirmed working streams.

### Unavailable video

On a player error, switch the channel’s presentation to an owned broadcast slate:

```text
[YOUTUBE]  BROADCAST UNAVAILABLE
This video cannot play on this TV.
[ Choose video ]   [ Try again ]
                         Open on YouTube
```

Use a more specific short reason where reliably known: embedding restricted, removed/unavailable, or player configuration trouble. A retry remains bounded to user action. Do not automatically open a tuner after the user has left YouTube. Preserve the failed selection so returning to the channel explains what happened.

This handles errors through the documented IFrame API, including configuration error 153; it does not attempt to style YouTube’s cross-origin error HTML. Preserve required player identification and successful-player behavior. Restrict hit interception to actual channel controls, rather than an invisible full-screen overlay that blocks video interaction.

### Files

- `public/zzz-tv/index.html`: new tuner/setup markup and shared CSS link.
- `public/zzz-tv/script/yt_tuner.js`: selection view, search states, real result buttons, active-channel-aware error handling, focus return.
- `public/zzz-tv/script/youtube_player.js`: explicit loading/ready/error callbacks and current selection context.
- `public/zzz-tv/script/tv.js`: coordinate channel state without disturbing other input lifecycles.
- `app/api/youtube/search/route.ts`: only the small response distinction needed to identify direct/search/preset results truthfully; no search-provider migration.
- `public/zzz-tv/style/channel-ui.css`: channel slate, selection rows, setup fields, lower thirds, and responsive safe-area rules.

## 7. Outside-left shelf gap: diagnose, then make one bounded fix

1. Capture the affected cabinet at the user’s current viewport and browser zoom, then at 1440, 1920, 768, and 390 CSS pixels.
2. Measure the cabinet shell, stage viewport, transformed stage, left vertical rail, and row background with `getBoundingClientRect()`. Compare computed padding/margins, scrollbar width, and transformed stage width with the viewport.
3. Locate the first box whose left edge deviates from the intended cabinet edge. Distinguish the unwanted unilateral strip from intentional symmetric room margins.
4. Fix only that responsible container rule, likely within the `.launch-cabinet-stack` / `.stage-viewport` rules in `app/globals.css`. If width measurement in `app/page.tsx` is responsible, change only that measurement.
5. Do not conceal the gap by altering `wallOffsetX`, wall texture width, cubby widths, shelf art, item positions, camera transforms, or introducing an unexplained negative offset.
6. Compare before/after overlays. The left rail must meet its background without an exposed strip; right-edge placement and internal shelf geometry must remain unchanged apart from any necessary equal translation of the entire cabinet.

The precise CSS edit is intentionally dependent on measurements. The gap is confirmed; its root cause is not yet proven.

## 8. Execution order and review checkpoints

### Task 1 — Baseline and channel design proof

- [ ] Confirm checkout and preserve the dirty files listed above.
- [ ] Capture current music, weather, YouTube watching/tuner/error, and cabinet-edge screenshots.
- [ ] Measure the shelf gap and record the responsible box.
- [ ] Build representative in-TV states using existing assets: disconnected music, music setup, missing-weather setup, YouTube results, YouTube error.
- [ ] Review them at the actual rendered TV size before wiring persistence. Reject clipped labels, inconsistent fonts, generic pills, and controls outside the glass.

### Task 2 — Shared controls and Spotify

- [ ] Add scoped CSS and bounded `channel-setup.js` controls; preserve physical art.
- [ ] Connect existing Spotify endpoints and implement the validated readiness/navigation/restore bridge.
- [ ] Verify missing credentials, configured credentials, save failure, cancellation, success, connected idle, active playback, and disconnect failure.
- [ ] Verify keyboard entry, Back/Escape, focus return, and successful operation with the host header hidden.

### Task 3 — Weather configuration and forecast states

- [ ] Add the server configuration/fetch module and two routes.
- [ ] Add in-screen setup and connect the existing forecast renderer to normalized server results.
- [ ] Remove the touched client credentials/logs and correct attribution.
- [ ] Add meaningful `tests/tv/weather.test.ts` cases using stubbed provider responses and temporary config storage: missing key; invalid candidate preserves old config; successful save survives reload; failed persistence returns failure; timeout; stale cached result; metric/us mapping; missing values; response errors contain no key.
- [ ] Run `npx tsx --test tests/tv/weather.test.ts`.

### Task 4 — YouTube broadcast presentation

- [ ] Replace tuner markup/styles and connect watching, choosing, loading, and failed states.
- [ ] Preserve current playback while searching, and restore focus after selection/Back.
- [ ] Verify real playback success and stubbed errors 100, 101/150, and 153; switching away must prevent surprise tuner openings.
- [ ] Verify search failure and fallback recommendations are distinguishable, long titles truncate safely, and keyboard users can tune each result.

### Task 5 — Shelf correction and final verification

- [ ] Apply the measured container-only correction.
- [ ] Capture matching before/after screenshots at the agreed viewport sizes, including the cabinet’s right edge and unchanged compartments.
- [ ] Recheck all three channels with the header hidden; reload after saving; confirm secrets are absent from browser GET responses, console output, and iframe messages.
- [ ] Run focused lint for touched supported files, existing relevant status tests if shared host changes affect them, and `npm run build`.
- [ ] Review the final diff for unrelated header, room, shelf-art, status-TV, launcher, or vendor changes and remove accidental scope expansion.

## 9. Acceptance conditions

Completion requires visual evidence as well as working requests:

1. A user starting from the music TV can configure/connect/disconnect Spotify without the header or a detached host modal.
2. OAuth returns to music and displays the real outcome; connected-but-idle is clear.
3. Missing weather configuration is actionable inside the forecast TV, survives restart after a successful save, and never exposes the key in a client response.
4. Ready weather retains its current recognizable forecast design, with accurate provider attribution and truthful stale/unavailable states.
5. YouTube’s owned selection and error screens visibly share the music/weather broadcast language; successful video remains unobstructed.
6. Other channels do not receive YouTube error popups or lose physical dial behavior.
7. The confirmed outside-left gap is gone, with screenshot evidence that shelf compartments, textures, item placements, and the right edge were preserved.
8. No application changes outside the four requested areas are included.

## 10. Provider references

- [YouTube IFrame Player API reference](https://developers.google.com/youtube/iframe_api_reference): supported player events and errors, including error 153 for missing referrer/client identification.
- [Visual Crossing Timeline API documentation](https://www.visualcrossing.com/resources/documentation/weather-api/timeline-weather-api/): existing provider endpoint and forecast request shape.
- [Visual Crossing setup guide](https://www.visualcrossing.com/resources/documentation/weather-api/how-do-i-get-started-with-the-weather-api/): account key setup and keeping keys private.

These references support integration details; the user’s screenshots and the existing TV assets determine the visual design.


## Implementation and verification record

Implemented the three channel flows in the existing iframe and the full-window shelf width chosen during execution. Previous Fairy/zoom edits remain intact; the header was preserved.

- Focused tests: 34 passing cases, including 10 weather/Spotify persistence cases and existing Fairy navigation/focused-TV coverage.
- Browser test: `python tests/tv/channel-ui.browser.py` runs the actual TV modules/assets against deterministic provider fixtures. It checks in-glass setup, password fields and cleanup, native YouTube recommendations/error states, channel isolation, and reachable mobile actions. No real account credentials are used.
- Cabinet measurements: left x=0 and width=viewport at 1920, 1440, 768, and 390 CSS pixels. Internal 1160px stage continues to scale uniformly.
- Runtime syntax checks and focused lint: passed; existing unused-variable warnings remain in older helper code.
- Production build: passed.
- Visual artifacts: `D:/ascend_hub/scratch/channel-review/`, including Spotify/weather forms, YouTube picker/error, mobile forms, and full-window shelf.

Execution fixes discovered by testing/review: decorative art/noise and the old overlay intercepted controls; API loading blocked startup; early YouTube selections were dropped; Retry could use a previous tuner selection; the dial updated before async selection completed; phone room cropping cut off setup; localhost Spotify returns lost session storage. The revised runtime routes inputs through actual controls, queues selections, retains authoritative player selection, uses async API loading and failure recovery, fits the room during narrow-screen setup, and canonicalizes TV OAuth navigation before storing return intent.

Live Spotify authorization and real forecast responses require the user's credentials and have not been exercised with a real account/key. Browser fixtures verify application behavior; they do not establish that a particular remote YouTube stream is available.
