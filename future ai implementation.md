# Future AI Status Shelf Implementation

## Purpose

This document defines a scalable status-shelf architecture for monitoring Ascend Core, Ascend Vision, and future AI agents such as Hermes Agent, Groq-backed bots, the Antigravity Gemini sidebar, and Codex CLI running in Antigravity.

The shelf is a visual display. Each slot represents a logical AI service and renders one normalized operational state:

- `idle`: online and ready, with no active work.
- `working`: actively processing a request or running a task.
- `stuck`: alive, but unable to make expected progress or repeatedly failing.
- `offline`: no valid heartbeat within the service's configured time-to-live.

The frontend must not understand each agent's native hooks, logs, or process model. Every integration is translated into one versioned contract before it reaches the shelf.

## Audit Scope and Confidence

| System | Audit result | Confidence |
| --- | --- | --- |
| Ascend Hub | Source inspected. Cloudflare/Vinext frontend exists, with optional D1 support but no active status backend or database schema. | Verified |
| Ascend Core / AIRA | Source inspected. FastAPI integration routes, Prisma/PostgreSQL, AIRA request boundaries, and local execution audit states exist. No normalized service lifecycle feed exists. | Verified |
| Ascend Vision | Source inspected. Core heartbeat, Core health/status checks, local session heartbeat, event persistence, runtime modes, and lifecycle logs exist. | Verified |
| Groq-backed bots | Groq is configured as an inference provider inside Ascend Vision. No separate Groq bot service or lifecycle emitter was found in the audited repositories. | Partially verified |
| Antigravity Gemini sidebar | Local Antigravity/Gemini configuration directories exist, but no project-owned lifecycle/status integration was found in the audited repositories. | Environment detected; adapter interface unverified |
| Codex CLI in Antigravity | Codex CLI executables are installed locally. No existing connection from Codex lifecycle activity to Ascend Core or Ascend Hub was found. | Runtime verified; integration absent |
| Hermes Agent | No Hermes executable or local Hermes project was found in the audited locations. Its exact hook and event interfaces must be verified when it is installed. | Not locally verifiable |

This distinction matters: recommendations for uninstalled or externally managed agents are adapter requirements, not claims that those agents already expose a specific hook.

## Current Architecture Findings

### Ascend Hub

Ascend Hub is a Next/Vinext application hosted through the Sites/Cloudflare Worker stack. It is well suited to rendering and proxying a shelf status response, but it is not currently an operational status authority.

Current constraints:

- `db/schema.ts` is intentionally empty.
- Hosted D1 and R2 bindings are currently disabled.
- Authentication uses dispatch-owned Sign in with ChatGPT identity headers.
- The application has no current status API, WebSocket hub, SSE endpoint, or status persistence model.

Recommendation: Hub should remain the presentation layer. Add a same-origin read endpoint later that proxies the normalized status snapshot from the status authority. Do not make the browser hold producer credentials or call every AI directly.

### Ascend Core / AIRA

Ascend Core is the best initial status authority because it already owns the integration API and already receives Vision presence.

Existing useful surfaces:

- `POST /api/integration/vision/heartbeat`
- `GET /api/integration/vision/status`
- `/api/aira/chat`
- `/api/aira/operations/read`
- `/api/aira/operations/preview`
- `/api/aira/operations/execute`
- AIRA execution audit transitions for pending, completed, and failed operations
- Prisma/PostgreSQL as the production persistence layer

Current limitations:

- Vision presence is stored in a process-local Python dictionary.
- That state disappears on restart and is not shared between replicas or serverless invocations.
- AIRA audit rows describe individual operations, not the overall operational state of AIRA.
- The local AIRA SQLite audit store is explicitly local-mode-only and must not become the production status store.
- `/api/aira/status/{character_id}` reports gameplay/system insight and is not an operational health endpoint.

Recommendation: introduce a small status repository and normalized status routes inside Core. Back production state with shared storage. This boundary should be designed so it can later be extracted into an independent Status Gateway without changing producers or the shelf.

### Ascend Vision

Vision is already the closest service to the target design.

Existing signals:

- A failure-contained background heartbeat worker.
- Authenticated heartbeat delivery to Core.
- A Core health check and authenticated Vision status check.
- Local SQLite session and application heartbeats.
- Runtime modes such as `background` and `focus`.
- Active semantic events and persisted event updates.
- Lifecycle logs including session start/end, saved events, failures, and periodic performance statistics.
- General event dispatch to Core.

Current limitation: the network heartbeat primarily communicates presence. It does not carry a normalized operational state that distinguishes idle, working, and stuck.

Recommendation: extend the existing heartbeat envelope with normalized state, state start time, and safe activity metadata. Do not create a second Vision-to-Core status channel.

