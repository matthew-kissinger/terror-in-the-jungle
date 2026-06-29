<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 3) -->
# coconut-card-crossfade

From the 2026-06-28 owner playtest: the coconut palm hard-pops between its near
mesh and its far card as you approach/recede. The hero octahedral-impostor path
already has a `transitionFadeMeters` opacity blend; the `GroundCardNearMeshTier`
(the mesh↔card tier the coconut uses) does not. Port that opacity-crossfade so the
swap is smooth.

## Files touched

- `src/systems/terrain/GroundCardNearMeshTier.ts` (add the transition fade blend)
- `*.test.ts` (assert the crossfade window)

## Scope

1. Add a `transitionFadeMeters` opacity blend to `GroundCardNearMeshTier` so over
   the transition band the near mesh fades out as the far card fades in (mirror
   the existing hero octa-impostor fade — reuse its constant/approach).
2. Default the fade band to match the hero path so behavior is consistent.
3. Keep the demotion/promotion distances unchanged — only blend across them.

## Non-goals

- Changing the LOD distances themselves or which assets use this tier.
- The hero octa path (already has the fade) — only the ground-card near-mesh tier.
- Density (that is `vegetation-density-retune`).

## Acceptance

- [ ] A test asserts that within the transition band the tier reports a partial
      (0<a<1) blend between mesh and card opacity rather than a hard 0/1 switch.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR linking this brief; terrain-nav-reviewer APPROVE; owner walk → PLAYTEST_PENDING.

## Dependencies

- Root (no blockers). Reviewer: terrain-nav (`src/systems/terrain/**`).
