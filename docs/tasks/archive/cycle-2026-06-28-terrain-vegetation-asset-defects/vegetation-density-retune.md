<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 3) -->
# vegetation-density-retune

From the 2026-06-28 owner playtest: a couple of biomes are too dense and wall in
the player. Thin the two worst offenders — `bamboo-thicket` (the highest density
in the file, ~2.8) and the riverbank `coconut` (~1.25). Config-only retune; no
plumbing or scatterer changes.

## Files touched

- `src/config/biomes.ts` (~lines 156, 217 — bamboo-thicket + riverbank coconut density)
- `*.test.ts` (assert the retuned densities)

## Scope

1. Lower `bamboo-thicket` density from ~2.8 to a value that still reads as dense
   bamboo but no longer walls off movement/sightlines (confirm the current value
   first; aim for a meaningful reduction, e.g. ~1.6-2.0).
2. Lower the riverbank `coconut` density from ~1.25 to thin the shoreline palms.
3. Do NOT touch other biomes or any scatterer/runtime code — config values only.

## Non-goals

- Exclusion plumbing (that is `veg-poi-exclusion` / `route-corridor-exclusion`).
- The coconut card LOD pop (that is `coconut-card-crossfade`).
- Adding/removing species from any biome.

## Acceptance

- [ ] A test asserts the new bamboo-thicket + riverbank-coconut densities and that
      they are lower than the previous values (behavior: thinner biomes), without
      asserting unrelated biome constants.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR linking this brief; terrain-nav-reviewer APPROVE; owner walk → PLAYTEST_PENDING.

## Dependencies

- Root (no blockers). Reviewer: terrain-nav (vegetation density).