### Groq and Gemini Providers

Ascend Vision already configures Groq and Gemini models and performs provider fallback. These are model providers, not necessarily independent long-running services.

The shelf should normally represent the bot or workflow that uses a provider:

- Good tile: `vision-roaster`, currently working through Groq.
- Optional infrastructure tile: `groq-provider`, degraded because requests are failing.

Provider health and agent activity are different dimensions. A bot can be idle while Groq is healthy, or working through Gemini because Groq failed. Preserve that distinction in metadata rather than changing the four-state shelf contract.

### Antigravity Gemini Sidebar

Antigravity/Gemini local configuration is present, but the audited Ascend repositories contain no lifecycle bridge for the sidebar.

Preferred integration order:

1. Use a supported extension or lifecycle event API if Antigravity exposes one.
2. Use a supported task wrapper that owns the Gemini request boundary.
3. Use a local sidecar to consume documented logs or process events.
4. Avoid screen scraping, UI pixel detection, or undocumented internal database access.

The adapter should report the sidebar as working only when it has a known active turn or tool operation. The existence of the Antigravity process alone proves online presence, not active AI work.

### Codex CLI in Antigravity

Codex CLI is installed, but no status integration currently exists.

Preferred signals, in order:

1. Supported Codex notifications, hooks, or structured event output.
2. A launcher/wrapper that observes process start, structured output, exit code, and cancellation.
3. A local sidecar that reads documented session events.

The adapter must support multiple simultaneous Codex tasks. A single process-level Boolean is insufficient: the logical service remains `working` until its active operation count reaches zero.

Do not report prompts, file contents, command output, patches, or secrets. A safe activity label such as `tool-call`, `reasoning`, `waiting-for-user`, or `running-tests` is enough.

### Hermes Agent

Hermes was not installed or present in the audited locations, so no current hook contract can be verified.

When Hermes is added, audit it for:

- Session start and end events.
- Model request start and completion.
- Tool invocation start and completion.
- User-input or approval waits.
- Retry, timeout, rate-limit, and fatal-error signals.
- A supported plugin, hook, callback, structured-log, or telemetry interface.

If no supported event API exists, run Hermes through a small supervised adapter process. The adapter should own the Hermes child process, emit heartbeats, translate exit conditions, and avoid parsing free-form terminal text whenever possible.

## Recommended Target Architecture

```text
Ascend Vision heartbeat ─────────────┐
Ascend Core/AIRA instrumentation ────┤
Hermes hook or supervised wrapper ───┤
Groq bot middleware ─────────────────┼──> Status Authority
Antigravity sidebar adapter ─────────┤       | shared state
Codex CLI hook/wrapper ──────────────┘       | normalized snapshot
                                             v
                                      Ascend Hub API proxy
                                             |
                                             v
                                      Status Shelf UI
```

### Initial deployment

Implement the authority as a clearly isolated module inside Ascend Core:

- `StatusRepository`: stores latest instance state and heartbeat time.
- `StatusService`: validates transitions and derives offline state.
- Producer write route: accepts authenticated state/heartbeat events.
- Shelf read route: returns the normalized service snapshot.

### Future extraction

Move the module into a standalone Status Gateway when one or more of these becomes true:

- Most monitored agents are no longer part of Ascend.
- Core downtime must not make monitoring unavailable.
- Heartbeat volume becomes operationally significant.
- Independent scaling, retention, or alerting is required.
- Multiple dashboards or external automation systems consume status.

Because the producer and read contracts remain stable, extraction should require configuration changes rather than frontend rewrites.

## Versioned Status Contract

```ts
type ServiceState = "idle" | "working" | "stuck" | "offline";

type ServiceType =
  | "agent"
  | "assistant"
  | "bot"
  | "vision"
  | "provider";

interface ServiceStatusEvent {
  schemaVersion: 1;
  eventId: string;
  sequence?: number;
  serviceId: string;
  instanceId: string;
  serviceType: ServiceType;
  state: Exclude<ServiceState, "offline">;
  stateSince: string;
  reportedAt: string;
  activity?: {
    kind: string;
    label?: string;
    startedAt?: string;
    progress?: number;
  };
  issue?: {
    code: string;
    message?: string;
    retryable?: boolean;
  };
  provider?: {
    id: string;
    model?: string;
    degraded?: boolean;
  };
  capabilities?: string[];
  metadata?: Record<string, string | number | boolean | null>;
}

interface StatusShelfResponse {
  schemaVersion: 1;
  generatedAt: string;
  services: Array<ServiceStatusEvent & {
    state: ServiceState;
    lastHeartbeatAt: string;
    staleAfterSeconds: number;
  }>;
}
```

### Contract rules

