# VEKHIKL-1 — M151 jeep ground vehicle

Status: code-complete (owner playtest deferred)
Owning subsystem: vehicle (ground)
Opened: cycle-2026-05-04
Code-complete: cycle-vekhikl-1-jeep-drivable 2026-05-16

## Latest evidence

5 PRs landed under `cycle-vekhikl-1-jeep-drivable` — R1: #223 `6309558a` GroundVehiclePhysics (581 LOC, fixed-step rigid-body sim per `docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md`), #224 `e687e70a` GroundVehiclePhysics.test (305 LOC, 7 behavior tests post stub→real swap); R2: #226 `…` GroundVehiclePlayerAdapter (W/S throttle, A/D steer, Space brake, F enter/exit, third-person follow) + VehicleManager.getGroundVehicleByOccupant helper, #227 `901ae017` M151 integration (GroundVehicle.update wired to GroundVehiclePhysics; VehicleManager.update fan-out; M151 spawns confirmed on Open Frontier airfield_motor_pool + A Shau tabat_motor_pool via existing world-feature prefabs; Playwright smoke verified jeep visible at expected coords on both modes), #225 `…` playtest evidence (`docs/playtests/cycle-vekhikl-1-jeep-drivable.md` + `scripts/capture-m151-jeep-playtest-shots.ts` + PLAYTEST_PENDING row). Owner walk-through deferred under autonomous-loop posture; PLAYTEST_PENDING.md row tracks the owner sweep. Promotion to fully `done` blocks on owner sign-off.

## Success criteria

- [x] M151 spawnable in Open Frontier; player enters/exits via `VehicleSessionController` (verified by adapter+integration PRs + smoke).
- [x] Basic driving (forward, back, turn) over terrain (verified by GroundVehiclePhysics tests: gravity, conform-flat, conform-slope, Ackermann yaw scaling, brake-to-stop, slope-stall).
- [x] Collides with terrain (per-wheel terrain conform via `ITerrainRuntime.getHeightAt/getNormalAt/getSlopeAt`; no per-frame reflection RT). Static-obstacle collision deferred to future cycle.
