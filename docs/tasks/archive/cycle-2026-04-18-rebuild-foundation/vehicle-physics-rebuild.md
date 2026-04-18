# Task B1: Fixed-wing physics rebuild from first principles

**Phase:** B (rebuild)
**Depends on:** A1 (plane test harness — rebuild validates inside it)
**Blocks:** helicopter + ground-vehicle rebuilds downstream
**Playtest required:** yes (flight feel)
**Estimated risk:** medium-high — replaces 4 flight files with 1 coherent airframe
**Files touched:** new `src/systems/vehicle/airframe/` (Airframe sim, intent types, config schema), rewritten `FixedWingPlayerAdapter.ts`, retired `FixedWingPhysics.ts` / `FixedWingControlLaw.ts` / `FixedWingConfigs.ts`, updated callers in `VehicleStateManager`, integration-test scenarios updated to hit the new Airframe.

## Goal

Land the unified fixed-wing flight model designed in the E6 spike memo. One
simulation type, one intent type, one command type, one config schema. Swept
collision, not point-sample. Two explicit control-law tiers (raw / assist), no
hidden modes. Validated inside the A1 harness.

## Why an implementation task, not another spike

The E6 R&D spike already produced `docs/rearch/E6-vehicle-physics-design.md` and
`docs/rearch/E6-vehicle-physics-evaluation.md` on branch `spike/E6-vehicle-physics-rebuild`.
The audit, unified architecture, swept-collision design, control-law tiers, and
migration path are all written. This task executes that plan.

## Required reading first

- `docs/AGENT_ORCHESTRATION.md` — Current cycle section (how this slots in).
- `docs/tasks/A1-plane-test-mode.md` — the harness that validates this work.
- **On branch `origin/spike/E6-vehicle-physics-rebuild`:**
  - `docs/rearch/E6-vehicle-physics-design.md` — the architecture proposal.
  - `docs/rearch/E6-vehicle-physics-evaluation.md` — the decision memo.
  - Any prototype code under `src/systems/vehicle/` that the spike landed — lift
    what's usable, rebuild what isn't.
- `docs/INTERFACE_FENCE.md` — if the rebuild requires changing
  `IPlayerController` or related fenced interfaces, stop and surface to the
  orchestrator before pushing.
- Current files you are replacing: `src/systems/vehicle/FixedWingPhysics.ts`,
  `FixedWingControlLaw.ts`, `FixedWingPlayerAdapter.ts`, `FixedWingConfigs.ts`.

## Steps

1. **Fetch the E6 spike branch.** `git fetch origin spike/E6-vehicle-physics-rebuild`.
   Read the design memo in full before editing.
2. **Scaffold `src/systems/vehicle/airframe/`.** One Airframe class,
   one IntentCommand type, one Config type per aircraft. Keep the
   module boundary narrow — one public `step(dt, intent)` method, one
   `getState()` accessor.
3. **Port Skyraider first.** Use the spike's config schema. Verify the A1
   integration tests (Tests 1–5) reach the new Airframe and produce the
   expected behavior. Tests 1 and 5 are the ones that were failing — after
   this task, they should PASS.
4. **Port F-4 and AC-47.** Same config schema, per-aircraft tuning.
5. **Wire `VehicleStateManager` to the new Airframe.** The four-file flight
   stack is retired; the adapter becomes a thin shim between input and the
   Airframe.
6. **Swept collision.** Sample terrain along the movement segment, not at
   endpoint. Climbing aircraft must not pass through rising terrain.
7. **Remove hidden modes.** The config exposes `controlLaw: 'raw' | 'assist'`.
   No string-matched `'orbit'` / `'direct_stick'` branches inside the sim.
8. **Delete the retired files.** Do not leave them as dead code.
9. **Run A1 integration tests.** All 5 scenarios must PASS on the new Airframe.
10. **Capture a perf delta.** `openfrontier:short` is the relevant scenario
    (fixed-wing live there). Flag any p99 regression > 5%.

## Exit criteria

- A1 integration tests: 5/5 PASS.
- `?mode=flight-test` scene flies the rebuilt Skyraider; debug overlay shows
  sane airspeed / pitch / roll values.
- `FixedWingPhysics.ts`, `FixedWingControlLaw.ts`, `FixedWingConfigs.ts` deleted.
- `FixedWingPlayerAdapter.ts` replaced or reduced to a thin input shim.
- `npm run lint`, `npm run test:run`, `npm run build` all green.
- Perf capture attached to PR. No p99 regression > 5% on `openfrontier:short`.
- Human playtest run from `docs/PLAYTEST_CHECKLIST.md` (flight feel section)
  documented in PR description.

## Non-goals

- No helicopter rebuild in this task — follow-up cycle. Helicopters keep their
  current physics untouched.
- No ground-vehicle driving runtime — follow-up cycle.
- No NPC pilot integration — Phase 2.

## Hard stops (escalate to orchestrator)

- Fence change required: stop and surface.
- A1 harness isn't merged yet: B1 can't validate without it. Report blocked.
- Diff exceeds ~800 lines net (excluding deletions): scope is wrong.
