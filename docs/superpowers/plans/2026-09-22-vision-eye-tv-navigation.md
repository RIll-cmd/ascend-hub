# Ascend Vision Eye TV Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a high-quality animated Ascend Vision eye that navigates spatially between the four status TVs and opens the selected TV with Space while preserving immediate mouse activation.

**Architecture:** Keep navigation rules in a pure TypeScript module and render the character as a measured, scene-local SVG overlay. `app/page.tsx` owns selection and focus state, reuses the existing camera calculation, and delegates presentation and geometry to focused modules.

**Tech Stack:** React 19, TypeScript, Framer Motion, inline SVG, CSS, Node test runner via `tsx --test`

**Spec:** `docs/superpowers/specs/2026-09-22-vision-eye-tv-navigation-design.md`

## Global Constraints

### Execution record — 2026-09-22

Implemented inline in the existing workspace. Added the procedural SVG eye, curved travel, spatial selection, Space activation, immediate click activation, retained selection on exit, input/modal guards, responsive sizing, and reduced-motion support. Directional filtering now stays at grid edges instead of jumping to a slightly staggered row. Measurements pause during focus and resume on camera exit.

Verification: 34 status tests passed; new feature modules lint clean; production build passed; `git diff --check` passed. Automated Chrome checks passed for Right navigation, right-edge clamping, no zoom while selecting, Space opening the panel, Escape preserving selection, center alignment at 390/768/1440px, and reduced-motion animation suppression. Existing page-level lint findings remain outside this change. No commit was created. Checklist steps below preserve the original proposed execution sequence; this record describes the actual verification completed.

- Do not display or ship `D:\ascend-vision\fairy-gif.png`; use it only as visual reference.
- Do not add a Three.js or canvas dependency.
- Arrow keys and WASD select without zooming; Space activates.
- Mouse/touch click selects and activates immediately.
- Preserve the existing camera zoom, auxiliary panel, status API, and muted status video behavior.
- Do not record or expose prompts, responses, transcripts, credentials, or raw agent content.
- Do not make Git commits; the repository owner will commit the completed work.

---

### Task 1: Pure spatial navigation model

**Files:**
- Create: `components/status/vision-eye-navigation.ts`
- Test: `tests/status/vision-eye-navigation.test.ts`

**Interfaces:**
- Produces: `VisionEyeServiceId`, `VisionEyeDirection`, `VisionEyeTarget`, `getVisionEyeCommand(event)`, `isVisionEyeKeyboardTarget(target)`, and `findDirectionalVisionEyeTarget(currentId, direction, targets)`.
- Consumes: no React or DOM rendering state; geometry is plain data so it can be unit tested.

- [ ] **Step 1: Write failing keyboard-command tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  findDirectionalVisionEyeTarget,
  getVisionEyeCommand,
  type VisionEyeTarget,
} from "../../components/status/vision-eye-navigation";

test("maps arrows and WASD to movement and Space to activation", () => {
  assert.equal(getVisionEyeCommand({ key: "ArrowLeft" }), "left");
  assert.equal(getVisionEyeCommand({ key: "d" }), "right");
  assert.equal(getVisionEyeCommand({ key: "W" }), "up");
  assert.equal(getVisionEyeCommand({ key: "s" }), "down");
  assert.equal(getVisionEyeCommand({ key: " " }), "activate");
  assert.equal(getVisionEyeCommand({ key: "Enter" }), null);
});
```

- [ ] **Step 2: Run the new test and confirm the module is missing**

Run: `& D:\node.exe node_modules\tsx\dist\cli.mjs --test tests/status/vision-eye-navigation.test.ts`

Expected: FAIL because `components/status/vision-eye-navigation.ts` does not exist.

- [ ] **Step 3: Add failing spatial-navigation tests**

```ts
const targets: VisionEyeTarget[] = [
  { serviceId: "ascend-core", channel: "CH 01", x: 100, y: 100, width: 80, height: 60 },
  { serviceId: "ascend-vision", channel: "CH 02", x: 400, y: 110, width: 80, height: 60 },
  { serviceId: "codex-cli", channel: "CH 03", x: 110, y: 350, width: 80, height: 60 },
  { serviceId: "antigravity-cli", channel: "CH 04", x: 410, y: 360, width: 80, height: 60 },
];

