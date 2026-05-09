# Task: cover-query-service-extraction

Last verified: 2026-05-09

Cycle: `cycle-2026-05-12-combatant-movement-system-ai-split` (R2)

## Goal

Extract the synchronous cover-search hot path from
`AIStateEngage.initiateSquadSuppression()` into a new
`src/systems/combat/CoverQueryService.ts`. **Behavior is preserved** — the
service is still synchronous and uses the same algorithm. This relocates
the DEFEKT-3 anchor so Phase F (cycle 8) can replace it with an async
worker + precomputed cover field cleanly.

## Why

DEFEKT-3 has been the open P0 across 5+ cycles
(`docs/CARRY_OVERS.md`). The Phase F fix is too large to land in one PR;
this extraction is the surgical preparation step that makes the Phase F
cutover a 1-file edit.

## Required reading first

- `src/systems/combat/ai/AIStateEngage.ts` — focus on `initiateSquadSuppression`
- `docs/CARRY_OVERS.md` — DEFEKT-3 entry
- `docs/REARCHITECTURE.md` (Phase E memos for cover-search context)
- Any existing cover-related code: `src/systems/combat/ai/AICoverFinding.ts`, `AICoverSystem.ts` if present

## Files touched

### Created

- `src/systems/combat/CoverQueryService.ts` (~150 LOC)
  ```ts
  export interface CoverQueryResult {
    point: THREE.Vector3 | null;
    quality: number;
    sourceCallsite: 'sync-raycast' | 'precomputed' | 'fallback';
  }

  export class CoverQueryService {
    queryCover(
      requester: Combatant,
      threats: ReadonlyArray<Combatant>,
      world: ITerrainRuntime,
    ): CoverQueryResult {
      // Move the existing sync raycast logic from AIStateEngage here.
      // No behavior change.
    }
  }
  ```
- `src/systems/combat/CoverQueryService.test.ts` — 5+ tests:
  - Returns a point when terrain offers cover
  - Returns null when no cover available
  - Quality > 0 when point validates
  - Identical-input determinism (same inputs → same point)
  - Mock terrain integration

### Modified

- `src/systems/combat/ai/AIStateEngage.ts` — `initiateSquadSuppression` now calls `coverQueryService.queryCover(...)` instead of inlined logic
- `scripts/lint-source-budget.ts` — DO NOT remove `AIStateEngage.ts` from GRANDFATHER yet. The next task `aistateengage-orchestrator-trim` does that after the file shrinks below 700 LOC.

## Steps

1. `npm ci --prefer-offline`.
2. Read AIStateEngage.ts. Locate the cover-search code path inside `initiateSquadSuppression`. Note all its inputs (requester combatant, threat list, terrain) and outputs (cover point, quality).
3. Author `CoverQueryService.ts` with the relocated code. **No algorithmic changes.** Keep the same raycast count, same scoring, same caching behavior (if any).
4. Wire AIStateEngage to call the service. Inject the service through CombatantAI's existing dependency wiring.
5. Write 5+ tests against the service. Use the same mocks as existing AI tests.
6. Run `npm run lint`, `npm run typecheck`, `npm run test:run`.
7. **Run combat120 perf:**
   ```
   npm run perf:capture:combat120
   npm run perf:compare -- --scenario combat120
   ```
   p99 must be within ±2% of pre-extraction baseline. Cover-search latency must be unchanged.
8. Run a 5-min AI Sandbox playtest at 120 NPCs — observe squad suppression behavior. Should look identical.

## Verification

- `wc -l src/systems/combat/CoverQueryService.ts` ≤200
- 5+ tests passing
- combat120 p99 ±2%
- AIStateEngage.ts shrunk by ~200 lines (still grandfathered until orchestrator-trim)
- DEFEKT-3 in `docs/CARRY_OVERS.md` Notes column updated to "Surgical extraction landed; Phase F replaces with async/precomputed"

## Non-goals

- Do NOT change cover-search algorithm. No new caching, no async worker, no precomputed field. Pure relocation.
- Do NOT close DEFEKT-3 — Phase F closes it.
- Do NOT trim AIStateEngage to ≤500 LOC — that's the next task.

## Branch + PR

- Branch: `task/cover-query-service-extraction`
- Commit: `refactor(combat): extract cover query into CoverQueryService (cover-query-service-extraction)`
- PR description: explicitly note "DEFEKT-3 anchor relocated; Phase F (cycle 8) replaces the synchronous query with a precomputed field + worker fallback. p99 unchanged by design."

## Reviewer: combat-reviewer pre-merge — REQUIRED to verify no behavior drift
## Playtest required: yes (5-min)
