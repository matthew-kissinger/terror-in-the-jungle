# Task A3: Test triage — navigation

**Phase:** A (parallel)
**Depends on:** Foundation
**Blocks:** nothing
**Playtest required:** no
**Estimated risk:** low
**Files touched:** `src/systems/navigation/**/*.test.ts`

## Goal

Reduce implementation-mirror tests in `src/systems/navigation/` by 30-50% without losing behavior coverage. Preserve coverage of: pathfinding correctness, crowd management (if present), navmesh queries, movement adapter contract.

## Required reading first

- `docs/TESTING.md`
- `docs/INTERFACE_FENCE.md`

## Scope

All `*.test.ts` files under `src/systems/navigation/`. Glob: `src/systems/navigation/**/*.test.ts`.

## Steps

Standard pruning procedure from `docs/TESTING.md`:

1. Classify each `it()`: behavior / implementation-mirror / redundant / broken.
2. Rewrite or delete as appropriate.
3. Preserve load-bearing behavior tests for:
   - Path from A to B is valid (doesn't cut through obstacles, respects slope limits).
   - Navmesh query returns nearest walkable point for off-mesh input.
   - Movement adapter converts world positions to path steps correctly.
4. Verify: `npm run lint`, `npm run test:run`, `npm run build`.

## Non-goals

- Don't modify navigation implementation files.
- Don't introduce new navmesh strategies or path algorithms.
- Don't touch recast-navigation WASM (that's C2).

## Exit criteria

- Test count in `src/systems/navigation/` dropped by 30-50% (or report if already lean).
- Full suite green.
- PR titled `test: prune navigation test drift (A3)`.
- PR body lists before/after counts.
