# Ascend Hub

A customizable retro dashboard for the Ascend ecosystem, with CRT-style televisions that display live AI service status. Currently supports Codex CLI, Antigravity CLI, and my Personal Projects (Core and Vision).

Future Ideas: Agent Orchestration.

Hub is the presentation layer—not the status authority. Ascend Core stores normalized status and derives offline state; Hub reads that existing v1 API through a server-side proxy.

## Features

- Retro TV cards, shelves, collectibles, and an editable room layout.
- A data-driven Status Shelf generated from Core's `services[]` response.
- Four states: `idle`, `working`, `stuck`, and `offline`, with textual state cues and last-seen information.
- Four-second polling, reduced polling in hidden tabs, and visible stale/error handling.
- A focused-TV auxiliary console with privacy-safe lifecycle details and local status-copy controls; transcripts and browser message sending are intentionally excluded.
- Generic TV cards for unknown services, without frontend changes.
- Reduced-motion support and non-color-only status cues.
- Separate, instance-bound local-agent adapters with durable operation tracking.

## Connected services

| Service | Status identity | Supported reporting path |
| --- | --- | --- |
| Ascend Core / AIRA | `ascend-core` | Core instrumentation with concurrent-operation tracking |
| Ascend Vision | `ascend-vision` | Authenticated Vision heartbeats |
| Codex CLI | `codex-cli` | Status wrapper with explicit session hook overrides |
| Antigravity CLI | `antigravity-cli` | Status wrapper, workspace hooks, and child-process-exit cleanup |

CLI reporting applies only to sessions launched through their status wrappers. Antigravity IDE/sidebar reporting remains **blocked / unsupported**; it is not the CLI integration. Hermes and standalone bot adapters are not implemented yet.

Phase 1 (Core + Vision), Phase 2 (Hub), and the approved Phase 3 CLI path have been live-validated. See the [implementation status](docs/phase-3-implementation-status.md) for evidence and limitations.

## Run the Hub locally

Requires Node.js **22.13.0 or newer** and npm. The Hub development runtime supports Windows, macOS, and Linux; the current operator-facing CLI adapter launchers use Windows PowerShell and DPAPI.

### 1. Start Ascend Core

Keep the existing Ascend Core server running. Hub reads the live Shelf snapshot from Core; it does not create status data itself.

### 2. Configure the read-only connection

Create an ignored `.env.local` file at the repository root:

```env
ASCEND_CORE_SHELF_URL=<full URL of your existing Core Shelf read endpoint>
ASCEND_SHELF_READ_CREDENTIAL=<dedicated read-only authority credential>
```

Replace the placeholders with your deployment values and restart Hub after changing them. Production requires an HTTPS Core endpoint reachable from the Hub server and equivalent server-side environment/secret configuration.

Use a dedicated **read-only** credential—not a browser session cookie, user Bearer token, or Core/Vision/CLI producer credential. Never prefix these variables with `NEXT_PUBLIC_` or commit real credentials.

The browser requests only `GET /api/status/shelf`. Hub authenticates upstream using `X-Status-Read-Credential`, validates the schema-v1 response, and returns the normalized snapshot without exposing the credential. Missing configuration or an unavailable authority produces a visible unavailable/stale state, not simulated live status.

### 3. Start Hub

In a new PowerShell terminal:

```powershell
Set-Location D:\ascend_hub
# Run this once after cloning or after dependency changes.
npm run install:ci
npm run dev
```

If Node is not on your `PATH`, use the known Node executable instead:

```powershell
Set-Location D:\ascend_hub
& D:\node.exe scripts\run-framework.mjs dev
```

Leave this terminal open. Hub normally starts at `http://localhost:5173`.

### 4. Confirm the Hub proxy

In another PowerShell terminal, request the normalized Shelf snapshot:

```powershell
Invoke-RestMethod 'http://localhost:5173/api/status/shelf' |
  ConvertTo-Json -Depth 10
```

Expected shape:

```json
{
  "schemaVersion": 1,
  "generatedAt": "...",
  "services": []
}
```

The service list should include `ascend-core`, `ascend-vision`, `codex-cli`, and `antigravity-cli` when those reporters have been provisioned. CLI services may correctly appear offline while their wrappers are not running.

If `localhost` does not load, the development server may be listening only on IPv6 loopback. Use:

```powershell
Invoke-RestMethod 'http://[::1]:5173/api/status/shelf' |
  ConvertTo-Json -Depth 10
```

Do not substitute `127.0.0.1` when the server is bound only to `::1`.

### 5. Open the dashboard

Open `http://localhost:5173` in a browser. If needed, use `http://[::1]:5173`.

Check that the four shelf TVs report the correct service:

| TV | Service | Expected state |
| --- | --- | --- |
| CH 01 | Ascend Core / AIRA | `idle`, `working`, `stuck`, or `offline` |
| CH 02 | Ascend Vision | `idle`, `working`, `stuck`, or `offline` |
| CH 03 | Codex CLI | `idle`, `working`, `stuck`, or `offline` |
| CH 04 | Antigravity CLI | `idle`, `working`, `stuck`, or `offline` |

The dashboard refreshes about every four seconds. Offline TVs show last-seen information. The read credential must never appear in browser responses or developer tools.

#### Blue-eye TV navigation

- Use **WASD** or the **Arrow keys** to move the Ascend Vision eye between the four status TVs. Moving does not zoom the shelf.
- Press **Space** to open the selected TV and its read-only auxiliary panel.
- Click or tap a TV to open it immediately.
- Press **Escape** or choose **Zoom Out** to return to the shelf. The previous TV remains selected.

