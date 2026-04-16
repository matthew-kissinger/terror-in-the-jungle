# Task E6: Vehicle physics rebuild — first principles

**Phase:** E (parallel R&D track, design + small prototype)
**Depends on:** Foundation
**Blocks:** Batch F planning
**Playtest required:** no (R&D); full rebuild in Batch F would require playtest
**Estimated risk:** low (design + spike)
**Files touched:** deliverable is a decision memo + optional prototype

## Goal

Propose a first-principles rebuild of vehicle physics (fixed-wing first, helicopter and future ground vehicles second) as ONE coherent system, not four layered ones. Produce a design doc, a prototype of the core simulation loop, and a migration sketch.

## Why this is an E-track task, not a surgical patch

Current evidence the system needs first-principles rework, not another pass:

1. **Four overlapping systems own the flight model.** `FixedWingPhysics` (force-model sim), `FixedWingControlLaw` (intent → command), `FixedWingPlayerAdapter` (input → intent), and `FixedWingConfigs` (per-aircraft tuning). Each written at a different time with a different mental model. Modes like `assisted`, `direct_stick`, `orbit` cross all four without a single source of truth.
2. **Ground/air transition is fragile.** Liftoff gate, ground stabilization, terrain separation, and `weightOnWheels` state transitions are scattered across multiple functions with implicit invariants.
3. **Collision is point-sampled height lookup.** Aircraft position at `(x, z, y)` queries terrain at `(x, z)` for height; no swept collision. A climbing aircraft can fly *through* rising terrain because `velocity.y > 0` is a skip condition in the ground contact check.
4. **Input ergonomics don't match sim behavior.** Arrow-up on the ground produces ~4° pre-rotation pitch, smoothstep-gated on forward speed. Technically "correct," feels unresponsive to a pilot who expects immediate feedback.
5. **Tuning is split between physics constants and control-law gains.** Changing "how responsive does this aircraft feel" requires coordinated edits in two files, often three.
6. **Cross-vehicle state bleed.** `VehicleStateManager` owns lifecycle across helicopter + fixed-wing via per-type adapters. Playtest after 24a94e7 suggested that entering a plane *after* a helicopter session behaves worse than entering a plane fresh — a signal that something (camera angles, input context, residual control state, mouse-lock mode, pointer-lock source) may leak between vehicle types. The adapters were built to decouple this, but the decoupling isn't complete.
7. Latest playtest (2026-04-16) surfaced: helicopter flies fine; fixed-wing arrow keys appear unresponsive; aircraft passes through rising terrain on climb-out. These are symptoms of the above, not independent bugs.

Surgical patches will keep producing whack-a-mole. The right move is a deliberate rebuild.

## Included investigation: arrow-key input flow + helicopter→plane transition

Before committing to the rebuild, the audit step (Step 1 below) must verify two specific claims and fold findings into the design doc:

- **Claim A:** arrow keys do reach `FixedWingPlayerAdapter.updateFixedWingControls` in the production build. Trace: key event → `input.isKeyPressed('arrowup')` at `FixedWingPlayerAdapter.ts:293-297` → `pitchIntent` → `buildFixedWingPilotCommand` → `phys.setCommand` → `stepGrounded` elevator lerp → visible pitch. If any step drops the signal, flag it. Distinguish "signal reached physics but pre-rotation cap makes it invisible" (perception / design problem) from "signal didn't reach physics" (real wiring bug).
- **Claim B:** entering a fixed-wing aircraft after having been in a helicopter produces the same control behavior as entering fresh. If it doesn't, the `VehicleStateManager` adapter handoff is leaking state. Diff the `FixedWingPlayerAdapter.onEnter` path vs `HelicopterPlayerAdapter.onExit` path. Anything either adapter writes to shared state (pointer-lock, camera angle cache, input-context token, HUD vehicle context) must be reset symmetrically.

The audit outcome feeds the design doc section "Current-system audit" directly — don't separate it into a side investigation.

## Vision anchor

Arcade-feel flight that matches player expectations. Aircraft respond immediately to stick input; ground/air transition is crisp; terrain is never passed through. Later: helicopters and ground vehicles built from the same chassis.

## Required reading first

- `docs/REARCHITECTURE.md` — E6 context here, reversibility/cost framework.
- All four current files: `src/systems/vehicle/FixedWingPhysics.ts`, `FixedWingControlLaw.ts`, `FixedWingPlayerAdapter.ts`, `FixedWingConfigs.ts`.
- `src/systems/helicopter/HelicopterPhysics.ts` for comparison and future-shared concerns.
- The arcade-feel commit (`24a94e7`) to understand what the current behavior is after surgical work.

## Steps

1. **Audit the current vehicle physics surface.** List every piece of state, every invariant, every cross-file dependency. Draw it as a diagram. Include Claim A and Claim B from the section above in the audit output.
2. **Propose a unified architecture.** One simulation type (call it `Airframe` or similar), one control-intent type, one collision/contact model. Flow: input → intent → command → sim step → state → visual. Single owner for each stage.
3. **Design swept collision.** Airframes sample terrain along a movement segment (or a thick ray), not just at endpoint. Climbing aircraft cannot pass through rising terrain.
4. **Design control-law layers.** Two explicit tiers: **raw** (stick directly drives control surfaces) and **assist** (PD toward target attitude). User toggles between them; no hidden modes.
5. **Design config schema.** Per-aircraft config is a single typed object with clear sections: mass/geometry, aerodynamic coefficients, control authorities, feel parameters. One file per aircraft, not split across physics/control.
6. **Prototype the core.** Build a throwaway `Airframe` class that unifies physics + command layer for one aircraft (pick Skyraider). Run an isolated scenario: spawn at altitude, apply stick, observe. Measure feel subjectively and frame time objectively.
7. **Migration sketch.** Document how to land the rebuild without breaking the game during migration: feature flag, shadow-run old vs new, playtest both, flip when ready.
8. **Decision memo.**

## Deliverable: decision memo + design doc

Files:

- `docs/rearch/E6-vehicle-physics-design.md` — the architecture proposal, as full as the prototype supports.
- `docs/rearch/E6-vehicle-physics-evaluation.md` — the decision memo (Question / Cost / Value / Reversibility / Recommendation per `docs/REARCHITECTURE.md`).

Design-doc sections:

1. Current-system audit (with diagram).
2. Proposed unified architecture (with diagram).
3. Swept collision design.
4. Control-law tiers (raw vs assist, no hidden modes).
5. Per-aircraft config schema (example: Skyraider in proposed form).
6. Prototype measurements (throughput, feel notes from throwaway scenario).
7. Migration path to production.
8. Impact on helicopters and future ground vehicles.

## Verification

- Both files exist.
- Prototype runs in isolation (not merged).
- Memo is decisive enough for human to pick go/no-go for Batch F implementation.

## Non-goals

- Do not land the rebuild. That's Batch F.
- Do not touch helicopters in the prototype. Scope to fixed-wing first.
- Do not change fenced interfaces in the spike. If the proposed architecture requires fence changes, flag them in the memo for deliberate handling in Batch F.
- Do not revert the current arcade control law. This is a rebuild proposal, not a rollback.

## Exit criteria

- Design doc + decision memo delivered.
- Prototype validates the core loop on one aircraft.
- Orchestrator flags delivered, moves on. Implementation comes later.
