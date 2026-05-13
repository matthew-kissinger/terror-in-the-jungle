# Task: player-movement-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-13-player-controller-and-hud-split` (R2)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/player/PlayerMovement.ts` (703 LOC) into 2 helpers.

## Required reading

- `_split-template.md`
- `src/systems/player/PlayerMovement.ts`

## Files touched

- New: `src/systems/player/movement/MovementSolver.ts` — terrain collision + slope handling + gravity (≤400 LOC)
- New: `src/systems/player/movement/MovementStamina.ts` — stamina, footstep events, animation sync (≤300 LOC)
- Each + `*.test.ts`
- Modified: `PlayerMovement.ts` — orchestrator ≤300 LOC
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template. **Slope-stuck** behavior is a known issue (DEFEKT-4 in CARRY_OVERS) — this split must not regress it AND ideally the new MovementSolver makes the future fix easier. Verify slope behavior is unchanged in playtest (don't try to fix it here).

## Reviewer: none required
## Playtest required: yes

## Branch + PR

- Branch: `task/player-movement-split`
- Commit: `refactor(player): split PlayerMovement into solver + stamina helpers (player-movement-split)`
