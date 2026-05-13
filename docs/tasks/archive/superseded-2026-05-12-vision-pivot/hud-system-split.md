# Task: hud-system-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-13-player-controller-and-hud-split` (R1)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/ui/hud/HUDSystem.ts` (740 LOC, fan-in 34, 79 methods) into 4 helpers.

## Required reading

- `_split-template.md`
- `src/ui/hud/HUDSystem.ts`
- `src/types/SystemInterfaces.ts` — `IHUDSystem` is fenced; do NOT change it
- After Phase 2: HUDSystem now consumes `IZoneQuery` instead of ZoneManager

## Files touched

- New: `src/ui/hud/HUDStateRouter.ts` — event subscription + diff detection (≤300 LOC)
- New: `src/ui/hud/HUDInputBindings.ts` — keyboard/touch handlers (≤300 LOC)
- New: `src/ui/hud/HUDModeAdapter.ts` — per-game-mode lifecycle (≤300 LOC)
- New: `src/ui/hud/HUDLayoutManager.ts` — layout + screen-bin assignments (≤300 LOC)
- Each + `*.test.ts` with ≥3 behavior tests
- Modified: `HUDSystem.ts` — orchestrator ≤300 LOC, still `implements IHUDSystem`
- Modified: `scripts/lint-source-budget.ts` — remove HUDSystem.ts from GRANDFATHER

## Verification

Per template + IHUDSystem fence preserved.

## Reviewer: none required
## Playtest required: yes (HUD readability check)

## Branch + PR

- Branch: `task/hud-system-split`
- Commit: `refactor(ui): split HUDSystem into 4 helpers (hud-system-split)`
