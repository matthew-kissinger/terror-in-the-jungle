<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 5) -->
# weapon-stats-panel

From the 2026-06-28 owner walk: the armory shows weapon NAMES but none of the
stats that already exist in code. Every weapon has a `WeaponSpec` (rpm, damage,
falloff, recoil, ADS time) in `GunplayCore`, surfaced through the
`WeaponRigManager` spec table — but no deploy UI reads it. Surface a compact
weapon-stats readout in the armory that updates as the player cycles weapons, so
the choice is informed (and the new Phase-4 marksman/SKS read as distinct).

## Files touched

- `src/ui/screens/DeployScreen.ts` (render + update the stats panel in the armory column)
- `src/systems/player/weapon/WeaponRigManager.ts` (expose the per-weapon `WeaponSpec` read, if not already accessible)
- `src/systems/weapons/GunplayCore.ts` (the `WeaponSpec` interface — read-only reference; touch only if a getter is needed)
- `*.test.ts` (new)

## Scope

1. For the currently-selected armory weapon, read its `WeaponSpec` and render a
   compact stats block: rate of fire (rpm), damage (near/far), falloff range,
   recoil, ADS time. Use the values already defined — do NOT invent new stats.
2. Update the panel reactively when the player cycles the weapon (PREV/NEXT or
   the chip strip), so it always reflects the equipped weapon.
3. Present derived/readable values where raw isn't friendly (e.g. rpm as a
   number, damage as near→far), but do not change any underlying spec.

## Non-goals

- The armory layout reflow (that is `armory-layout-reflow`, which builds on this).
- Changing any `WeaponSpec` value or weapon balance.
- A full stat-bar visualization system — a compact text/inline readout is enough.

## Acceptance

- [ ] The armory shows the selected weapon's rpm/damage/falloff/recoil/ADS and
      updates on cycle; a behavior test asserts the rendered stats match the
      weapon's `WeaponSpec` and change when the selected weapon changes.
- [ ] `npm run lint && npm run lint:budget && npm run test:run && npm run build` green.
- [ ] PR linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- Root. **Blocks `armory-layout-reflow`** (shared `DeployScreen` armory column — serialize).
- No reviewer (UI/loadout). NOTE: `DeployScreen.ts` is also edited by
  `deploy-map-navigation` (different region — the map panel); keep edits localized
  to the armory column for a clean rebase.
