# Focused Agent Auxiliary Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished, read-only auxiliary console beside each zoomed status TV using only privacy-safe fields from the existing Shelf snapshot.

**Architecture:** A pure presentation-model module allowlists and formats service data. A focused React component renders that model and owns only ephemeral clipboard feedback. The existing page supplies the selected service and adjusts the camera target to reserve panel space; no endpoint, persistence, or provider integration is added.

**Tech Stack:** React 19, TypeScript 5.9, Next/Vinext, Framer Motion 13, CSS, Node test runner via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-22-focused-agent-auxiliary-panel-design.md`

## Global Constraints

- Do not add conversation or transcript display, a prompt composer, or message sending.
- Do not add browser-controlled process launch, resume, stop, or restart.
- Do not add a write-capable Hub endpoint or another persistence layer.
- Render and copy only explicitly allowlisted normalized Shelf fields.
- Never recursively render `provider`, `capabilities`, or `metadata`.
- Preserve the current cinematic shelf zoom, backdrop close, Escape close, focus restoration, reduced motion, and read-only Shelf proxy.
- Do not add dependencies.
- Do not create Git commits; the user will review and commit the finished work.

---

### Task 1: Build the privacy-safe auxiliary presentation model

**Files:**
- Create: `components/status/agent-auxiliary-model.ts`
- Create: `tests/status/agent-auxiliary-model.test.ts`
- Reuse: `components/status/status-presentation.ts`
- Reuse: `app/status/shelf-contract.ts`

**Interfaces:**
- Consumes: `ShelfTvAssignment`, `ShelfServiceStatus`, and `safeStatusText()`.
- Produces:

```ts
export interface AgentAuxiliarySignal {
  label: string;
  value: string;
  tone: "normal" | "positive" | "warning" | "muted";
}

export interface AgentAuxiliaryModel {
  headingId: string;
  channel: ShelfTvAssignment["channel"];
  serviceLabel: string;
  stateLabel: string;
  stateSymbol: string;
  detail: string;
  signalLabel: "LIVE" | "STALE" | "NO SIGNAL" | "CONNECTING";
  signals: AgentAuxiliarySignal[];
  copyText: string;
}

export interface AgentAuxiliaryModelInput {
  assignment: ShelfTvAssignment;
  service: ShelfServiceStatus | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  nowMs: number;
}

export function buildAgentAuxiliaryModel(input: AgentAuxiliaryModelInput): AgentAuxiliaryModel;
```

- [ ] **Step 1: Write failing allowlist and state-formatting tests**

Create fixtures for working, stuck, offline, and idle services. Include secret sentinel strings inside `provider`, `capabilities`, and `metadata`, then assert those strings do not appear in `JSON.stringify(model)` or `model.copyText`.

```ts
test("builds a working console model from allowlisted lifecycle fields", () => {
  const model = buildAgentAuxiliaryModel({
    assignment: { channel: "CH 03", serviceId: "codex-cli" },
    service: {
      ...workingService,
      activity: { kind: "agent-turn", label: "Generating answer", startedAt: "2026-09-22T01:58:30.000Z", progress: 42 },
      provider: { secret: "DO-NOT-RENDER" },
      metadata: { transcript: "DO-NOT-RENDER" },
    },
    loading: false,
    error: null,
    stale: false,
    nowMs: Date.parse("2026-09-22T02:00:00.000Z"),
  });

  assert.equal(model.serviceLabel, "CODEX CLI");
  assert.equal(model.stateLabel, "WORKING");
  assert.equal(model.detail, "Generating answer");
  assert.equal(model.signalLabel, "LIVE");
  assert.match(model.copyText, /STATE: WORKING/);
  assert.equal(JSON.stringify(model).includes("DO-NOT-RENDER"), false);
});
```

Also assert that invalid timestamps become `UNKNOWN`, progress is clamped to `0%`–`100%`, upstream strings are sanitized/length-limited, stale snapshots say `STALE`, and no-service loading/error/empty inputs report truthful states.

- [ ] **Step 2: Run the model test and verify RED**

Run:

```powershell
& D:\node.exe .\node_modules\tsx\dist\cli.mjs --test tests/status/agent-auxiliary-model.test.ts
```

Expected: FAIL because `agent-auxiliary-model.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure model**

Use fixed service labels and deterministic duration formatting. Derive time from the injected `nowMs`; never call `Date.now()` inside the pure function.

```ts
const SERVICE_LABELS: Record<ShelfTvAssignment["serviceId"], string> = {
  "ascend-core": "ASCEND CORE / AIRA",
  "ascend-vision": "ASCEND VISION",
  "codex-cli": "CODEX CLI",
  "antigravity-cli": "ANTIGRAVITY CLI",
};

function relativeAge(iso: string | undefined, nowMs: number): string {
  if (!iso) return "UNKNOWN";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "UNKNOWN";
  const seconds = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (seconds < 60) return `${seconds}S AGO`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}M AGO`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}H AGO`;
  return `${Math.floor(seconds / 86400)}D AGO`;
}
```

