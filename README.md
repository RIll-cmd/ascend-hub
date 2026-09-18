# Ascend Hub

A customizable retro dashboard for the Ascend ecosystem, with CRT-style televisions that display live AI service status.

Hub is the presentation layer—not the status authority. Ascend Core stores normalized status and derives offline state; Hub reads that existing v1 API through a server-side proxy.

## Features

- Retro TV cards, shelves, collectibles, and an editable room layout.
- A data-driven Status Shelf generated from Core's `services[]` response.
- Four states: `idle`, `working`, `stuck`, and `offline`, with textual state cues and last-seen information.
- Four-second polling, reduced polling in hidden tabs, and visible stale/error handling.
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

## Quick start

Requires Node.js **22.13.0 or newer** and npm. The Hub development runtime supports Windows, macOS, and Linux; the current operator-facing CLI adapter launchers use Windows PowerShell and DPAPI.

From the repository root:

```sh
npm run install:ci
npm run dev
```

Open the local URL printed by the server (the portable development default is port `5173`). A clean clone uses the portable execution profile automatically.

### Configure the Status Shelf

Create an ignored `.env.local` file at the repository root:

```env
ASCEND_CORE_SHELF_URL=<full URL of your existing Core Shelf read endpoint>
ASCEND_SHELF_READ_CREDENTIAL=<dedicated read-only authority credential>
```

Replace the placeholders with your deployment values and restart Hub after changing them. Production requires an HTTPS Core endpoint reachable from the Hub server and equivalent server-side environment/secret configuration.

Use a dedicated **read-only** credential—not a browser session cookie, user Bearer token, or Core/Vision/CLI producer credential. Never prefix these variables with `NEXT_PUBLIC_` or commit real credentials.

The browser requests only `GET /api/status/shelf`. Hub authenticates upstream using `X-Status-Read-Credential`, validates the schema-v1 response, and returns the normalized snapshot without exposing the credential. Missing configuration or an unavailable authority produces a visible unavailable/stale state, not simulated live status.

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
