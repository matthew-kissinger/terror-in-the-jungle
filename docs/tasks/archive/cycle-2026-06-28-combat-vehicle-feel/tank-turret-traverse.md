<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 2) -->
# tank-turret-traverse

Feel-tuning from the 2026-06-28 owner playtest: the tank turret aims far too
slowly to be usable in combat. The barrel pitch especially crawls
(`barrelPitchSlewRate` ≈ 8°/s) and the yaw slew (`yawSlewRate` ≈ 30°/s) is
sluggish. Raise both in `DEFAULT_TANK_TURRET_CONFIG` so gunner aim feels
responsive without becoming twitchy or arcade-instant.

## Files touched

- `src/systems/vehicle/TankTurret.ts` (`DEFAULT_TANK_TURRET_CONFIG`, ~lines 71-82)
- `src/systems/vehicle/TankTurret.test.ts` (or sibling — assert the new rates)

## Scope

1. Raise `yawSlewRate` to a responsive value (target ~60-90°/s — confirm the
   current value first and choose a number that feels deliberate, not instant).
2. Raise `barrelPitchSlewRate` substantially (it is the worst offender at ~8°/s;
   target ~20-30°/s so elevation tracking keeps up with aim).
3. Keep the slew CAPPED (still rate-limited, not snap-to-aim) so heavy-armor feel
   is preserved. No other turret behavior changes.

## Non-goals

- Changing turret damage, reload, projectile, or the gunner-sight POV.
- Per-tank overrides (M48 vs T-54) — this is the shared default only.
- Removing the slew-rate cap (the turret must still feel like heavy armor).

## Acceptance

- [ ] `TankTurret` test asserts the raised `yawSlewRate` + `barrelPitchSlewRate`
      and that the slew remains rate-limited (a large aim delta does not resolve
      in one tick).
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master` linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- Root (no blockers). Disjoint from the other Phase-2 tasks.