test("chooses the nearest TV in the requested direction", () => {
  assert.equal(findDirectionalVisionEyeTarget("ascend-core", "right", targets)?.serviceId, "ascend-vision");
  assert.equal(findDirectionalVisionEyeTarget("ascend-core", "down", targets)?.serviceId, "codex-cli");
  assert.equal(findDirectionalVisionEyeTarget("antigravity-cli", "left", targets)?.serviceId, "codex-cli");
  assert.equal(findDirectionalVisionEyeTarget("antigravity-cli", "up", targets)?.serviceId, "ascend-vision");
});

test("keeps selection when no target exists in that direction", () => {
  assert.equal(findDirectionalVisionEyeTarget("ascend-core", "left", targets)?.serviceId, "ascend-core");
});
```

- [ ] **Step 4: Implement the pure model**

```ts
export type VisionEyeServiceId = "ascend-core" | "ascend-vision" | "codex-cli" | "antigravity-cli";
export type VisionEyeDirection = "left" | "right" | "up" | "down";
export type VisionEyeCommand = VisionEyeDirection | "activate";

export interface VisionEyeTarget {
  serviceId: VisionEyeServiceId;
  channel: "CH 01" | "CH 02" | "CH 03" | "CH 04";
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getVisionEyeCommand(event: Pick<KeyboardEvent, "key">): VisionEyeCommand | null {
  const key = event.key.toLowerCase();
  if (key === "arrowleft" || key === "a") return "left";
  if (key === "arrowright" || key === "d") return "right";
  if (key === "arrowup" || key === "w") return "up";
  if (key === "arrowdown" || key === "s") return "down";
  if (event.key === " " || event.key === "Spacebar") return "activate";
  return null;
}

export function isVisionEyeKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select, button, a, [contenteditable='true']") ||
    Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']"));
}

export function findDirectionalVisionEyeTarget(
  currentId: VisionEyeServiceId,
  direction: VisionEyeDirection,
  targets: readonly VisionEyeTarget[],
): VisionEyeTarget | null {
  const current = targets.find(target => target.serviceId === currentId);
  if (!current) return null;
  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  const candidates = targets.filter(target => {
    if (target.serviceId === currentId) return false;
    const primary = horizontal ? target.x - current.x : target.y - current.y;
    return primary * sign > 0;
  });
  return candidates.sort((a, b) => {
    const score = (target: VisionEyeTarget) => {
      const primary = Math.abs(horizontal ? target.x - current.x : target.y - current.y);
      const cross = Math.abs(horizontal ? target.y - current.y : target.x - current.x);
      return primary + cross * 1.75;
    };
    return score(a) - score(b);
  })[0] ?? current;
}
```

- [ ] **Step 5: Run the focused tests**

Run: `& D:\node.exe node_modules\tsx\dist\cli.mjs --test tests/status/vision-eye-navigation.test.ts`

Expected: all navigation tests PASS.

- [ ] **Step 6: Stop at the user-managed commit checkpoint**

Do not run `git add` or `git commit`. Report Task 1 files and verification result.

### Task 2: Animated SVG eye and responsive target measurement

**Files:**
- Create: `components/status/VisionEyeNavigator.tsx`
- Modify: `app/globals.css`
- Modify: `tests/status/vision-eye-navigation.test.ts`

**Interfaces:**
- Consumes: `VisionEyeServiceId` and `VisionEyeTarget` from Task 1; a `sceneElement`, `selectedServiceId`, `hidden`, `activating`, and `reduceMotion` from the page.
- Produces: `onTargetsChange(targets: readonly VisionEyeTarget[])` whenever measured geometry changes.

- [ ] **Step 1: Add a source-contract test for the procedural model**

Add a test that reads the component source and verifies the procedural layers exist without referencing the original image:

```ts
import { readFile } from "node:fs/promises";

