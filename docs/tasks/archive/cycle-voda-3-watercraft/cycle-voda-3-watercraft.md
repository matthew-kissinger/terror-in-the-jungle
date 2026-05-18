# Cycle: VODA-3 Watercraft (Sampan + PBR)

Last verified: 2026-05-16

## Status

Queued at position #10 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
Closes `VODA-3`. **Blocked on cycle #7 (VODA-2) and cycle #4
(VEKHIKL-1)** — needs the buoyancy contract + the
seat/PlayerVehicleAdapter pattern.

## Skip-confirm: no

Owner playtest required.

## Concurrency cap: 4

R1 ships watercraft physics + buoyancy integration; R2 ships
sampan + PBR + playtest.

## Objective

Ship two watercraft — the Sampan (light Vietnamese river boat) and
the PBR (Patrol Boat River, US riverine craft) — both drivable and
mountable. Both float on the buoyancy contract from VODA-2 and
mount via the seat/adapter surface from VEKHIKL-1.

Plus: river crossings, bridge interactions, and beach/bank
docking work.

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. [docs/DIRECTIVES.md](../DIRECTIVES.md) VODA-3 row.
2. `src/systems/vehicle/IVehicle.ts` — `VehicleCategory` includes
   `'watercraft'` already; no fence change.
3. `src/systems/vehicle/GroundVehiclePhysics.ts` — generalize the
   chassis-conform pattern to water-plane-conform.
4. `src/systems/environment/water/BuoyancyForce.ts` — written in
   cycle #7; this cycle's hull integrates with it.
5. `src/systems/environment/WaterSystem.ts:350`
   `sampleWaterInteraction` — used per hull sample point.
6. `src/systems/vehicle/GroundVehiclePlayerAdapter.ts` — adapter
   pattern.
7. Sampan GLB: `public/models/vehicles/water/sampan.glb` (verify).
8. PBR GLB: `public/models/vehicles/water/pbr.glb` (verify).

## Critical Process Notes

1. **Block on cycles #4 and #7.** Orchestrator verifies both are
   `done` before dispatching this cycle.
2. **No external physics library.** Hand-rolled buoyancy from
   VODA-2 carries to watercraft.
3. **Owner playtest required.** Boat feel, river-current
   interaction, docking transitions.
4. **`combat-reviewer` is pre-merge gate** for the PBR (PBR has
   M2HB twin mounts — those reuse the cycle #6 emplacement
   pattern).

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `watercraft-physics-core`, `watercraft-physics-tests` | 2 | Hull physics + tests. |
| 2 | `sampan-integration`, `pbr-integration`, `voda-3-playtest-evidence` | 3 | Per-craft integration + playtest. PBR mounts M2HB twin per cycle #6 surface. |

## Task Scope

### watercraft-physics-core (R1)

Author `WatercraftPhysics.ts`. Generalizes `GroundVehiclePhysics`
chassis-conform with water-surface conform via the buoyancy contract.

**Files touched:**
- New: `src/systems/vehicle/WatercraftPhysics.ts` (~450 LOC).

**Method:**
1. State: `position`, `velocity`, `angularVelocity`, `quaternion`,
   `enginePower`, hull-sample-points array.
2. Per-hull-sample buoyancy via
   `BuoyancyForce.applyAtPoint(samplePoint, hullDisplacement, dt)`.
3. Throttle drives forward force; rudder drives yaw.
4. Drag = quadratic in velocity (water is much denser than air).
5. River current force (from VODA-2 flow contract) added to
   horizontal velocity.
6. Wave heave + pitch from per-hull-sample y-variance (visible
   "rocking" feel).
7. Beach/bank docking: when hull bottom touches terrain
   (`ITerrainRuntime.getHeightAt`), transition to grounded state
   that allows player exit to the bank.
8. Commit message: `feat(vehicle): WatercraftPhysics hand-rolled hull (watercraft-physics-core)`.

**Acceptance:**
- Tests + build green.
- File LOC ≤ 700.
- No fence change.

### watercraft-physics-tests (R1)

**Files touched:**
- New: `src/systems/vehicle/WatercraftPhysics.test.ts`.