- Producers report `idle`, `working`, or `stuck`.
- The authority derives `offline` after heartbeat expiry.
- `eventId` provides retry deduplication.
- `sequence`, when available, prevents an older event from replacing a newer event.
- All timestamps are ISO-8601 UTC.
- `progress` is optional and constrained to `0..1`.
- Unknown `serviceId` values must render with a generic shelf theme.
- New optional metadata must not require a frontend contract change.
- Producer clocks are advisory; the authority records its own receipt time.

## State Semantics

### Idle

The instance is alive and ready, but has no active operation. A provider being configured does not make an agent working.

### Working

At least one owned operation is active. Multi-task agents maintain an active-operation counter or set. They transition to idle only when all operations complete.

### Stuck

The process is alive but progress is blocked beyond an adapter-specific threshold. Valid causes include repeated provider failures, a deadlocked operation, exhausted retries, or an unhandled dependency outage.

Waiting for deliberate user input should normally remain `working` with `activity.kind = "waiting-for-user"`, not `stuck`. An adapter may promote it to stuck after a separately configured long-wait threshold.

### Offline

The authority has not received a valid heartbeat within the service's time-to-live. Producers should not normally submit offline themselves because a crashed process cannot reliably announce its own failure.

## Adapter Strategy by Service

| Service | Preferred emitter | Heartbeat | Working transition | Stuck transition |
| --- | --- | --- | --- | --- |
| Ascend Vision | Extend existing Core heartbeat | Existing periodic worker | Active inference, feedback, or agent operation | Repeated dependency failure or no progress beyond threshold |
| Ascend Core/AIRA | Middleware/context manager around AI entry points | Internal scheduled heartbeat or status write | First active AIRA operation starts | Timeout/retry exhaustion while process remains healthy |
| Groq bot | Middleware in the bot application | Bot process heartbeat | Groq request or bot task starts | Repeated rate-limit/provider failures or task timeout |
| Antigravity Gemini sidebar | Supported extension event API; otherwise wrapper/sidecar | Local adapter heartbeat | Turn/tool starts | Documented failure or no-progress threshold |
| Codex CLI | Supported notification/hook/event stream; otherwise supervised wrapper | Local adapter heartbeat | Codex turn/tool begins | Fatal/repeated failure or no-progress threshold |
| Hermes Agent | Supported hook/plugin when installed; otherwise supervised wrapper | Local adapter heartbeat | Session turn/tool begins | Retry exhaustion, deadlock, or dependency failure |

## Storage Model

Use a dedicated latest-state model instead of overloading gameplay observations or AIRA operation audits.

Suggested logical fields:

- `service_id`
- `instance_id`
- `service_type`
- `state`
- `state_since`
- `reported_at`
- `received_at`
- `last_heartbeat_at`
- `stale_after_seconds`
- `event_id`
- `sequence`
- `activity_json`
- `issue_json`
- `provider_json`
- `metadata_json`

The initial Core implementation can use PostgreSQL upserts keyed by `(service_id, instance_id)`. Retaining every heartbeat is unnecessary. If historical timelines are later required, write only transitions to a separate append-only history table.

Do not write five-second heartbeat history indefinitely.

## Push, Pull, and UI Delivery

### Producer to authority

Use push-based state changes plus periodic heartbeats.

Pull-based process or log monitoring should be a last-resort adapter technique confined to the same machine as the agent. A cloud service cannot reliably poll desktop agents behind NAT, sleeping devices, or firewalls.

### Authority to Hub

Initially, use short polling:

- Hub exposes a same-origin read route.
- That route authenticates server-to-server with the authority.
- The browser polls Hub every 3–5 seconds.
- Polling slows or pauses when the tab is hidden.
- The UI animates locally between snapshots.

WebSockets or SSE should be deferred until sub-second status propagation or large viewer counts justify persistent connection infrastructure. If streaming is later required, SSE is sufficient for the one-way shelf feed. Cloudflare Durable Objects or another shared fan-out layer would then be preferable to process-local connection state.

## Authentication and Privacy

### Producer authentication

- Issue one revocable write credential per service instance.
- Bind each credential to allowed `serviceId` and `instanceId` values.
- Reject attempts to write another producer's status.
- Prefer short-lived signed credentials or HMAC-signed requests where practical.
- Rate-limit heartbeat and transition routes.

### Shelf authentication

- The browser calls only Ascend Hub.
- Hub uses a separate read-only server credential to query the authority.
- Do not expose Core producer tokens or a broad Core JWT to browser JavaScript.
- Do not assume Hub's ChatGPT identity headers are interchangeable with Core user or Vision tokens.

### Payload restrictions

Never transmit status payloads containing:

