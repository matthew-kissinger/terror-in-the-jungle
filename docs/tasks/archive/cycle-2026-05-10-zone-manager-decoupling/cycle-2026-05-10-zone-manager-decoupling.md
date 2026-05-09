# Cycle: cycle-2026-05-10-zone-manager-decoupling

Last verified: 2026-05-09

Status: queued (Phase 2 of the realignment campaign; cycle 2 of 9)

This cycle drops the worst coupling junction in the repo. `ZoneManager` has
fan-in **52** — the highest in [docs/ARCHITECTURE.md](../ARCHITECTURE.md). It
must drop to ≤20 before the Phase 3 god-module splits start, or the splits
re-create the coupling problem in new files.

## Skip-confirm: yes

## Concurrency cap: 5

## Round schedule

### Round 1 — design + fence change

| Slug | Reviewer | Notes |
|------|----------|-------|
| `zone-manager-design-memo` | none | doc-only; lays out 11 caller surfaces, splits into mutation/read/event |
| `izone-query-fence` | terrain-nav-reviewer (touches `src/types/SystemInterfaces.ts`) | **`[interface-change]` PR** — adds read-only `IZoneQuery` interface |

### Round 2 — consumer batches (3 parallel after Round 1 closes)

| Slug | Reviewer | Notes |
|------|----------|-------|
| `zone-decoupling-batch-a-readonly` | none | HUD, Compass, Minimap, FullMap → `IZoneQuery` only |
| `zone-decoupling-batch-b-state-driven` | combat-reviewer | Combat, Tickets, WarSim → events + `IZoneQuery` |
| `zone-decoupling-batch-c-owners` | combat-reviewer | PlayerRespawn + ZoneManager-internal cleanup |

## Tasks in this cycle

- [zone-manager-design-memo](zone-manager-design-memo.md)
- [izone-query-fence](izone-query-fence.md) — fence change PR
- [zone-decoupling-batch-a-readonly](zone-decoupling-batch-a-readonly.md)
- [zone-decoupling-batch-b-state-driven](zone-decoupling-batch-b-state-driven.md)
- [zone-decoupling-batch-c-owners](zone-decoupling-batch-c-owners.md)

## Dependencies

```
zone-manager-design-memo ─→ izone-query-fence ─→ batch-a ─┐
                                              ─→ batch-b ─┼─→ (cycle close)
                                              ─→ batch-c ─┘
```

## Cycle-level success criteria

1. `IZoneQuery` exported from `src/types/SystemInterfaces.ts` (interface-change PR landed)
2. Zone-decoupling parity test green: `src/integration/scenarios/zone-decoupling-parity.test.ts` — identical zone capture timeline + ticket counts + HUD updates pre-vs-post
3. ZoneManager direct imports under `src/` reduced to ≤5 (currently ~11)
4. ZoneManager fan-in updated to ≤20 in `docs/ARCHITECTURE.md`
5. `combat120` p99 within ±2% of pre-cycle baseline
6. `npm run lint:budget` — ZoneManager grandfather entry can be removed

## End-of-cycle ritual

Per `docs/AGENT_ORCHESTRATION.md`. Auto-advance: yes → next cycle is
[cycle-2026-05-11-combatant-renderer-split](cycle-2026-05-11-combatant-renderer-split.md).
