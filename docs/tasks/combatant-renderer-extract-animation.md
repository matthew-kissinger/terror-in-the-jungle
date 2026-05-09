# Task: combatant-renderer-extract-animation

Last verified: 2026-05-09

Cycle: `cycle-2026-05-11-combatant-renderer-split` (Phase 3 R1, step 1/5)

## Goal

Extract Pixel Forge impostor clip selection + timing logic from
`CombatantRenderer.ts` (1,825 LOC) into a new
`src/systems/combat/combatant/AnimationManager.ts` (≤500 LOC).

Follow [docs/tasks/_split-template.md](_split-template.md) for shared
process. This brief lists only the specifics.

## Required reading first

- [docs/tasks/_split-template.md](_split-template.md)
- `src/systems/combat/CombatantRenderer.ts` — focus on methods named
  `select*Clip*`, `update*Animation*`, `applyClip*`, `tick*Animation*`
- `docs/COMBAT.md`

## Files touched

### Created

- `src/systems/combat/combatant/AnimationManager.ts` (≤500 LOC)
- `src/systems/combat/combatant/AnimationManager.test.ts` — at least 3 behavior tests:
  - clip selection responds to combat state
  - clip timing advances with delta
  - death clip overrides regular clip selection

### Modified

- `src/systems/combat/CombatantRenderer.ts` — methods related to animation moved out; orchestrator now delegates to `AnimationManager`

## Steps

1. `npm ci --prefer-offline`.
2. Read `_split-template.md` end-to-end.
3. In `CombatantRenderer.ts`, identify all methods + private fields owned by the animation concern. Likely candidates:
   - `selectAnimationClip*`
   - `updateAnimationTime*`
   - `applyClipToInstance*`
   - `getDeathClip*`
   - Pixel Forge atlas index / row / column state
4. Create `AnimationManager.ts` with a class `CombatantAnimationManager`. Move the methods + state into it. Keep the API caller-shaped — orchestrator calls `animationManager.select(combatant, dt)` etc.
5. In `CombatantRenderer.ts`, hold a private `animationManager` and delegate.
6. Write tests for the manager. Mock the minimum surface needed (Pixel Forge atlas dims, current time).
7. Run lint, lint:budget, typecheck, test:run, combat120 perf compare.
8. **Run a screenshot-diff test** at 5 distance bands (close, mid, far, very far, fallback). All bands within 5% pixel diff.

## Verification (per template + specifics)

- `wc -l src/systems/combat/combatant/AnimationManager.ts` ≤500
- 3+ behavior tests pass
- 5-band screenshot diff <5%
- combat120 p99 ±2%
- 10-min playtest signoff

## Non-goals

- Don't move shader / mesh / death-FX code yet — those are steps 2/3/4.
- Don't change behavior. Pure refactor.

## Branch + PR

- Branch: `task/combatant-renderer-extract-animation`
- Commit: `refactor(combat): extract CombatantRenderer animation into AnimationManager (combatant-renderer-extract-animation)`

## Reviewer: combat-reviewer pre-merge
## Playtest required: yes (10-min AI Sandbox @ 120 NPCs)