- Prompts or model responses.
- Source code or patches.
- Screenshots, camera frames, or biometric observations.
- Terminal output or raw logs.
- API keys, bearer tokens, cookies, or authorization headers.
- User messages or personally identifying data.
- Full exception traces.

Use controlled activity labels and sanitized error codes.

## Deployment Risks

1. **Process-local Core presence:** the existing Vision presence dictionary is not safe across restarts or multiple instances.
2. **Serverless execution:** in-memory status and long-lived connections are unreliable when functions scale to zero or requests land on different instances.
3. **CORS:** Core's current browser origins do not necessarily include the final Sites/Cloudflare domain. The Hub server proxy avoids browser-to-Core CORS coupling.
4. **Identity mismatch:** Hub's Sign in with ChatGPT identity and Core's JWT/Vision authorization are separate trust domains.
5. **Desktop reachability:** Vision, Antigravity, Codex, and possibly Hermes run locally and may not accept inbound connections.
6. **Clock skew:** offline calculation must use authority receipt time, not only producer timestamps.
7. **Concurrency:** a single Boolean can falsely report idle when one of several tasks finishes. Adapters need operation IDs or active counts.
8. **False stuck states:** user approval waits, long model reasoning, and rate-limit backoff need explicit activity kinds and service-specific thresholds.
9. **Provider ambiguity:** Groq or Gemini availability must not be confused with the operational state of a bot using that provider.

## Frontend Requirements

The shelf should be driven entirely by the normalized response:

- One logical card per `serviceId`, or one per instance when the user expands a service.
- `serviceId` selects branding and artwork.
- `state` selects visual behavior.
- Unknown services use a generic TV face without requiring a deployment.
- State behavior:
  - Idle: static logo and subtle powered-on glow.
  - Working: looping service-specific animation.
  - Stuck: pulsing warning treatment with a safe issue summary.
  - Offline: dark screen/static and last-seen time.
- Stale snapshots degrade visibly rather than pretending the last state is current.
- Accessibility includes textual state, reduced-motion behavior, and no reliance on color alone.

## Phased Implementation Roadmap

### Phase 1: Normalize the existing two services

1. Add the status repository and service boundary inside Ascend Core.
2. Replace process-local Vision presence with shared latest-state persistence.
3. Extend the Vision heartbeat with normalized state and safe activity metadata.
4. Instrument Core/AIRA request boundaries with concurrency-aware transitions.
5. Add authenticated producer-write and shelf-read routes.
6. Add tests for authentication, deduplication, ordering, expiry, and concurrent operations.

### Phase 2: Connect Ascend Hub

1. Add a same-origin server-side status proxy.
2. Add configurable 3–5 second browser polling.
3. Render cards from returned service data instead of a hard-coded two-service array.
4. Add stale/offline handling, reduced motion, and generic future-service artwork.

### Phase 3: Add local-agent adapters

1. Audit the installed Antigravity version for supported extension events.
2. Audit the installed Codex CLI version for supported structured notifications or hooks.
3. Build a local adapter capable of supervising or subscribing to these runtimes.
4. Use individual producer credentials for each machine and agent instance.

### Phase 4: Add Hermes and standalone bots

1. Install or identify the exact Hermes Agent distribution.
2. Verify its supported lifecycle interface before selecting hooks versus a wrapper.
3. Instrument each Groq-backed bot at its application request boundary.
4. Register new service branding in Hub; retain generic fallback behavior.

### Phase 5: Extract the authority if warranted

1. Move the repository and routes from Core into a small Status Gateway.
2. Keep the versioned producer and shelf contracts unchanged.
3. Add transition history, alerts, or SSE only when requirements justify them.

## Acceptance Criteria

- Ascend Vision, Core/AIRA, and every future adapter publish the same versioned event shape.
- The shelf can render an unknown service without frontend schema changes.
- Offline state is derived consistently from heartbeat expiry.
- Concurrent tasks do not cause premature idle transitions.
- A process restart or second backend replica does not lose global latest state.
- Browser code never receives producer credentials.
- No status payload contains prompts, user content, source code, screenshots, or secrets.
- A missing optional integration cannot prevent the other shelf cards from updating.
- Polling one Hub endpoint is sufficient for the first release.

## Final Recommendation

Proceed with a producer-adapter architecture and a normalized status authority. Keep the initial authority inside Ascend Core because Vision already communicates with it and Core already owns the relevant authentication and persistence layers. Build that module behind an extraction-friendly interface. Have Ascend Hub poll one server-side proxy endpoint and remain unaware of native agent protocols.

Ascend Vision and Core can be implemented first with verified existing surfaces. Codex CLI and Antigravity require a local adapter audit before implementation. Hermes must be re-audited after installation. Groq and Gemini should normally appear as provider metadata on the bot or agent tile, with separate provider-health tiles added only if operationally useful.
