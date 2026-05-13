# Cycle: cycle-2026-05-14-fixed-wing-and-airframe-tests

Last verified: 2026-05-09

Status: queued (Phase 3 Round 4 of 5; cycle 6 of 9)

Targets:
- `Airframe.ts` — 948 LOC, **0 tests** (highest-leverage testing work in repo)
- `FixedWingModel.ts` — 957 LOC → 4 helpers
- `HelicopterModel.ts` — 704 LOC → 2 helpers (small split)
- `WorldFeatureSystem.ts` — 802 LOC → 3 helpers

## Skip-confirm: yes

## Concurrency cap: 3 (Airframe-tests is independent of others; FixedWingModel + HelicopterModel separate; WorldFeatureSystem separate)

## Round schedule

### Round 1 — parallel

| Slug | Reviewer | Notes |
|------|----------|-------|
| `airframe-test-coverage` | none | Add ≥10 behavior tests for `Airframe.ts` (physics functions are pure — high-leverage) |
| `fixed-wing-model-split` | none | FixedWingModel → 4 helpers |
| `world-feature-system-split` | terrain-nav-reviewer | WorldFeatureSystem → 3 helpers (touches terrain features) |

### Round 2 — sequential

| Slug | Reviewer | Notes |
|------|----------|-------|
| `helicopter-model-split` | none | HelicopterModel → 2 helpers; preserves 2026-05-08 rotor-axis fix |

## Tasks in this cycle

- [airframe-test-coverage](airframe-test-coverage.md)
- [fixed-wing-model-split](fixed-wing-model-split.md)
- [world-feature-system-split](world-feature-system-split.md)
- [helicopter-model-split](helicopter-model-split.md)

## Cycle-level success criteria

1. `Airframe.ts` has ≥10 behavior tests; covers landing, climb, rotation, ground rolling
2. `FixedWingModel.ts`, `HelicopterModel.ts`, `WorldFeatureSystem.ts` all ≤700 LOC
3. All 4 grandfather entries removed from `scripts/lint-source-budget.ts`
4. `npm run probe:fixed-wing` — all 3 aircraft (A-1, F-4, AC-47) pass takeoff/climb/orbit/handoff/approach
5. `combat120` p99 within ±2%
6. 10-min playtest: helicopter flight + fixed-wing flight + Open Frontier feature placement

## End-of-cycle ritual + auto-advance

Auto-advance: yes → [cycle-2026-05-15-telemetry-warsim-navmesh-split](cycle-2026-05-15-telemetry-warsim-navmesh-split.md).
