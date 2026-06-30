<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 2) -->
# ground-vehicle-speed-and-camera

Two feel issues from the 2026-06-28 owner playtest: (1) the jeep is too slow /
floaty, and (2) the M35 truck's follow camera is framed *inside its own bed* —
the shared 12m follow distance measured from the chassis center sits inside the
6.7m-long truck. This speeds up the wheeled vehicles and makes the follow-cam
distance per-vehicle so longer chassis are framed from outside.

## Files touched

- `src/systems/vehicle/GroundVehicle.ts` (~line 30 — velocityDamping / engineTorque)
- `src/systems/vehicle/GroundVehiclePlayerAdapter.ts` (~line 96 — follow-cam distance)
- `*.test.ts` (assert faster top speed + per-vehicle cam distance)

## Scope

1. Make the jeep noticeably faster: raise `velocityDamping` (~0.88 → ~0.95) and
   `engineTorque` so it reaches a higher cruise without feeling like ice.
2. Make the follow-cam distance scale with chassis length (or a per-vehicle
   value) so the ~6.7m M35 truck is framed from BEHIND/OUTSIDE the bed, not
   inside it. The jeep framing should not regress.
3. Keep handling stable — faster, not undrivable; no new drift/spin.

## Non-goals

- Tracked vehicles (that is `tank-hill-authority`).
- Reworking the wheeled physics model — only retune the existing params.
- Changing the boarding/exit flow (that is `tank-exit-and-seatswap` for tanks).

## Acceptance

- [ ] A `GroundVehicle`/adapter test asserts the higher cruise speed and that the
      follow-cam distance for a long chassis (M35, ~6.7m) is greater than the
      jeep's, so the camera sits outside the truck body.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master` linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- Root (no blockers). Disjoint from the other Phase-2 tasks.
