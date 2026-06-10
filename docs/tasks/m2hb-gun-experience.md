<!-- cycle-2026-06-09-ground-gunnery-craft R2; follows reticle-framework + tank-gunner-sight -->
# m2hb-gun-experience

R2 of `reticle-framework`: the M2HB emplacement now gets an `emplacement_mg`
crosshair mode with placeholder geometry. This task makes crewing the gun
feel like a heavy MG position: real reticle, belt counter, traverse-stop
feedback, and fire feel. See
`docs/CAMPAIGN_2026-06-09-craft-specialization.md` Phase 1.

## Files touched

- `src/ui/hud/CrosshairSystem.ts` (+ module CSS + test) — emplacement_mg mode only
- `src/systems/vehicle/EmplacementPlayerAdapter.ts` (+ test)
- `src/systems/combat/weapons/M2HBWeapon.ts` / `M2HBEmplacement.ts` —
  read-path only (expose getters if missing; `getAmmo()` exists at
  `M2HBWeapon.ts:144`)
- New/shared FJ-styled emplacement panel under `src/ui/hud/` (own file + test)

## Scope

1. Refine the `emplacement_mg` reticle: open-center MG cross with wide
   horizontal wings (classic ladder-less MG sight), Field Journal language.
2. Belt counter panel: rounds remaining from `M2HBWeapon.getAmmo()` (belt
   refills on dismount via the existing reload-on-dismount path — display
   only; no new ammo mechanics). Show a LOW state under a threshold.
3. Traverse-stop feedback: when the adapter clamps yaw/pitch at its limits,
   show a directional stop cue (edge tick flash on the reticle or panel).
4. Fire feel: small camera recoil impulse per shot in the barrel-camera path
   in `EmplacementPlayerAdapter` (subtle; no gameplay aim punch — visual
   only, and respect the existing camera provider contract).
5. Mount/unmount through the adapter lifecycle, same pattern
   `tank-gunner-sight` established (reuse its panel scaffolding/styles where
   sensible; additive optional `VehicleUIContext` fields only —
   `src/types/SystemInterfaces.ts` must not be touched).

## Non-goals

- No heat/jam mechanics; no new ammo economy.
- No NPC M2HB behavior changes (NpcM2HBAdapter untouched).
- No tank_gunner mode changes.
- No changes to M2HB damage/cadence values.

## Acceptance

- [ ] L2: M2HB entry mounts panel + emplacement_mg reticle; belt count
      decrements with fire and refills after dismount/remount; traverse cue
      fires at the yaw stops; exit restores infantry.
- [ ] `git diff --name-only master` does NOT include
      `src/types/SystemInterfaces.ts`.
- [ ] `npm run lint && npm run test:run && npm run build` pass.
- [ ] PR against `master` linking this brief; combat-reviewer gates merge
      (touches `src/systems/combat/weapons/**`).

## Round 2 / Dependencies

- Depends on: `reticle-framework` (merged) and `tank-gunner-sight` (shared
  CrosshairSystem + panel scaffolding — dispatch after it merges).
