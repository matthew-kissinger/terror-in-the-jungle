<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# cycle-2026-05-28-vehicles-aircraft-operable

Closes the "vehicles and aircraft are not actually operable" gap the owner hit.
Boarding a ground vehicle or tank welds the camera under the chassis at the
ground-origin boarding point so you cannot drive (`PlayerCamera` has no
ground/tank branch; the correct third-person follow-cam exists but is never
called). Tanks have no usable crew or cannon and no spawn discoverability.
Aircraft weapons are untested and broken end-to-end: the Huey M60 door guns are
filtered out of `initWeapons` and never fire, fixed-wing armament is absent
(`weaponCount:0`), and the pilot guns that do fire hit friendlies as well as
enemies (no friend-or-foe check). Bundled repo-alignment runs in parallel: wire the dead
`CoverSpatialGrid` O(1) cover path into prod combat, consolidate drifted docs,
archive unreferenced scripts. Posture: autonomous-loop (playtests become
Playwright smoke + screenshots, deferred to PLAYTEST_PENDING).

## Files touched (by task - see per-task briefs)

- R1: PlayerCamera + vehicle adapters; HelicopterWeaponSystem + FixedWing*;
  AIStateEngage cover grid; docs/**; scripts/**.
- R2: TankPlayerAdapter + M48TankSpawn + factory; DeployScreen + loadout +
  map; HydrologyRiverSurface + WatercraftPhysics.

## Scope (2 rounds, 8 tasks)

1. R1 (5 parallel): `vehicle-occupancy-camera` (keystone), `aircraft-armament`,
   `cover-grid-wiring`, `doc-consolidation-and-refs`, `script-inventory-archival`.
2. R2 (3, after keystone): `tank-crew-cannon-turret`, `tank-deploy-loadout-ux`,
   `hydrology-river-surface-fix`.
3. Wave 0 (orchestrator, during R1): drive the build on this RTX 3070 box,
   characterize the specific hydrology defect, fill the R2 hydrology brief.

## Non-goals

- Helicopter / fixed-wing camera branches (already work; do not touch).
- New vehicle/aircraft types or fleet expansion.
- ECS hot-path / materialization-tier work.
- Combat cover-scoring redesign (only inject the existing O(1) grid).

## Acceptance

- [ ] All 8 task PRs merged to master, CI green, listed reviewers APPROVE.
- [ ] combat120 p99 within +5% of baseline (perf-analyst after each round;
      `cover-grid-wiring` expected to hold or improve it).
- [ ] PLAYTEST_PENDING row per playtest-deferred task; `docs/playtests/<slug>.md`
      memo per smoke-captured task.
- [ ] Cycle-close commit subject carries `(playtest-deferred)`.
- [ ] Carry-over count does not grow (`npm run check:cycle -- <slug> --close`).

## Round 2 / Dependencies

- `tank-crew-cannon-turret` + `tank-deploy-loadout-ux` depend on
  `vehicle-occupancy-camera` (drivable + shared `TankPlayerAdapter.ts`).
- Hard-stops (halt + surface): fence change, >2 CI red/round, combat120 p99
  >5%, carry-over growth, worktree failure, reviewer rejects twice.
