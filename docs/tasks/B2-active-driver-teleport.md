# Task B2: Active driver teleport/pathing fix

**Phase:** B (parallel)
**Depends on:** Foundation
**Blocks:** nothing
**Playtest required:** no (this is perf harness, not gameplay)
**Estimated risk:** low
**Files touched:** `scripts/perf-active-driver.js`, possibly `scripts/perf-capture.ts`

## Problem

The perf capture "active driver" (the automated player simulator that walks/sprints/fires during perf captures) teleports around and bounces back and forth rather than following coherent paths. Logs show rapid `driver=sprint` / `driver=retreat` / `driver=hold` / `driver=advance` switches. This degrades perf capture fidelity and may cause perf regressions that look real but are artifacts of the driver bouncing.

## Goal

Active driver produces coherent movement during perf captures — sustained direction holds, reasonable pacing between state changes, no warp-teleport behavior. Perf numbers become more repeatable.

## Required reading first

- `scripts/perf-active-driver.js` — current driver implementation.
- `scripts/perf-capture.ts` — how driver is instantiated, what inputs it sends.
- Any perf artifact log showing the symptom (`artifacts/perf/*/sample-log.txt` or similar).

## Suggested investigation

1. Read the driver code and identify the state transition logic. Is there a missing minimum-dwell timer in each state?
2. Is the target position being reset every tick (causing thrash)?
3. Is the "look-ahead" logic correctly consuming pathfinding output?
4. Is there a bug where the driver reads stale player position after game state transitions (e.g. respawn)?

## Proposed fix shape

- Add minimum state dwell time (e.g. don't switch state more often than once per 500 ms).
- Cache the current movement target and only re-plan when reached or explicitly invalidated.
- Add a simple "don't reverse direction within N frames of the last reversal" heuristic.
- Log driver state transitions explicitly so future debugging is easier.

Do not fundamentally redesign the driver. This is a state-machine stability fix, not a rewrite.

## Verification

- Run `npm run perf:capture:combat120`. Observe driver log — state transitions should be <= ~2 per second on average, not rapid-fire.
- Run `npm run perf:capture:openfrontier:short`. Same.
- Perf numbers should become more repeatable across runs (report mean and stddev of avg frame time across 3 runs).

## Non-goals

- Do not change what the driver does (sprint/advance/retreat/hold stay as behaviors).
- Do not add new driver behaviors.
- Do not touch Playwright harness internals.

## Exit criteria

- Driver produces coherent movement across a full perf capture.
- State transitions bounded.
- PR titled `fix(perf-harness): stabilize active driver state transitions (B2)`.
- PR body includes before/after state-transition rate from a combat120 capture.
