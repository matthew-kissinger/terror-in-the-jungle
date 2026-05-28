<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# compositor-debug-overlay

R2.3 of `cycle-terrain-compositor`. Ships a dev-only diagnostic overlay that
draws stamp AABBs and conflict edges in world space through the existing
`Shift+\` diagnostic surface. Lets the owner and reviewers visually verify
R2.1's resolver decisions and R2.2's hydrology recompose footprint. Design
memo: [docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md](../rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).

## Files touched

- `src/systems/terrain/compositor/CompositorDebugOverlay.ts` (new — Three.js LineSegments builder)
- `src/systems/terrain/compositor/CompositorDebugOverlay.test.ts` (new)
- `src/ui/debug/DiagnosticChordHandler.ts` (register the new sub-chord; check name in repo)
- `src/core/ModeStartupPreparer.ts` (expose the last `TerrainCompositorOutput` to the diagnostic surface)
- `docs/dev/diagnostic-keys.md` (document the new chord — if a similar file already exists; otherwise skip)

## Scope

1. **Sub-chord under `Shift+\`.** Memory note (2026-05-08) flagged that `Y`
   under `Shift+\` is the CDLOD seam highlighter. Pick a free sub-key
   (suggest `C` for "compositor" or `S` for "stamps") — scan the existing
   diagnostic chord handler before committing to one. Brief allows either;
   executor picks based on what's actually free.
2. **`CompositorDebugOverlay.build(output: TerrainCompositorOutput, scene: THREE.Scene)`**:
   - Adds one `THREE.LineSegments` per stamp AABB (color-coded by `kind`:
     airfield = white, hydrology = blue, motor-pool = orange, route = green).
   - Adds one red line per conflict pair from `output.conflicts`, drawn at
     `y = max(yA, yB) + 0.5 m` so it sits above the terrain.
   - AABB Y comes from `composedProvider.getHeightAt(centerX, centerZ)` so
     the boxes hug the surface (top of box at `y + 50 m` so it's visible
     from helicopter altitude).
3. **Toggle behavior identical to the seam overlay.** Press chord → build
   + add to scene. Press again → remove + dispose geometry. Idempotent.
4. **Dev-only gate.** Build only registers in `import.meta.env.DEV` (matches
   how the worldbuilder console gates today — check pattern before relying
   on it).
5. **No production allocations.** Geometry built once per toggle-on; reused
   buffer; disposed on toggle-off. Don't rebuild every frame.
6. **Tests.** Three minimum:
   - Stamp count → matching `LineSegments` count.
   - Conflict count → matching red-line count.
   - Toggle-off disposes geometry (memory leak guard).

## Non-goals

- HUD text panel listing stamps (overlay is geometry-only).
- Mobile-friendly UI (dev tool; desktop-only).
- Persisting toggle state across reloads.
- Live editing of stamps from the overlay (worldbuilder territory, future cycle).
- Production builds (gated by `import.meta.env.DEV`).

## Acceptance

- [ ] Chord triggers overlay; second press hides it; no console errors.
- [ ] OF screenshot shows airfield envelope AABB + ≥1 conflict edge against a hydrology stamp.
- [ ] A Shau screenshot shows river AABBs and zero conflict edges (regression sentinel — A Shau is the clean baseline).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Round 2 / Dependencies

- Depends on: R2.1 (resolved conflicts to render) — informally; could land
  alongside R2.1 if it only renders AABBs, but conflict edges need R2.1.
- Independent of R2.2; can land in any merge order with it.
- Blocks: R3.2 (playtest evidence references the overlay for owner walk).
