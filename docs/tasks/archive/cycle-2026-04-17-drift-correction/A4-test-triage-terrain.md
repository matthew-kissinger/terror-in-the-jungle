# Task A4: Test triage — terrain

**Phase:** A (parallel)
**Depends on:** Foundation
**Blocks:** nothing
**Playtest required:** no
**Estimated risk:** medium (terrain is a heavy dependency; don't break it)
**Files touched:** `src/systems/terrain/**/*.test.ts`

## Goal

Reduce implementation-mirror tests in `src/systems/terrain/` by 30-50% without losing behavior coverage. Preserve coverage of: height queries, normal queries, collision registration, CDLOD level selection, world extent queries, playable bounds.

## Required reading first

- `docs/TESTING.md`
- `docs/INTERFACE_FENCE.md` — `ITerrainRuntime` is fenced; don't change it.

## Scope

All `*.test.ts` files under `src/systems/terrain/`. Glob: `src/systems/terrain/**/*.test.ts`.

## Steps

1. Classify each `it()`: behavior / implementation-mirror / redundant / broken.
2. Rewrite impl-mirrors as behavior where meaningful. Delete the rest.
3. Preserve load-bearing behavior tests for:
   - `getHeightAt(x, z)` returns a finite height for points within playable bounds.
   - `getNormalAt` returns a unit vector with positive Y component.
   - `raycastTerrain` finds the ground below a known-high ray origin.
   - Collision object registration/unregistration round-trips.
   - Height-query cache returns the same value on repeated query.
4. Verify: `npm run lint`, `npm run test:run`, `npm run build`.

## Non-goals

- Don't modify `ITerrainRuntime` surface (fenced).
- Don't modify CDLOD internals.
- Don't touch the navmesh prebake.

## Exit criteria

- Test count dropped by 30-50% (or report lean).
- Full suite green.
- PR titled `test: prune terrain test drift (A4)`.
- PR body lists before/after counts and confirms listed behaviors still covered.
