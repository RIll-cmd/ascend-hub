# Fairy selector, ZZZ style details, and Hub console revision

**Status:** revised and implemented on 2026-10-05 after visual review. The user asked to preserve the old shelf-room backdrop, use wood like the cabinet, restore the real selected TV asset in details, and make the right column read like ZZZ's compact item rows. The attached ZZZ item-upgrade screenshot is a layout reference, not content to reproduce.

## Visual system

- **Charcoal** `#141513`: launcher and modal ground.
- **Raised charcoal** `#222321`: console wells and interactive rows.
- **CRT black** `#080A0D`: glass and idle receiver screen.
- **Ivory** `#F5E8CF`: primary text and restrained frame highlights.
- **Signal orange** `#F0A23B`: selected states, action icons and primary controls.
- **Warm gray** `#AAA596`: secondary copy.

Use Segoe UI for body and actions, a bold condensed Windows display face for the few large titles, and Consolas only for channel identifiers and stage timing. Preserve the existing shelf's dark wood, status clip colors, CRT crops, and Vision's indigo Fairy geometry.

### Clicked TV

At desktop width, keep the original room/shelf visible through a restrained dim layer. Frame the dialog with a subtle cabinet-like wood grain and dark inset. The left side uses the *same square TV profile, shell, screen crop and channel label as the selected shelf TV*; do not replace it with a generic wide monitor. On the right, use compact ZZZ-inspired icon rows for truthful lifecycle/freshness, reported activity or issue, Refresh, Copy status and expandable diagnostics. Keep one Close action at the top edge. At narrow widths, stack the same TV and console, retain the sticky close control, and keep the wood frame restrained.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│   ╱ thick charcoal CRT ╲     CH 01 · ASCEND CORE          [× Close]     │
│  ╱                     ╲    Status unavailable                          │
│ │   real status video   │   Hub has no status connection configured.     │
│ │   / signal-loss clip  │                                                 │
│  ╲                     ╱    ◉ Current activity (when reported)           │
│   ╲___________________╱     ◉ Refresh status    ◉ Copy status             │
│                              ◉ More details                               │
└──────────────────────────────────────────────────────────────────────────┘
```

Let the original TV silhouette and authentic screen crop do the work. Keep report text truthful: stale stays “Last known”; unavailable stays unavailable; media errors never overwrite lifecycle. Keep one visible status explanation. Use actual service/report information in the right pane, not game currencies, rewards, inventory or upgrade choices. The details view shows the actual status screen; the shelf's selected Fairy layer remains separate.

### Shelf Fairy selector

When a TV is active or transferring, show the existing large Fairy eye, orbit and readout centered *inside the screen*. The existing status video remains mounted underneath and reappears on deselection. Use an indigo receiver background inside the glass and clip the glow there. Keep the channel's actual lifecycle/freshness on the bezel and in the accessible control label. Remove the tiny corner Fairy cue. Preserve keyboard-only focus visibility; pointer selection has no persistent cubby border, blue exterior glow or “SELECTED” label.

### Hub launcher

Keep the separate native WPF window and shared supervisor actions. Recompose Hub as a 760 × 520 DIP landscape console with the actual shelf TV bitmap at left. Put the live startup stage and state over the real TV's screen coordinates, and keep a compact, readable connection/action column at right. Remove the redundant small product mark.

```text
┌──────────────────────────────────────────────────────────────┐
│ ASCEND HUB                                   [minimize] [×]   │
│                                                              │
│   ╭──────── CRT monitor ────────╮  HUB INTERFACE  Available  │
│   │ local boot/stage indication │  CORE / FEED    Not checked│
│   │         when starting       │  Ready · started in 10s    │
│   ╰─────────────────────────────╯                             │
│                                    [ OPEN HUB / START HUB ]   │
│                                    [ Stop Hub ]  [Diagnostics]│
└──────────────────────────────────────────────────────────────┘
```

Use the charcoal tokens, ivory text and signal orange for action/active trim; reserve monospace for runtime stage and channel-like details. Preserve responsive minimum size, scrollable recovery details, keyboard focus, truthful independent Hub/Core status, Force stop, cancellation, diagnostics, activation and close confirmation. Vision's launcher remains out of scope.

## Implementation sequence

1. **Shelf selection:** completed. Selected TVs render the Fairy layer inside the glass while the source-keyed status video remains mounted; the small corner cue was removed. Status and video issue accessibility stays in the label/bezel.
2. **Clicked view:** completed. The detail overlay uses a wide CRT monitor and a right-side status/action console on desktop, with the stacked monitor and sticky close control at 390 px. The same freshness-aware report and actions remain in use.
3. **Hub launcher:** completed. Hub uses a 760 × 520 DIP landscape window, a distinct landscape CRT stage panel built in XAML, charcoal/ivory/orange resources, and a compact independent status/action column. Shared supervisor actions and Vision composition are unchanged.
4. **Review and verify:** focused detail tests pass (9/9), focused lint passes, and WPF state/keyboard/100/150/200% layout checks pass. Chromium confirms desktop and 390 px mobile layouts each expose one Close action and use the square TV. The full status suite currently stops at a syntax error in the already-modified `tests/status/status-video.test.ts` (line 146), after 65 other tests pass; that unrelated test file still needs repair before the full suite can be claimed green.

**Acceptance:** Fairy clearly fills the selected CRT screen. The original status clip remains mounted underneath and resumes after deselection. The blue border, outer glow and “SELECTED” text remain absent. The detail view preserves the shelf-room context and wood cabinet treatment, shows the exact selected TV, and uses compact ZZZ-inspired status/action rows with one close action. Hub has a landscape console with the actual TV asset and approved palette while startup, connection, timing and recovery behavior remain accurate.

**Scope boundary:** no service schema, health/authentication, startup engine, profile, installed shortcut, Vision launcher or unrelated Hub work changes.
