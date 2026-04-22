# player-controller-interpolated-pose: feed interpolated pose to PlayerController

**Slug:** `player-controller-interpolated-pose`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 1
**Priority:** P0 - the "tick back and forth" root fix; unifies the three time bases (camera, render mesh, PlayerController).
**Playtest required:** NO (probe-verified via pose-continuity assertion).
**Estimated risk:** medium - changes what PlayerController and HUD read. If any downstream consumer depended on raw-physics precision (e.g. aim solver), it may need updating.
**Budget:** <=250 LOC.
**Files touched:**

- Modify: `src/systems/vehicle/FixedWingModel.ts` (specifically the PlayerController feed at approximately line 359).
- Possibly modify: `src/systems/player/PlayerController.ts`, `src/systems/player/PlayerCamera.ts`, any HUD consumer that reads from one of these.

## Required reading first

- `src/systems/vehicle/FixedWingModel.ts:320-370` (the step + render copy + PlayerController feed).
- `src/systems/vehicle/airframe/Airframe.ts:131-156` (`getInterpolatedState`).
- `src/systems/player/PlayerController.ts` - especially any method that takes an aircraft position and what it uses it for.
- `src/systems/player/PlayerCamera.ts:262-269` - the camera lerp; confirm it is downstream of the new pose source.

## Diagnosis

`FixedWingModel.update()` copies the interpolated pose to `group` (line 337-339) but feeds `airframe.getPosition()` (raw physics) to `playerController.updatePlayerPosition` (line 359). Camera reads the interpolated pose via `group.position`. Aim, collision, HUD readouts may read whatever PlayerController stores. Three time bases for one aircraft, aliased by the fixed-step sawtooth. Visible as tick-back-and-forth, especially at high speed and at high monitor refresh rates.

## Fix

Feed `airframe.getInterpolatedState().position` (and quaternion where needed) to every downstream consumer. Raw physics pose is internal to Airframe; external callers always get the interpolated pose.

## Steps

1. Read all of "Required reading first."
2. Audit every call site of `airframe.getPosition()` and `airframe.getRotation()` / `getQuaternion()` outside `Airframe` itself. Each one is a candidate for migration.
3. Change `FixedWingModel.update()` line 359 and siblings to pass the interpolated pose.
4. If any call site genuinely needs raw physics state (e.g. a simulation-internal consumer), leave it and add a code comment explaining why.
5. Verify camera behaviour: `group.position` is already interpolated, so no change required there.
6. Probe at 144 Hz (simulate via probe's variable-dt harness if needed): compare frame-to-frame pose delta before vs after.
7. Add Vitest that exercises the public surface: step the airframe 120 times, read via `getInterpolatedState()` on each tick, assert position continuity (no discontinuities > some small epsilon given fixed input).

## Exit criteria

- Pose-continuity probe assertion: frame-to-frame delta at 144 Hz render is smoothly monotonic in fixed-input cruise (no sawtooth signature).
- HUD readouts remain stable (no new flicker).
- Helicopter feel unchanged (scope is fixed-wing only; if helicopter passes through the same consumer, verify the helicopter call site explicitly is unaffected).
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe before / after JSON committed to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/player-controller-interpolated-pose/`.

## Non-goals

- Do not change the accumulator or the fixed-step value.
- Do not refactor PlayerController broadly.
- Do not touch camera smoothing (a separate concern; if climb rock persists after Round 2, file a follow-up for morning review).

## Hard stops

- An aim or collision consumer reads position at a phase offset that breaks once switched to interpolated -> STOP, decide per-consumer; may need to stay raw for that consumer with a code comment.
- Fence change (SystemInterfaces) -> STOP.
- Helicopter regressions surface -> STOP.

## Pairs with

None directly; independent of the other Round 1 tasks.
