# Cycle Note: KONVEYER Water And Hydrology Pass

Last verified: 2026-05-11

## Objective

Connect VODA water work back into the KONVEYER renderer-architecture decision
loop before the principles-first rearchitecture pass. Water is not only a
cosmetic surface: hydrology placement, shader/material behavior, terrain
intersections, interaction samples, buoyancy/swimming, and eventual watercraft
must share one scene/gameplay contract.

## Evidence

- Hydrology prebake freshness:
  `npm run check:hydrology-bakes` PASS on 2026-05-11.
- Source audit:
  `artifacts/perf/2026-05-11T21-33-05-844Z/projekt-143-water-system-audit/water-system-audit.json`
  WARN. This accepts source wiring and test coverage, not final visual water.
- Runtime proof:
  `artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/water-runtime-proof.json`
  PASS for Open Frontier and A Shau.
- Runtime screenshots:
  `artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/open_frontier-river-proof.png`
  and
  `artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/a_shau_valley-river-proof.png`.
- Targeted unit proof:
  `npx vitest run src/systems/environment/WaterSystem.test.ts` PASS, 11 tests.
- Perf bundle proof:
  `npm run build:perf` PASS.

## Implemented Slice

- `WaterSystem.sampleWaterInteraction(position, options)` now reports
  `source`, `surfaceY`, `depth`, `submerged`, `immersion01`, and
  `buoyancyScalar` for both global-water and hydrology-channel surfaces.
- Existing `getWaterSurfaceY`, `getWaterDepth`, and `isUnderwater` now share
  the same surface-resolution path.
- `check:water-runtime` records a hydrology interaction sample one meter below
  the focused river surface. The current proof records `source=hydrology`,
  `depth=1`, `immersion01=0.5`, and `buoyancyScalar=0.5` in both Open
  Frontier and A Shau.
- No fenced interfaces were edited.

## Visual Read

The browser proof is mechanical, not art acceptance. Open Frontier still reads
as a pale/washed scene when the water proof camera isolates river strips, and
A Shau remains very dark with broad matte terrain patches. The hydrology
surfaces are present and queryable, but the current standard-material strip
representation is still provisional.

## Non-Claims

- No TSL/node water shader is accepted.
- No flow, foam, bank wetness, splash, or terrain-intersection treatment is
  accepted.
- No buoyancy force, swimming state, wading behavior, stamina/breath, or
  watercraft physics consumer is implemented.
- No water visuals are accepted by human review.
- No perf baseline was updated.

## Next Recommendations

1. Build the first WebGPU/TSL water material target for hydrology channels:
   still/slow river water first, not ocean waves.
2. Prove water/terrain intersections from low banks and elevated views in
   Open Frontier and A Shau.
3. Add one consumer of `sampleWaterInteraction`, preferably a small
   buoyancy-debug body or player wading/swimming detector before watercraft.
4. Keep global water as the fallback/lake/ocean path; do not clip or scale it
   into map-space rivers.
5. If the water normal or river strip art fights the Vietnam palette, treat it
   as an asset/material authoring problem. Pixel Forge or a texture-edit pass
   is valid before shader compensation.
