# Task: command-mode-overlay-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-13-player-controller-and-hud-split` (R2)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/ui/hud/CommandModeOverlay.ts` (823 LOC) into 2 helpers.

## Required reading

- `_split-template.md`
- `src/ui/hud/CommandModeOverlay.ts`

## Files touched

- New: `src/ui/hud/commandMode/CommandRenderer.ts` — overlay rendering, marker drawing (≤400 LOC)
- New: `src/ui/hud/commandMode/CommandInputDispatcher.ts` — keyboard / map-click → squad-order dispatch (≤400 LOC)
- Each + `*.test.ts`
- Modified: `CommandModeOverlay.ts` — orchestrator ≤300 LOC
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template. Squad-order dispatch behavior must be unchanged: Hold, Patrol, Attack Here, Fall Back, Stand Down all still dispatch correctly (verify in 5-min playtest using Z-key overlay).

## Reviewer: none required
## Playtest required: yes (5-min squad-command playtest)

## Branch + PR

- Branch: `task/command-mode-overlay-split`
- Commit: `refactor(ui): split CommandModeOverlay into renderer + dispatcher (command-mode-overlay-split)`
