# Task: vekhikl-1-jeep-spike

Last verified: 2026-05-09

Cycle: `cycle-2026-05-17-phase-5-new-normal` (R1)

## Goal

Spike the M151 jeep — minimal driving runtime over terrain. **Spike, not
full integration.** Demonstrates the engine can host ground vehicles;
follow-on cycles do polish + multiple vehicles.

## Why

Plan reference: Phase 5 § ground vehicles unblocked. The jeep GLB has
existed at `public/models/vehicles/ground/m151-jeep.glb` for cycles. Phase
5 ships a minimum viable driving runtime as proof.

## Required reading first

- `src/systems/vehicle/VehicleSessionController.ts` — existing pattern; ground vehicles use this
- `src/systems/vehicle/FixedWingPlayerAdapter.ts` — adapter pattern reference
- `src/systems/vehicle/airframe/Airframe.ts` (post-Phase-3-R4 + post-Phase-4-F5) — fixed-step physics; ground vehicle uses simpler version

## Files touched

### Created (under feature flag `?vehkikl=1` URL gate so it doesn't ship to retail without explicit opt-in)

- `src/systems/vehicle/ground/M151JeepAdapter.ts` — `PlayerVehicleAdapter` impl (≤300 LOC)
- `src/systems/vehicle/ground/JeepPhysics.ts` — minimum driving model (forward/back, turn, terrain following) (≤300 LOC)
- `src/systems/vehicle/ground/JeepPhysics.test.ts` — ≥3 behavior tests
- Modified: `src/systems/vehicle/VehicleManager.ts` — register the jeep adapter behind the flag

## Steps

1. `npm ci --prefer-offline`.
2. Inspect the existing fixed-wing adapter pattern. Mirror the lifecycle.
3. Author JeepPhysics — terrain-following with sample-and-set Y, basic turning, basic acceleration.
4. Author M151JeepAdapter — onEnter (player teleports into seat), onExit (player exits to side), update (forwards input to JeepPhysics), resetControlState.
5. Wire into VehicleManager behind URL flag.
6. Smoke test in dev preview: `?vehkikl=1`, find a jeep on Open Frontier, enter, drive, exit.
7. Tests: 3 behavior tests against JeepPhysics (forward, turn, terrain follow).

## Verification

- `?vehkikl=1` in dev preview surfaces a drivable M151 in Open Frontier
- Tests green
- `npm run lint`, `npm run typecheck` clean
- Per-frame perf: 1 jeep adds <0.1ms to combat120 (one-off measurement; not a baseline)

## Non-goals

- Do NOT add other ground vehicles (M35, M113, etc.) — spike is one vehicle.
- Do NOT polish jeep feel — drift, suspension, etc. — that's a follow-on cycle.
- Do NOT add NPC drivers.
- Do NOT add weapons.

## Branch + PR

- Branch: `task/vekhikl-1-jeep-spike`
- Commit: `feat(vehicle): M151 jeep driving spike behind ?vehkikl=1 flag (vekhikl-1-jeep-spike)`

## Reviewer: none required
## Playtest required: no (spike, not user-facing)