For a service, use `getStatusPresentation(service)` for the state label/symbol. Prefer safe activity text when working, safe issue text when stuck, last-seen detail when offline, and `HEARTBEAT CONFIRMED` when idle. Build signal rows only from allowlisted scalar fields. For no service, use fixed UI strings and never include the raw `error` value.

- [ ] **Step 4: Run the model test and verify GREEN**

Run the same focused command. Expected: all tests pass.

---

### Task 2: Render the accessible auxiliary console

**Files:**
- Create: `components/status/AgentAuxiliaryPanel.tsx`
- Create: `tests/status/agent-auxiliary-panel.test.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `AgentAuxiliaryModel` from Task 1.
- Produces:

```ts
export interface AgentAuxiliaryPanelProps {
  model: AgentAuxiliaryModel;
  open: boolean;
  reduceMotion: boolean;
  onClose: () => void;
}

export function AgentAuxiliaryPanel(props: AgentAuxiliaryPanelProps): React.ReactElement;
```

- [ ] **Step 1: Write the failing static-markup test**

Render the component with `renderToStaticMarkup` and assert the semantic structure and truthful labels.

```ts
test("renders the focused service console with safe actions", () => {
  const markup = renderToStaticMarkup(createElement(AgentAuxiliaryPanel, {
    model,
    open: true,
    reduceMotion: false,
    onClose() {},
  }));

  assert.match(markup, /aria-labelledby="agent-console-codex-cli"/);
  assert.match(markup, />CODEX CLI</);
  assert.match(markup, />WORKING</);
  assert.match(markup, />COPY STATUS</);
  assert.match(markup, />ZOOM OUT</);
  assert.match(markup, /aria-live="polite"/);
});
```

Assert that every signal row renders as text and that no transcript, prompt, message textbox, or send button exists.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
& D:\node.exe .\node_modules\tsx\dist\cli.mjs --test tests/status/agent-auxiliary-panel.test.ts
```

Expected: FAIL because `AgentAuxiliaryPanel.tsx` does not exist.

- [ ] **Step 3: Implement the panel and clipboard feedback**

Create a client component using `motion.aside`, `Copy`, `Radio`, and `X` icons. Keep clipboard state local:

```tsx
const [copyResult, setCopyResult] = useState<"idle" | "copied" | "failed">("idle");

async function handleCopy() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(model.copyText);
    setCopyResult("copied");
  } catch {
    setCopyResult("failed");
  }
}
```

Render a labelled heading, state block, detail, `<dl>` signal rows, `COPY STATUS`, `ZOOM OUT`, and a polite live region containing `STATUS COPIED`, `COPY FAILED`, or an empty string. Do not render a textarea, input, transcript list, or arbitrary model object.

- [ ] **Step 4: Add the visual treatment and responsive layout**

Add focused selectors in `app/globals.css`:

```css
.agent-auxiliary-panel {
  position: absolute;
  right: clamp(20px, 4vw, 72px);
  top: 50%;
  width: min(31vw, 430px);
  max-height: min(74vh, 680px);
  transform: translateY(-50%);
  overflow: auto;
}

@media (max-width: 860px) {
  .agent-auxiliary-panel {
    inset: auto 12px 12px;
    width: auto;
    max-height: 40vh;
    transform: none;
  }
}
```

Style it as an in-world HDD auxiliary console: dark glass, rounded industrial frame, amber/green status accents, scanlines, high-contrast type, compact signal rows, and visible keyboard focus. Avoid generic card styling and keep the panel visually subordinate to the TV.

- [ ] **Step 5: Run the component and full status suites**

Run:

```powershell
npm run test:status
```

Expected: all status tests pass.

---

### Task 3: Reserve camera space and integrate the console

**Files:**
- Modify: `components/status/shelf-tv-focus.ts`
- Modify: `tests/status/shelf-tv-focus.test.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Extends `getShelfSceneCameraMotion()` with an optional focus region:

```ts
export interface ShelfCameraFocusArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function getShelfSceneCameraMotion(
  target: ShelfTvFocusRect,
  scene: ShelfTvFocusRect,
  viewport: ShelfTvFocusViewport,
  focusArea?: ShelfCameraFocusArea,
): ShelfSceneCameraMotion;
```

- Consumes `buildAgentAuxiliaryModel()` and `AgentAuxiliaryPanel`.

- [ ] **Step 1: Add failing camera-region tests**

Keep every existing test unchanged and add:

```ts
test("centers the TV inside a desktop focus region reserved for the console", () => {
  const motion = getShelfSceneCameraMotion(target, scene, { width: 1440, height: 900 }, {
    left: 0,
    top: 0,
    width: 900,
    height: 900,
  });

  const projectedCenter = scene.left + motion.translateX +
    (target.left + target.width / 2 - scene.left) * motion.scale;
  assert.equal(Math.round(projectedCenter), 450);
});
```

Also assert that omitting `focusArea` preserves the previous full-viewport result.

- [ ] **Step 2: Run the camera test and verify RED**

Run:

```powershell
& D:\node.exe .\node_modules\tsx\dist\cli.mjs --test tests/status/shelf-tv-focus.test.ts
```

Expected: FAIL because the fourth argument is unsupported or the target still centers in the full viewport.

- [ ] **Step 3: Implement focus-region-aware camera math**

Use the supplied focus region for scale and center calculations, falling back to the original viewport rectangle:

```ts
const area = focusArea ?? { left: 0, top: 0, width: viewport.width, height: viewport.height };
const scale = Math.min(
  area.width * 0.72 / target.width,
  area.height * 0.7 / target.height,
  MAX_CAMERA_SCALE,
);

