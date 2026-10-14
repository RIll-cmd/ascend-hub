# Retro desktop TV inspector

Status: implemented and verified

## Reference and intent

Reference: https://workos.com/launch-week/summer-2026 (live iMac click inspected October 6, 2026), plus the user's supplied screenshot. The interaction opens a brown framed browser, a light desktop menu bar, a dithered purple/cyan desktop and a compact monochrome alert. Adapt its material, texture, hierarchy and restrained controls to our actual status inspector. Do not embed WorkOS or recreate its navigation/404 page.

## Design

1. Keep the current shelf-to-inspector opening and closing behavior, keyboard focus handling, Escape and reduced motion. Preserve the selected physical TV asset and status presentation.
2. Replace the current wood-and-black split console with a framed desktop: walnut outer chrome, an inset channel label, one Close control, ivory menu strip, textured service-color desktop, selected TV preview on the left and an ivory report window in the main area.
3. Base colors: walnut #493525, frame highlight #876b4d, ivory #f3f0e6, graphite #202321. Use the repository's IBM Plex Mono for desktop chrome and report headings, and readable body type for explanations. Thin black double borders and horizontal title-bar rules convey the old desktop style; avoid unrelated fake menu items and decorative nonfunctional buttons.
4. Channel palettes: Core icy blue #89bce8 with cyan #85d9df; Vision violet #b8a5df with teal #87d0c0; Codex muted mint #a7c8a9 with graphite-green #769991; Antigravity blue #739fdc with periwinkle #a6b1e8. State meanings remain driven by actual status, independently of service accent colors.
5. Keep one heading, one explanation, activity/progress and issues only when present, Refresh and Copy status, optional diagnostics and truthful failure/stale information. The desktop menu contains only service context, not invented app controls.
6. On small screens, shrink chrome, put a compact selected TV preview above the report, allow internal scrolling, keep all actions reachable, and prevent viewport overflow.

## Implementation and verification

- Change AgentAuxiliaryPanel markup and add a separately scoped inspector stylesheet imported by the root layout. This avoids overrides spilling into the shelf or TV channel UI.
- Update focused-panel tests for the new desktop shell while retaining behavior assertions for stale/unavailable status, original TV artwork, optional diagnostics and a single Close action.
- Synchronize the panel and new stylesheet into the installed desktop checkout, preserving unrelated worktree changes.
- Verify all four channels in the actual running Hub at desktop and phone sizes. Check themes, selected TV asset, Refresh, Copy, diagnostics, Close/Escape/focus return and reduced motion.
- Run targeted status tests and production build. Review screenshots against the reference before completing.

## Completed verification

- Installed desktop checkout: 10 focused panel tests passed and production build completed successfully.
- Actual Hub on port 5173: all four service themes and selected TV assets checked; Copy, Refresh, diagnostics, Escape and focus return passed.
- Phone viewport (390 × 844): inspector fits the viewport and actions/Close remain reachable. Reduced-motion keyboard opening and closing passed. No browser errors observed.
- Screenshots saved in scratch/channel-review, including inspector-antigravity-cli.png and inspector-mobile.png. Shelf geometry and channel content were outside this change.

## Palette and polish follow-up

Core now combines cyan, blue and apricot; Codex combines mint, lavender and butter yellow; Antigravity combines blue, periwinkle and coral. Vision retains its violet/teal balance. Each palette extends into the striped title bar, icon tile and two action buttons. Strong ink borders and solid offset shadows add a restrained neo-brutalist finish to the retro desktop. Only the scoped inspector stylesheet changed, synchronized to the installed checkout. Ten focused panel tests passed; four-channel desktop and phone browser checks and actions passed.
