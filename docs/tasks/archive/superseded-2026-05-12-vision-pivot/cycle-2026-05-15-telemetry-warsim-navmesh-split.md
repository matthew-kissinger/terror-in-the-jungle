# Cycle: cycle-2026-05-15-telemetry-warsim-navmesh-split

Last verified: 2026-05-09

Status: queued (Phase 3 Round 5 of 5; cycle 7 of 9)

Final round of Phase 3 splits. Closes the remaining grandfather entries.

Targets:
- `PerformanceTelemetry.ts` — 995 LOC → 4 helpers
- `WarSimulator.ts` — 788 LOC → 2 helpers
- `NavmeshSystem.ts` — 789 LOC → 3 helpers
- `TerrainSystem.ts` — 753 LOC, 60 methods → 2 helpers
- `TerrainFeatureCompiler.ts` — 728 LOC → 2 helpers
- `TerrainMaterial.ts` — 1039 LOC → 3 helpers
- `AShauValleyConfig.ts` — 763 LOC, 0 tests → split + add tests
- `SystemManager.ts` — 60 methods → factor lifecycle helpers

## Skip-confirm: yes

## Concurrency cap: 4 (each target is in a different system; no cross-file conflicts)

## Round schedule

### Round 1 — parallel (concurrency 4)

| Slug | Reviewer | Notes |
|------|----------|-------|
| `performance-telemetry-split` | none | PerformanceTelemetry → 4 helpers |
| `warsim-split` | combat-reviewer | WarSimulator → 2 helpers |
| `navmesh-system-split` | terrain-nav-reviewer | NavmeshSystem → 3 helpers |
| `terrain-system-split` | terrain-nav-reviewer | TerrainSystem → 2 helpers |

### Round 2 — parallel (concurrency 4)

| Slug | Reviewer | Notes |
|------|----------|-------|
| `terrain-material-split` | terrain-nav-reviewer | TerrainMaterial → 3 helpers |
| `terrain-feature-compiler-split` | terrain-nav-reviewer | TerrainFeatureCompiler → 2 helpers |
| `ashau-valley-config-split-and-tests` | terrain-nav-reviewer | AShauValleyConfig → 2-3 helpers + add tests |
| `system-manager-helpers` | none | SystemManager → factor lifecycle helpers (drop method count from 60) |

## Tasks in this cycle

- [performance-telemetry-split](performance-telemetry-split.md)
- [warsim-split](warsim-split.md)
- [navmesh-system-split](navmesh-system-split.md)
- [terrain-system-split](terrain-system-split.md)
- [terrain-material-split](terrain-material-split.md)
- [terrain-feature-compiler-split](terrain-feature-compiler-split.md)
- [ashau-valley-config-split-and-tests](ashau-valley-config-split-and-tests.md)
- [system-manager-helpers](system-manager-helpers.md)

## Cycle-level success criteria

1. All 8 target god-modules ≤700 LOC, ≤50 methods
2. **Zero entries in `scripts/lint-source-budget.ts` `GRANDFATHER` map** (Phase 3 closes the entire grandfather list)
3. `combat120` p99 within ±2%
4. `npm run perf:terrain-probe:ashau:traverse` passes (terrain streaming unchanged)
5. AShauValleyConfig has ≥3 behavior tests
6. Playtest in A Shau and Open Frontier — no feel regression

## End-of-cycle ritual + auto-advance

Auto-advance: yes → [cycle-2026-05-16-phase-f-ecs-and-cover-rearch](cycle-2026-05-16-phase-f-ecs-and-cover-rearch.md).
