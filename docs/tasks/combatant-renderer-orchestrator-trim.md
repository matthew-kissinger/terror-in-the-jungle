# Task: combatant-renderer-orchestrator-trim

Last verified: 2026-05-09

Cycle: `cycle-2026-05-11-combatant-renderer-split` (Phase 3 R1, step 5/5)

Follow [docs/tasks/_split-template.md](_split-template.md). This brief lists only specifics.

## Goal

Final cleanup pass after the four extractions: trim `CombatantRenderer.ts` to ≤300 LOC, delete dead code left behind by the moves, remove from grandfather list.

## Required reading

- [docs/tasks/_split-template.md](_split-template.md)
- `src/systems/combat/CombatantRenderer.ts` (post-step-4 state)
- `src/systems/combat/combatant/{AnimationManager,ShaderUniformBus,MeshFactory,DeathFXController}.ts`

## Files touched

- Modified: `src/systems/combat/CombatantRenderer.ts` — trim to ≤300 LOC orchestrator; delete unused private fields, dead branches, no-longer-needed imports
- Modified: `scripts/lint-source-budget.ts` — remove `'src/systems/combat/CombatantRenderer.ts'` from `GRANDFATHER` map

## Steps

1. `npm ci --prefer-offline`.
2. Read CombatantRenderer.ts. List anything not strictly orchestrator-shaped (per-frame entry, helper composition, public API). Anything else is dead.
3. Delete dead code. Run typecheck after each meaningful chunk.
4. Verify orchestrator ≤300 LOC and ≤50 methods (it should be far under both).
5. Remove the entry from `scripts/lint-source-budget.ts`.
6. Run `npm run lint:budget` — `CombatantRenderer.ts` should NOT appear in warnings or failures.
7. Run combat120 perf compare — within ±2%.
8. Run 10-min AI Sandbox playtest @ 120 NPCs.

## Verification

- `wc -l src/systems/combat/CombatantRenderer.ts` ≤300
- `grep -c "^\s*\(public\|private\|protected\|async\|static\|readonly\|override\|get\|set\)" src/systems/combat/CombatantRenderer.ts` ≤50 (rough method count)
- `grep "CombatantRenderer.ts" scripts/lint-source-budget.ts` returns 0
- Cycle-level success criteria from `cycle-2026-05-11-combatant-renderer-split.md` all green
- 10-min playtest signoff

## Non-goals

- Don't add new functionality to the orchestrator.
- Don't rewrite the helpers — they're done.
- Don't grandfather any new file.

## Branch + PR

- Branch: `task/combatant-renderer-orchestrator-trim`
- Commit: `refactor(combat): trim CombatantRenderer orchestrator to ≤300 LOC, drop grandfather entry (combatant-renderer-orchestrator-trim)`

## Reviewer: combat-reviewer pre-merge
## Playtest required: yes
