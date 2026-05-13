# Task: player-controller-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-13-player-controller-and-hud-split` (R1)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/player/PlayerController.ts` (1,014 LOC, 35 imports, 177 methods) into 5 helpers.

## Required reading

- `_split-template.md`
- `src/systems/player/PlayerController.ts`
- `src/types/SystemInterfaces.ts` — `IPlayerController` is fenced; do NOT change it. Keep the orchestrator class implementing it.

## Files touched

- New: `src/systems/player/PlayerInputBindings.ts` — keyboard/mouse/touch routing (≤500 LOC)
- New: `src/systems/player/PlayerCameraController.ts` — camera state, FOV, transitions (≤500 LOC)
- New: `src/systems/player/PlayerVehicleBridge.ts` — handoff to/from VehicleSessionController (≤300 LOC)
- New: `src/systems/player/PlayerWeaponBridge.ts` — weapon-system gateway (≤300 LOC)
- New: `src/systems/player/PlayerStateAggregator.ts` — derives `PlayerState` flags (≤200 LOC)
- Each + `*.test.ts` with ≥3 behavior tests
- Modified: `PlayerController.ts` — orchestrator ≤300 LOC, still `implements IPlayerController`, delegates to 5 helpers
- Modified: `scripts/lint-source-budget.ts` — remove `PlayerController.ts` from GRANDFATHER

## Verification

Per template + IPlayerController fence preserved (no fence-change PR).

## Reviewer: combat-reviewer optional (player isn't strict combat, but combat-reviewer often touches player). No required reviewer.
## Playtest required: yes (10-min in TDM)

## Branch + PR

- Branch: `task/player-controller-split`
- Commit: `refactor(player): split PlayerController into 5 helpers (player-controller-split)`
