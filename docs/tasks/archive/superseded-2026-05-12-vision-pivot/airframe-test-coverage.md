# Task: airframe-test-coverage

Last verified: 2026-05-09

Cycle: `cycle-2026-05-14-fixed-wing-and-airframe-tests` (R1)

## Goal

Add ≥10 behavior tests for `src/systems/vehicle/airframe/Airframe.ts`
(948 LOC, currently **0 tests**). Highest-leverage testing work in the
repo — `Airframe` is the unified fixed-wing simulation, and the
2026-04-22 flight-rebuild cycle made its physics functions
deterministic + pure.

## Why

- AVIATSIYA-2 (AC-47 takeoff bounce) is anchored at `Airframe` ground rolling.
  Phase 4 F5 fixes it; this task creates the test surface that catches
  regressions when F5 lands.
- Phase 5 ground-vehicle work may reuse Airframe-style fixed-step physics.
  Test coverage now buys safety later.

## Required reading

- `src/systems/vehicle/airframe/Airframe.ts` — full file
- `docs/TESTING.md` — behavior tests, not implementation-mirror
- `src/systems/vehicle/FixedWingConfigs.ts` — config shapes the tests can mock against

## Files touched

### Created

- `src/systems/vehicle/airframe/Airframe.test.ts` — ≥10 tests covering:
  1. Initialization with config produces valid initial state
  2. Fixed-step update advances time by configured dt
  3. Pitch input above threshold initiates rotation
  4. Climb angle bounded by config max
  5. Ground rolling: thrust < drag → speed decreases, ≥ → increases
  6. Ground stabilization absorbs terrain-height mismatch on spawn
  7. Swept terrain collision rejects pass-through (climbing-into-terrain test)
  8. Bank angle bounded by config max
  9. Stall: airspeed below config stall threshold → controlled descent
  10. Snapshot surface: getSnapshot() returns immutable state copy

### NOT touched

- `Airframe.ts` itself — test coverage only, no behavior changes

## Steps

1. `npm ci --prefer-offline`.
2. Read Airframe.ts. Identify each public method and its preconditions/postconditions.
3. Write tests one at a time. Each test:
   - Initializes Airframe with a mock config (use FIXED_WING_CONFIGS as reference but mock minimum fields)
   - Mocks the terrain dependency (`ITerrainRuntime`) with a fixed-elevation surface
   - Calls public methods and asserts observable state via getSnapshot()
4. Run `npx vitest run src/systems/vehicle/airframe/` after each test passes.
5. Verify coverage > 0 across all major methods.

## Verification

- `npx vitest run src/systems/vehicle/airframe/Airframe.test.ts` — ≥10 tests passing
- `npm run lint`, `npm run typecheck` — green
- `npm run probe:fixed-wing` — still green (didn't break anything)

## Non-goals

- Do NOT modify `Airframe.ts`.
- Do NOT split `Airframe.ts` (that's not in this cycle scope).
- Do NOT fix AVIATSIYA-2 (AC-47 bounce) — that's Phase 4 F5.

## Branch + PR

- Branch: `task/airframe-test-coverage`
- Commit: `test(vehicle): add behavior tests for Airframe (airframe-test-coverage)`

## Reviewer: none required
## Playtest required: no (coverage-only)
