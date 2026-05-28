<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# terrain-compositor-skeleton

R1.1 of `cycle-terrain-compositor`. Lays the foundation for the new
`TerrainCompositor` without changing terrain behavior: introduce the module,
contract types, NO-OP pass-through wrapper, and tests proving the
compositor's output equals the current three-compiler concat-and-sort
byte-for-byte on Open Frontier (seed 42) and A Shau. Design memo:
[docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md](../rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).

## Files touched

- `src/systems/terrain/compositor/TerrainCompositor.ts` (new)
- `src/systems/terrain/compositor/TerrainCompositorTypes.ts` (new)
- `src/systems/terrain/compositor/TerrainCompositor.test.ts` (new)
- `src/core/ModeStartupPreparer.ts` (route compileStartupTerrainFeatures through compositor)

## Scope

1. New `TerrainCompositor` module exposing `composeTerrain(input)` per the
   memo §"Contract": takes `{ baseProvider, features, flow, hydrology,
   options }`, returns `{ composedProvider, stamps,
   vegetationExclusionZones, conflicts: [], waterSurfaceArtifact:
   hydrology }`.
2. R1.1 is NO-OP: stamps = concat of inputs sorted by priority (identical
   to current `ModeStartupPreparer` logic); `conflicts: []`;
   `waterSurfaceArtifact` returns the input hydrology artifact unchanged
   (Pass C lands in R2.2).
3. Wire `compileStartupTerrainFeatures` through `TerrainCompositor`.
   Preserve current telemetry marks (`stats.stamps-N`,
   `stats.hydrology-stamps-N`, `stamped-provider.begin/end`).
4. Behavior-identical test: snapshot composed stamp list + height-provider
   sample at 64 deterministic world coords for OF (seed 42) and A Shau,
   compare to pre-compositor baseline captured in the same test fixture.
   Byte-identical match required.
5. Worker-parity sanity test: worker-side height sample at 16 random
   coords matches main-thread sample (catches a future regression where
   only main-side wires the compositor).

## Non-goals

- Conflict detection (R1.2 owns).
- Stamp policy fields (R1.3 owns).
- Recomposing hydrology (R2.2 owns).
- Touching `TerrainFeatureCompiler.ts`, `TerrainFlowCompiler.ts`, or
  `HydrologyTerrainFeatures.ts` (R1.3 owns annotations there).

## Acceptance

- [ ] Behavior-identical tests pass: stamp-list snapshot + 64-coord height
      sample + worker parity.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief and the design
      memo.
- [ ] `terrain-nav-reviewer` invoked (nice-to-have on R1; mandatory on
      R2.2).

## Round 2 / Dependencies

- Depends on: design memo at
  [docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md](../rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).
- Blocks: R2.1 `compositor-stamp-policy-resolver`, R2.2
  `compositor-hydrology-feedback`, R2.3 `compositor-debug-overlay`.
