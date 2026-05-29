<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# vehicle-occupancy-camera

Closes the owner-reported "I enter the new vehicles and the camera mounts under
the car and I can't drive" bug. `PlayerCamera.updateCamera` only branches on
`isInHelicopter` / `isInFixedWing`; ground vehicles and tanks fall through to
`updateFirstPersonCamera`, which copies `playerState.position` (the
ground-origin boarding point set by the adapter `onEnter`), so the camera sits
under the chassis and never follows it. The correct follow-cam math
(`GroundVehiclePlayerAdapter.computeThirdPersonCamera`) exists but is never
invoked in production. Keystone task: unblocks all R2 vehicle/tank verification.

## Files touched

- `src/systems/player/PlayerCamera.ts` (add ground/tank occupancy branch)
- `src/systems/vehicle/GroundVehiclePlayerAdapter.ts` (ensure follow-cam runs per frame)
- `src/systems/vehicle/TankPlayerAdapter.ts` (camera branch ONLY; gunnery is `tank-crew-cannon-turret`)
- `src/systems/player/PlayerCamera.test.ts` (new or extend)

## Scope

1. Add a ground-vehicle/tank branch to `PlayerCamera.updateCamera` that drives
   the third-person follow-cam (behind + above chassis, tracks motion + yaw).
2. Wire `computeThirdPersonCamera` (ground + tank adapters) into the per-frame
   camera update so it runs in production, not just tests.
3. Confirm the camera re-attaches to first-person on exit (no stuck 3rd-person).

## Non-goals

- Helicopter / fixed-wing camera branches (already correct; do not touch).
- Tank gunnery / seat-swap / turret (separate `tank-crew-cannon-turret`).
- Vehicle physics / drive model (drive works once the camera is right).

## Acceptance

- [ ] Unit test: ground + tank occupancy selects the third-person path (not
      `updateFirstPersonCamera`) and the camera target tracks chassis pose.
- [ ] Playwright smoke: board the OF jeep, drive forward; camera is 3rd-person
      behind/above and follows the chassis. Screenshot to
      `artifacts/cycle-2026-05-28-vehicles-aircraft-operable/playtest-evidence/`.
- [ ] `npm run lint && npm run test:run && npm run build` pass.
- [ ] PR vs master links this brief; names the gap (camera-under-vehicle).

## Round 2 / Dependencies

- Blocks: `tank-crew-cannon-turret`, `tank-deploy-loadout-ux` (shared
  `TankPlayerAdapter.ts` + need a drivable vehicle to verify).
- If the fix needs a `SystemInterfaces.ts` change: STOP and surface
  (`[interface-change]` + human approval).
