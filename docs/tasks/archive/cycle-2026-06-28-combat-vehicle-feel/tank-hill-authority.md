<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 2) -->
# tank-hill-authority

Feel-tuning from the 2026-06-28 owner playtest: tanks bog down and slide on
jungle hills they should be able to climb. Give the tracked vehicles more climb
authority — raise the climbable slope ceiling and the on-slope drive floor, and
reduce the downhill gravity drag — so the M48 and T-54 read as "slower but
stronger" rather than stalling on grades. Tuning only.

## Files touched

- `src/config/vehicles/m48-config.ts` (~line 27)
- `src/config/vehicles/t54-config.ts` (~line 24)
- `src/systems/vehicle/TrackedVehiclePhysics.ts` (~line 91, shared defaults if used)
- `*.test.ts` (assert the climb behavior at a steep grade)

## Scope

1. Raise `maxClimbSlope` (from ~0.6) so steeper jungle grades are drivable.
2. Raise `slopeDriveFloor` (from ~0.5) so the tank keeps usable power uphill.
3. Lower `slopeGravityScale` (from ~0.28) so it slides back less on grades.
4. Optionally lower `maxTrackSpeed` slightly for the "slower but stronger" feel.
   Apply consistently to both M48 (US) and T-54 (NVA).

## Non-goals

- Wheeled vehicles (that is `ground-vehicle-speed-and-camera`).
- Turret/cannon/damage behavior.
- Making tanks climb cliffs — keep a believable ceiling; do not set
  `maxClimbSlope` so high that vertical walls become drivable.

## Acceptance

- [ ] A `TrackedVehiclePhysics` (or config) test asserts the new values and that
      a tank on a previously-stalling grade now maintains forward motion (no
      stall, bounded slide-back).
- [ ] M48 and T-54 stay in sync (both updated).
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master` linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- Root (no blockers). Disjoint from the other Phase-2 tasks.
