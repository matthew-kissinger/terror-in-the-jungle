<!-- cycle-2026-06-09-helicopter-craft R1 (Phase 3 of CAMPAIGN_2026-06-09-craft-specialization) -->
# door-gun-seat

Helicopters are the least-broken craft family (bespoke controls, HUD, the
only pre-campaign pipper) — but the UH-1's door guns are NPC-flavor only: the
player cannot crew them. This task makes the door-gun seat player-crewable
with a reticle, arc limits, and ammo display, reusing the seat/session and
reticle machinery the ground-gunnery cycle built. See
`docs/CAMPAIGN_2026-06-09-craft-specialization.md` Phase 3.

## Files touched (trace first — heli code spans several modules)

- `src/systems/helicopter/HelicopterWeaponSystem.ts` (+ test) — door-gun fire
  path for a player gunner (reuse the existing door-gun primitives)
- `src/systems/vehicle/HelicopterVehicleAdapter.ts` /
  `src/systems/vehicle/HelicopterPlayerAdapter.ts` (+ tests) — seat
  model/swap (mirror the M48 `swapSeat` pattern where sensible)
- `src/ui/hud/CrosshairSystem.ts` (+ test) — `door_gun` mode (open MG cross
  variant, FJ language; emplacement_mg styling is the close cousin)
- `src/core/StartupPlayerRuntimeComposer.ts` — wiring (panel/ammo host if a
  panel is warranted; m2hb precedent)

## Scope

1. Player can take a UH-1 door-gun seat (entry from passenger/pilot via a
   seat-swap key, mirroring the tank's swap; document the chosen UX) and
   leave it back to their prior seat.
2. While crewing: mouse aims the door gun within its traverse/elevation arc
   (hard stops at the mount limits), LMB fires through the EXISTING door-gun
   fire/damage path (no new ballistics), tracers visible.
3. `door_gun` crosshair mode while crewing; restore on leaving the seat.
   Ammo/heat display only if the existing weapon state exposes it (no new
   ammo economy; belt-style readout reusing EmplacementGunPanel patterns is
   optional, not required).
4. Camera: a door-side gunner view while crewing (reuse the
   `computeGunnerSightCamera` optional-provider seam on `VehicleFollowCamera`
   from tank-sight-prod-wiring if the heli camera path can host it; else the
   heli camera block — document the route).
5. L2/L3 tests: seat swap in/out, arc clamps, fire reaches the door-gun
   path, crosshair set/restore.

## Non-goals

- No NPC door-gunner behavior changes (NPC crews keep working as today).
- No Cobra/attack-heli changes (sibling `gunship-reticle-upgrade`).
- No new weapon systems or damage models.
- No transport HUD overhaul (sibling `heli-hud-consolidation`).

## Acceptance

- [ ] Board a UH-1, swap to the door gun, aim within the arc, fire with
      tracers, swap back — all proven by tests; crosshair correct per seat.
- [ ] `npm run lint && npm run test:run && npm run build && npm run
      lint:budget` pass; no `src/types/SystemInterfaces.ts` diff.
- [ ] PR against `master` linking this brief; combat-reviewer gates if
      `src/systems/combat/**` is touched (door-gun fire path may live there
      — confirm in report).

## Round 2 / Dependencies

- Independent root of Phase 3 (siblings: `gunship-reticle-upgrade`,
  `heli-hud-consolidation`).
