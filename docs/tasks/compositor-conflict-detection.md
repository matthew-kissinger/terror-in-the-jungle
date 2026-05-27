<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# compositor-conflict-detection

R1.2 of `cycle-terrain-compositor`. Ships a standalone spatial-conflict
detector over terrain stamps. Logging-only — no behavior change: the
compositor (R1.1) will consume this in R2.1; this PR only publishes the
detector + its tests. Design memo:
[docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md](../rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).

## Files touched

- `src/systems/terrain/compositor/TerrainStampConflictDetector.ts` (new)
- `src/systems/terrain/compositor/TerrainStampConflictDetector.test.ts` (new)

## Scope

1. Export `detectStampConflicts(stamps: TerrainStampConfig[]): TerrainStampConflict[]`
   that enumerates spatial AABB overlaps. At ~150 stamps per scenario a
   flat O(n²) scan is ~22K compares — ship the flat scan; R-tree is a
   deferred optimization per memo §"Open questions".
2. Helper `stampAABB(stamp)` derives the AABB per stamp kind:
   - `flatten_capsule` → segment AABB inflated by `outerRadius` (matches
     hydrology + route stamps).
   - Planar / disc stamps → bbox from center + radius.
   - Airfield envelope → use `gradeRadius` (outer ramp), not
     `outerRadius` (catches the airfield-padding gap).
3. Conflict struct: `{ stampA: number, stampB: number, kindA: string,
   kindB: string, overlapAABB: AABB2D, severity: 'overlap' | 'inside' }`.
   `inside` when one AABB fully contains the other; `overlap` otherwise.
4. Unit tests (≥5):
   - (a) Two disjoint stamps → zero conflicts.
   - (b) Two overlapping capsules → one conflict, severity `overlap`.
   - (c) Hydrology capsule ∩ airfield rect (synthetic OF case) → one
     conflict with correct `kindA`/`kindB`.
   - (d) Airfield envelope (large) ∩ hydrology capsule (smaller, fully
     inside) → severity `inside`.
   - (e) 50 random non-overlapping stamps → zero conflicts (perf sanity
     + correctness; complete in <50ms).
5. No consumption yet — the compositor wires this in R2.1.

## Non-goals

- Wiring detector into `TerrainCompositor` (R2.1).
- Resolution policy `consult` / `never_above` / `never_below` /
  `override` (R2.1).
- R-tree optimization (deferred per memo).

## Acceptance

- [ ] 5 unit tests pass on the new module.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Round 2 / Dependencies

- Independent of R1.1 and R1.3; can land in any merge order.
- Blocks: R2.1 `compositor-stamp-policy-resolver`.