### 6. Test Vision (optional)

With Core and Hub running:

1. Start Vision normally and confirm its TV becomes `idle`.
2. Confirm its heartbeat advances.
3. Stop Vision and wait about 30 seconds.
4. Confirm its TV becomes `offline` and displays its last-seen time.

### 7. Test Codex CLI (optional)

Launch Codex through its status wrapper—not directly through the Codex executable:

```powershell
Set-Location D:\ascend-core
& 'D:\ascend_hub\scripts\status-adapters\codex-status.ps1' `
  -ConfigPath 'D:\ascend-status-adapters\codex-local-1\config.json'
```

Run a harmless task. The Codex TV should transition `offline → working → idle`. After Codex exits, it should become `offline` after roughly 30 seconds.

### 8. Test Antigravity CLI (optional)

Antigravity status is supported only when launched through the wrapper. The Antigravity IDE/sidebar is not a supported reporter.

First verify that the trusted local probe workspace exists:

```powershell
$agyWorkspace = "$env:TEMP\ascend-phase3-agy-probe-20260918-4c81e5"
Test-Path -LiteralPath $agyWorkspace
```

If this returns `True`, launch the real Antigravity CLI through the wrapper:

```powershell
& 'D:\ascend_hub\scripts\status-adapters\antigravity-status.ps1' `
  -Workspace $agyWorkspace
```

For a normal completion, submit:

```text
Compute 2 + 2 and reply with the number only. Do not use tools.
```

The Antigravity TV should transition `offline → working → idle`.

For an interruption test, launch it again, submit a long harmless task, then press `Ctrl+C` while it is working. The wrapper must safely close the operation as interrupted or abandoned; it must never report that interrupted run as completed. After Antigravity exits, its TV should become `offline` after about 30 seconds.

If the workspace check returns `False`, do not install hooks into another workspace. Follow the [Antigravity CLI setup guide](docs/antigravity-cli-status-adapter.md) instead.

### 9. Stop Hub

Press `Ctrl+C` in the Hub terminal.

- `502` from the proxy means Core is unreachable.
- `503` means Hub is missing configuration or needs a restart after changing `.env.local`.

### Local-agent setup

Follow the operator guides before provisioning or launching an adapter:

- [Codex CLI setup and lifecycle mapping](docs/codex-status-adapter.md)
- [Antigravity CLI setup and wrapper boundary](docs/antigravity-cli-status-adapter.md)

Each agent needs its own instance-bound producer credential. Credentials and durable runtime stores belong outside this repository. Keep `scripts/status-adapters/` paths stable because installed hooks reference them. The guides document verified versions and machine-specific executable/configuration paths; adjust deployment paths deliberately rather than bypassing launcher validation.

## Development commands

```sh
npm run dev                                      # Development server
npm run test:status                              # Hub Shelf tests
node --no-warnings --test tests/phase3/*.test.mjs  # Local-agent adapter tests
npm run lint                                     # Repository lint
npm run build                                    # Production build
npm start                                        # Local preview of the built Worker
git diff --check                                 # Whitespace checks
```

`npm start` requires a successful build and previews the generated Worker locally; it does not deploy. Repository-wide lint has known existing UI/vendor findings; a successful build or focused test run does not mean full lint is clean.

## Repository structure

| Path | Purpose |
| --- | --- |
| `app/` | Pages, routing, Shelf proxy, and polling logic |
| `components/`, `hooks/`, `lib/` | UI components and shared application logic |
| `public/` | Runtime artwork, fonts, and models |
| `scripts/status-adapters/` | Production CLI wrappers, hooks, stores, and reporters |
| `tests/status/`, `tests/phase3/` | Shelf and adapter regression tests |
| `docs/`, `docs/design/` | Architecture audits, operator guides, and design references |
| `build/` | Required build-plugin source—not generated output |
| `vendor/` | Vendored styles/licenses and the standalone TV reference project |
| `worker/`, `.openai/` | Worker entry point and hosting configuration |
| `db/`, `drizzle/`, `examples/` | Optional database integration |
| `scratch/` | Ignored local inspection and QA files |

## Security and privacy

- Browser code never receives producer or Shelf read credentials.
- Status reporters allowlist lifecycle metadata; they do not send prompts, responses, transcripts, source code, tool I/O, terminal output, or raw errors.
- The focused-TV auxiliary console renders only allowlisted normalized Shelf fields and ignores arbitrary provider, capability, and metadata objects.
- Concurrent operations remain `working` until the final active operation closes.
- Antigravity child exit is a session boundary, not proof of completion. Orphaned operations become `interrupted-or-abandoned`; completed operations are preserved.
- Core derives `offline` after heartbeat expiry. Hub shows stale snapshots explicitly when polling fails.
- `.gitignore` excludes local secrets, dependencies, generated output, SQLite state, and scratch evidence. Review staged changes before publishing; ignore rules do not protect secrets already tracked by Git.

## Documentation

- [Authoritative Status Shelf architecture](<future ai implementation.md>)
- [Phase 3 audit](docs/phase-3-local-ai-status-adapter-audit.md)
- [Phase 3 implementation status](docs/phase-3-implementation-status.md)
- [Development, hosting, authentication, and optional database setup](docs/development-and-hosting.md)
- [Design references](docs/design/README.md)

Built with React, TypeScript, Tailwind CSS, Three.js, and Vinext on a Cloudflare Worker runtime. Third-party reference assets and vendored code retain their existing files and notices; their presence does not grant redistribution rights.
