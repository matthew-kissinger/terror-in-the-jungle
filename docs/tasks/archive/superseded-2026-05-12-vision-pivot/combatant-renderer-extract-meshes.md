# Task: combatant-renderer-extract-meshes

Last verified: 2026-05-09

Cycle: `cycle-2026-05-11-combatant-renderer-split` (Phase 3 R1, step 3/5)

Follow [docs/tasks/_split-template.md](_split-template.md). This brief lists only specifics.

## Goal

Extract close-model mesh creation + GLB pool wiring from `CombatantRenderer.ts` into `src/systems/combat/combatant/MeshFactory.ts` (≤500 LOC).

## Required reading

- [docs/tasks/_split-template.md](_split-template.md)
- `src/systems/combat/CombatantRenderer.ts` — methods like `create*Mesh*`, `acquirePoolMesh*`, `releaseMesh*`, close-model state
- `src/utils/ObjectPoolManager.ts`

## Files touched

- New: `src/systems/combat/combatant/MeshFactory.ts` (≤500 LOC)
- New: `src/systems/combat/combatant/MeshFactory.test.ts` — at least 3 behavior tests:
  - mesh acquired from pool when within close-model distance
  - mesh returned to pool when outside distance band
  - faction-keyed mesh selection
- Modified: `src/systems/combat/CombatantRenderer.ts` — mesh code moved, orchestrator delegates

## Verification

Per template + specifics. Pool residency unchanged (verify via `__engine.systemManager.combatantSystem.getCloseModelPoolStats()` if available).

## Non-goals

- Don't change pool sizes or eviction policy.
- Don't touch the GLB loader logic — only the wiring/lifecycle.

## Branch + PR

- Branch: `task/combatant-renderer-extract-meshes`
- Commit: `refactor(combat): extract CombatantRenderer mesh wiring into MeshFactory (combatant-renderer-extract-meshes)`

## Reviewer: combat-reviewer pre-merge
## Playtest required: yes
