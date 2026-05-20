# VEKHIKL-3 — M48 Patton tank (skid-steer chassis + turret + cannon)

Status: closed (cycle-vekhikl-4-tank-turret-and-cannon close-commit 2026-05-17)
Owning subsystem: vehicle (ground / tracked)
Opened: cycle-2026-05-04
Chassis half code-complete: cycle-vekhikl-3-tank-chassis 2026-05-17
Closed: cycle-vekhikl-4-tank-turret-and-cannon 2026-05-17 (turret + cannon + AI gunner + damage states + WASM pilot half landed; full M48 combat platform)

## Latest evidence

5 PRs landed under `cycle-vekhikl-3-tank-chassis` — R1: [#246](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/246) `6ab6ade5` tracked-vehicle-physics-core (new `src/systems/vehicle/TrackedVehiclePhysics.ts` per `docs/rearch/TANK_SYSTEMS_2026-05-13.md`; skid-steer kinematics with W/S throttle + A/D turn → independent L/R track speeds via `smoothControlInputs` lerp; four-corner ground conform through `ITerrainRuntime`; tracks-blown state zeroes forward velocity contribution; fixed 1/60 s step via `FixedStepRunner`; reuses `GroundVehiclePhysics` integration loop shape with skid-steer substituted for Ackermann), [#247](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/247) `23410433` tracked-vehicle-physics-tests (7 L2 behavior tests: pure forward throttle → forward motion + zero yaw, pure turn axis → in-place pivot, throttle+turn combined, chassis tilt on slope per-corner ground sample, tracks-blown immobilization, slope-stall scaling, input smoothing → no instantaneous jump). R2: [#249](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/249) `bc4ec779` vekhikl-3-playtest-evidence (`docs/playtests/cycle-vekhikl-3-tank-chassis.md` + capture script + PLAYTEST_PENDING row; deferred under autonomous-loop posture), [#250](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/250) `a08b878a` m48-tank-integration (new `src/systems/vehicle/Tank.ts` IVehicle impl + M48 chassis config; `VehicleManager` registration; M48 spawns on Open Frontier US base + A Shau valley road; `update(dt)` delegates to `TrackedVehiclePhysics.step()`), [#248](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/248) `a11c1ddf` tank-player-adapter (new `src/systems/vehicle/TankPlayerAdapter.ts` mirroring `GroundVehiclePlayerAdapter` with skid-steer input model: W/S throttle, A/D turn — NOT steer angle; F enter/exit; player seat = `'pilot'`; external orbit-tank third-person camera for the chassis-only slice; turret first-person comes in cycle #9; stub swapped to real Tank instance at merge commit `a11c1ddf`). No fence change (`VehicleCategory` / `SeatRole` reused per INTERFACE_FENCE.md). No external physics library added (per ENGINE_TRAJECTORY addendum + TANK_SYSTEMS §"Decision"). Owner walk-through deferred under autonomous-loop posture; full `done` promotion blocks on cycle #9 close (turret + cannon + AI gunner + damage states + WASM pilot).

## Success criteria

- [x] Tanks built as a sibling of the wheeled chassis (not a subclass) per TANK_SYSTEMS memo (chassis lives in `TrackedVehiclePhysics`, reusing the `GroundVehiclePhysics` integration loop shape).
- [x] M48 chassis drivable on Open Frontier US base + A Shau valley road via skid-steer (W/S throttle, A/D track-differential turn) with four-corner terrain conform and ground-conform chassis tilt (#246 + #248 + #250).
- [x] Tracks-blown immobilization state implemented (#246 forward-velocity contribution zeroed when `tracksBlown` set; verified by #247 behavior test).
- [x] No external physics library added; fixed-1/60 s integration step via `FixedStepRunner` (#246).
- [x] Turret + cannon mount + barrel pitch slew + ballistic projectile (cycle #9 PR #252 TankTurret rig + PR #253 TankCannonProjectile + PR #251 TankGunnerAdapter).
- [x] HP bands + visual transitions + turret-jammed / engine-killed substates (cycle #9 PR #256 tank-damage-states).
- [x] NPC AI gunner with lead-prediction via Rust→WASM solver pilot (cycle #9 PR #257 tank-ai-gunner-route + PR #254 tank-ballistic-solver-wasm-pilot KEEP-INCONCLUSIVE outcome + PR #258 post-merge stub→real swap).
- [ ] Owner playtest walk (mount, drive forward + reverse + in-place pivot, slope crest, tracks-blown trigger, turret aim, cannon arc, HP transitions, substate triggers, NPC gunner observation) — deferred to PLAYTEST_PENDING.
