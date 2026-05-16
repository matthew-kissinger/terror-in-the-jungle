# Cycle: VEKHIKL-1 M151 Jeep Drivable End-to-End

Last verified: 2026-05-16

## Status

Queued at position #4 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
Closes `VEKHIKL-1`. Unblocks `cycle-voda-3-watercraft` (the seat /
adapter / `GroundVehiclePhysics` surface generalizes).

## Skip-confirm: no

Owner playtest is part of acceptance (the jeep is a player-facing
feature; auto-merge on CI green is not sufficient).

## Concurrency cap: 4

R1 ships the physics + chassis + behavior tests; R2 ships the
player-adapter + integration + playtest acceptance.

## Objective

Drive the M151 jeep end-to-end on a hand-rolled chassis model
mirroring `HelicopterPhysics.ts`: fixed-1/60 s integration, four
wheel sample points conformed to `ITerrainRuntime` height + normal,
Ackermann yaw, drive/brake/drag forces, slope-stall scaling.

Source memo:
[docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md](../rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md)
— the architecture brief that this cycle implements verbatim.

**No external physics library.** Defer Rapier evaluation to the
named four-trigger gate (multi-vehicle collision, ragdoll, watercraft
buoyancy, articulated trucks) per
`docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md` §2.1 + §6.

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. [docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md](../rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md)
   — full architecture brief: state shape, force list, integration
   loop, integration surface, behavior-test plan. **Treat as the
   authoritative scope.**
2. [docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md](../rearch/ENGINE_TRAJECTORY_2026-04-23.md)
   — "keep the stack" stance with 2026-05-13 ground-vehicle
   addendum.
3. `src/systems/vehicle/IVehicle.ts:4` — `VehicleCategory` already
   includes `'ground'`; no fence change.
4. `src/systems/vehicle/GroundVehicle.ts:17` — current M151 stub.
5. `src/systems/helicopter/HelicopterPhysics.ts:49` — the
   438-line fixed-step rigid-body sim that's the integration
   template.
6. `src/systems/helicopter/HelicopterPhysics.test.ts` — behavior-test
   pattern to mirror.
7. `src/types/SystemInterfaces.ts:219` — `ITerrainRuntime` fenced
   contract (`getHeightAt`, `getEffectiveHeightAt`, `getSlopeAt`,
   `getNormalAt`).
8. `src/systems/vehicle/VehicleSessionController.ts` — existing
   session pattern; ground vehicles use this.
9. `src/systems/vehicle/FixedWingPlayerAdapter.ts` — adapter
   pattern reference.
10. M151 GLB: `public/models/vehicles/ground/m151-jeep.glb`.

## Critical Process Notes

1. **`ITerrainRuntime` is fenced.** Read methods only; no
   modifications.
2. **No external physics library.** Hand-roll the model.
3. **Owner playtest is the merge gate for R2.** The cycle marks
   "Playtest required" — drive the jeep across Open Frontier
   and A Shau, feel for slope-stall, brake response, steering.
4. **Smoke test in dev preview before R2 PR.** Spawn the jeep,
   drive it, exit it.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `ground-vehicle-physics-core`, `ground-vehicle-physics-tests` | 2 | Physics + tests. Independent; both write to new files. |
| 2 | `ground-vehicle-player-adapter`, `m151-jeep-integration`, `m151-jeep-playtest-evidence` | 3 | Player adapter + vehicle integration + playtest. Adapter depends on physics from R1; integration depends on adapter; playtest is the owner gate. |

## Task Scope

### ground-vehicle-physics-core (R1)

Author `GroundVehiclePhysics.ts` per the architecture memo.

**Files touched:**
- New: `src/systems/vehicle/GroundVehiclePhysics.ts` (~400 LOC
  per memo).

**Method:**
1. Implement state: `position`, `velocity`, `angularVelocity`,
   `quaternion`, `engineRPM`, `isGrounded`, `groundHeight`,
   per-wheel sample arrays.
2. Fixed `1 / 60` step via the existing
   `src/utils/FixedStepRunner.ts` (used by `HelicopterPhysics`).
3. Four wheel sample points conformed to `ITerrainRuntime` height +
   normal.
4. Ackermann steering kinematics (`omega_y = v_forward / wheelbase
   * tan(steerAngle)`).
5. Force model: drive (engine torque × gear × wheel radius⁻¹),
   brake (clamped to current velocity), rolling resistance, slope
   gravity component, slope-stall scaling.
6. Explicit Euler integration; exponential damping; ground-
   collision clamp via per-wheel height check.
7. Commit message: `feat(vehicle): hand-rolled GroundVehiclePhysics fixed-step sim (ground-vehicle-physics-core)`.

**Acceptance:**
- `npm run lint`, `npm run test:run`, `npm run build` all green.
- No fence change.
- File LOC ≤ 700 (source-budget cap).

### ground-vehicle-physics-tests (R1)

Author the behavior tests per the memo's test plan.

**Files touched:**
- New: `src/systems/vehicle/GroundVehiclePhysics.test.ts`.

**Method:**
1. Test "applies gravity when airborne with zero throttle."
2. Test "wheels conform to flat ground" (returns expected height).
3. Test "wheels conform to slope" (returns inclined orientation).
4. Test "Ackermann yaw rate scales with steer angle at constant
   forward speed."
