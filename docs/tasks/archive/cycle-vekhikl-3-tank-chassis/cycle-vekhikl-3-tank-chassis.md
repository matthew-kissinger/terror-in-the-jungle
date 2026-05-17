# Cycle: VEKHIKL-3 Tank Chassis (Skid-Steer Locomotion)

Last verified: 2026-05-16

## Status

Queued at position #8 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
Closes the locomotion half of `VEKHIKL-3`. Blocks
`cycle-vekhikl-4-tank-turret-and-cannon` (turret + cannon mount onto
this chassis).

## Skip-confirm: no

Owner playtest required.

## Concurrency cap: 4

R1 ships chassis physics + tests; R2 ships player adapter + M48
integration + playtest.

## Objective

Ship a tank chassis (M48 Patton as the first tracked vehicle) with
skid-steer locomotion, four-wheel terrain conform, ground-conform
chassis tilt, and tracks-blown immobilization state.

**Tanks are a sibling of the wheeled chassis, not a subclass** (per
TANK_SYSTEMS memo). Reuse the chassis-conform pattern and fixed-1/60
s integration loop from `GroundVehiclePhysics` (cycle #4); substitute
Ackermann with skid-steer (independent L + R track speed from W/S/A/D).

Source memo:
[docs/rearch/TANK_SYSTEMS_2026-05-13.md](../rearch/TANK_SYSTEMS_2026-05-13.md).

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. [docs/rearch/TANK_SYSTEMS_2026-05-13.md](../rearch/TANK_SYSTEMS_2026-05-13.md)
   — full architecture brief. **Treat as authoritative scope.**
2. [docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md](../rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md)
   — wheeled chassis foundation (this cycle's predecessor pattern).
3. `src/systems/vehicle/GroundVehiclePhysics.ts` — written in cycle
   #4; reuse the integration loop shape.
4. `src/systems/vehicle/IVehicle.ts:4-5` — `VehicleCategory`
   includes `'ground'`; `SeatRole` includes `'gunner'`. No fence
   change.
5. `src/systems/helicopter/HelicopterPhysics.ts:151`
   `smoothControlInputs` — input smoothing template.
6. `src/types/SystemInterfaces.ts:219` — `ITerrainRuntime` fenced
   contract.
7. M48 GLB: `public/models/vehicles/ground/m48-tank.glb` (verify
   exists; if missing, flag in R1).

## Critical Process Notes

1. **No external physics library.** Per `ENGINE_TRAJECTORY` addendum
   + `TANK_SYSTEMS` memo §"Decision."
2. **Reuse `GroundVehiclePhysics` integration loop.** Substitute
   Ackermann with skid-steer. The fixed-1/60 s step + terrain
   conform pattern carries over verbatim.
3. **Owner playtest required.** Skid-steer feel is famously hard to
   tune; owner sign-off on hull-pivot and track-driven yaw is the
   gate.
4. **`combat-reviewer` is pre-merge gate** for any task that
   touches `src/systems/combat/**` (none expected this cycle —
   turret/cannon are cycle #9).

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `tracked-vehicle-physics-core`, `tracked-vehicle-physics-tests` | 2 | Physics + tests. |
| 2 | `tank-player-adapter`, `m48-tank-integration`, `vekhikl-3-playtest-evidence` | 3 | Adapter + integration + playtest. |

## Task Scope

### tracked-vehicle-physics-core (R1)

Author `TrackedVehiclePhysics.ts` per the TANK_SYSTEMS memo.

**Files touched:**
- New: `src/systems/vehicle/TrackedVehiclePhysics.ts` (~500 LOC).

**Method:**
1. State: `position`, `velocity`, `angularVelocity`, `quaternion`,
   `leftTrackSpeed`, `rightTrackSpeed`, `isGrounded`,
   `groundHeight`, `tracksBlown` (bool).
2. Skid-steer kinematics:
   ```
   throttleAxis  = W - S
   turnAxis      = D - A
   leftTrackCmd  = clamp(throttleAxis - turnAxis, -1, 1)
   rightTrackCmd = clamp(throttleAxis + turnAxis, -1, 1)
   ```
3. Per-track commands feed `leftTrackSpeed` / `rightTrackSpeed`
   through `smoothControlInputs` lerp.
4. Chassis-frame velocities follow differential-drive kinematics
   (per memo §"Locomotion: skid-steer").
5. Four corner sample points conformed to `ITerrainRuntime`.
6. Tracks-blown state: zero out forward velocity contribution from
   tracks; turret + chassis tilt still functional.
7. Fixed `1 / 60` step via `FixedStepRunner`.
8. Commit message: `feat(vehicle): TrackedVehiclePhysics skid-steer chassis (tracked-vehicle-physics-core)`.

**Acceptance:**
- `npm run lint`, `npm run test:run`, `npm run build` all green.
- File LOC ≤ 700.
- No fence change.

### tracked-vehicle-physics-tests (R1)

Author the behavior tests per the memo's test plan.

**Files touched:**
- New: `src/systems/vehicle/TrackedVehiclePhysics.test.ts`.

**Method:**
1. Test "pure forward throttle → forward motion, zero yaw."
2. Test "pure turn axis → in-place pivot."
3. Test "throttle + turn → combined motion + yaw."
4. Test "chassis tilts on slope (per-corner ground sample)."
5. Test "tracks-blown immobilizes forward motion."
6. Test "slope-stall scales forward force."
7. Test "input smoothing → no instantaneous track-speed jump."
8. Commit message: `test(vehicle): TrackedVehiclePhysics behavior tests (tracked-vehicle-physics-tests)`.

**Acceptance:**
- Tests green.
- L2 single-system test layer per `docs/TESTING.md`.

### tank-player-adapter (R2)

Author `TankPlayerAdapter.ts` per the memo.

**Files touched:**
- New: `src/systems/vehicle/TankPlayerAdapter.ts` (~300 LOC).
- New sibling test.

**Method:**
1. `PlayerVehicleAdapter` impl mirroring
   `GroundVehiclePlayerAdapter` (cycle #4) — but with skid-steer
   input model.
2. W/S throttle, A/D turn (NOT steer angle — track-differential).
3. Camera: external orbit-tank (third-person) for the chassis-only
   slice; turret first-person comes in cycle #9.
4. `F` enter/exit; player seat = `'pilot'`.
5. Commit message: `feat(vehicle): TankPlayerAdapter for chassis (tank-player-adapter)`.

**Acceptance:**
- Tests + build green.
- Behavior tests cover skid-steer input mapping (W+D ≠ Ackermann
  W+D).

### m48-tank-integration (R2)

Wire `Tank.ts` to `TrackedVehiclePhysics` + `TankPlayerAdapter`.

**Files touched:**
- New: `src/systems/vehicle/Tank.ts` (~250 LOC, the IVehicle impl
  per memo).
- `src/systems/vehicle/VehicleManager.ts` — register the M48.
- Possibly `src/config/vehicles/m48-config.ts` — chassis dims,
  mass, track speed cap, slope-stall threshold.

**Method:**
1. Config block per memo: M48 dimensions (~6.4 m × 3.6 m × 3.1 m),
   mass ~46 t, track speed cap ~12 m/s (~45 km/h road, less
   off-road).
2. `update(dt)` delegates to `TrackedVehiclePhysics.step()`.
3. Spawn one M48 on Open Frontier (US base) + one on A Shau (valley
   road).
4. Smoke-test in dev preview: enter, drive forward, pivot in place,
   crest a slope, exit.
5. Commit message: `feat(vehicle): M48 Patton tank chassis integration (m48-tank-integration)`.

**Acceptance:**
- Tests + build green.
- M48 visible at spawn on both modes.
- Driveable in dev preview (smoke screenshots in PR).

### vekhikl-3-playtest-evidence (R2, merge gate)

Owner playtest.

**Files touched:**
- New: `docs/playtests/cycle-vekhikl-3-tank-chassis.md`.

**Method:**
1. Owner drives M48 on Open Frontier: forward, reverse, in-place
   pivot, slope crest, slope stall.
2. Repeat on A Shau.
3. Trigger tracks-blown (developer debug command) and verify
   immobilization.
4. Owner records feel: skid-steer responsiveness, hull tilt on
   slopes, track-driven yaw rate.

**Acceptance:**
- Owner sign-off recorded.

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- Any task introduces an external physics library → halt.
- Owner playtest rejects twice → halt.

## Reviewer Policy

- No mandatory reviewer (no combat/terrain/navigation touches).
- Orchestrator reviews each PR.

## Acceptance Criteria (cycle close)

- All R1 + R2 task PRs merged.
- M48 chassis drivable on Open Frontier + A Shau.
- Tracks-blown state observably immobilizes.
- Owner playtest sign-off.
- No external physics library added.
- No fence change.
- No perf regression > 5% p99 on `combat120`.
- `VEKHIKL-3` directive (chassis half) progress recorded in
  `docs/DIRECTIVES.md`; full close awaits cycle #9 turret + cannon.

## Out of Scope

- Turret, cannon, ammo, ballistic solver — cycle #9.
- AI gunner — cycle #9.
- Other tanks (T-54, M113, etc.) — future cycles.
- Touching `src/systems/combat/**`, `src/systems/terrain/**`,
  `src/systems/navigation/**`.
- Fenced-interface touches.

## Carry-over impact

VEKHIKL-3 lives in `docs/DIRECTIVES.md`. Chassis half closes here;
turret half closes in cycle #9.

Net cycle delta: 0 active-list; +0.5 directive closed (partial).
