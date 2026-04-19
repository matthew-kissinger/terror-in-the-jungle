# b1-flight-cutover: delete the FixedWingPhysics shim

**Slug:** `b1-flight-cutover`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Depends on:** nothing in this cycle (B1 airframe already on master since `3268908`)
**Blocks (in this cycle):** `npc-fixed-wing-pilot-ai` (consumes the direct Airframe API)
**Playtest required:** yes (player flight feel is the observable)
**Estimated risk:** medium — touches FixedWingModel + air-support + integration tests; caller cascade is small but structural
**Files touched:**

Delete: `src/systems/vehicle/FixedWingPhysics.ts`, `src/systems/vehicle/FixedWingPhysics.test.ts`

Rewrite: `src/systems/vehicle/FixedWingModel.ts`, `src/systems/airsupport/NPCFlightController.ts`, `src/dev/flightTestScene.ts`, `src/systems/vehicle/__tests__/fixedWing.integration.test.ts`

Do NOT touch: `src/systems/vehicle/FixedWingControlLaw.ts` (live control-law, not a shim), `src/systems/vehicle/FixedWingConfigs.ts` (live config registry, not a shim). Both stay.

## Why this task exists

The 2026-04-18 B1 cycle shipped the unified `Airframe` primitive at `src/systems/vehicle/airframe/Airframe.ts` but kept `FixedWingPhysics.ts` as a 422-LOC compat shim that wraps the new sim in the legacy API surface. The shim was intentional scope-control: the B1 executor flagged an 18+ caller cascade and opted not to fan it out in one cycle. That's been open as a follow-up since.

Research during cycle setup showed the "18+ callers" number was an overcount — it conflated callers of `FixedWingPhysics` (which is the shim) with callers of `FixedWingControlLaw` and `FIXED_WING_CONFIGS` (which are live, not shims, and stay). The actual direct `FixedWingPhysics` caller set is:

- `src/systems/vehicle/FixedWingModel.ts`
- `src/systems/airsupport/NPCFlightController.ts`
- `src/dev/flightTestScene.ts`
- `src/systems/vehicle/FixedWingPhysics.test.ts` (unit tests for the shim)
- `src/systems/vehicle/__tests__/fixedWing.integration.test.ts`

Five files. That's a one-cycle task.

`FixedWingPlayerAdapter.ts` was named as an uncertain target in the original follow-up note. Investigation confirms it does NOT call `FixedWingPhysics` directly — it talks to `FixedWingModel`, which is the correct seam. No adapter rewrite needed.

## Required reading first

- `src/systems/vehicle/airframe/Airframe.ts` — the direct target. Public API: `step(intent, terrainProbe, deltaTime)`, `getState()`, `getPosition()`, `getQuaternion()`, `getVelocity()`, `resetToGround()`, `resetAirborne()`, `setWorldHalfExtent()`, `AIRFRAME_FIXED_STEP` export.
- `src/systems/vehicle/airframe/types.ts` — `AirframeIntent` (pitch/roll/yaw/throttle/brake/tier + optional orbit), `AirframeState` (full telemetry), `AirframeConfig`, `AirframeTerrainProbe`.
- `src/systems/vehicle/FixedWingPhysics.ts` — shim being deleted. Read `buildIntentFromCommand()` (the legacy→new translation) so no telemetry or command semantic is lost.
- `src/systems/vehicle/FixedWingModel.ts` — primary consumer; how it holds a `FixedWingPhysics` instance, calls `setCommand` / `update` / `getFlightSnapshot` / `resetToGround` / `resetAirborne`.
- `src/systems/airsupport/NPCFlightController.ts` — 99 LOC; creates `FixedWingPhysics` per NPC aircraft, steps it alongside `NPCPilotAI`.
- `src/dev/flightTestScene.ts` — dev-mode plane test harness; uses the shim + integration-style scenarios.
- `src/systems/vehicle/__tests__/fixedWing.integration.test.ts` — 5 behavior scenarios that must still pass after cutover.
- `docs/TESTING.md` before modifying tests.
- `docs/INTERFACE_FENCE.md` before touching anything under `src/types/SystemInterfaces.ts`.

## Target state

