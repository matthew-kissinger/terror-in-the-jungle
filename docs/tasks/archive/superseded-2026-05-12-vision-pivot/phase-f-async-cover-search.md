# Task: phase-f-async-cover-search

Last verified: 2026-05-09

Cycle: `cycle-2026-05-16-phase-f-ecs-and-cover-rearch` (F2)

## Goal

Replace synchronous `CoverQueryService` (extracted in Phase 3 R2) with a
precomputed cover field per zone + async fallback on a Web Worker. **Closes
DEFEKT-3** (the open P0 across 5+ cycles).

## Why

`AIStateEngage.initiateSquadSuppression` p99 contribution is currently
~12ms — the dominant tail-anchor on combat120. Phase 3 R2 relocated the
hot path into `CoverQueryService` (still synchronous). Now we replace
the implementation with O(1) field lookup + async re-bake when stale.

## Required reading first

- `src/systems/combat/CoverQueryService.ts` (post-Phase-3-R2)
- `src/systems/strategy/MaterializationGate.ts` (post-Phase-3-R5; the cover field bakes alongside materialization)
- `docs/CARRY_OVERS.md` DEFEKT-3 entry
- `docs/REARCHITECTURE.md` cover-search context
- Three.js worker patterns (project already uses Web Workers in `src/workers/`)

## Files touched

### Created

- `src/systems/combat/coverField/CoverFieldBaker.ts` — bakes cover field at terrain-load (≤500 LOC)
  - For each zone (or global grid), precompute cover points + quality scores
  - Stores as flat Float32Array of (x, z, quality) triples
  - Bake runs once at terrain-load (or on-demand if zone changes)
- `src/systems/combat/coverField/CoverFieldQuery.ts` — O(1) lookup against the field (≤200 LOC)
- `src/systems/combat/coverField/CoverFieldWorker.ts` — Web Worker that re-bakes on demand (≤300 LOC)
- `src/systems/combat/coverField/CoverFieldStaleness.ts` — invalidation policy (zone-changed, terrain-changed) (≤200 LOC)
- Each + `*.test.ts`

### Modified

- `src/systems/combat/CoverQueryService.ts` — internals replaced. Public API unchanged. Implementation now: try field lookup first; if field is stale or returns nothing, fall back to old sync raycast (rare); meanwhile dispatch worker re-bake.
- `src/systems/strategy/MaterializationGate.ts` — wire the bake at terrain-load time
- `docs/CARRY_OVERS.md` — move DEFEKT-3 to Closed table

## Steps

1. `npm ci --prefer-offline`.
2. Read CoverQueryService.ts. Note its existing API (must be preserved).
3. Design the cover-field grid: spacing, per-zone vs global, quality metric.
4. Author the baker. Bake completes in <500ms for A Shau (target).
5. Author the field-query — must return in <0.05ms p99 (the perf gain).
6. Author the worker. Worker receives terrain ref + zone bounds, returns Float32Array.
7. Author staleness policy.
8. Wire CoverQueryService internals: field lookup → fallback sync raycast (for stale zones) → schedule worker re-bake.
9. Run combat120 perf compare:
   ```
   npm run perf:capture:combat120
   npm run perf:compare -- --scenario combat120
   ```
   p99 must improve meaningfully. Target: AIStateEngage suppression p99 contribution <2ms (down from ~12ms).
10. Run a 10-min AI Sandbox playtest. Squad suppression behavior should look identical (algorithm changed; outputs should match within tolerance).

## Verification

- combat120 p99 improves by ≥10ms (target — this is the DEFEKT-3 fix)
- AIStateEngage suppression-cone playtest visually identical
- DEFEKT-3 row moved to Closed in `docs/CARRY_OVERS.md`
- New `npm run check:cover-attribution` (or similar) confirms field is the dominant code path

## Non-goals

- Do NOT change cover quality scoring math. Field stores the same scores raycast computed.
- Do NOT remove the sync raycast fallback — staleness can hit edge cases.
- Do NOT block on Phase F1's outcome. This task is independent: it works on OOP combatants AND on ECS combatants.

## Branch + PR

- Branch: `task/phase-f-async-cover-search`
- Commit: `perf(combat): replace sync cover search with precomputed field + worker fallback (phase-f-async-cover-search) — closes DEFEKT-3`

## Reviewer: combat-reviewer pre-merge — REQUIRED
## Playtest required: yes (10-min AI Sandbox)

## Estimated diff size

~1,500 LOC. Carefully reviewed.