test("renders a procedural eye instead of embedding the source GIF", async () => {
  const source = await readFile("components/status/VisionEyeNavigator.tsx", "utf8");
  assert.match(source, /vision-eye__outer-ring/);
  assert.match(source, /vision-eye__iris/);
  assert.match(source, /vision-eye__pupil/);
  assert.match(source, /vision-eye__particle/);
  assert.doesNotMatch(source, /fairy-gif|<img|next\/image/i);
});
```

- [ ] **Step 2: Run the test and confirm the component is missing**

Run: `& D:\node.exe node_modules\tsx\dist\cli.mjs --test tests/status/vision-eye-navigation.test.ts`

Expected: FAIL with `ENOENT` for `VisionEyeNavigator.tsx`.

- [ ] **Step 3: Implement target measurement and presentation props**

Create the component with this public contract:

```tsx
export interface VisionEyeNavigatorProps {
  sceneElement: HTMLElement | null;
  selectedServiceId: VisionEyeServiceId;
  hidden: boolean;
  activating: boolean;
  reduceMotion: boolean;
  layoutVersion: string;
  onTargetsChange: (targets: readonly VisionEyeTarget[]) => void;
}
```

Inside `useLayoutEffect`, query:

```ts
const triggers = sceneElement.querySelectorAll<HTMLElement>("[data-status-service-id]");
const sceneRect = sceneElement.getBoundingClientRect();
const targets = Array.from(triggers).flatMap(trigger => {
  const screen = trigger.querySelector<HTMLElement>(".shelf-status-tv__screen");
  const serviceId = trigger.dataset.statusServiceId as VisionEyeServiceId | undefined;
  const channel = trigger.dataset.statusChannel as VisionEyeTarget["channel"] | undefined;
  if (!screen || !serviceId || !channel) return [];
  const rect = screen.getBoundingClientRect();
  return [{
    serviceId,
    channel,
    x: rect.left - sceneRect.left + rect.width / 2,
    y: rect.top - sceneRect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
  }];
});
```

Observe `sceneElement` and each trigger with one `ResizeObserver`, remeasure on window resize, and clean up both listeners. Call `onTargetsChange` after each complete measurement.

- [ ] **Step 4: Build the layered SVG character**

Render one `motion.div` located at the selected target center. The SVG must include `<defs>` for radial gradients and restrained blur filters, then named layers:

```tsx
<motion.div
  className={`vision-eye-navigator${activating ? " is-activating" : ""}`}
  aria-hidden="true"
  animate={{ x: target.x, y: target.y, opacity: hidden ? 0 : 1 }}
  transition={reduceMotion ? { duration: 0 } : { duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
>
  <svg className="vision-eye" viewBox="0 0 180 180">
    <g className="vision-eye__halo">...</g>
    <g className="vision-eye__outer-ring">...</g>
    <g className="vision-eye__iris">...</g>
    <g className="vision-eye__pupil">...</g>
    <g className="vision-eye__particles">
      <circle className="vision-eye__particle vision-eye__particle--one" ... />
      <circle className="vision-eye__particle vision-eye__particle--two" ... />
      <circle className="vision-eye__particle vision-eye__particle--three" ... />
    </g>
  </svg>
</motion.div>
```

Use complete SVG primitives rather than external images: concentric circles, dashed orbital strokes, four tracking ticks, a white radial pupil, and three small particle circles. Keep filter bounds generous (`x="-60%"`, `width="220%"`) so glow is not clipped.

- [ ] **Step 5: Add the visual states and controls legend CSS**

Add named styles to `app/globals.css`:

```css
.vision-eye-layer { position: absolute; inset: 0; z-index: 24; pointer-events: none; overflow: visible; }
.vision-eye-navigator { position: absolute; left: 0; top: 0; width: clamp(62px, 6vw, 94px); aspect-ratio: 1; translate: -50% -50%; will-change: transform, opacity; }
.vision-eye { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 0 16px rgba(80, 208, 255, .7)); }
.vision-eye__outer-ring { transform-origin: 90px 90px; animation: vision-eye-spin 8s linear infinite; }
.vision-eye__iris { transform-origin: 90px 90px; animation: vision-eye-spin-reverse 5.6s linear infinite; }
.vision-eye__pupil { transform-origin: 90px 90px; animation: vision-eye-breathe 2.8s ease-in-out infinite; }
.vision-eye__particle { transform-origin: 90px 90px; animation: vision-eye-orbit 4.4s linear infinite; }
.vision-eye-navigator.is-activating { animation: vision-eye-activate 220ms cubic-bezier(.7,0,.84,0) both; }
.shelf-status-tv-trigger.is-vision-eye-selected { outline: 2px solid rgba(101, 222, 255, .9); outline-offset: 5px; filter: drop-shadow(0 0 12px rgba(64, 193, 255, .58)); }
.vision-eye-controls { position: absolute; /* use existing cabinet typography and restrained cyan treatment */ }
```

Define every referenced keyframe. Under the existing reduced-motion media query, set animation to `none`, remove trails/particles, and keep a static eye and selected outline.

- [ ] **Step 6: Run focused tests and lint the new component**

Run:

```powershell
& D:\node.exe node_modules\tsx\dist\cli.mjs --test tests/status/vision-eye-navigation.test.ts
& D:\node.exe node_modules\eslint\bin\eslint.js components/status/VisionEyeNavigator.tsx components/status/vision-eye-navigation.ts tests/status/vision-eye-navigation.test.ts
```

Expected: tests PASS and ESLint exits 0.

- [ ] **Step 7: Stop at the user-managed commit checkpoint**

Do not commit. Report the new component, CSS section, and verification result.

### Task 3: Integrate browsing, Space activation, and immediate click activation

**Files:**
- Modify: `app/page.tsx:2-55`
- Modify: `app/page.tsx:340-482`
- Modify: `app/page.tsx:1087-1153`
- Modify: `app/page.tsx:1295-1330`
- Modify: `tests/status/vision-eye-navigation.test.ts`

**Interfaces:**
- Consumes: `VisionEyeNavigator`, `findDirectionalVisionEyeTarget`, `getVisionEyeCommand`, `isVisionEyeKeyboardTarget`, and the existing `getShelfSceneCameraMotion`.
- Produces: one retained `selectedVisionEyeServiceId`, the shared `activateStatusTv()` path, and status-TV data attributes/classes.

- [ ] **Step 1: Add an integration source-contract test**

```ts
test("page integrates selection-only movement and Space activation", async () => {
  const source = await readFile("app/page.tsx", "utf8");
  assert.match(source, /selectedVisionEyeServiceId/);
  assert.match(source, /getVisionEyeCommand/);
  assert.match(source, /activateStatusTv/);
  assert.match(source, /data-status-service-id/);
  assert.match(source, /<VisionEyeNavigator/);
});
```

- [ ] **Step 2: Run the focused test and confirm integration is absent**

Run: `& D:\node.exe node_modules\tsx\dist\cli.mjs --test tests/status/vision-eye-navigation.test.ts`

Expected: FAIL because the page does not yet include the navigation integration.

- [ ] **Step 3: Add page state and a shared activation function**

Add imports for the component and pure helpers. Add:

```ts
const [selectedVisionEyeServiceId, setSelectedVisionEyeServiceId] =
  useState<VisionEyeServiceId>("ascend-core");
const [visionEyeTargets, setVisionEyeTargets] = useState<readonly VisionEyeTarget[]>([]);
const [visionEyeActivating, setVisionEyeActivating] = useState(false);
const visionEyeActivationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Extract the current click camera calculation into:

```ts
const activateStatusTv = (
  assignment: ShelfTvAssignment,
  trigger: HTMLButtonElement,
  withEyeTransition: boolean,
) => {
  const scene = cameraSceneRef.current;
  const screen = trigger.querySelector<HTMLElement>(".shelf-status-tv__screen");
  if (!scene || !screen || focusedStatusTv) return;
  setSelectedVisionEyeServiceId(assignment.serviceId);
  const openCamera = () => {
    const targetBounds = screen.getBoundingClientRect();
    const sceneBounds = scene.getBoundingClientRect();
    const focusArea = window.innerWidth > 860
      ? { left: 0, top: 0, width: window.innerWidth * 0.64, height: window.innerHeight }
      : undefined;
    cameraTriggerRef.current = trigger;
    setFocusedStatusTv({ assignment, open: true, motion: getShelfSceneCameraMotion(
      targetBounds, sceneBounds, { width: window.innerWidth, height: window.innerHeight }, focusArea,
    ) });
    setVisionEyeActivating(false);
  };
  if (!withEyeTransition || reduceMotion) return openCamera();
  setVisionEyeActivating(true);
  visionEyeActivationTimerRef.current = setTimeout(openCamera, 220);
};
```

Use an unmount cleanup effect to clear `visionEyeActivationTimerRef`.

- [ ] **Step 4: Add the browsing keyboard lifecycle**

Register one window `keydown` effect when `!edit && !focusedStatusTv`. Ignore `event.defaultPrevented`, modifier chords, and `isVisionEyeKeyboardTarget(event.target)`. For directional commands, find the next spatial target and update `selectedVisionEyeServiceId` without touching camera state. For `activate`, locate the matching trigger inside `cameraSceneRef.current` and call `activateStatusTv(assignment, trigger, true)`. Prevent default only after handling a command.

Use a selector escaped from application-owned service IDs:

```ts
const trigger = cameraSceneRef.current?.querySelector<HTMLButtonElement>(
  `[data-status-service-id="${selectedVisionEyeServiceId}"]`,
);
```

- [ ] **Step 5: Integrate the navigator and TV metadata**

Render `VisionEyeNavigator` as a child of the camera scene, after the shelf rows so it sits above them:

```tsx
<VisionEyeNavigator
  sceneElement={cameraSceneRef.current}
  selectedServiceId={selectedVisionEyeServiceId}
  hidden={Boolean(focusedStatusTv)}
  activating={visionEyeActivating}
  reduceMotion={Boolean(reduceMotion)}
  layoutVersion={JSON.stringify(cabinetRows)}
  onTargetsChange={setVisionEyeTargets}
/>
```

Add to every assigned TV trigger:

```tsx
data-status-service-id={statusAssignment.serviceId}
data-status-channel={statusAssignment.channel}
className={`shelf-status-tv-trigger ${
  selectedVisionEyeServiceId === statusAssignment.serviceId ? "is-vision-eye-selected" : ""
}`}
```

Replace the old click body with:

```tsx
onClick={event => activateStatusTv(statusAssignment, event.currentTarget, false)}
```

This preserves immediate mouse/touch focus while synchronizing retained selection.

- [ ] **Step 6: Add navigation guidance and announcement**

Near the eye overlay, render:

```tsx
<div className="vision-eye-controls" aria-hidden="true">
  WASD / ARROWS MOVE <span>·</span> SPACE OPEN
</div>
<p className="sr-only" aria-live="polite">
  {selectedTarget
    ? `${selectedTarget.channel}, ${selectedTarget.serviceId.replaceAll("-", " ")} selected. Press Space to open.`
    : "Status TV navigation loading."}
</p>
```

Do not announce movement while a TV is focused.

- [ ] **Step 7: Run focused tests and changed-file lint**

Run:

```powershell
& D:\node.exe node_modules\tsx\dist\cli.mjs --test tests/status/vision-eye-navigation.test.ts tests/status/shelf-tv-focus.test.ts
& D:\node.exe node_modules\eslint\bin\eslint.js components/status/VisionEyeNavigator.tsx components/status/vision-eye-navigation.ts tests/status/vision-eye-navigation.test.ts
```

Expected: all focused tests PASS; new modules lint clean. Record separately any already-known `app/page.tsx` legacy lint findings instead of broadening this feature into unrelated cleanup.

- [ ] **Step 8: Stop at the user-managed commit checkpoint**

Do not commit. Report the integrated keyboard, mouse, and focus behavior.

### Task 4: Interaction polish, accessibility, and responsive behavior

**Files:**
- Modify: `components/status/VisionEyeNavigator.tsx`
- Modify: `app/globals.css`
- Modify: `app/page.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed navigation and focus integration from Task 3.
- Produces: stable resize behavior, reduced-motion behavior, and documented controls.

- [ ] **Step 1: Verify and tune the four visual transitions manually**

Start Hub:

```powershell
cd D:\ascend_hub
& D:\node.exe scripts\run-framework.mjs dev
```

At `http://localhost:5173`, verify:

1. Initial CH 01 selection does not zoom.
2. Right, Down, Left, and Up traverse the expected spatial targets.
3. Travel uses a curved-feeling eased glide with no layout shift.
4. Space shows the 220 ms contraction/flash and then the existing 1.4 s zoom.
5. Escape reverses the zoom and rematerializes the eye at the same TV.
6. Clicking each TV opens it immediately.

Tune only the declared duration/easing CSS variables; do not add per-TV coordinate exceptions.

- [ ] **Step 2: Verify resizing and shelf editing**

Resize the browser across 390 px, 768 px, 1280 px, and 1920 px widths. Confirm the eye remains centered on the selected CRT screen. Enter shelf edit mode and confirm navigation keys do nothing. Rearrange a supported shelf setting, leave edit mode, and confirm measurements update.

- [ ] **Step 3: Verify keyboard and reduced-motion accessibility**

Confirm:

- Space does not activate while a button or form control has focus.
- browser scrolling is prevented only for handled navigation keys;
- the live region announces channel and service exactly once per selection;
- the focused camera still traps Tab and closes with Escape;
- with `prefers-reduced-motion: reduce`, all eye rotation, orbit, trail, flash, and bounce are removed while selection and Space activation still work.

- [ ] **Step 4: Document controls in README**

Add a short section under dashboard usage:

```md
### Blue-eye TV navigation

- Use **WASD** or the **Arrow keys** to move the Ascend Vision eye between the four status TVs. Moving does not zoom the shelf.
- Press **Space** to open the selected TV and its read-only auxiliary panel.
- Click or tap a TV to open it immediately.
- Press **Escape** or choose **Zoom Out** to return to the shelf. The previous TV remains selected.
```

- [ ] **Step 5: Stop at the user-managed commit checkpoint**

Do not commit. Report the responsive sizes and accessibility modes tested.

### Task 5: Final verification

**Files:**
- Verify all files modified by Tasks 1–4.

**Interfaces:**
- Consumes: the finished feature.
- Produces: evidence suitable for the repository owner's final review and commit.

- [ ] **Step 1: Run the complete status suite**

Run: `& D:\node.exe node_modules\tsx\dist\cli.mjs --test tests/status/*.test.ts`

Expected: all status tests PASS.

- [ ] **Step 2: Run lint for all changed feature files**

Run:

```powershell
& D:\node.exe node_modules\eslint\bin\eslint.js `
  components/status/VisionEyeNavigator.tsx `
  components/status/vision-eye-navigation.ts `
  tests/status/vision-eye-navigation.test.ts
```

Expected: exit 0. Inspect `app/page.tsx` separately and report only newly introduced findings versus the repository's known pre-existing warnings/errors.

- [ ] **Step 3: Run the production build**

Run: `& D:\node.exe scripts\run-framework.mjs build`

Expected: production build completes successfully.

- [ ] **Step 4: Check the patch for accidental content and formatting problems**

Run:

```powershell
git diff --check
rg -n "fairy-gif|prompt|transcript|credential" components/status/VisionEyeNavigator.tsx components/status/vision-eye-navigation.ts app/page.tsx README.md
```

Expected: no whitespace errors, no `fairy-gif` usage, and no new sensitive-content capture.

- [ ] **Step 5: Hand off without committing**

Provide the repository owner with:

- files created and modified;
- status-test count and outcome;
- lint outcome, separating known legacy findings;
- production-build outcome;
- manual keyboard, click, resize, and reduced-motion results;
- confirmation that no commit was created.
