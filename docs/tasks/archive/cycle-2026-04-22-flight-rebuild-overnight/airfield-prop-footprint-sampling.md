# airfield-prop-footprint-sampling: 9-point footprint solver for perimeter airfield props

**Slug:** `airfield-prop-footprint-sampling`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 3
**Priority:** P1 - resolves residual foundation float/sink on slope-crossing footprints even inside the envelope.
**Playtest required:** NO (probe-verified).
**Estimated risk:** medium - changes how airfield props resolve Y; a bug here could sink props into the ground.
**Budget:** <=200 LOC.
**Files touched:**

- Modify: `src/systems/world/WorldFeatureSystem.ts:200-202` (the `skipFlatSearch` branch) and/or `src/systems/world/AirfieldLayoutGenerator.ts` (if `skipFlatSearch` is authored there).

## Required reading first

- `src/systems/world/WorldFeatureSystem.ts:143-230` (spawnFeature).
- `src/systems/world/WorldFeatureSystem.ts:469-549` (`resolveTerrainPlacement`, the 9-point footprint solver that airfield props currently skip).

## Diagnosis

Airfield structures use `skipFlatSearch: true`, which means `WorldFeatureSystem.spawnFeature` at lines 200-202 uses a single centroid Y sample. On any terrain with sub-footprint height variation (which includes the envelope shoulder and anywhere near the airfield's hard ramp), the footprint corners float or sink against the placement Y. Combined with `STRUCTURE_SCALE = 2.5` amplifying any base-pivot offset in the model, this is the floating / sunken foundation symptom.

## Fix

Replace the binary `skipFlatSearch ? centroid-Y : resolveTerrainPlacement(...)` with a tier system:

- Airfield runway / apron / taxiway surfaces: centroid Y (current behaviour); these are on the flattest part of the stamp.
- Airfield perimeter / dispersal structures: full `resolveTerrainPlacement` footprint solver. The flag on placement becomes `placementTier: 'surface' | 'structure' | 'perimeter'` with defaults derived from zone.

**Alternative minimal fix:** keep the flag but gate it: `skipFlatSearch` only skips the footprint if the structure is inside `envelopeInnerLateral * 0.6` (truly interior). Outside that, fall through to `resolveTerrainPlacement`.

Executor picks the minimal option that makes the probe pass.

## Steps

1. Read both files.
2. Implement the minimal "gated skipFlatSearch" variant. Boot `npm run probe:fixed-wing` or a dedicated airfield probe; inspect perimeter tower foundations visually via dev cam.
3. If foundations still float/sink, extend to full footprint solver.
4. Probe: compute a foundation-clearance score for each placed structure = distance between object bottom and underlying terrain at 4 corners. Assert all perimeter structures have score < 0.3 m at all corners.
5. Regression Vitest on the resolver branch selection.

## Exit criteria

- Perimeter structure foundation-clearance probe score < 0.3 m at all corners.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe before/after JSON committed to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airfield-prop-footprint-sampling/`.

## Non-goals

- Do not touch `freezeTransform` or collision registration.
- Do not migrate non-airfield features.

## Hard stops

- Some perimeter structures now fail to place (resolver rejects) -> STOP, lower slope threshold in resolver or reduce structure count, record in summary.
- Fence change -> STOP.

## Pairs with

`airfield-perimeter-inside-envelope` (pull the structures inside first; this task then handles residual footprint-vs-terrain mismatch).