5. Test "brake decelerates from cruise to stop."
6. Test "slope-stall: forward force scales down on slopes above
   threshold."
7. Test "bounces on hard landing" (mirrors helicopter test).
8. Commit message: `test(vehicle): GroundVehiclePhysics behavior tests (ground-vehicle-physics-tests)`.

**Acceptance:**
- Tests green.
- Tests are L2 single-system per `docs/TESTING.md`.

### ground-vehicle-player-adapter (R2)

Author `GroundVehiclePlayerAdapter.ts` per the architecture memo.

**Files touched:**
- New: `src/systems/vehicle/GroundVehiclePlayerAdapter.ts`
  (~300 LOC).
- Modified: `src/systems/vehicle/VehicleManager.ts` — register
  the adapter.

**Method:**
1. `PlayerVehicleAdapter` impl mirroring
   `HelicopterPlayerAdapter.ts` shape.
2. Input mapping: W/S throttle, A/D steer, Space brake, F enter/exit.
3. Camera: third-person follow on the jeep.
4. `onEnter` teleports player to driver seat; `onExit` ejects to
   side.
5. Commit message: `feat(vehicle): GroundVehiclePlayerAdapter for M151 (ground-vehicle-player-adapter)`.

**Acceptance:**
- Tests + build green.
- New sibling test for adapter lifecycle (enter, exit, input
  forward).

### m151-jeep-integration (R2)

Wire the M151 stub to `GroundVehiclePhysics` + `GroundVehiclePlayerAdapter`.

**Files touched:**
- `src/systems/vehicle/GroundVehicle.ts` — config block + real
  `update(dt)` loop.
- Possibly `src/config/vehicles/` — M151 config (wheelbase, mass,
  engine torque curve, max steer angle).

**Method:**
1. Config block on `GroundVehicle.ts` per memo: M151 dimensions,
   mass, engine power curve.
2. `update(dt)` delegates to `GroundVehiclePhysics.step()`.
3. Spawn one M151 on Open Frontier (default spawn near US base).
4. Spawn one M151 on A Shau (near valley road).
5. Smoke test in dev preview: enter, drive on flat, drive up slope,
   brake, exit.
6. Commit message: `feat(vehicle): M151 jeep wired end-to-end on Open Frontier + A Shau (m151-jeep-integration)`.

**Acceptance:**
- Tests + build green.
- Jeep visible at spawn on both modes.
- Driveable in dev preview (smoke test screenshots in PR).

### m151-jeep-playtest-evidence (R2, merge gate)

Owner playtest acceptance.

**Files touched:**
- New: `docs/playtests/cycle-vekhikl-1-jeep-drivable.md` with
  owner's recorded notes.

**Method:**
1. Owner drives the jeep on Open Frontier: flat, slope, U-turn,
   slope-stall, brake-stop, enter/exit transitions.
2. Repeat on A Shau valley road.
3. Owner records "playable," "feels right," or "needs work [X]."
4. Commit message: `docs(playtest): VEKHIKL-1 jeep playtest acceptance (m151-jeep-playtest-evidence)`.

**Acceptance:**
- Owner sign-off recorded.
- If "needs work" — orchestrator opens a follow-up cycle and marks
  this cycle CHANGES-REQUESTED → re-dispatches adapter or physics
  task.

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- Any task introduces an external physics library
  (`rapier`, `cannon`, `jolt`, `ammo.js`, `physijs`) → halt. The
  four-trigger gate from `ENGINE_TRAJECTORY_2026-04-23.md` is NOT
  satisfied by one MVP.
- Owner playtest rejects R2 twice → halt.

## Reviewer Policy

- No mandatory `combat-reviewer` (this cycle does not touch
  `src/systems/combat/**`).
- No mandatory `terrain-nav-reviewer` (`ITerrainRuntime` is the
  fenced consumer surface; the cycle reads it only).
- Orchestrator reviews each PR for acceptance + smoke-test
  screenshot.

## Acceptance Criteria (cycle close)

- All R1 + R2 task PRs merged.
- Jeep drivable end-to-end on Open Frontier + A Shau.
- Owner playtest sign-off recorded.
- No external physics library added.
- No fence change.
- No perf regression > 5% p99 on `combat120` (one jeep on the
  ground in a no-combat scene should be sub-0.1 ms).
- `VEKHIKL-1` directive in `docs/DIRECTIVES.md` moves to Closed
  with this cycle's close-commit SHA.

## Out of Scope

- Other ground vehicles (M35, M113, ZIL, etc.) — VEKHIKL-2 +
  follow-on cycles.
- NPC drivers — separate cycle.
- Weapons on the jeep — VEKHIKL-2 stationary weapons + future
  vehicle-mounted weapon cycle.
- Damage states for the jeep — future cycle.
- Multi-passenger seats (driver-only for MVP).
- Touching `src/systems/combat/**`, `src/systems/terrain/**`,
  `src/systems/navigation/**`.
- Fenced-interface touches.

## Carry-over impact

VEKHIKL-1 lives in `docs/DIRECTIVES.md`, not in
`docs/CARRY_OVERS.md` Active table. Closing it doesn't touch the
active count.

Net cycle delta: 0 active-list count; +1 directive closed.
