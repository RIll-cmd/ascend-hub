# Focused Agent Auxiliary Panel Design

## Goal

Add a cinematic auxiliary console beside a focused shelf TV so the user can inspect the selected service without leaving the shelf scene. The panel uses only the existing read-only Status Shelf snapshot and must not expose conversations, prompts, responses, tool data, terminal output, credentials, or raw adapter records.

## Scope

This milestone adds:

- A retro auxiliary panel that appears when one of the four status TVs is focused.
- The selected service identity, channel, current state, safe activity label, state duration, heartbeat freshness, and allowlisted issue detail.
- A compact signal log derived from the current normalized snapshot.
- A **Copy status** action that copies a short, non-sensitive text summary.
- The existing **Zoom out** action in the panel and camera overlay.
- Responsive positioning: a right-side console on desktop and a lower sheet on narrow screens.

This milestone does not add:

- Conversation or transcript display.
- A prompt composer or message sending.
- Browser-controlled process launch, resume, stop, or restart.
- New Core, Vision, Codex, or Antigravity APIs.
- Any write-capable Hub endpoint.
- Storage of additional lifecycle history.

## Rationale and Alternatives

### Selected: read-only auxiliary console

The existing Shelf API already provides normalized, privacy-safe lifecycle data. Rendering that data in the focused view improves usefulness without changing the current trust boundary. It is also consistent across all four services.

### Deferred: native-session handoff

Opening or resuming a local agent requires an explicit, authenticated server-side command boundary or a registered local protocol handler. The repository currently has neither. Adding a button that merely looks functional would be misleading; launching commands through an unauthenticated route would be unsafe.

### Deferred: full conversation bridge

Each service has different conversation and control capabilities. A future bridge requires a separate audit of official APIs, opt-in authorization, data retention rules, redaction, and per-provider adapters. It must not be built by scraping terminal output or forwarding raw hook payloads.

## Architecture

Create a focused `AgentAuxiliaryPanel` component under `components/status/`. It receives the selected `ShelfTvAssignment`, the matching `ShelfServiceStatus | null`, polling state, and callbacks for copying and closing. The component remains presentation-only and does not fetch data itself.

Extract a small pure presentation module that:

- Converts a normalized Shelf service into allowlisted panel rows.
- Formats state duration and heartbeat freshness.
- Produces a plain-text safe status summary for the clipboard.
- Uses the existing `safeStatusText` helper for all upstream strings.
- Ignores `provider`, `capabilities`, and `metadata` because their arbitrary values have not been approved for display.

The home page passes the currently selected service from the already-polled Shelf snapshot into the panel. No new request or persistence layer is introduced.

## Layout and Interaction

On desktop, the auxiliary console occupies the right side of the viewport while the camera aims the selected TV into the remaining left-side focus area. The shelf and nearby props remain visible and continue to scale as a single scene.

On narrow screens, the focused TV remains centered in the upper area and the console becomes a scrollable bottom sheet. It must not cover the zoom-out control.

The console enters after the camera begins moving and reverses with the existing zoom-out transition. Reduced-motion users receive an immediate opacity change with no delayed dolly effect.

The panel contains:

1. Channel and service name.
2. Prominent textual state with a non-color symbol.
3. Current safe activity or issue summary.
4. Signal rows for state start, last heartbeat, and snapshot freshness.
5. **Copy status** and **Zoom out** buttons.

Backdrop click and `Escape` retain their existing close behavior. Focus returns to the TV button that opened the view.

## Data and Privacy Rules

Only these fields may influence rendered or copied content:

- `serviceId`
- `instanceId`, sanitized and length-limited
- `serviceType`
- `state`
- `stateSince`
- `lastHeartbeatAt`
- `staleAfterSeconds`
- `activity.kind`
- `activity.label`
- `activity.startedAt`
- `activity.progress`, clamped to 0–100
- `issue.code`
- `issue.message`
- `issue.retryable`

The panel must not recursively render unknown objects. `provider`, `capabilities`, and `metadata` are intentionally excluded. Clipboard output follows the same allowlist and never includes credentials, prompts, responses, transcripts, logs, errors, tool data, terminal output, or raw JSON.

## Error and Empty States

- While the first snapshot is loading, show `OPENING STATUS CHANNEL`.
- If the authority is unavailable without a prior snapshot, show `NO SIGNAL` and the sanitized local UI error category only.
- If the selected service is missing, show `NO INSTANCE REPORTED`.
- If polling fails after a successful snapshot, keep the last service details and visibly mark the signal `STALE`.
- If clipboard access fails, show a small non-blocking `COPY FAILED` result and leave the panel usable.

## Accessibility

- Keep the focused camera layer as a labelled modal dialog.
- Give the auxiliary console a heading connected with `aria-labelledby`.
- Preserve textual status and symbols so state is not conveyed by color or video alone.
- Make every action keyboard reachable with a visible focus style.
- Announce clipboard success or failure through a polite live region.
- Preserve `Escape`, backdrop close, reduced-motion behavior, and focus restoration.

## Testing

Use test-first development for the pure presentation model and static component markup.

Tests cover:

- Safe fields are formatted correctly for all four states.
- Arbitrary provider, capability, and metadata values never appear.
- Upstream labels and issue messages are length-limited and sanitized.
- Missing, loading, stale, and unavailable states render truthful copy.
- Clipboard summaries contain only the allowlisted fields.
- The panel renders semantic headings, live status, and both actions.
- Camera calculations reserve desktop space for the panel while retaining the current mobile behavior.

Run the focused status tests, touched-file lint, production build, and whitespace validation. Existing unrelated repository-wide lint findings remain outside this feature.

## Future Conversation Bridge Gate

A later conversation feature may proceed only after a separate design and provider audit establishes:

- An official supported read/write API for each service.
- Explicit local user authorization and CSRF/origin protection.
- Per-service capability negotiation.
- Clear transcript retention and deletion behavior.
- Content redaction and size limits.
- No reliance on terminal scraping or private vendor internals.

