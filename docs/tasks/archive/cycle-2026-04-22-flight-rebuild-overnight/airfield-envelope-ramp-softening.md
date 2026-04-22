# airfield-envelope-ramp-softening: widen hard ramp, raise grade strength

**Slug:** `airfield-envelope-ramp-softening`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 3
**Priority:** P1 - replaces the 6 m hard ramp at the flat-edge with a wider, softer blend. Addresses the residual "ring of sloped hillside" around airfields.
**Playtest required:** NO (probe-verified via heightmap slice).
**Estimated risk:** low - two constant changes; easy to revert.
**Budget:** <=50 LOC.
**Files touched:**

- Modify: `src/systems/terrain/TerrainFeatureCompiler.ts:372-379` (the envelope `outerRadius`, `gradeRadius`, `gradeStrength` computation) and the `AIRFIELD_ENVELOPE_GRADE_RAMP_M` / `AIRFIELD_ENVELOPE_GRADE_STRENGTH` constants.

## Required reading first

- `src/systems/terrain/TerrainFeatureCompiler.ts:339-402` (envelope stamp builder).

## Diagnosis

The current envelope has `outerRadius = innerRadius + 6` (6 m hard ramp from flat to blend start) and `AIRFIELD_ENVELOPE_GRADE_STRENGTH ~= 0.45`. The 6 m hard ramp is effectively a small cliff at the flat edge, and 45% grade strength over 48 m shoulder leaves most native slope intact when native terrain is steep.

## Fix

Two constant changes:

- `outerRadius = innerRadius + 12` (up from +6): doubles the hard-ramp width.
- `AIRFIELD_ENVELOPE_GRADE_STRENGTH` raised from ~0.45 to 0.65: the graded shoulder actually blends native terrain.

## Steps

1. Change the two constants.
2. Probe heightmap slice: confirm the 6 m hard ramp is now 12 m, and shoulder blend produces a visible 2/3 reduction of native slope at `gradeRadius / 2`.
3. Vitest regression: stamp evaluated at `innerRadius + 6` returns a height within 0.3 m of `innerRadius + 0` target (was > 1 m mismatch at 6 m hard ramp edge under native-cliff conditions).

## Exit criteria

- Envelope transition confirmed soft via probe heightmap slice.
- No runway flatness regression at `innerRadius` (stamp still produces a pad at target height).
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe before/after JSON committed to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airfield-envelope-ramp-softening/`.

## Non-goals

- Do not change `AIRFIELD_ENVELOPE_STRUCTURE_BUFFER_M` (that's `airfield-perimeter-inside-envelope`).
- Do not change the rect-stamp grade (authored tuning).

## Hard stops

- Softer shoulder leaves visible hillside inside perimeter placement radius -> confirm `airfield-perimeter-inside-envelope` pulled perimeter inside; if that task failed, stop and queue reconciliation.
- Fence change -> STOP.

## Pairs with

`airfield-perimeter-inside-envelope` (together, perimeter sits inside a softer envelope).
