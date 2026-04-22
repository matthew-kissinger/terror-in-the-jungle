# airfield-perimeter-inside-envelope: pull perimeter placement inside flat zone

**Slug:** `airfield-perimeter-inside-envelope`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 3
**Priority:** P0 - resolves "building foundations float / sink" at airfield perimeter by pulling the placement radius inside the flat envelope.
**Playtest required:** NO (probe-verified via heightmap slice).
**Estimated risk:** low - one constant / formula change in the layout generator.
**Budget:** <=100 LOC.
**Files touched:**

- Modify: `src/systems/world/AirfieldLayoutGenerator.ts` (perimeter placement distance computation).

## Required reading first

- `src/systems/world/AirfieldLayoutGenerator.ts` full file - focus on where `perimDist` or perimeter-zone placements resolve their radius.
- `src/systems/terrain/TerrainFeatureCompiler.ts:339-402` (envelope stamp construction). Note: `innerLateral = lateralReach + AIRFIELD_ENVELOPE_STRUCTURE_BUFFER_M`.

## Diagnosis

For `us_airbase`, `innerLateral ~= 238 m`; perimeter placement radius is approximately 240 m. Perimeter props land ~2 m OUTSIDE the flat zone, on the 6 m hard ramp transition to the 48 m graded shoulder (`TerrainFeatureCompiler.ts:372-379`). The in-file comment at lines 345-350 explicitly acknowledges "perimeter structures at radius ~240m fall inside the graded shoulder" - the diagnosis is already documented; not resolved.

## Fix

Compute `perimDist = min(originalPerimDist, envelopeInnerLateral - 8)`. The -8 m provides a clearance margin inside the flat zone. If `envelopeInnerLateral` is not exposed to the layout generator, add an exported helper function from `TerrainFeatureCompiler` (or better: centralize the constant in `AirfieldTemplates.ts` or a shared module). Do not duplicate the computation.

## Steps

1. Identify where `perimDist` is set in `AirfieldLayoutGenerator`.
2. Expose `AIRFIELD_ENVELOPE_STRUCTURE_BUFFER_M` and the `maxLateralSurfaceReach(template)` helper from `TerrainFeatureCompiler` (or factor out to a shared file).
3. Clamp `perimDist` to `innerLateral - 8`.
4. Write probe `airfield-heightmap-slice-after.json` and compare against baseline: perimeter placement Y values should be within 0.5 m of envelope target height.
5. Vitest regression: "for us_airbase template, perimeter placement at max radius lands inside envelope `innerLateral`."

## Exit criteria

- Perimeter placement at main_airbase lands inside the flat zone (verified via probe heightmap slice).
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe before/after JSON committed to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airfield-perimeter-inside-envelope/`.

## Non-goals

- Do not change `STRUCTURE_SCALE` or any per-model constants.
- Do not change the envelope geometry itself (that's `airfield-envelope-ramp-softening`).

## Hard stops

- Clamping reduces perimeter structure count below the template's `structureCount` minimum -> STOP, reassess (perhaps shrink spacing instead of clamping radius).
- Fence change -> STOP.

## Pairs with

`airfield-envelope-ramp-softening` (together, perimeter sits inside a softer envelope).
