<!-- 80 LOC cap. Diagnosis handed down from the 2026-06-04 deploy/zone/vehicle triage. -->
# vehicle-board-drive-e2e

Owner report: "the jeep mount now mounts behind and it spawns stuck inside the
terrain and I don't think the controls or movement work — we need a real e2e
vehicle pass this cycle." Three symptoms on the M151 jeep. Closes VEKHIKL-5. The
player will see: press-to-board snaps into the DRIVER seat (not the rear), the
jeep rests on the ground (not clipped under it), and throttle/steer actually
drive it.

## Required reading first

- `src/systems/vehicle/PlayerVehicleAdapterFactory.ts` — `tryBoardNearest()` :242:
  `seatIndex` is fetched :254-255 then **never used**; boarding passes
  `vehicle.getPosition()` (chassis center) :266 into `buildTransitionContext()` :352,
  dropping the driver seat's local offset. Regression from the M48 factory refactor
  (`a158a4e1`).
- `src/systems/vehicle/GroundVehicle.ts` — pilot seat `localOffset` (forward of
  center) and the construction/spawn path (physics init from raw world position).
- `src/systems/vehicle/GroundVehiclePhysics.ts` — `conformToGround` runs only inside
  `simulateStep` (first `update()`), not on construct; drive force is gated on
  `isGrounded` (≈`:452`), so a jeep clipped under terrain produces zero throttle force.
- `src/systems/vehicle/GroundVehiclePlayerAdapter.ts` — `onEnter` :117 applies
  `ctx.position` verbatim; `stepPhysics(dt, terrain)`.
- `docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md`; `docs/TESTING.md` before the test.

## Files touched

- `src/systems/vehicle/PlayerVehicleAdapterFactory.ts`
- `src/systems/vehicle/GroundVehicle.ts`
- `src/systems/vehicle/GroundVehiclePhysics.ts`
- `src/.../<vehicle-board-drive>.test.ts` (new)

## Scope

1. **Mount-behind (confirmed):** in `tryBoardNearest`, compute the seat WORLD
   position (vehicle position + vehicle-rotated seat `localOffset` for the locked
   `seatIndex`) and pass THAT into `buildTransitionContext`, not the chassis center.
2. **Spawn-in-terrain:** conform the ground vehicle to axle height on construction
   (terrain-clamp the initial Y) so `isGrounded` is true from frame 0.
3. **Drive:** with grounded-from-spawn, confirm throttle produces forward motion;
   verify the integration layer calls `stepPhysics(dt, terrain)` each frame.
4. **E2E test (real pass):** L3 scenario — board → player seated at driver offset
   (not center/rear) → vehicle resting on surface (y ≈ terrain + axleOffset) →
   throttle moves forward → steer changes heading → dismount beside the vehicle.
   Cover the jeep; cover the M48 tank too IF within the diff budget.

## Non-goals

- No helicopter / fixed-wing boarding (separate paths). No physics-model rewrite,
  no new vehicle types, no fence change. If tank coverage + screenshot capture
  pushes the diff past budget, split it into a follow-on `vehicle-e2e-harness-tank`.

## Acceptance

- [ ] New e2e L3 test green for the jeep (seat offset + spawn-rest + drive + steer +
      dismount all asserted); tank covered if budget allows.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR against `master` linking this brief; owner playtest deferred to
      `docs/PLAYTEST_PENDING.md`.
