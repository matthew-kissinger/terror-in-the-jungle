# airframe-climb-rate-pitch-damper: kill phugoid with climb-rate-scaled pitch damping

**Slug:** `airframe-climb-rate-pitch-damper`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 2
**Priority:** P1 - kills phugoid (speed-altitude coupling oscillation) in climb by damping pitch rate more aggressively when climbing.
**Playtest required:** NO (probe-verified).
**Estimated risk:** low - adds a damping term; conservative failure mode is less responsive pitch, not instability.
**Budget:** <=100 LOC.
**Files touched:**

- Modify: `src/systems/vehicle/airframe/Airframe.ts:528-532` (pitchAccel term) or `src/systems/vehicle/airframe/configs.ts` to add a per-aircraft `climbPitchDampScale`.

## Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:497-557` (integrateAir rotation section).
- External reference: phugoid mode damping - the standard aerodynamic fix is pitch-rate proportional damping that scales with climb rate so cruise stays crisp.

## Diagnosis

In climb: pitch up -> airspeed bleeds -> dynamic pressure drops -> lift drops -> aircraft sags -> airspeed recovers -> lift recovers -> pitch rises. Phugoid. Real aircraft do this; arcade games damp or hide it.

## Fix

In `integrateAir`, compute `climbFactor = smoothstep(velocity.y, 0, 5)` (0 to 1 over 0 to 5 m/s climb). Scale `pitchDamp` by `1 + climbFactor * climbDampBonus` where `climbDampBonus` is ~1.5. Damping is effectively 2.5x at 5+ m/s climb, 1x in cruise / descent. Place the addition just before the `pitchAccel` computation at line 528.

## Steps

1. Read `integrateAir` carefully.
2. Add `climbFactor` + boosted damping. Probe A-1 hands-off climb at full throttle: peak-to-peak vertical oscillation amplitude.
3. Probe cruise (hands-off level flight at trim speed): confirm no regression in pitch responsiveness.
4. Add Vitest regression: "A-1 hands-off climb at full throttle does not oscillate > 1 m peak-to-peak over 30 s."
5. Probe before/after JSON to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airframe-climb-rate-pitch-damper/`.

## Exit criteria

- Climb vertical-speed RMS oscillation reduced by at least 50% relative to baseline.
- Cruise pitch response (step input to 10 deg pitch, time-to-90%) within 10% of baseline.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not retune `stability.pitchDamp` directly (that affects cruise too).
- Do not change `authority.maxPitchRate`.

## Hard stops

- Cruise pitch response degrades > 10% -> STOP, lower `climbDampBonus`.
- Fence change -> STOP.

## Pairs with

`airframe-soft-alpha-protection`, `airframe-authority-scale-floor` (Round 2 climb-stability fix).
