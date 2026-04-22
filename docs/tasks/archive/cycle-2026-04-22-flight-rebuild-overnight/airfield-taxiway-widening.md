# airfield-taxiway-widening: extend taxiway capsule innerRadius +2m

**Slug:** `airfield-taxiway-widening`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 3
**Priority:** P2 - small quality fix; ensures painted taxiway sits inside guaranteed-flat ground.
**Playtest required:** NO (probe-verified).
**Estimated risk:** low.
**Budget:** <=50 LOC.
**Files touched:**

- Modify: `src/systems/terrain/TerrainFeatureCompiler.ts` (the `compileGeneratedTerrainStamps` capsule sizing, approximately lines 280-302).

## Required reading first

- `src/systems/terrain/TerrainFeatureCompiler.ts:183-312` (full rect-to-capsule stamp compilation).

## Diagnosis

Taxiway rect -> capsule conversion uses `innerRadius = min(width, length)/2 + innerPadding(1.5m)`. For a 12 m wide taxiway, flat band is ~7.5 m from centerline, but the visual tarmac paint (`RectTerrainSurfacePatch`) is 6 m from centerline. The margin is only 1.5 m; at sharp capsule endcaps, the paint can extend onto sloped ground.

## Fix

When emitting a taxiway capsule from a rect, set `innerRadius = min(width, length)/2 + innerPadding(1.5m) + TAXIWAY_EXTRA_PAD(2m)`. The extra 2 m ensures the visual tarmac paint is fully inside the flat band.

## Steps

1. Identify the capsule sizing code in `compileGeneratedTerrainStamps`.
2. Add `TAXIWAY_EXTRA_PAD = 2` constant. Apply only when the source rect type is `taxiway` (not runway / apron).
3. Probe heightmap slice across a main_airbase taxiway; confirm full painted width sits on flat ground.
4. Vitest regression: taxiway rect width 12 m produces capsule with `innerRadius >= 12 / 2 + 1.5 + 2 = 9.5 m`.

## Exit criteria

- Probe confirms all taxiway paint sits inside flat zone.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe before/after JSON committed to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airfield-taxiway-widening/`.

## Non-goals

- Do not change runway or apron capsule sizing.
- Do not change `RectTerrainSurfacePatch` semantics.

## Hard stops

- Fence change -> STOP.
