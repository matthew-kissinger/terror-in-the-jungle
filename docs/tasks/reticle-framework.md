<!-- cycle-2026-06-09-ground-gunnery-craft R1 -->
# reticle-framework

Owner verdict: no craft has a proper targeting crosshair. Today
`CrosshairSystem` knows four modes (infantry + three helicopter) and the M48
gunner / M2HB emplacement adapters set the **infantry** crosshair while
seated. This task adds per-craft reticle modes and routes them through the
existing adapter lifecycle, so the two ground-gunnery tasks (R2) have a
framework to draw real sights in. See
`docs/CAMPAIGN_2026-06-09-craft-specialization.md` Phase 1.

## Files touched

- `src/ui/hud/CrosshairSystem.ts` (+ its module CSS + existing tests)
- `src/systems/vehicle/VehicleAdapterShared.ts`
- `src/systems/vehicle/TankGunnerAdapter.ts` (+ test)
- `src/systems/vehicle/EmplacementPlayerAdapter.ts` (+ test)

## Scope

1. Widen the `CrosshairMode` union in `CrosshairSystem.ts` with
   `'tank_gunner'` and `'emplacement_mg'`. Do NOT touch
   `src/types/SystemInterfaces.ts` — it imports the union by type reference,
   so additive widening is fence-clean. If you find any change to that file
   is required, STOP and surface (fence rule).
2. Render a distinct reticle per new mode in `CrosshairSystem` (DOM/CSS in
   the Field Journal language per `docs/FIELD_JOURNAL_UI.md`): tank_gunner =
   center cross + stadia placeholder; emplacement_mg = open MG cross.
   Placeholder geometry is fine — R2 tasks refine the visuals.
3. Add a `setCrosshairMode(gameRenderer, mode)` helper beside
   `setInfantryCrosshair` in `VehicleAdapterShared.ts`.
4. `TankGunnerAdapter.onEnter` sets `'tank_gunner'`;
   `EmplacementPlayerAdapter.onEnter` sets `'emplacement_mg'`; both restore
   `'infantry'` on exit (today both set infantry on BOTH ends — see
   `TankGunnerAdapter.ts:136` / `EmplacementPlayerAdapter.ts:118`).
5. Update the adapter tests' `toHaveBeenLastCalledWith` expectations and add
   mode-switch coverage in the CrosshairSystem test.

## Non-goals

- No new HUD panels (ammo/reload displays are the R2 tasks).
- No helicopter/fixed-wing mode changes (later phases).
- No camera or fire-path changes.
- No `src/types/SystemInterfaces.ts` diff (see Scope 1).

## Acceptance

- [ ] L2 tests: entering the gunner seat sets `'tank_gunner'`, the M2HB sets
      `'emplacement_mg'`, exit restores `'infantry'`; CrosshairSystem renders
      a distinct element per new mode.
- [ ] `git diff --name-only` does NOT include `src/types/SystemInterfaces.ts`.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Round 2 / Dependencies

- Blocks: `tank-gunner-sight`, `m2hb-gun-experience` (both draw into the
  modes this task creates).
