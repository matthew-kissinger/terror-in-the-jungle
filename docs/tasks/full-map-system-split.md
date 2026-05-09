# Task: full-map-system-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-13-player-controller-and-hud-split` (R3)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/ui/map/FullMapSystem.ts` (742 LOC, fan-in 8) into 2 helpers.

## Required reading

- `_split-template.md`
- `src/ui/map/FullMapSystem.ts`
- After Phase 2: FullMap consumes `IZoneQuery` instead of ZoneManager

## Files touched

- New: `src/ui/map/FullMapRenderer.ts` — canvas rendering, marker layout (≤400 LOC)
- New: `src/ui/map/FullMapInteraction.ts` — map clicks, ping placement, camera move (≤300 LOC)
- Each + `*.test.ts`
- Modified: `FullMapSystem.ts` — orchestrator ≤300 LOC
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template. Tactical map command dispatch unchanged.

## Reviewer: none required
## Playtest required: yes

## Branch + PR

- Branch: `task/full-map-system-split`
- Commit: `refactor(ui): split FullMapSystem into renderer + interaction (full-map-system-split)`
