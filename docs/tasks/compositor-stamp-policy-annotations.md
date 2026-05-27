<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# compositor-stamp-policy-annotations

R1.3 of `cycle-terrain-compositor`. Extends `TerrainStampConfig` with two
optional policy fields and annotates the three existing stamp compilers
to emit explicit defaults that preserve current behavior. Pure plumbing
PR — no behavior change. Design memo:
[docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md](../rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).

## Files touched

- `src/systems/terrain/TerrainFeatureTypes.ts` (extend `TerrainStampConfig`)
- `src/systems/terrain/TerrainFeatureCompiler.ts` (annotate airfield + helipad + motor-pool emissions)
- `src/systems/terrain/TerrainFlowCompiler.ts` (annotate route + zone-shoulder emissions)
- `src/systems/terrain/hydrology/HydrologyTerrainFeatures.ts` (annotate hydrology bed emissions)
- `src/systems/terrain/TerrainFeatureTypes.test.ts` (new — assert all emitted stamps carry both annotations)

## Scope

1. Extend `TerrainStampConfig` with two **optional** fields (per memo
   §"Contract"):
   - `obstructionPolicy?: 'never_below' | 'never_above' | 'override' | 'consult'`
   - `targetHeightStrategy?: 'baked' | 'sample_at_compose' | 'sample_post_compose'`
   Both optional so unannotated stamps stay valid; the compositor falls
   back to the defaults below at compose time.
2. Compilers emit explicit defaults that preserve current behavior:
   - Airfield envelope → `consult` + `sample_post_compose`.
   - Airfield rect (runway / apron) → `override` + `baked`.
   - Helipad → `override` + `baked`.
   - Motor-pool flatten → `never_above` + `baked`.
   - Route flow + zone-shoulder → `override` + `baked`.
   - Hydrology channel bed → `consult` + `baked` (R2.2 flips this to
     `sample_post_compose` once the feedback loop ships; not this PR).
3. New test `TerrainFeatureTypes.test.ts` exercises each compiler
   against a minimal config and asserts every emitted stamp carries
   both annotations (no missing fields after this PR).
4. Behavior-identical snapshot: stamp positions, radii, and target
   heights byte-identical vs master (the new fields are pure metadata).
5. No consumption yet — R2.1 reads the fields; this PR only publishes
   them at the source.

## Non-goals

- Resolving conflicts based on policy (R2.1 owns).
- Hydrology feedback loop (R2.2 owns) — hydrology bed stays `baked` for
  now.
- Compositor wiring (R1.1 owns).

## Acceptance

- [ ] All emitted stamps carry both annotations; type-check test passes.
- [ ] Stamp positions / radii / target heights byte-identical vs master
      (snapshot comparison).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] `terrain-nav-reviewer` (touches `src/systems/terrain/**`) — nice-to-have
      on R1; mandatory on R2.2.

## Round 2 / Dependencies

- Independent of R1.1 and R1.2; can land in any merge order.
- Blocks: R2.1, R2.2, R2.3.
