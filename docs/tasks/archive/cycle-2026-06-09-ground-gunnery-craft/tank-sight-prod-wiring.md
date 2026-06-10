<!-- cycle-2026-06-09-ground-gunnery-craft R3; follows tank-gunner-sight (PR #366) + npc-tank-cannon-wiring (PR #364) -->
# tank-sight-prod-wiring

`tank-gunner-sight` (merged) built the full M48 gunner sight — stadia reticle,
READY/RELOADING panel, azimuth dial, RMB zoom — inside `TankGunnerAdapter`.
But that adapter has **zero production imports**: prod boards tanks through
`TankPlayerAdapter` (internal driver/gunner seat swap), so the sight is
unreachable in-game and the Phase 1 exit gate (owner kills a target using the
sight) cannot pass. This task routes the prod gunner experience to the new
sight. See `docs/CAMPAIGN_2026-06-09-craft-specialization.md` Phase 1.

## Files touched

- `src/systems/vehicle/PlayerVehicleAdapterFactory.ts` and/or
  `src/systems/vehicle/TankPlayerAdapter.ts` (+ tests)
- `src/systems/vehicle/TankGunnerAdapter.ts` (+ test) — only if the chosen
  route needs hooks
- `src/core/StartupPlayerRuntimeComposer.ts` (panel-host + cannon wiring;
  follow the precedent `m2hb-gun-experience` set with
  `buildSeatedWeaponLifecycle` + lazy `game-hud-root` host)
- Existing integration tests `src/integration/vehicle/m48-board.test.ts` /
  `seated-weapon-fire.test.ts` (extend, keep green)

## Scope

1. Decide the route and justify it in the PR: (a) wire `TankGunnerAdapter`
   into the factory/seat-switch path as the gunner-seat adapter, or (b) port
   the sight surface (panel mount, zoom, reload-gate display, tank_gunner
   crosshair mode) into `TankPlayerAdapter`'s gunner mode and retire the
   standalone adapter's duplicate reload model. Prefer whichever leaves ONE
   reload-gate authority (the cannon fire path that actually fires —
   `TankPlayerAdapter.tryFireCannon` / shared `TankCannonProjectileSystem`).
2. Wire the panel host in the composer at board-time (m2hb precedent) so the
   gunner panel mounts in prod, not just tests.
3. Gunner seat shows `tank_gunner` crosshair + panel; driver seat does NOT;
   seat swap transitions cleanly both ways; exit restores infantry.
4. RMB zoom works from the prod gunner seat against the real camera path.
5. Extend the m48-board integration test to assert reticle mode + panel
   mount across board → seat-swap → fire → exit.

## Non-goals

- No reticle/panel visual changes (shipped).
- No cannon ballistics/damage changes (PR #364 owns the stepper fix).
- No M2HB changes.
- No NPC behavior changes.

## Acceptance

- [ ] L3: full board → gunner seat → sight visible + panel mounted →
      RELOADING after fire → seat swap hides → exit restores infantry.
- [ ] One reload-gate authority feeds both the fire gate and the panel
      display (no drift between displayed RELOADING and actual fire gate).
- [ ] `npm run lint && npm run test:run && npm run build` pass; no
      `src/types/SystemInterfaces.ts` diff.
- [ ] PR against `master` linking this brief.

## Round 2 / Dependencies

- Depends on: `tank-gunner-sight` (merged #366), `npc-tank-cannon-wiring`
  (#364 — composer conflicts; dispatch after it merges).
