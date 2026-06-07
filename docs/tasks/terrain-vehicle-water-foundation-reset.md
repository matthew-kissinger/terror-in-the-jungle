<!-- 80 LOC cap. Source audit: 2026-06-07 owner feedback + repo trace. -->
# terrain-vehicle-water-foundation-reset

Re-aligns the next long-horizon cycle after owner playtest rejected the
"code-complete / playtest deferred" surfaces for land vehicles, tanks,
hydrology, and Zone Control placement. Objective: one terrain placement and
water authority so vehicles spawn and drive on flat ground, tanks exist for both
teams and take damage, objectives sit on playable pads, and rivers read as
integrated water bodies instead of stamped ribbons.

## Pre-R1 source findings

- `VehicleManager.spawnScenarioM48Tanks` leaves terrain injection to callers;
  `OperationalRuntimeComposer.wireM48TankRuntime` only snaps initial Y and does
  not call `Tank.setTerrain`, while the M48 e2e test does so manually.
- `Tank.setTerrain` does not immediately rest-height conform like
  `GroundVehicle.setTerrain`; M48 spawn clipping remains plausible and is
  already named in `docs/BACKLOG.md`.
- `M48TankSpawn` only configures US tanks in Open Frontier and A Shau. There is
  no OPFOR tank fleet for enemy-team combined arms.
- Tank HP bands exist, but projectile/explosion impact routes damage
  combatants, not vehicles; M151 has no real damage state.
- Zone Control bases set `validateTerrain:false`, but
  `ZoneInitializer.createZonesFromConfig` still runs the random suitable-position
  pre-pass before that flag takes effect.
- Hydrology is still stamp + ribbon based:
  `HydrologyTerrainFeatures` emits flatten capsules and
  `HydrologyRiverGeometry` renders raised cross-section meshes over terrain.

## R0 evidence capture

1. Run headed Open Frontier, A Shau, and Zone Control walks. Record exact
   coordinates and screenshots for clipped vehicles, tank discoverability,
   river cutoffs, trench/wall banks, and objective/base terrain.
2. Treat the current green automated suite as necessary but insufficient. Do not
   promote these surfaces from tests alone.

## R1 split

1. `terrain-placement-authority` - central flat-pad / slope / terrain-readiness
   resolver used by vehicle spawns, watercraft spawns, bases, and capture zones.
2. `vehicle-runtime-closeout` - M151/M48 conform, board/drive/dismount proof,
   M151 damage, and tank combat balance.
3. `water-generation-reset-spike` - decide the replacement model before tuning:
   hydrology/water should feed terrain generation as bed/mask/level input.
4. `zone-control-playability` - rebuild ZC bases/objectives on authored,
   verified playable pads; no cliffs, ditches, or random spiral drift.

## Non-goals

- No broad visual terrain rewrite without the R0 defect poses.
- No fenced-interface change without `[interface-change]` approval.
- No "closed" status from local tests alone; owner playtest is the close gate.
- No live-production claim without the repo's live Pages release proof.

## R1 local proof (2026-06-07)

- Fixed `GameModeManager` fanout, added `TerrainPlacementAuthority`, and added
  US/NVA M48 scenario groups for Open Frontier and A Shau.
- M48 terrain/damage routing, shared non-tank vehicle damage, rejected
  hydrology diagnostics, and ZC no-drift proof had no failing gates:
  `artifacts/playtests/terrain-vehicle-water-foundation-reset/terrain-foundation-proof.json`.
- Hydrology diagnostics improved but do not close water acceptance.
- R2 water rearch slice: Open Frontier and A Shau now declare authored
  level/depth reaches; these compile carved bathymetry stamps, render
  `level-depth-water-bodies`, and return `water_body` samples. Hydrology stays a
  drainage/material sensor, not accepted gameplay water for those modes.
- Latest headed proof passes with `water_body` samples and bounded bed/inner
  bank sections in `artifacts/playtests/terrain-vehicle-water-foundation-reset/terrain-foundation-proof.json`.
- Gates: `doctor`, focused Vitest, `validate:fast`, `build`, `build:perf`,
  `check:water-runtime`, `check:water-system`, and
  `check:mobile-ui -- --device-id android-390x844`.

## Acceptance

- [x] `doctor`, `validate:fast`, `build`, and `check:mobile-ui` pass.
- [x] Headed evidence covers OF, A Shau, ZC, water, pads, and mobile deploy.
- [x] Both teams field damageable tanks in reachable, understandable locations.
- [x] Local proof: water bodies avoid terrain cuts, walls, trenches, and ribbons.
- [x] ZC bases, capture zones, and spawns are on playable real terrain.
