# airframe-soft-alpha-protection: smoothstep AoA authority scale instead of hard cap

**Slug:** `airframe-soft-alpha-protection`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 2
**Priority:** P1 - reduces climb rocking by replacing a boundary-limit oscillator with a smooth gradient.
**Playtest required:** NO (probe-verified).
**Estimated risk:** low - the current alpha protection already uses `smoothstep` from `alphaStall - 5` to `alphaStall - 1`, but the protection band is narrow (4 deg). Widening and re-curving is low-risk tuning.
**Budget:** <=100 LOC.
**Files touched:**

- Modify: `src/systems/vehicle/airframe/Airframe.ts:506-513` (alpha-protection block).

## Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:497-532` (integrateAir authority + alpha-protection + base restoring moments).

## Diagnosis

Player holds full pitch -> alpha rises -> alphaFactor ramps from 1.0 to 0.0 over a 4 deg window -> nose authority drops abruptly -> nose sinks -> alpha drops -> authority returns -> nose rises. Boundary-limit oscillator. Climb rocking is partially this.

## Fix

Widen the protection band from 4 deg (`stall - 5` to `stall - 1`) to 8 deg (`stall - 8` to `stall + 1`), keeping `smoothstep` for the ramp but with asymmetric bounds that allow partial response even at stall. Alternatively, use a soft tanh: `alphaFactor = 0.5 * (1 - tanh((absAlphaDeg - alphaStallDeg) / 3))`. Executor probe-compares the two and picks the one that produces less peak-to-peak vertical oscillation in hands-off climb.

## Steps

1. Read `Airframe.ts:497-532`.
2. Implement widened smoothstep variant. Probe: A-1 full throttle, pitch held at +0.8 elevator (hard pull), 60 s climb; measure peak-to-peak vertical oscillation amplitude in the AGL trace.
3. If variant A amplitude > 1 m, swap to tanh variant, probe again.
4. Commit the winning variant with a regression Vitest: "aircraft at full aft stick with alpha within 2 deg of stall does not cycle authority from 0 to full between consecutive ticks."
5. Probe before/after JSON to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airframe-soft-alpha-protection/`.

## Exit criteria

- Climb vertical-speed RMS oscillation reduced relative to baseline by at least 50%.
- Stall protection still prevents actual stall (airspeed stays above `stallSpeedMs * 0.95` under hard pull).
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not change `alphaStallDeg` or `alphaMaxDeg` in configs.
- Do not touch the elevator authority scale (`authority.elevator`).

## Hard stops

- Aircraft actually stalls mid-climb at full throttle -> STOP, narrow the band back.
- Fence change -> STOP.

## Pairs with

`airframe-climb-rate-pitch-damper`, `airframe-authority-scale-floor` (all three compose the Round 2 climb-stability fix).
