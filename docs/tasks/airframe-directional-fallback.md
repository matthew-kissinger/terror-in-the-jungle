# airframe-directional-fallback: split post-liftoff grace into upward vs downward rules

**Slug:** `airframe-directional-fallback`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 1
**Priority:** P0 - removes the "phase through terrain for ~1 s after takeoff" symptom.
**Playtest required:** NO (probe-verified via per-tick `altitudeAGL` vs terrain trace).
**Estimated risk:** medium - touches the fallback logic that prior cycles worked around; must not reintroduce the descent-side bounce the grace window was added to prevent.
**Budget:** <=200 LOC.
**Files touched:**

- Modify: `src/systems/vehicle/airframe/Airframe.ts` (post-liftoff fallback at approximately lines 587-620 and the `descentLatchTicks` / `postLiftoffGraceTicks` / `TOUCHDOWN_LATCH_TICKS` constants).

## Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:442-474` (liftoff gate).
- `src/systems/vehicle/airframe/Airframe.ts:587-620` (post-liftoff fallback + descent latch).
- `src/systems/vehicle/airframe/terrainProbe.ts:75-140` (the sweep the fallback uses).
- Prior task brief: `docs/tasks/archive/cycle-2026-04-21-atmosphere-polish-and-fixes/aircraft-ground-physics-tuning.md` - explains why the grace window exists (descent-side bounce prevention).

## Diagnosis

The post-liftoff fallback suppresses ALL ground contact for `postLiftoffGraceTicks = 60` (~1 s at 60 Hz) AND requires `TOUCHDOWN_LATCH_TICKS = 10` consecutive guarded ticks. These gates were designed for the descent case (aircraft just left the runway; spurious contact would snap it back down). The same suppression hides UPWARD terrain contact - when the aircraft climbs over rising terrain and the sweep reports intersection, the latch ignores it. Result: ~1 s of phase-through after rotation over any rising terrain.

## Fix

Split the post-liftoff suppression into two directional rules:

- **Downward contact** (sweep reports ground under the aircraft, `vy <= 0`): keep the existing grace + latch behaviour. This is the descent-bounce case the grace was designed for.
- **Upward / forward penetration** (sweep reports terrain above the aircraft's floor Y at the swept segment's end, regardless of `vy`): do NOT suppress. Clamp Y to terrain height + clearance immediately, zero out the component of velocity pointing into the terrain, continue.

## Steps

1. Read all of "Required reading first."
2. Add a Logger trace (dev-only) in the fallback path that logs `altitudeAgl`, `vy`, `fallbackFired`, `direction` (up/down), `ticksSinceLiftoff`. Capture an A-1 takeoff over rising terrain via probe; confirm the phase-through coincides with upward contact being suppressed.
3. Refactor the fallback into two branches:
   - Downward branch: existing descent-latch behaviour, gated on `vy <= 0` and sweep showing ground below.
   - Upward branch: always respond, no grace, no latch. Clamp Y, zero inward velocity.
4. Keep `postLiftoffGraceTicks` constant but rename it (e.g. `descentLatchGraceTicks`) to reflect its now-specific purpose.
5. Add Vitest regressions:
   - "aircraft climbing over rising terrain immediately within post-liftoff window does not phase through" - set up an airframe at altitude 5 m above a rising ramp, step, assert `position.y > terrainHeight` after each step.
   - "aircraft descending within post-liftoff grace does not snap down prematurely" - preserve existing test behaviour.
6. Probe: A-1, F-4, AC-47 takeoffs from main_airbase; confirm no visible terrain penetration for at least 500 m of downrange terrain including one rise.

## Exit criteria

- A-1, F-4, and AC-47 each take off from main_airbase and cross at least 500 m of downrange terrain including at least one rise without any visible terrain penetration (probe-verified).
- Descent-side bounce not reintroduced: test asserts that cutting throttle at 10 m AGL within the grace window does not snap the aircraft back to runway.
- Vitest regressions pass.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe before/after JSON committed to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airframe-directional-fallback/`.

## Non-goals

- Do not change the liftoff gate (that's `airframe-ground-rolling-model`).
- Do not change the sweep implementation (out of scope for this cycle; see Round 4 design memo).
- Do not tune `gearClearanceM` or `liftoffClearanceM`.

## Hard stops

- Descent-side bounce reintroduced in any form -> STOP.
- Fix requires changing `AirframeTerrainProbe`'s API -> STOP, surface (interface-fence risk).
- Fence change -> STOP.

## Pairs with

`aircraft-building-collision` (together, aircraft respects both terrain and buildings post-takeoff). `airframe-ground-rolling-model` (both touch Airframe.ts; coordinate rebase).
