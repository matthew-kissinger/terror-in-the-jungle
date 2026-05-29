<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# tank-crew-cannon-turret

Closes the owner-reported "I'm not sure how to use the tanks" gap on the
functional side. The M48 boards but has no usable crew or weapon:
`TankPlayerAdapter` hardcodes `canFirePrimary:false` / `weaponCount:0`, there is
no driver/gunner seat-swap, the cannon is inert, and the turret/barrel are
`m48_turret_placeholder` / `m48_barrel_placeholder` cylinders
(`M48TankSpawn.ts:63,71`). Depends on `vehicle-occupancy-camera` (drivable +
shared adapter file).

## Files touched

- `src/systems/vehicle/TankPlayerAdapter.ts` (seat-swap, cannon fire, UI ctx)
- `src/systems/vehicle/M48TankSpawn.ts` (real turret/barrel geometry + refs)
- `src/systems/vehicle/PlayerVehicleAdapterFactory.ts` (tank_gunner route; fix
  latent `vehicleId:''` bug)
- sibling `*.test.ts`

## Scope

1. Driver/gunner seat-swap: player can switch to the gunner seat and back.
2. Wire the cannon to actually fire (real `weaponCount`, `canFirePrimary`, shot
   to damage via existing weapon primitives) with turret aim/rotation.
3. Replace placeholder turret/barrel cylinders with real geometry, keeping the
   turret pivot/muzzle transforms correct for aim + fire.

## Non-goals

- Camera branch (owned by `vehicle-occupancy-camera`; do not edit it).
- Deploy/loadout/map UX (owned by `tank-deploy-loadout-ux`).
- New tank types.

## Acceptance

- [ ] Test: tank reports `weaponCount>0` / `canFirePrimary` when crewed; cannon
      fire path produces a shot; seat-swap toggles the control target.
- [ ] Playwright smoke: spawn tank, swap to gunner, fire cannon at a target.
      Screenshots to the cycle playtest-evidence dir.
- [ ] combat120 p99 within +5% (perf-analyst); `combat-reviewer` APPROVE.
- [ ] `npm run lint && npm run test:run && npm run build` pass.

## Round 2 / Dependencies

- Depends on: `vehicle-occupancy-camera` (merge first).
- May exceed the ~500 LOC soft cap (coupled turret model + aim + gunnery);
  acceptable per orchestrator, keep cohesive, do not split mid-task.
- Reviewer: `combat-reviewer`. Fenced-interface change: STOP.
