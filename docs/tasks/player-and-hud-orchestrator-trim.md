# Task: player-and-hud-orchestrator-trim

Last verified: 2026-05-09

Cycle: `cycle-2026-05-13-player-controller-and-hud-split` (R3)

## Goal

Final cleanup pass for the cycle. Trim all 7 player/HUD orchestrators to
≤300 LOC, drop all 7 grandfather entries from
`scripts/lint-source-budget.ts`.

## Required reading

- `_split-template.md`
- All 7 orchestrator files (post-split state):
  - `src/systems/player/PlayerController.ts`
  - `src/systems/player/PlayerInput.ts`
  - `src/systems/player/PlayerMovement.ts`
  - `src/systems/player/PlayerRespawnManager.ts`
  - `src/ui/hud/HUDSystem.ts`
  - `src/ui/hud/CommandModeOverlay.ts`
  - `src/ui/map/FullMapSystem.ts`

## Steps

1. `npm ci --prefer-offline`.
2. For each orchestrator: identify any non-orchestrator code remaining. Move it into the appropriate helper, or delete if dead.
3. Verify each ≤300 LOC.
4. Remove all 7 entries from `scripts/lint-source-budget.ts` `GRANDFATHER` map.
5. Run lint, lint:budget, typecheck, test:run.
6. Run combat120 perf compare — ±2%.
7. Run 10-min playtest in TDM.

## Verification

- Each of the 7 orchestrators ≤300 LOC
- 7 entries gone from grandfather list
- Cycle's combat120 p99 ±2%
- 10-min playtest signoff

## Branch + PR

- Branch: `task/player-and-hud-orchestrator-trim`
- Commit: `refactor(player+ui): trim 7 orchestrators to ≤300 LOC, drop grandfather entries (player-and-hud-orchestrator-trim)`

## Reviewer: none required
## Playtest required: yes
