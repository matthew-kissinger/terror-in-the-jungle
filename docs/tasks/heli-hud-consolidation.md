<!-- cycle-2026-06-09-helicopter-craft R3; follows gunship-reticle-upgrade -->
# heli-hud-consolidation

Last task of the craft-specialization campaign. Helicopter HUD today renders
a shared superset regardless of variant; per-variant descriptors give the
transport, gunship, and attack airframes the right panels — and this task
sweeps the campaign's two deferred heli items: the door-side gunner POV and
the traverse-stop reticle tick seam (both documented in PR #374). See
`docs/CAMPAIGN_2026-06-09-craft-specialization.md` Phase 3.

## Files touched

- `src/ui/hud/HelicopterHUD.ts` (+ test) — per-variant descriptor rendering
  (transport: no weapon panels; gunship: door-gun belt + crew state; attack:
  weapon/ammo from `gunship-reticle-upgrade`); retire duck-typed variant
  checks
- `src/ui/layout/types.ts` — additive optional `VehicleUIContext` fields
  only (NOT fenced); `src/types/SystemInterfaces.ts` must not change
- `src/systems/vehicle/HelicopterPlayerAdapter.ts` (+ test) — emit the
  per-variant context; door-gun POV camera while crewing (deferred from
  `door-gun-seat`: route it through the heli camera block in
  `src/systems/player/PlayerCamera.ts` — the `isInHelicopter` branch —
  with the same restore guarantees as the sight FOV machinery)
- `src/ui/hud/CrosshairSystem.ts` — wire the existing `setTraverseStop`
  edge ticks for `door_gun`/`emplacement_mg` via a non-fenced seam (the
  HUD-side panels already receive adapter state; reuse that path — do NOT
  add fenced methods)

## Scope

1. Per-variant HUD descriptors through `setVehicleContext` (additive
   optional fields), rendered by HelicopterHUD; the wrong-variant panels
   never mount.
2. Door-gun POV: while crewing the door gun, the camera moves to a
   door-side gunner view (look direction follows the clamped gun aim);
   restores cleanly on seat toggle/exit (no leakage — reuse the restore
   guarantees pattern).
3. Traverse-stop ticks: light the `door_gun` (and `emplacement_mg`) reticle
   edge ticks from the adapters' existing traverse-stop state via the
   non-fenced HUD seam.
4. L2 tests: variant→panel matrix, POV swap/restore, tick lighting at the
   stops.

## Non-goals

- No weapon/ballistics changes.
- No fenced-interface changes.
- No fixed-wing/ground HUD changes.

## Acceptance

- [ ] Variant→panel matrix proven by tests; door-gun POV active while
      crewing + clean restore; ticks light at the stops.
- [ ] `npm run lint && npm run test:run && npm run build && npm run
      lint:budget` pass; no `src/types/SystemInterfaces.ts` diff.
- [ ] PR against `master` linking this brief.

## Round 2 / Dependencies

- Depends on: `gunship-reticle-upgrade` (merged — shared HelicopterHUD).
- Closes Phase 3 and the craft-specialization campaign (owner feel-walk
  row at cycle close).
