# airframe-authority-scale-floor: smooth the low-q authority clamp edge

**Slug:** `airframe-authority-scale-floor`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 2
**Priority:** P2 - softens a discontinuity at the low-speed end of the authority clamp that contributes to climb-rock (control character changes at the clamp edge).
**Playtest required:** NO (probe-verified).
**Estimated risk:** low - single constant change with a smoothstep addition.
**Budget:** <=80 LOC.
**Files touched:**

- Modify: `src/systems/vehicle/airframe/Airframe.ts:503-504` (authorityScale clamp).

## Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:503-504` (`const authorityScale = THREE.MathUtils.clamp(a.dynamicPressure / qRef, 0.15, 2.2)`).

## Diagnosis

The clamp produces a non-smooth derivative at `x = 0.15` (low-q end) and `x = 2.2` (high-q end). Near the low-q edge during slow climb, crossing the threshold changes control feel discontinuously.

## Fix

Replace the `clamp(x, 0.15, 2.2)` with a `smoothstep`-blended floor: `smoothstep(x, 0.10, 0.30) * (1 - floor) + floor`, where `floor = 0.30`. So at `x < 0.10`, authority is at the floor (0.30); at `x > 0.30`, authority is the full `x`; between, smooth blend. Remove the discontinuity at the old clamp edge. High-side clamp stays at 2.2.

## Steps

1. Implement the floor blend.
2. Probe A-1 low-speed climb (at `forwardSpeed` just above Vr): confirm control response is smooth as dynamic pressure changes.
3. Probe high-speed run (at `0.9 * maxSpeedMs`): confirm no change in authority at high end.
4. Vitest regression: "authorityScale is continuous in dynamic pressure (derivative within a bounded range)."
5. Probe before/after JSON to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airframe-authority-scale-floor/`.

## Exit criteria

- Climb rocking amplitude reduced further vs baseline.
- No change in high-speed handling.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not change the high-side clamp.
- Do not touch individual `authority.elevator / aileron / rudder` coefficients.

## Hard stops

- Fence change -> STOP.

## Pairs with

`airframe-soft-alpha-protection`, `airframe-climb-rate-pitch-damper` (Round 2 climb-stability fix).