1. `FixedWingPhysics.ts` and `FixedWingPhysics.test.ts` are deleted.
2. `FixedWingModel.ts` holds an `Airframe` instance directly. It builds `AirframeIntent` from the player's `FixedWingPilotIntent` via `buildFixedWingPilotCommand()` (the command builder, which stays — it lives in the non-shim `FixedWingControlLaw.ts`), then translates that command into `AirframeIntent` and calls `airframe.step(intent, terrain, dt)`. The legacy `FixedWingCommand` type can be retired OR kept internally to `FixedWingModel` — executor's call. If kept, the key is that the shim's `buildIntentFromCommand()` translation logic is inlined into `FixedWingModel`.
3. `FixedWingModel.getFlightSnapshot()` (or equivalent) builds snapshots from `airframe.getState()` directly. No more double-hop through a shim.
4. `NPCFlightController.ts` holds an `Airframe` instance directly; `NPCPilotAI` output (whatever form) gets translated into `AirframeIntent` at that seam.
5. `flightTestScene.ts` imports `Airframe` directly; its test scenarios run against the primitive.
6. The 5-test integration suite imports `Airframe` (not the shim) and passes all scenarios: flat-takeoff, level-cruise, nose-down dive, cliff edge (marginal-airspeed altitude loss < 30m), high-alpha pitch-up no-stall. These were the regression targets B1 shipped against; they must stay green.

## Steps

1. Read all six files listed in "Required reading first" before changing anything. Map each `FixedWingPhysics` method to its `Airframe` equivalent in a scratchpad.
2. Inline `buildIntentFromCommand()` logic into `FixedWingModel` (or a small helper at `src/systems/vehicle/airframe/` if it's reused by `NPCFlightController`). Keep the neutralization of legacy scale factors — the shim does this for a reason; don't lose it.
3. Rewrite `FixedWingModel` to hold `Airframe` directly. Expected diff: large but mechanical — swap `this.physics.update(...)` → `this.airframe.step(...)`, swap `getFlightSnapshot()` to build from `airframe.getState()`. The outward API (`setFixedWingPilotIntent`, `update`, display info) stays identical so `FixedWingPlayerAdapter` and HUD are untouched.
4. Rewrite `NPCFlightController` to hold `Airframe` directly. Same shape: swap the physics reference, translate NPC pilot output → `AirframeIntent`.
5. Rewrite `flightTestScene` to import `Airframe`. Scenario code stays; just the construction site changes.
6. Rewrite `fixedWing.integration.test.ts` to exercise `Airframe` directly. Re-run the 5 tests — all must pass with the same numerical budgets (e.g. cliff test: altitude loss < 30m over 4s at marginal airspeed).
7. Delete `FixedWingPhysics.ts` and `FixedWingPhysics.test.ts`.
8. `npm run lint` and `npm run test:run` green. `npm run build` green.
9. Spot-check `?mode=flight-test` in `npm run dev` — takeoff → climb → cruise → landing still feels right on an A1 Skyraider. This is the playtest gate.

## Exit criteria

- `src/systems/vehicle/FixedWingPhysics.ts` does not exist on the branch.
- Grep for `FixedWingPhysics` in `src/**` returns zero hits (only archive/historical references OK).
- The 5 integration tests pass against `Airframe` direct.
- `?mode=flight-test` scene runs without errors; aircraft takes off, reaches cruise, can be flown back to a landing.
- Player flight in combat120 / openfrontier modes behaves indistinguishably from pre-cutover (no regression in feel, altitude hold, roll authority).
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not rewrite `FixedWingControlLaw.ts` — it's live, not a shim. `buildFixedWingPilotCommand()` and `deriveFixedWingControlPhase()` stay as-is.
- Do not rewrite `FixedWingConfigs.ts` — it's the aircraft registry, live, not a shim.
- Do not rewrite `FixedWingPlayerAdapter.ts` — it doesn't touch `FixedWingPhysics`.
- Do not change HUD / `FixedWingHUD.ts`, weapons, or targeting code. `FixedWingControlPhase` stays.
- Do not fold `Airframe` construction under a new factory or DI container — direct `new Airframe(position, config)` at each call site is fine.
- No new behavior, no perf work, no feel tuning.

## Hard stops

- Any of the 5 integration tests regresses — STOP, investigate before shipping. B1's whole point was these passing; a regression means the cutover dropped a behavior the shim had.
- Fence change to `src/types/SystemInterfaces.ts` — STOP. The cutover rides on existing surfaces.
- Player flight feel noticeably changes (slower climb, sluggish roll, different stall behavior) — STOP. Suggests `buildIntentFromCommand()` logic lost something in the inline.
- Diff exceeds ~600 lines net — STOP and propose tighter brief. This is a mechanical swap, not a refactor.
