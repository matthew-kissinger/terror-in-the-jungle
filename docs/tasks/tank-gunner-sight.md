<!-- cycle-2026-06-09-ground-gunnery-craft R2; follows reticle-framework (PR #362) -->
# tank-gunner-sight

R2 of `reticle-framework`: the M48 gunner now gets a `tank_gunner` crosshair
mode with placeholder geometry. This task turns it into a real sight: stadia
reticle, weapon-state HUD, azimuth awareness, and magnification — the owner
should be able to find, lead, and kill a target using the sight alone. See
`docs/CAMPAIGN_2026-06-09-craft-specialization.md` Phase 1.

## Files touched

- `src/ui/hud/CrosshairSystem.ts` (+ module CSS + test) — tank_gunner mode only
- `src/systems/vehicle/TankGunnerAdapter.ts` (+ test)
- `src/ui/layout/types.ts` (`VehicleUIContext` — additive optional fields only)
- New FJ-styled gunner panel component under `src/ui/hud/` (own file + test;
  do NOT inline into HUDVehicleHud)

## Scope

1. Refine the `tank_gunner` reticle: center aim cross + horizontal stadia
   rangefinder ticks + mil-style drop ticks below center (static markings —
   no live ballistic computation). Field Journal language per
   `docs/FIELD_JOURNAL_UI.md`.
2. Gunner panel (FJ-styled, gunner seat only): main-gun state READY /
   RELOADING driven from the actual fire-gate state the adapter/cannon
   already enforces (trace the cooldown the player fire path uses; do NOT
   invent a new ammo economy — if no stowage count exists, show state only).
3. Turret-azimuth indicator in the panel: turret yaw relative to hull yaw
   (simple rotated tick on a hull silhouette or arc), updated per frame.
4. Magnification: toggle between 1x and one zoomed step in
   `computeGunnerSightCamera` (FOV change) on RMB (real mouse input landed
   2026-06-09); reticle scales naturally (DOM overlay unaffected is fine).
5. Wire panel mount/unmount through the gunner adapter lifecycle (mirror how
   existing vehicle HUD context flows via `setVehicleContext`; add additive
   optional fields to `VehicleUIContext` in `src/ui/layout/types.ts` if
   needed — that file is NOT fenced; `src/types/SystemInterfaces.ts` is, and
   must not be touched).

## Non-goals

- No ammo-type selection (AP/HEAT/HE resolver is MVP AP-only — leave it).
- No new ammo economy / stowage model.
- No emplacement_mg changes (sibling task owns that mode).
- No NPC behavior changes.

## Acceptance

- [ ] L2: gunner seat entry mounts the panel + tank_gunner reticle; exit
      unmounts and restores infantry; RELOADING state appears after a shot
      and clears when the fire gate reopens; RMB toggles the zoom FOV.
- [ ] `git diff --name-only master` does NOT include
      `src/types/SystemInterfaces.ts`.
- [ ] `npm run lint && npm run test:run && npm run build` pass.
- [ ] PR against `master` linking this brief.

## Round 2 / Dependencies

- Depends on: `reticle-framework` (merged, PR #362).
- Sibling: `m2hb-gun-experience` runs AFTER this merges (shared
  CrosshairSystem file).
