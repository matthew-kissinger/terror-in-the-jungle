# Cycle: cycle-2026-05-12-combatant-movement-system-ai-split

Last verified: 2026-05-09

Status: queued (Phase 3 Round 2 of 5; cycle 4 of 9)

Three god-modules in `src/systems/combat/` get split + the first surgical
pass at DEFEKT-3 (cover-search synchronous p99 anchor) lands. **This is
the cycle that creates `CoverQueryService` so Phase F (cycle 8) can replace
the hot path.**

Targets:
- `CombatantMovement.ts` — 1,179 LOC, 158 methods → 4 helpers
- `CombatantSystem.ts` — 665 LOC, 0 direct tests → orchestrator + tests
- `CombatantAI.ts` — 757 LOC → 3 helpers
- `AIStateEngage.ts` — 758 LOC → cover-search extraction

## Skip-confirm: yes

## Concurrency cap: 2 (movement + AI can split in parallel; system rolls last)

## Round schedule

### Round 1 — parallel (concurrency 2)

| Slug | Reviewer | Notes |
|------|----------|-------|
| `combatant-movement-split` | combat-reviewer | Movement → 4 helpers (MovementCore, MovementCollision, MovementClusters, ?) |
| `combatant-ai-split` | combat-reviewer | AI → 3 helpers (AIDecisionLoop, AIPerception, ?) |

### Round 2 — sequential (after R1 closes)

| Slug | Reviewer | Notes |
|------|----------|-------|
| `cover-query-service-extraction` | combat-reviewer | Extract synchronous cover query from `AIStateEngage.initiateSquadSuppression` into `CoverQueryService` (still synchronous; just relocated). Sets up Phase F cutover. |
| `combatant-system-split-and-tests` | combat-reviewer | CombatantSystem → orchestrator (≤300 LOC) + lifecycle helpers + first behavior tests for the orchestrator |
| `aistateengage-orchestrator-trim` | combat-reviewer | After CoverQueryService is in, trim AIStateEngage to ≤500 LOC, remove from grandfather |

## Tasks in this cycle

- [combatant-movement-split](combatant-movement-split.md)
- [combatant-ai-split](combatant-ai-split.md)
- [cover-query-service-extraction](cover-query-service-extraction.md)
- [combatant-system-split-and-tests](combatant-system-split-and-tests.md)
- [aistateengage-orchestrator-trim](aistateengage-orchestrator-trim.md)

## Cycle-level success criteria

1. `CombatantMovement.ts`, `CombatantSystem.ts`, `CombatantAI.ts`, `AIStateEngage.ts` all under 700 LOC, ≤50 methods
2. `src/systems/combat/CoverQueryService.ts` exists; `AIStateEngage.initiateSquadSuppression` calls it instead of inlined cover search
3. CombatantSystem has ≥3 behavior tests (closes the "0 direct tests" gap)
4. All 4 grandfather entries removed from `scripts/lint-source-budget.ts`
5. DEFEKT-3 `Cycles open` count incremented in `docs/CARRY_OVERS.md` (still open — Phase F closes it; this cycle just relocates the hot path)
6. `combat120` p99 within ±2% of pre-cycle baseline (cover-search latency is preserved by the relocation)
7. 10-min AI Sandbox playtest @ 120 NPCs — no feel regression

## End-of-cycle ritual + auto-advance

Auto-advance: yes → [cycle-2026-05-13-player-controller-and-hud-split](cycle-2026-05-13-player-controller-and-hud-split.md).
