# aircraft-ground-physics-tuning: takeoff currently requires hill-launch; flat-runway takeoff must work

**Slug:** `aircraft-ground-physics-tuning`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P0 — depends on `airfield-terrain-flattening` (need a real flat runway to test against).
**Playtest required:** YES.
**Estimated risk:** medium — physics tuning that has been touched multiple times before; previous attempts only made hill-assist work.
**Budget:** ≤ 350 LOC.
**Files touched:**

- Investigate: `src/systems/vehicle/airframe/Airframe.ts` (takeoff_roll phase, ground branch, ~lines 350-420 area), `src/systems/vehicle/airframe/configs.ts` (per-aircraft engine + mass), `src/systems/vehicle/airframe/buildCommand.ts` (NPC-driven throttle).
- Possibly modify: `src/systems/vehicle/NPCFixedWingPilot.ts` and `npcPilot/states.ts` (does the NPC pilot apply enough throttle during ground roll?).

## Symptoms (orchestrator playtest 2026-04-20)

User: "We have tried several passes at getting aircrafts to be able to go airborne and it kinda worked if we get enough speed and fly off a hill but the current airfield still has lots of issues like not a proper runway."

Two related symptoms:
1. Aircraft can only go airborne by rolling off a hill, not by reaching takeoff speed on a flat runway.
2. The runway itself is bumpy (`airfield-terrain-flattening` covers that part), so even a "good" tuning hasn't been validated on a properly flat surface.

THIS task assumes `airfield-terrain-flattening` lands first. With a proven-flat runway, tune airframe ground-physics so flat-runway takeoff works.

## Required reading first

- `src/systems/vehicle/airframe/Airframe.ts` end-to-end. Focus on:
  - `takeoff_roll` phase (line 418/422 transitions; types.ts:17).
  - Ground-friction / wheel-roll terms (~line 350 area, comment says "0.9 → 0.85 shaves ~0.7s off a Skyraider takeoff roll").
  - `thrustAccel` at line 325, `staticThrustFloor` at line 497.
  - Ground-clamp logic — how is the airframe kept on the runway height when wheels are down?
- `src/systems/vehicle/airframe/configs.ts` — per-aircraft engine settings:
  - Skyraider (A-1): `maxThrustN: 95000`, `throttleResponsePerSec: 4.0`, `staticThrustFloor: 0.4`.
  - F-4 Phantom: `maxThrustN: 155000`, `throttleResponsePerSec: 2.4`, `staticThrustFloor: 0.3`.
  - AC-47 Spooky: `maxThrustN: 58000`, `throttleResponsePerSec: 1.2`, `staticThrustFloor: 0.3`.
  - Mass values (search for `mass.kg`).
- `src/systems/vehicle/airframe/terrainProbe.ts` — terrain height sampling for the wheels.
- `src/systems/vehicle/NPCFixedWingPilot.ts` + states.ts — does the pilot reach throttle 1.0 during ground roll?

## Hypothesis (verify after airfield flatten lands)

Three plausible bugs (cheapest to investigate first):

1. **Throttle never reaches 1.0** during NPC pilot's takeoff state. Verify with Logger trace.
2. **Lift coefficient too low at low speed** — airframe doesn't generate enough lift even at rotation speed. Verify by reading `Airframe.ts` lift calc + per-aircraft lift coefficients.
3. **Ground friction too high** — even with full thrust, the airframe doesn't accelerate fast enough. The "0.9 → 0.85" comment at line 352 suggests this has been tuned before; may need further tuning.

## Steps

1. Wait for `airfield-terrain-flattening` to merge.
2. Read all of "Required reading first."
3. Add Logger trace in `Airframe.ts` ground branch logging: throttle, thrustAccel, current speed, ground-friction term, lift, weight-on-wheels.
4. Boot dev, observe an A-1 NPC takeoff; identify the bottleneck.
5. Tune the bottleneck. If multiple tuning paths work, prefer the one that doesn't break high-altitude cruise (cruise tuning is sensitive — the airframe has lots of comments about cruise vs takeoff trade-offs).
6. Verify all three aircraft (A-1, AC-47, F-4) can take off from a flat runway. AC-47 currently has no auto-flight but should still be able to (verify by manual flight or a test).
7. Re-run `NPCFixedWingPilot.test.ts` and `NPCFixedWingPilot.integration.test.ts`.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/aircraft-ground-physics-tuning/`:

- `a1-takeoff-sequence.png` — composite or single mid-takeoff shot of the A-1 lifting off the runway (not a hillside).
- `f4-takeoff-sequence.png` — same for F-4 (manual or NPC if added).

## Exit criteria

- A-1 Skyraider with `npcAutoFlight.kind === 'ferry'` takes off from the main_airbase flat runway and reaches the ferry waypoint.
- All three aircraft can take off from a flat runway when given full throttle.
- Cruise behavior unchanged — no regression in level flight.
- `NPCFixedWingPilot.test.ts` and `NPCFixedWingPilot.integration.test.ts` pass.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not change cruise tuning unless proven necessary.
- Do not redesign the airframe state machine.
- Do not add new aircraft.
- Do not address ground turning / taxi steering (separate concern).

## Hard stops

- Fence change → STOP.
- Fix requires regenerating navmesh → STOP.
- Tuning that fixes takeoff breaks cruise → STOP, find a different lever.
- `airfield-terrain-flattening` hasn't landed → block this task; the bumpy-runway confound makes physics tuning untestable.