**Method:**
1. Test "neutral buoyancy floats at expected waterline."
2. Test "throttle drives forward motion."
3. Test "rudder yaws hull."
4. Test "river current adds drift to stationary hull."
5. Test "beach contact transitions to grounded state."
6. Test "bridge clearance: hull rejects path under low bridge."
7. Test "wave heave produces vertical oscillation."
8. Commit message: `test(vehicle): WatercraftPhysics behavior tests (watercraft-physics-tests)`.

**Acceptance:**
- Tests green.

### sampan-integration (R2)

Wire the Sampan (light unarmed Vietnamese river boat).

**Files touched:**
- New: `src/systems/vehicle/Sampan.ts` (~250 LOC).
- New: `src/systems/vehicle/WatercraftPlayerAdapter.ts` (~250 LOC).
- `src/systems/vehicle/VehicleManager.ts` — register.

**Method:**
1. Sampan stats: ~6 m length, ~2 m beam, low engine power, single
   seat.
2. `WatercraftPlayerAdapter`: W/S throttle, A/D rudder, F enter/exit.
3. Camera: third-person follow.
4. Spawn one Sampan on A Shau riverbank (poled out by NPC at
   game-start; player can commandeer).
5. Commit message: `feat(vehicle): Sampan watercraft (sampan-integration)`.

**Acceptance:**
- Tests + build green.
- Sampan visible at spawn; driveable in dev preview.

### pbr-integration (R2)

Wire the PBR (Patrol Boat River, US riverine craft, twin M2HB).

**Files touched:**
- New: `src/systems/vehicle/PBR.ts` (~300 LOC).
- `src/systems/vehicle/VehicleManager.ts` — register.

**Method:**
1. PBR stats: ~9.4 m, twin water-jet drive, two M2HB twin mounts
   (forward + aft), driver + two gunners + room for one passenger.
2. Reuse `WatercraftPlayerAdapter` for the driver seat.
3. Mount M2HB twin via cycle #6 emplacement pattern (gunner seats
   = emplacement seats parented to the PBR hull transform).
4. Spawn one PBR at the US river outpost on A Shau (or near a
   spawn pad).
5. Commit message: `feat(vehicle): PBR watercraft with M2HB twin mounts (pbr-integration)`.

**Acceptance:**
- Tests + build green.
- `combat-reviewer` APPROVE (PBR has M2HB twin mounts wired through
  combat-system path).
- PBR visible at spawn; driveable + gunnable in dev preview.

**Reviewer gate: `combat-reviewer` required pre-merge (M2HB
integration).**

### voda-3-playtest-evidence (R2, merge gate)

Owner playtest.

**Files touched:**
- New: `docs/playtests/cycle-voda-3-watercraft.md`.

**Method:**
1. Owner mounts Sampan, navigates A Shau river up + down, exits
   at a bank.
2. Owner mounts PBR, drives upstream against current, fires M2HB
   at riverbank target, swaps seats.
3. Owner attempts to pass under a bridge (if A Shau has one in
   range — else flag for later test).
4. Owner observes wave heave + rocking at idle.
5. Owner records feel: throttle response, rudder authority,
   current resistance, wave behavior.

**Acceptance:**
- Owner sign-off recorded.

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- Cycles #4 OR #7 not closed → halt at dispatch.
- Any new external physics library → halt.
- Owner playtest rejects twice → halt.

## Reviewer Policy

- `combat-reviewer` pre-merge gate for `pbr-integration` (M2HB
  wiring).
- Orchestrator reviews other PRs.

## Acceptance Criteria (cycle close)

- All R1 + R2 task PRs merged.
- Sampan + PBR drivable on A Shau river.
- M2HB twin on PBR firable + gunnable from passenger seat.
- Owner playtest sign-off.
- No fence change.
- No external physics library.
- No perf regression > 5% p99 on `combat120`.
- `VODA-3` directive in `docs/DIRECTIVES.md` moves to Closed.

## Out of Scope

- Other watercraft (Junk Force boats, etc.) — future cycles.
- Watercraft damage states beyond destroyed/intact — future.
- Submerged operation / submarines — far future.
- Multiplayer boat sharing — out of scope across campaign.
- Touching `src/systems/terrain/**`, `src/systems/navigation/**`.

## Carry-over impact

VODA-3 lives in `docs/DIRECTIVES.md`.

Net cycle delta: 0 active-list; +1 directive closed.
