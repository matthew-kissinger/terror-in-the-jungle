# Task: player-input-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-13-player-controller-and-hud-split` (R2)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/player/PlayerInput.ts` (727 LOC) into 2 helpers.

## Required reading

- `_split-template.md`
- `src/systems/player/PlayerInput.ts`
- After R1: `PlayerInputBindings.ts` may already absorb some of PlayerInput's surface — coordinate or hand off

## Files touched

- New: `src/systems/player/input/KeyboardMouseInput.ts` — keyboard, mouse, pointer-lock (≤400 LOC)
- New: `src/systems/player/input/TouchInput.ts` — mobile touch + virtual stick (≤400 LOC)
- Each + `*.test.ts` with ≥3 behavior tests
- Modified: `PlayerInput.ts` — orchestrator ≤300 LOC, dispatches between input modes based on detected device
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template. Mobile-UI gate (`npm run check:mobile-ui`) must pass.

## Branch + PR

- Branch: `task/player-input-split`
- Commit: `refactor(player): split PlayerInput into KeyboardMouse + Touch (player-input-split)`

## Reviewer: none required
## Playtest required: yes (PC + mobile both)
