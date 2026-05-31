# Playtest memo: vehicle-occupancy-camera

Status: **automated smoke deferred; owner walk-through pending.**

Cycle: `cycle-2026-05-28-vehicles-aircraft-operable`
Task brief: [`docs/tasks/archive/cycle-2026-05-28-vehicles-aircraft-operable/vehicle-occupancy-camera.md`](../tasks/archive/cycle-2026-05-28-vehicles-aircraft-operable/vehicle-occupancy-camera.md)

## What the fix does

Closes the owner-reported "I enter the new vehicles and the camera mounts
under the car and I can't drive" bug (the camera-under-vehicle gap).

`PlayerCamera.updateCamera` only branched on `isInHelicopter` /
`isInFixedWing`. Ground vehicles and tanks fell through to
`updateFirstPersonCamera`, which copies `playerState.position` — the
ground-origin boarding point the adapter sets in `onEnter` — so the camera
sat under the chassis and never followed it. The correct follow-cam math
(`GroundVehiclePlayerAdapter.computeThirdPersonCamera` /
`TankPlayerAdapter.computeThirdPersonCamera`) already existed but was never
invoked in production.

The fix adds a `VehicleFollowCamera` provider slot to `PlayerCamera` with a
third-person branch in `updateCamera` (between the flight branches and the
first-person fallback). The ground and tank adapters register themselves as
the provider in `onEnter` and clear it in `onExit`, so the follow-cam runs
every frame in production and the camera re-attaches to first-person on exit.
If the chassis pose is unavailable for a frame, the camera falls back to
first-person rather than freezing.

## Test coverage (the merge gate)

L2 behavior tests in `src/systems/player/PlayerCamera.test.ts` cover:

- Ground/tank occupancy selects the third-person follow path, not
  `updateFirstPersonCamera` (asserts the camera tracks the adapter-reported
  chassis pose and is NOT stuck at the boarding point).
- The camera orients toward the chassis it follows.
- The camera tracks the chassis as it moves between frames.
- Pose-unavailable frames fall back to first-person (no frozen 3rd-person).
- Exit (provider cleared) re-attaches first-person.
- Flight occupancy (helicopter) takes priority over a stale ground provider.

Adapter wiring is exercised by the existing
`GroundVehiclePlayerAdapter` / `TankPlayerAdapter` suites; the `onEnter` /
`onExit` register/clear calls use optional chaining so existing mocks are
unaffected.

`npm run lint`, `npm run test:run` (5000 tests), and `npm run build` all pass.

## Playwright smoke: documented limitation

The brief's acceptance lists a Playwright smoke (board the OF jeep, drive
forward, confirm 3rd-person behind/above the chassis, screenshot to
`artifacts/cycle-2026-05-28-vehicles-aircraft-operable/playtest-evidence/`).

This was **not captured in this PR**, by design:

- The existing capture script
  (`scripts/capture-m151-jeep-playtest-shots.ts`) disables the engine loop
  (`engine.isLoopRunning = false`) and hand-poses the camera via
  `poseAndRender`. That bypasses the production `PlayerCamera.updateCamera`
  follow-cam path entirely, so it cannot serve as evidence for *this* fix —
  it would screenshot a manually-placed camera, not the code under test.
- A valid smoke needs the live loop running with a boarded jeep so the
  production follow-cam executes (input injection + proximity boarding +
  letting the loop settle). That harness is a new capture script, which is
  outside this task's `Files touched` scope (4 source/test files, no script).

Per the cycle's autonomous-loop posture, this is a documented limitation, not
a hard stop: the code change, the L2 behavior tests, and the green build are
the merge gate. Owner walk-through (or a dedicated live-loop capture script in
a follow-up) confirms feel.

## Owner walk-through checklist (pending)

1. Open Frontier: walk to the OF jeep, press the board key.
2. Confirm the camera snaps to 3rd-person, behind and above the chassis
   (not under it).
3. Drive forward (W); confirm the camera follows the chassis and tracks its
   yaw through turns.
4. Exit (F); confirm the camera returns to first-person infantry view with no
   stuck 3rd-person frame.
5. Repeat for the tank (M48) — same follow-cam, tuned wider/higher for the
   chassis size.
