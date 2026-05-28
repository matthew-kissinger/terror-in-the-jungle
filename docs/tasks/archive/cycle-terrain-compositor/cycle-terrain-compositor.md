<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# cycle-terrain-compositor

Closes OF water-on-walls and OF airfield random-mountain / padding bugs by
introducing `TerrainCompositor`: a single owner of stamp composition + spatial
conflict detection + hydrology feedback. User sees: OF rivers sit on actual
ground from helicopter altitude and on watercraft routes; OF airfield reads
as flat with smooth padding. A Shau unaffected (regression sentinel). Design
memo: [docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md](../rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).

## Files touched

- `src/systems/terrain/compositor/TerrainCompositor.ts` (new)
- `src/systems/terrain/compositor/TerrainStampPolicy.ts` (new)
- `src/systems/terrain/compositor/TerrainCompositor.test.ts` (new)
- `src/systems/terrain/TerrainFeatureCompiler.ts` (annotate stamp policy)
- `src/systems/terrain/TerrainFlowCompiler.ts` (annotate stamp policy)
- `src/systems/terrain/hydrology/HydrologyTerrainFeatures.ts` (annotate policy)
- `src/systems/environment/water/HydrologyRiverSurface.ts` (consume recomposed artifact)
- `src/core/ModeStartupPreparer.ts` (route through compositor)
- `src/workers/terrain.worker.ts` (composed-provider parity)
- `scripts/capture-of-water-airfield-shots.ts` (new acceptance capture)

## Scope (3 rounds — full plan in memo §"Implementation phases")

1. **R1** Foundation, behavior-identical: skeleton + NO-OP wrapper, AABB
   conflict detection (logging only), stamp-policy annotations on the three
   existing compilers (defaults preserve behavior). 3 parallel tasks.
2. **R2.1** Policy resolver: consult / never_above / never_below / override.
   Airfield wins height fights; hydrology preserves bed depth anchored to
   the new airfield datum.
3. **R2.2** Hydrology feedback (Pass C): re-sample river elevations against
   composed provider; `HydrologyRiverSurface` consumes new artifact; navmesh
   keeps original. Mandatory `terrain-nav-reviewer`.
4. **R2.3** Dev-only debug overlay (`Shift+\` chord, keybind TBD): stamp
   AABBs + conflict edges.
5. **R3** Acceptance captures (no-hover assertion + no-mountain assertion)
   + PLAYTEST_PENDING row.

## Non-goals

- Worldbuilder runtime stamp editing (future cycle).
- CDLOD / skirts / edge-morph rework.
- Watercraft physics changes.
- WGSL compute port of the height path.
- Vegetation pipeline changes beyond `vegetationExclusionZones` plumbing.

## Acceptance

- [ ] `OperationalRuntimeComposer.bindSpawnedWatercraftRuntime` reports
      `surfaceY` within 0.5m of `TerrainSystem.getHeightAt(x,z) + 0.85` at
      all OF Sampan + PBR spawn points.
- [ ] `scripts/capture-of-water-airfield-shots.ts` post-merge: zero frames
      with `hoverAboveTerrainMeters > 0.5`; zero "random-mountain" peaks
      inside airfield envelope inner radius.
- [ ] `terrain-nav-reviewer` APPROVE on R2.2 PR (Pass C is load-bearing).
- [ ] `combat120` p99 within ±2ms of baseline (compose-time cost only).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Round 2 / Dependencies

- Depends on: design memo at
  [docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md](../rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).
- Blocks: `cycle-vekhikl-5-fleet-expansion` (more vehicles → more overlap
  surface against the new conflict policy).
- Mandatory reviewer: `terrain-nav-reviewer` on R2.2. Nice-to-have on
  R1 and R2.1.
