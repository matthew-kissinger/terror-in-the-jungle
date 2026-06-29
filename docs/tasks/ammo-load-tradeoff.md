<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 4) -->
# ammo-load-tradeoff

From the 2026-06-28 owner walk: the EXTENDED/HEAVY ammo loads are strictly better —
`getAmmoLoadReserveFactor` only scales spawn RESERVE ammo up (1.0 / EXT / HVY)
with zero downside, so there is never a reason to pick STANDARD. Add a real
tradeoff so carrying more ammo costs something. **OWNER-CONFIRM at the walk:** the
default below (add a downside) vs. collapsing the three options to one.

## Files touched

- `src/ui/loadout/LoadoutTypes.ts` (a pure `getAmmoLoadHandlingFactor(load)` next to `getAmmoLoadReserveFactor`)
- `src/systems/player/LoadoutService.ts` (surface the handling factor where the reserve factor is read)
- `src/systems/player/FirstPersonWeapon.ts` (apply the penalty to ONE handling lever — ADS time or reload time)
- `*.test.ts` (new)

## Scope

1. Add a pure, tested `getAmmoLoadHandlingFactor(load: AmmoLoad): number` in
   `LoadoutTypes` — STANDARD = 1.0 (baseline), EXTENDED + HEAVY return a >1.0
   penalty multiplier scaling with the reserve they grant.
2. Apply that factor to exactly ONE clear handling lever (pick the cleanest:
   ADS-transition time or reload time — heavier load = slower) so EXTENDED/HEAVY
   is a genuine tradeoff, not strictly better. Keep STANDARD identical to today.
3. Keep the magazine size unchanged (the reserve-only contract holds); the
   penalty is the only new effect. Mirror the existing `getAmmoLoadReserveFactor`
   shape so the deploy UI / stats can read it later.

## Non-goals

- Changing magazine size or the reserve-factor values themselves.
- Collapsing to one option (that is the owner's call at the walk — note it in the PR).
- Movement-system rework — if move speed is the chosen lever, apply via the
  existing player-speed scalar, do not add a new movement subsystem.

## Acceptance

- [ ] `getAmmoLoadHandlingFactor` is pure + unit-tested (STANDARD 1.0 < EXTENDED < HEAVY);
      a test asserts the chosen handling lever is slower under HEAVY than STANDARD
      and that STANDARD behavior is unchanged.
- [ ] `npm run lint && npm run lint:budget && npm run test:run && npm run build` green.
- [ ] PR linking this brief; owner walk → PLAYTEST_PENDING (owner picks: keep the
      tradeoff, retune the penalty, or collapse to one load).

## Dependencies

- Root (no blockers). No reviewer (loadout/weapon-handling scope, not `combat/**`).
