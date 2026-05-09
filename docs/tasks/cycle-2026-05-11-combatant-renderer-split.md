# Cycle: cycle-2026-05-11-combatant-renderer-split

Last verified: 2026-05-09

Status: queued (Phase 3 Round 1 of 5; cycle 3 of 9)

Splits `src/systems/combat/CombatantRenderer.ts` (1,825 LOC, 219 methods)
— the worst god-module in the repo — into 5 focused files. All tasks
follow [docs/tasks/_split-template.md](_split-template.md).

## Skip-confirm: yes

## Concurrency cap: 1 (sequential — same file ownership)

The five split tasks all touch CombatantRenderer.ts and the new sibling
directory `src/systems/combat/combatant/`. They cannot run in parallel
without churning each other's diffs. **Run sequentially.**

## Round schedule

### Round 1 — sequential 5-step split

| # | Slug | Reviewer | Notes |
|---|------|----------|-------|
| 1 | `combatant-renderer-extract-animation` | combat-reviewer | Extract impostor clip selection / timing into `combatant/AnimationManager.ts` |
| 2 | `combatant-renderer-extract-shaders` | combat-reviewer | Extract shader uniforms / distance bands into `combatant/ShaderUniformBus.ts` |
| 3 | `combatant-renderer-extract-meshes` | combat-reviewer | Extract close-model mesh creation / pool wiring into `combatant/MeshFactory.ts` |
| 4 | `combatant-renderer-extract-deathfx` | combat-reviewer | Extract death-fall-back animation pipeline into `combatant/DeathFXController.ts` |
| 5 | `combatant-renderer-orchestrator-trim` | combat-reviewer | Trim CombatantRenderer.ts to ≤300 LOC orchestrator; remove from grandfather list |

After step 5, `src/systems/combat/CombatantRenderer.ts` is the orchestrator;
the four helpers live in `src/systems/combat/combatant/`.

## Tasks in this cycle

- [combatant-renderer-extract-animation](combatant-renderer-extract-animation.md)
- [combatant-renderer-extract-shaders](combatant-renderer-extract-shaders.md)
- [combatant-renderer-extract-meshes](combatant-renderer-extract-meshes.md)
- [combatant-renderer-extract-deathfx](combatant-renderer-extract-deathfx.md)
- [combatant-renderer-orchestrator-trim](combatant-renderer-orchestrator-trim.md)

## Cycle-level success criteria

1. `src/systems/combat/CombatantRenderer.ts` ≤300 LOC, ≤50 methods
2. `src/systems/combat/combatant/{AnimationManager,ShaderUniformBus,MeshFactory,DeathFXController}.ts` each ≤500 LOC, each with a `*.test.ts` sibling (behavior tests)
3. `src/systems/combat/CombatantRenderer.ts` removed from `scripts/lint-source-budget.ts` `GRANDFATHER`
4. Combat scenario screenshot diff <5% across 5 distance bands (impostor → close-model transitions)
5. `combat120` p99 within ±2% of pre-split baseline
6. 10-min playtest in AI Sandbox at 120 NPCs — no visible feel regression

## End-of-cycle ritual + auto-advance

Per `docs/AGENT_ORCHESTRATION.md`. Auto-advance: yes →
[cycle-2026-05-12-combatant-movement-system-ai-split](cycle-2026-05-12-combatant-movement-system-ai-split.md).
