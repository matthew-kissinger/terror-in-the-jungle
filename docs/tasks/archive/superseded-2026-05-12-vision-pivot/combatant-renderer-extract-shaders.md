# Task: combatant-renderer-extract-shaders

Last verified: 2026-05-09

Cycle: `cycle-2026-05-11-combatant-renderer-split` (Phase 3 R1, step 2/5)

Follow [docs/tasks/_split-template.md](_split-template.md). This brief lists only specifics.

## Goal

Extract shader uniform updates + distance-band logic from `CombatantRenderer.ts` into `src/systems/combat/combatant/ShaderUniformBus.ts` (≤500 LOC).

## Required reading

- [docs/tasks/_split-template.md](_split-template.md)
- `src/systems/combat/CombatantRenderer.ts` — methods like `update*Uniforms*`, `applyDistanceBand*`, shader-related fields
- After step 1: `src/systems/combat/combatant/AnimationManager.ts` — make sure your extraction doesn't pull animation state by accident

## Files touched

- New: `src/systems/combat/combatant/ShaderUniformBus.ts` (≤500 LOC)
- New: `src/systems/combat/combatant/ShaderUniformBus.test.ts` — at least 3 behavior tests:
  - distance-band threshold transitions correctly
  - uniform values applied to material
  - per-NPC tint state isolated
- Modified: `src/systems/combat/CombatantRenderer.ts` — shader code moved, orchestrator delegates

## Verification (per template + specifics)

- ShaderUniformBus.ts ≤500 LOC
- 3+ behavior tests pass
- combat120 p99 ±2%
- 5-band screenshot diff <5%
- 10-min playtest signoff

## Non-goals

- Don't touch animation, mesh, or death-FX code (those are other steps).
- Don't change shader source. Pure refactor of how uniforms are pushed.

## Branch + PR

- Branch: `task/combatant-renderer-extract-shaders`
- Commit: `refactor(combat): extract CombatantRenderer shader uniforms into ShaderUniformBus (combatant-renderer-extract-shaders)`

## Reviewer: combat-reviewer pre-merge
## Playtest required: yes
