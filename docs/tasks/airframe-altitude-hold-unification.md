# airframe-altitude-hold-unification: one authoritative altitude-hold PD owner

**Slug:** `airframe-altitude-hold-unification`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 1
**Priority:** P1 - removes a latent inconsistency: two PD implementations for the same concept, each active in disjoint conditions, neither aware of the other.
**Playtest required:** NO (probe-verified).
**Estimated risk:** medium - touches altitude-hold behaviour; a wrong pick here could make hands-off cruise oscillate or sag.
**Budget:** <=250 LOC.
**Files touched:**

- Modify: `src/systems/vehicle/airframe/Airframe.ts` (altitude-hold block at approximately lines 114, 191, 220-224, 300-321), and/or `src/systems/vehicle/airframe/buildCommand.ts` (cruise-hold block at 64-81).

## Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:114` (`altitudeHoldTarget` field), `:191` (cleared in `resetToGround`), `:220-224` (set in `resetAirborne`), `:300-321` (PD that fires only when target is set).
- `src/systems/vehicle/airframe/buildCommand.ts:64-81` (cruise-hold PD that runs when target is null, i.e. every normal piloted flight).
- `src/systems/vehicle/airframe/Airframe.ts:442-474` (liftoff gate - critical because this is where the airframe transitions `weightOnWheels` from true to false in the normal path, and NO code here sets `altitudeHoldTarget`).

## Diagnosis (corrected 2026-04-22)

The two altitude-hold PD loops do NOT actively compete. They cover disjoint conditions:

- `buildCommand.ts:64-81` fires when: tier is assist, airborne, pitch stick neutral (< 0.05). This runs in normal piloted flight because `altitudeHoldTarget` is never set during a ground-to-air liftoff (only `resetAirborne` sets it).
- `Airframe.ts:300-321` fires when: same three conditions AND `altitudeHoldTarget !== null`. This runs for test fixtures and any spawn path that invokes `resetAirborne` directly.

The bug is not that they compete; it is that:

1. Normal player flight always uses the weaker buildCommand PD (a vs-damping + trim-return pair with `assistPitchP * 0.25`).
2. The stronger Airframe PD (`-altErr*0.015 - vs*0.06 - pitchRate*0.05`, explicitly tuned for "real autopilot backbone") is never engaged in normal flight because no code captures `altitudeHoldTarget` at liftoff.
3. Debugging is confusing: a future reader sees two PD implementations and assumes they compete.

## Fix (executor picks one, probe-verifies)

**Option A (preferred)** - wire `altitudeHoldTarget` capture into the normal liftoff path. In `integrateGround`'s liftoff block (approximately lines 452-473), when `weightOnWheels` flips false, capture `this.altitudeHoldTarget = this.position.y + some_climb_margin`. The margin puts the target above current altitude so the aircraft climbs to it, not sinks. The Airframe PD then takes over hands-off cruise in all conditions. Delete the duplicate buildCommand block or leave it as a fallback for `tier === 'raw'` (current code already excludes raw at line 32).

**Option B (fallback)** - delete the `Airframe.ts:300-321` block as vestigial. Clean up `altitudeHoldTarget` field and its set/clear sites. buildCommand becomes the single PD.

Executor decides A vs B based on probe result: run `npm run probe:fixed-wing` in a cruise scenario before and after each option; whichever gives tighter altitude-hold without oscillation wins.

## Steps

1. Read all of "Required reading first."
2. Add Logger trace at both PD sites logging which fired this tick. Boot `npm run probe:fixed-wing`, confirm the diagnosis: only buildCommand fires in a normal player-initiated takeoff; only Airframe fires in a `resetAirborne`-initiated scenario.
3. Implement Option A first. Probe cruise hold. If stable over 60 seconds and tighter than Option B's baseline, commit Option A.
4. If Option A shows instability or regression, revert and implement Option B.
5. Add Vitest regression: "assist tier, airborne, hands-off, altitude at t+60s is within +/- 5 m of target."
6. Write `evidence/airframe-altitude-hold-unification/before.json` and `.../after.json` probe captures to the cycle evidence folder.

## Exit criteria

- `npm run probe:fixed-wing` cruise scenario reports altitude deviation < 5 m over 60 s hands-off. Baseline allowed up to ~8-12 m depending on aircraft.
- No oscillation in the altitude trace (no sign-flips at > 0.3 Hz within the cruise window).
- `Airframe.test.ts`, `NPCFixedWingPilot.test.ts` pass. Regression test added.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe before / after JSON committed.

## Non-goals

- Do not retune PD gains beyond what the unification requires.
- Do not change the `orbit` command path in buildCommand.

## Hard stops

- Probe shows worse altitude-hold than baseline under both A and B -> STOP, mark blocked, surface; the assumption behind this task is wrong.
- Fence change -> STOP.
