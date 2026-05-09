# Task: aistateengage-orchestrator-trim

Last verified: 2026-05-09

Cycle: `cycle-2026-05-12-combatant-movement-system-ai-split` (R2)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

After CoverQueryService is extracted, `AIStateEngage.ts` is ~200 LOC lighter
but probably still over 700 LOC. This task trims it to the orchestrator
shape (state-machine method + transition logic) at ≤500 LOC, and removes
the grandfather entry.

## Required reading

- `_split-template.md`
- `src/systems/combat/ai/AIStateEngage.ts` (post-CoverQueryService state)

## Files touched

- Modified: `src/systems/combat/ai/AIStateEngage.ts` — trim to ≤500 LOC
- Modified: `scripts/lint-source-budget.ts` — remove `AIStateEngage.ts` from GRANDFATHER
- Possibly: `src/systems/combat/ai/AIStateEngageScoring.ts` (new) — if engage scoring logic is fat enough to warrant its own file

## Steps

1. `npm ci --prefer-offline`.
2. Inspect AIStateEngage.ts. Identify any code that's not state-machine entry/transition/exit. Common candidates:
   - Engage-target scoring → `AIStateEngageScoring.ts`
   - Suppression-cone math helpers → utility module
3. Move what doesn't belong. Keep the state-machine itself in AIStateEngage.
4. Verify ≤500 LOC.
5. Remove from grandfather list.
6. Run lint, typecheck, test:run, combat120 perf compare, 10-min playtest.

## Verification

- `wc -l src/systems/combat/ai/AIStateEngage.ts` ≤500
- `grep "AIStateEngage" scripts/lint-source-budget.ts` returns 0
- combat120 p99 ±2%
- Playtest signoff

## Non-goals

- Do NOT change engage behavior. Pure refactor.
- Do NOT touch CoverQueryService.

## Reviewer: combat-reviewer pre-merge
## Playtest required: yes

## Branch + PR

- Branch: `task/aistateengage-orchestrator-trim`
- Commit: `refactor(combat): trim AIStateEngage to state-machine orchestrator (aistateengage-orchestrator-trim)`
