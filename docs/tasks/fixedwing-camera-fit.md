<!-- cycle-2026-06-09-fixed-wing-craft R3; follows per-aircraft-ordnance -->
# fixedwing-camera-fit

With per-airframe ordnance landed, the cameras must fit the weapons: the
reflector sight must actually predict where the guns hit, and the AC-47's
broadside needs an aiming view (the guns fire 90° left of the nose — the
forward chase cam cannot aim them). See
`docs/CAMPAIGN_2026-06-09-craft-specialization.md` Phase 2.

## Files touched

- `src/systems/player/PlayerCamera.ts` (+ test) — fixed-wing camera block
  (per-airframe offsets; AC-47 broadside view toggle)
- `src/systems/vehicle/FixedWingModel.ts` / `FixedWingArmament.ts` (+ tests)
  — per-airframe camera tuning data; expose what the camera needs (read-only)
- `src/systems/vehicle/FixedWingPlayerAdapter.ts` (+ test) — wiring only
- `src/ui/hud/CrosshairSystem.ts` (+ test) — only if the broadside view needs
  the reticle repositioned/swapped (keep changes mode-scoped)

## Scope

1. Per-airframe chase-cam tuning in the armament/airframe table (follow
   distance/height/FOV feel per airframe — A-1 closer/agile, F-4 farther/
   faster, AC-47 wide/stately). Values data-driven, not hardcoded in the
   camera.
2. Sight-line alignment: from the chase/cockpit view, the PR #370 reflector
   reticle must sit on the gun convergence point for A-1 (wing-pair
   convergence) and F-4 (nose axis) at a documented reference range —
   verify with a deterministic test (project the convergence point; assert
   screen-center alignment within tolerance).
3. AC-47 broadside aiming view: while in the AC-47, a toggle (reuse the RMB
   rising-edge pattern from the tank sight, or auto when guns armed — pick
   and document) switches to a left-side gunner view (camera looks 90° left,
   slight down-angle for orbit fire); the reticle centers in that view;
   toggling back restores the chase cam. Fixed-wing flight CONTROLS remain
   unchanged in both views.
4. Exit/enter transitions stay clean across all three airframes (no FOV or
   view leakage into infantry — reuse the PlayerCamera restore guarantees
   from tank-sight-prod-wiring).
5. L2 tests per scope item; extend the PlayerCamera fixed-wing tests.

## Non-goals

- No weapon/ordnance changes (tables landed in per-aircraft-ordnance).
- No lead computation / CCIP.
- No helicopter or ground-vehicle camera changes.
- No new HUD panels.

## Acceptance

- [ ] Per-airframe chase feel values drive the camera (tests assert the
      table is consumed); A-1/F-4 reticle-convergence alignment proven by
      test; AC-47 broadside view toggle works and restores cleanly.
- [ ] `npm run lint && npm run test:run && npm run build && npm run
      lint:budget` pass; no `src/types/SystemInterfaces.ts` diff.
- [ ] PR against `master` linking this brief.

## Round 2 / Dependencies

- Depends on: `per-aircraft-ordnance` (merged).
- Last task of Phase 2; exit gate: owner feel-walk (A-1 strafe with sight,
  F-4 pass, AC-47 orbit + broadside view on a zone).
