# Task: phase-f-bitecs-prototype

Last verified: 2026-05-09

Cycle: `cycle-2026-05-16-phase-f-ecs-and-cover-rearch` (F1)

## Goal

Port the hottest combatant hot path to bitECS storage. **Measurement-driven
decision:** if ECS wins by ≥3x at 1,000+ entities AND the port is bounded
(estimable in <2 weeks), adopt. Otherwise the prototype is preserved as a
measured "we tried" and the OOP path is committed permanently.

## Why

Plan reference: `C:/Users/Mattm/.claude/plans/can-we-make-a-lexical-mitten.md`
Phase 4 § F1. Resumes [docs/rearch/E1-ecs-evaluation.md](../rearch/E1-ecs-evaluation.md).

The 3,000-NPC vision sentence cannot be made true without addressing
cache behavior on the combatant hot path. bitECS's struct-of-arrays
component storage is the leading candidate.

## Required reading first

- `docs/rearch/E1-ecs-evaluation.md` (existing memo)
- `docs/REARCHITECTURE.md` E1 section
- `src/systems/combat/CombatantSystem.ts` (post-Phase-3-R2 state)
- `src/systems/combat/combatant/MovementCore.ts` (post-Phase-3-R2 state)
- bitECS docs: https://github.com/NateTheGreatt/bitECS
- After Phase 3 R5 closes: TerrainSystem.ts split; needed for ECS terrain queries

## Files touched

### Created (under feature flag `import.meta.env.VITE_ECS_PROTOTYPE === '1'` or similar)

- `package.json` — add `bitecs` dependency
- `src/systems/combat/ecs/components.ts` — `Position`, `Velocity`, `Health`, `Faction`, `AIState`, `WeaponState`, `LODBand` (≤300 LOC)
- `src/systems/combat/ecs/world.ts` — bitECS world wiring, query helpers (≤200 LOC)
- `src/systems/combat/ecs/MovementSystem.ts` — re-implementation of `MovementCore` as ECS query loops (≤500 LOC)
- `src/systems/combat/ecs/PerceptionSystem.ts` — re-implementation of `AIPerception` (≤500 LOC)
- `src/systems/combat/ecs/EcsCombatantFacade.ts` — adapter exposing the OOP `Combatant` API on top of ECS storage (≤400 LOC)
- Each + `*.test.ts`
- `scripts/perf-capture-ecs-prototype.ts` — captures ECS-vs-OOP perf at 120/500/1000/2000 entities
- `docs/rearch/E1-ecs-evaluation.md` — UPDATE with measurements

### Modified

- `src/systems/combat/CombatantSystem.ts` — feature-flagged switch between OOP and ECS implementations

## Steps

1. `npm ci --prefer-offline`. Add bitecs: `npm install bitecs`.
2. Read the existing E1 memo. Note the prior measurement plan.
3. Author the components + world.
4. Re-implement `MovementCore` and `AIPerception` as ECS systems. Keep behavior identical to the OOP versions.
5. Author `EcsCombatantFacade` so the rest of the codebase doesn't change.
6. Wire the feature flag in `CombatantSystem`.
7. Author `perf-capture-ecs-prototype.ts` — runs 4 captures (120, 500, 1000, 2000 entities) on each implementation.
8. Run the captures. Tabulate results.
9. **Apply the decision rule:**
   - Speedup at 1,000 entities ≥3x AND port bounded → ADOPT. Wire ECS as default in production. Update vision sentence.
   - Speedup <2x OR port unbounded → ABANDON. Keep prototype committed but feature-flag-off-by-default. Update memo: "OOP committed permanently."
   - Speedup 2-3x → ESCALATE to human (this brief alone can't decide).
10. Update `docs/rearch/E1-ecs-evaluation.md` with: measurements, decision, rationale, follow-up tasks (if any).

## Verification

- `npx tsx scripts/perf-capture-ecs-prototype.ts` outputs comparable timings
- Updated E1 memo includes a clear decision
- If ADOPT: combat120 with `VITE_ECS_PROTOTYPE=1` p99 within ±5% of OOP baseline (close enough — a slight regression is acceptable if the headroom at 1,000+ is decisive)
- If ABANDON: feature flag remains; no behavior change for default builds

## Non-goals

- Do NOT migrate projectiles, effects, or vehicles to ECS. Combatants only.
- Do NOT remove the OOP path until the decision is "ADOPT and stable for 2 cycles."
- Do NOT modify fenced interfaces. The facade preserves the public API.

## Branch + PR

- Branch: `task/phase-f-bitecs-prototype`
- Commit: `feat(combat): bitECS prototype for combatant hot path (phase-f-bitecs-prototype)`

## Reviewer: combat-reviewer pre-merge — REQUIRED to validate parity
## Playtest required: no (perf-only; runtime feel evaluated when feature flag flips on)

## Estimated diff size

Large — ~2,500 LOC including the new ECS implementation. Review carefully.
