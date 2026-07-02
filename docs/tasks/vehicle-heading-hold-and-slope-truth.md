<!-- 80 LOC cap per framework recovery Pass 2 R1.2. -->
# vehicle-heading-hold-and-slope-truth

Ground vehicles weathervane on hills and reject the wrong slopes. Two verified
physics defects (owner manifest V1/V2): (1) `conformToGround` re-extracted
euler-YXZ yaw from the tilt-composed quaternion every fixed step, so heading
error was amplified by `1/cos(slope)` per 60Hz step — even a parked M151/M48 on
a 25-deg grade spun cross-slope in ~1s; (2) the slope gate compared the runtime
`getSlopeAt` value (a 0..1 deficit, `1 - normal.y`) directly against
`maxClimbSlope` configs documented as radians, so climb/cliff rejection was
nonsense. This closes both so hill driving reads true: point uphill and it holds,
start off-axis and it converges, and only real ~50-55 deg cliffs reject.

## Files touched

- `src/systems/vehicle/vehiclePhysicsMath.ts` (new) — shared slope-gate + conform math
- `src/systems/vehicle/vehiclePhysicsMath.test.ts` (new) — L1 pure-math tests
- `src/systems/vehicle/GroundVehiclePhysics.ts`
- `src/systems/vehicle/TrackedVehiclePhysics.ts`
- `src/systems/vehicle/GroundVehicle.ts` (config ceilings + doc)
- `src/config/vehicles/m48-config.ts`, `src/config/vehicles/t54-config.ts`
- `GroundVehiclePhysics.test.ts`, `TrackedVehiclePhysics.test.ts`

## Scope

1. Persist heading as an explicit scalar per physics instance; move it ONLY by
   the yaw-integration step, `setQuaternion`/`resetToStable`, and the spawn seed.
   `conformToGround` composes `conform(up→normal) * Ry(heading)` — never re-extracts.
2. Convert the slope deficit to a true angle at the gate
   (`acos(1 - deficit)`) and compare vs `maxClimbSlope` (radians). Retune ceilings:
   jeep 0.87, M35 0.70, APC 0.73, M48/T54 0.96, class defaults 0.87/0.96.
3. Smooth only the tilt via a per-vehicle `conformTau` (default 0.2s; 0 = legacy
   hard snap). Heading stays exact.
4. Expose `trackTau`/`yawTau`/`conformTau` in tracked configs (unchanged defaults).
5. Fix test mocks to the real deficit contract (`deficit = 1 - cos(angle)`).

## Non-goals

- Helicopter / fixed-wing feel (parked, manifest V3); WatercraftPhysics (dormant).
- Any terrain-layer change — `HeightQueryCache.getSlopeAt` is consumed as-is.
- SystemInterfaces / fence changes.

## Acceptance

- [x] New L1 + L2 tests: parked-holds-heading, off-axis climb converges + gains
      altitude, flat handling unchanged, per-class gate stalls above ceiling only,
      conform settles within ~3*tau without oscillation.
- [x] `npm run typecheck && npm run lint && npm run lint:budget && npm run test:run`
      (touched files) all green; both physics files back under the 700-LOC budget.
- [ ] PR opened against `master` with link to this brief.
- [ ] Playtest: hill-feel walk (M151 + M48 on A Shau grades).

## Notes

Reading YXZ euler-yaw back from a slope-tilted quaternion is inherently
distorted (`atan2(sin psi, cos psi * cos slope)`) — that is the defect. Tests
therefore assert the persisted scalar + horizontal-forward stability, not
euler-yaw equality.
