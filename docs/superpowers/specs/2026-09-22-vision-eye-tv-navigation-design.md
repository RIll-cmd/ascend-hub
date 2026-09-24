# Ascend Vision Eye TV Navigation Design

## Summary

Add a keyboard-navigable Ascend Vision eye character to the four-TV status shelf. The eye begins on CH 01 without changing the camera, glides between TVs with Arrow keys or WASD, and opens the selected TV only when Space is pressed. Clicking a TV retains the existing immediate zoom behavior.

The character is a new, high-quality procedural SVG interpretation of Ascend Vision's blue-eye artwork. The existing `fairy-gif.png` is a visual reference only; it is not displayed or shipped by this feature.

## Approved interaction

- Initial selection: CH 01 / `ascend-core`.
- Keyboard movement: Arrow keys and WASD move between the four TVs.
- Moving selection never zooms the shelf.
- Activation: Space enters the selected TV.
- Mouse and touch: clicking a TV immediately selects and enters it.
- Exit: Escape, backdrop click, or the existing Zoom Out control returns to the shelf with the same TV still selected.
- While a TV is focused, navigation keys do not move the eye.
- Keyboard handling is disabled while editing the shelf or typing in an input, textarea, select, button, link, or contenteditable element.

## Interaction states

The feature uses four explicit presentation states:

1. `browsing`: the eye hovers at the selected TV and the shelf camera remains at its overview transform.
2. `travelling`: selection has changed and the eye follows a curved, eased path to the new TV.
3. `activating`: the eye contracts toward the selected CRT screen and emits a short flash before focus begins.
4. `focused`: the existing 1.4-second camera zoom and auxiliary panel are active; the navigation eye is hidden.

Closing the focused view preserves `selectedServiceId`. Once the reverse camera animation completes, the eye rematerializes at that TV rather than resetting to CH 01.

## Navigation model

The implementation must not hardcode visual pixel coordinates. Each status-TV trigger receives a stable `data-status-service-id` attribute. The navigator measures the four rendered CRT screen centers relative to the cabinet scene.

Directional navigation chooses the nearest candidate whose center lies in the requested half-plane. Candidates are scored by primary-axis distance plus a cross-axis penalty so Right strongly prefers a TV to the right, while still working if the shelf layout is rearranged. If no TV exists in that direction, selection remains unchanged.

The selection order is therefore spatial rather than tied to service names. The current default layout naturally behaves as a 2×2 grid:

```text
CH 01 ascend-core       CH 02 ascend-vision
CH 03 codex-cli         CH 04 antigravity-cli
```

## Visual design

`VisionEyeNavigator` renders an accessible, pointer-transparent overlay inside the transformed cabinet scene. Its SVG eye contains:

- a soft cyan atmospheric halo;
- independently rotating inner and outer iris rings;
- broken orbital arcs and small tracking ticks;
- a bright white-blue pupil with radial bloom;
- subtle orbiting particles;
- a breathing idle pulse;
- a direction-aware travel lean and short fading trail;
- an activation contraction and screen flash.

The eye is centered over the selected CRT screen and scales responsively with the screen bounds. It visually reads as a character moving through the shelf rather than a copied media asset. The selected TV also receives a restrained cyan outline and channel/service callout, making selection clear even when motion is disabled.

Animations should use transforms and opacity. The travelling curve should feel quick but deliberate (approximately 650–750 ms with `[0.22, 1, 0.36, 1]` easing). Activation should take approximately 220 ms before the existing camera focus starts.

## Responsive measurement

The navigator observes the cabinet scene and TV triggers with `ResizeObserver`, and also remeasures after shelf layout changes. Measurements are stored in scene-local coordinates. This keeps the avatar aligned at different viewport sizes without coupling navigation logic to the current CSS layout.

If measurement is temporarily unavailable, the selected-TV highlight remains available and Space does nothing safely rather than opening the wrong target.

## Accessibility and controls

- The animated SVG is decorative and uses `aria-hidden="true"`.
- The cabinet exposes a visually subtle controls legend: `WASD / ARROWS MOVE · SPACE OPEN`.
- Selection changes are announced through a polite live region using the channel and service label.
- TV buttons keep their existing accessible labels and native mouse/touch behavior.
- Space and movement keys call `preventDefault()` only when shelf navigation handles them.
- `prefers-reduced-motion` removes travelling arcs, ring rotation, particles, flash, and bounce; the eye moves instantly and the existing reduced camera transition remains intact.
- Focus restoration after zoom continues to use the clicked or keyboard-activated TV trigger.

## Component boundaries

- `components/status/vision-eye-navigation.ts`: pure geometry, directional selection, editable-target guards, and keyboard-command mapping.
- `components/status/VisionEyeNavigator.tsx`: measurements, SVG presentation, status callout, live region, and motion states.
- `app/page.tsx`: owns selected TV state, keyboard lifecycle, activation, and integration with the existing focused-TV camera state.
- `app/globals.css`: character rendering, selection outline, controls legend, and reduced-motion styling.
- `tests/status/vision-eye-navigation.test.ts`: unit coverage for spatial navigation and keyboard guards.

## Existing behavior preserved

- The existing shelf status API and four service assignments remain unchanged.
- The current camera calculation and 1.4-second zoom remain the source of truth.
- The auxiliary side panel remains read-only and unchanged.
- Video status playback remains muted.
- No credentials, prompts, responses, transcripts, or agent content are added.
- The shelf editor still works; navigation is suspended while edit mode is active.

## Acceptance criteria

1. The eye starts at CH 01 and the shelf remains unzoomed.
2. Arrow keys and WASD move the eye spatially between all four TVs without moving the camera.
3. Space performs the eye activation animation and opens the existing focused view for the selected TV.
4. Clicking any TV still opens it immediately and updates the retained selection.
5. Escape returns to the overview and the eye reappears at the last focused TV.
6. The eye is a crisp procedural SVG recreation with layered motion, not the source PNG/GIF.
7. Navigation remains aligned after resizing and shelf layout changes.
8. Typing, shelf editing, and focused-TV operation do not trigger navigation shortcuts.
9. Reduced-motion users receive an equivalent static interaction.
10. Status tests, lint for changed files, and the production build pass.

