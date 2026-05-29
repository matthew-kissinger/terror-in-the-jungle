<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# tank-deploy-loadout-ux

Closes the owner-reported "I'm not sure where the tanks are" gap. Tanks are not
surfaced as a spawn/loadout choice and have no map/HUD discoverability, so the
owner cannot find or intentionally crew one. Make the tank a first-class deploy
option with on-map markers and a controls hint.

## Files touched

- `src/ui/screens/DeployScreen.ts` (+ `DeployScreen.module.css`) - tank as deploy choice
- `src/ui/loadout/LoadoutTypes.ts` - tank loadout entry
- `src/ui/map/OpenFrontierRespawnMap.ts` and/or `src/ui/minimap/**` - tank markers
- `src/ui/controls/VehicleActionBar.ts` - seat-swap / fire controls hint

## Scope

1. Surface the tank as a selectable deploy/loadout option (spawn into or near a
   tank) in `DeployScreen` + `LoadoutTypes`.
2. Add tank spawn-location markers to the respawn map / minimap so the owner can
   see where tanks are.
3. Show a brief "how to use" controls hint (enter / seat-swap / fire) via the
   vehicle action bar when near/in a tank.

## Non-goals

- Cannon/gunnery wiring or turret models (owned by `tank-crew-cannon-turret`).
- Camera (owned by `vehicle-occupancy-camera`).
- Reworking non-tank deploy flows.

## Acceptance

- [ ] Tank appears as a deploy/loadout choice and spawns the player into/at a tank.
- [ ] Tank spawn markers render on the respawn map / minimap.
- [ ] Playwright smoke: open deploy screen, pick tank, see markers + controls
      hint. Screenshots to the cycle playtest-evidence dir.
- [ ] `npm run lint && npm run test:run && npm run build` pass.

## Round 2 / Dependencies

- Depends on: `vehicle-occupancy-camera` (need an operable tank to verify).
- Coordinates with `tank-crew-cannon-turret`: this task owns `src/ui/**`; do
  not edit `TankPlayerAdapter` combat.
