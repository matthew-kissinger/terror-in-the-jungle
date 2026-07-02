# task/fixed-wing-bombs

Cycle: cycle-2026-07-02-greenlight-followthrough (Wave 2)
Reviewer: combat-reviewer
Owner decisions: A0-incremental, A1b, A2, A3, A4-spare, A5-sortie
Playtest-required: yes

## Goal

Player-droppable, impact-detonating bombs with a CCIP pipper on the A-1 Skyraider
and F-4 Phantom (RMB release). The AC-47 stays a pure broadside gunship (its RMB
remains the gunner cam). Built on a consolidated GrenadeSystem projectile
primitive that also fixes the shipped rocket fuse-only defect (A3).

## Part 1 — ordnance primitive (+ rocket fix, A3)

- `GrenadePhysics.updateGrenade` now latches `grenade.hasImpacted` on first ground
  contact (a bounce/roll no longer hides the impact from the caller).
- `GrenadeSystem.spawnProjectile` gained an additive `options` bag:
  `{ detonateOnImpact?, blastRadius?, blastDamage? }`. `GrenadeSystem.update`
  detonates on `fuseTime <= 0` (unchanged) OR `(detonateOnImpact && hasImpacted)`.
  Per-projectile blast is threaded through `GrenadeEffects.explodeFrag`
  (`grenade.blastRadius ?? 15`, `grenade.blastDamage ?? 150`), so thrown
  grenades / M79 stay byte-identical (fuse-only, legacy 15/150 blast).
- The two shipped rocket call sites flipped to `detonateOnImpact: true` keeping
  the 10 s fuse as a backstop: `HelicopterWeaponSystem.fireProjectile` and
  `RocketRunMission.updateRocketRun`. False "relies on terrain impact" comments
  fixed. **Owner-approved feel change to shipped rockets (manifest A3).**

## Part 2 — bombs

- `FixedWingArmament.ts`: secondary-ordnance table — A-1 4 bombs, F-4 6 bombs,
  AC-47 none. Blast 16 m / 180 (between mortar 20/200 and Arclight 14/160).
- `FixedWingBombing.ts` (new): `predictBombImpact` CCIP forward-Euler solver
  (same gravity as the grenade sim, terrain intersection; NOT coupled to mortar
  code), `solveBombCueOffset` (project impact → screen pixel offset),
  `FixedWingBombController` (per-sortie store, release, cue), and
  `createBombRuntime` (assembles the airframe pose view + output sinks). Keeps
  the player adapter thin and unit-tests without the model or GrenadeSystem.
- `FixedWingPlayerAdapter`: RMB rising edge on the A-1/F-4 releases a bomb at the
  aircraft position with its **current world velocity** (zero added muzzle
  speed), `detonateOnImpact`, 20 s backstop fuse, `ownerFaction = US` (IFF spares
  allies — A4), killFeedWeaponType `'bomb'` (hit markers + kill credit + F1
  self-damage at 0.75x ride for free through the shared `applyExplosionDamage`
  path). Grounded release blocked (reuses the gun's airborne gate + "Airborne to
  fire" hint). CCIP pipper pushed to the crosshair each frame; hidden off-screen
  / grounded. Bombing deps injected at construction (net-zero PlayerController
  lines).
- HUD: `FixedWingHUD` bomb panel (count + LOW on the last bomb) via the #469 ammo
  push (extended `updateFixedWingAmmo` signature, net-zero HUDSystem lines).
  Desktop legend "RMB: Drop bomb" via the `HudControlHints` seat-hint note.
  Touch BOMB button on `VehicleActionBar` (visible only while bombs remain, via
  the `bombsAvailable` vehicle-context field). CCIP pipper via a new
  `GameRenderer.setCrosshairBombCue` / `CrosshairSystem` bomb-cue channel.

## Files touched

- src/systems/weapons/GrenadePhysics.ts, GrenadeSystem.ts, GrenadeEffects.ts
- src/systems/helicopter/HelicopterWeaponSystem.ts
- src/systems/airsupport/RocketRunMission.ts
- src/systems/vehicle/FixedWingArmament.ts, FixedWingBombing.ts (new),
  FixedWingPlayerAdapter.ts
- src/systems/player/PlayerController.ts (net-zero: adapter construction args)
- src/core/GameRenderer.ts
- src/ui/hud/CrosshairSystem.ts (+ .module.css), FixedWingHUD.ts, HUDSystem.ts
  (net-zero), HUDVehicleHud.ts, HudControlHints.ts
- src/ui/controls/VehicleActionBar.ts, TouchControls.ts
- src/ui/layout/types.ts (VehicleUIContext.bombsAvailable)
- Tests: GrenadeSystem, RocketRunMission, HelicopterWeaponSystem,
  FixedWingBombing (new), FixedWingPlayerAdapter, CrosshairSystem, FixedWingHUD,
  VehicleActionBar, HudControlHints

## Non-goals / gaps

- Touch BOMB button tap → adapter is wired through `VehicleActionBar` →
  `TouchControls` (`onFixedWingBombRelease`) and the adapter exposes
  `releaseBombFromTouch()`, but the final `PlayerInput` → `PlayerController` leg
  is **deferred**: it needs ~3 lines in grandfathered files (PlayerInput,
  PlayerController) that are at their budget ceiling. The button + its
  bombs-remaining gating render correctly (via the vehicle-context path); the tap
  is a documented no-op until that wire lands in `hint-table-and-touch-strings`.
- AC-47 unchanged (no bombs, no pipper; RMB stays the gunner cam).

## Perf

combat120 / AI_SANDBOX never exercises this (no aircraft, usesZones false) — the
evidence is the focused L1/L2 tests. Per-frame CCIP is O(a few dozen fixed
integration steps) and runs only while piloting a bombed airframe.

## Validation

- npm run typecheck: PASS
- npm run lint: PASS (0 errors; 1 pre-existing warning in an untouched file)
- npm run lint:budget: PASS (0 failures; grandfathered files unchanged at snapshot)
- npm run build: PASS
- Focused tests: all touched files green
