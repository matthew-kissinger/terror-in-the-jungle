# Task: combatant-renderer-extract-deathfx

Last verified: 2026-05-09

Cycle: `cycle-2026-05-11-combatant-renderer-split` (Phase 3 R1, step 4/5)

Follow [docs/tasks/_split-template.md](_split-template.md). This brief lists only specifics.

## Goal

Extract death-fall-back animation pipeline from `CombatantRenderer.ts` into `src/systems/combat/combatant/DeathFXController.ts` (≤500 LOC).

## Required reading

- [docs/tasks/_split-template.md](_split-template.md)
- `src/systems/combat/CombatantRenderer.ts` — methods around `death*`, `playDeathClip*`, fade-out timing, body-pile retention
- After step 1: `src/systems/combat/combatant/AnimationManager.ts` — DeathFX consumes its clip-selection but doesn't duplicate it

## Files touched

- New: `src/systems/combat/combatant/DeathFXController.ts` (≤500 LOC)
- New: `src/systems/combat/combatant/DeathFXController.test.ts` — at least 3 behavior tests:
  - dying NPC selects death_fall_back
  - one-shot atlas clip (no looping)
  - fade-out completes within configured time window
- Modified: `src/systems/combat/CombatantRenderer.ts` — death-FX code moved, orchestrator delegates

## Verification

Per template. Pay particular attention: the 2026-05-08 cycle landed
death-animation policy that explicitly removed the old procedural shrink.
This task must not regress that — verify by visual diff during the 10-min
playtest (NPC kills should drop, not shrink).

## Non-goals

- Don't change death tuning constants.
- Don't extend with new death effects (e.g. ragdoll). Pure refactor.

## Branch + PR

- Branch: `task/combatant-renderer-extract-deathfx`
- Commit: `refactor(combat): extract CombatantRenderer death FX into DeathFXController (combatant-renderer-extract-deathfx)`

## Reviewer: combat-reviewer pre-merge
## Playtest required: yes
