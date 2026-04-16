# Task A1: Test triage — vehicle

**Phase:** A (parallel)
**Depends on:** Foundation (merged)
**Blocks:** nothing in this run
**Playtest required:** no
**Estimated risk:** low
**Files touched:** `src/systems/vehicle/**/*.test.ts`, `src/test-utils/**` (if needed)

## Goal

Reduce implementation-mirror tests in `src/systems/vehicle/` by 30-50% without losing behavior coverage. Preserve every behavior contract the current tests encode; delete or rewrite every test that only mirrors today's implementation shape.

## Required reading first

- `docs/TESTING.md` — the four-layer contract, behavior vs implementation examples, pruning procedure.
- `docs/INTERFACE_FENCE.md` — do not modify `src/types/SystemInterfaces.ts`.

## Scope

Test files in `src/systems/vehicle/`:
- `FixedWingAnimation.test.ts`
- `FixedWingControlLaw.test.ts`
- `FixedWingInteraction.test.ts`
- `FixedWingModel.test.ts`
- `FixedWingPhysics.test.ts`
- `FixedWingPlayerAdapter.test.ts`
- `FixedWingVehicleAdapter.test.ts`
- `HelicopterPlayerAdapter.test.ts`
- `NPCPilotAI.test.ts`
- `NPCVehicleController.test.ts`
- `VehicleManager.test.ts`
- `VehicleStateManager.test.ts`

## Steps

1. For each test file, classify every `it()` block:
   - **behavior** — assertions about observable outcomes (aircraft lifts off, roll recovers, vehicle enters). Keep.
   - **implementation-mirror** — assertions on phase names, envelope constants, exact command magnitudes, internal state field names. Rewrite as behavior or delete.
   - **redundant** — covered by another test at the same or higher layer. Delete.
   - **broken/skipped** — fix or delete. Don't leave `.skip()` lying around.
2. For each rewrite, preserve the original *intent*. Ask "what bug was this test supposed to catch?" — if the answer is real, express it as a behavior assertion. If the answer is "it was just mirroring implementation," delete.
3. Use shared fixtures from `src/test-utils/` where available. If a needed fixture doesn't exist and would make tests cleaner, add it.
4. After each file: run `npx vitest run <file>` — must be green.
5. After all files: `npm run lint`, `npm run test:run`, `npm run build` all green.

## Verification

- Report the before/after test count per file.
- Confirm the full suite (`npm run test:run`) still passes.
- Confirm `FixedWingPhysics.test.ts` still covers: lifts off at Vr, alpha protection prevents stall, stalls from speed loss, world boundary enforced. These are the load-bearing assertions.
- Confirm `FixedWingControlLaw.test.ts` still covers: orbit hold produces a stable turn, stall forces nose-down.

## Non-goals

- Do not modify any `src/systems/vehicle/*.ts` implementation file. Tests only.
- Do not add new test infrastructure (new test helpers, new vitest config). Use what's there.
- Do not touch `FixedWingPhysics` config tuning values.
- Do not change fenced interfaces.

## Exit criteria

- Test count in `src/systems/vehicle/` dropped by 30-50%.
- All tests pass.
- PR titled `test: prune vehicle test drift (A1)`.
- PR body lists before/after counts and sampling of 3-5 representative prunes/rewrites with brief rationale.