return {
  scale,
  translateX: area.left + area.width / 2 - scene.left - localCenterX * scale,
  translateY: area.top + area.height / 2 - scene.top - localCenterY * scale,
};
```

- [ ] **Step 4: Integrate the selected service and panel into `app/page.tsx`**

Import `AgentAuxiliaryPanel` and `buildAgentAuxiliaryModel`. Resolve the focused service from the current snapshot:

```ts
const focusedService = focusedStatusTv
  ? shelfStatus.current?.services.find(
      service => service.serviceId === focusedStatusTv.assignment.serviceId,
    ) ?? null
  : null;

const focusedAgentModel = focusedStatusTv
  ? buildAgentAuxiliaryModel({
      assignment: focusedStatusTv.assignment,
      service: focusedService,
      loading: shelfStatus.loading && !shelfStatus.current,
      error: shelfStatus.error,
      stale: Boolean(shelfStatus.stale),
      nowMs: shelfStatus.current ? Date.parse(shelfStatus.current.generatedAt) : 0,
    })
  : null;
```

Render `AgentAuxiliaryPanel` inside the existing camera dialog. Pass the same close callback used by backdrop and Escape.

On TV click, reserve panel space only when `window.innerWidth > 860`:

```ts
const focusArea = window.innerWidth > 860
  ? { left: 0, top: 0, width: window.innerWidth * 0.64, height: window.innerHeight }
  : undefined;
```

Pass `focusArea` as the fourth camera helper argument.

- [ ] **Step 5: Update keyboard focus containment**

Add a `cameraControlsRef` to the dialog. On Tab, query enabled buttons inside the dialog and wrap from the last to the first and vice versa. Keep initial focus on the existing top-right Zoom Out control and preserve focus restoration to `cameraTriggerRef` after close.

```ts
const focusables = Array.from(
  cameraControlsRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
);
```

Do not collapse all Tab presses back to a single button; Copy Status and the panel Zoom Out button must be keyboard reachable.

- [ ] **Step 6: Run the status suite**

Run `npm run test:status`. Expected: all tests pass.

---

### Task 4: Document and verify the finished feature

**Files:**
- Modify: `README.md`
- Verify: all files touched in Tasks 1–3

**Interfaces:**
- No new runtime interface.
- Documents the read-only auxiliary console and its privacy boundary.

- [ ] **Step 1: Update the README feature list**

Add one bullet under Features:

```markdown
- A focused-TV auxiliary console with privacy-safe lifecycle details and local status-copy controls; transcripts and browser message sending are intentionally excluded.
```

Add a short note to Security and privacy that the focused panel renders only allowlisted normalized Shelf fields and ignores provider/capability/metadata objects.

- [ ] **Step 2: Run focused tests and touched-file lint**

Run:

```powershell
npm run test:status
npx eslint app/page.tsx components/status/AgentAuxiliaryPanel.tsx components/status/agent-auxiliary-model.ts components/status/shelf-tv-focus.ts tests/status/agent-auxiliary-model.test.ts tests/status/agent-auxiliary-panel.test.ts tests/status/shelf-tv-focus.test.ts
```

Expected: zero failures in the focused test and lint commands.

- [ ] **Step 3: Run the production build**

Run:

```powershell
npm run build
```

Expected: successful production build.

- [ ] **Step 4: Check whitespace and repository state**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors. Report all modified/untracked files and explicitly confirm that no commit was created.

- [ ] **Step 5: Perform manual browser QA**

With Core and Hub running, verify:

1. Each of the four TVs opens the correct service console.
2. Desktop zoom places the TV left of the panel while nearby shelf props remain visible.
3. At widths at or below 860 px, the panel becomes a bottom sheet and does not cover Zoom Out.
4. Live state changes update the open console on the next Shelf poll.
5. Copy Status copies only the displayed safe summary.
6. Escape, backdrop click, top Zoom Out, and panel Zoom Out reverse the camera and return focus to the triggering TV.
7. Keyboard Tab reaches every panel action and wraps inside the dialog.
8. Reduced-motion mode removes the cinematic delay.
9. Browser network responses contain no credentials, transcript content, or new write requests.

