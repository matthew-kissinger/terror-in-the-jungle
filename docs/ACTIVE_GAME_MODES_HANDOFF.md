# Game Modes Handoff

Last updated: 2026-03-06
Status: READY FOR HANDOFF

## Canonical Read Order

1. `GAME_MODES_EXECUTION_PLAN.md`
2. `SQUAD_COMMAND_REARCHITECT.md`
3. `blocks/core.md`
4. `blocks/world.md`
5. `blocks/ui.md`
6. `ROADMAP.md`

## Current Phase Status

| Phase | State | Notes |
|---|---|---|
| Phase 0. Truth Sync | complete | Canonical plan exists and active docs now point to it. |
| Phase 1. Runtime Foundation | in progress | `GameModeDefinition`, policy-backed runtime hooks, deploy session model, and spawn resolver are live. `GameModeManager` still fans config into legacy systems. |
| Phase 2. Deploy And Loadout | substantially complete | Shared first-spawn/respawn deploy flow is live. `2 weapons + 1 equipment` loadout model, faction pools, presets, and side/faction launch selection are wired. |
| Phase 3. Command Surface | complete | Command coordinator, quick strip, selected-squad detail, map-click squad selection, and map-first overlay are live across desktop, touch, and gamepad. |
| Phase 4. Map Intel Policy | in progress | Runtime-owned minimap/full-map policy is live. Per-mode tactical/strategic product tuning is still open. |
| Phase 5. Mode Vertical Slices | in progress | Mode cards and deploy/respawn copy now differentiate the exposed modes; objective/HUD-specific product passes are still open. |
| Phase 6. Team And Faction Generalization | not started | Player-facing faction flow exists, but core world ownership logic still leaks US/OPFOR assumptions. |
| Phase 7. Death Presentation | not started | Shrink/fade death presentation still needs replacement. |

## Validated State

- `npx vitest run src/ui/minimap/MinimapRenderer.test.ts src/ui/hud/CommandTacticalMap.test.ts src/ui/hud/CommandModeOverlay.test.ts src/systems/combat/CommandInputManager.test.ts src/systems/player/PlayerController.test.ts src/ui/map/FullMapSystem.test.ts`
  - passed: `102` tests
- `npm run build`
  - passed
- remaining build issue:
  - Vite chunk-size warnings only

## Landed Capabilities

- shared deploy loop now gates first spawn and respawn
- launch flow is `mode -> side/faction -> deploy`
- loadout model is `2 weapons + 1 equipment`
- faction-aware presets and pools are live
- OPFOR rifle selection now drives the AK first-person rig
- mode runtime seam exists through `GameModeDefinition`, runtime hooks, and policy bundles
- spawn selection is policy-driven for startup and pressure-front fallback
- command entry is centralized through `CommandInputManager`
- command mode is now map-first across desktop, touch, and gamepad for ground orders
- minimap and full map now mirror squad command placement with guidance
- command mode now shows selected-squad detail and supports friendly squad selection directly from the tactical map
- mode cards and deploy/respawn session copy now present Zone Control, TDM, Open Frontier, and A Shau as different products instead of generic scale variants
- `MapIntelPolicy` now applies through runtime-owned minimap/full-map policy instead of renderer globals

## Current Gaps

- `GameModeManager` is still a legacy fan-out point and not yet a thin coordinator
- `MapIntelPolicy` is now the source of truth for minimap/full-map visibility, but per-mode product tuning still needs a dedicated pass
- mode-specific objective, HUD, and pacing behavior are only partially sliced; the current pass is strongest in mode selection and deploy/respawn surfaces
- death presentation work has not started

## Resume Here

### Recommended Next Task

Phase 5: mode vertical slices

Reason:
- deploy/loadout flow, command surface, and runtime-owned map intel are now in place together
- the next highest-value work is making the shipped modes feel distinct instead of continuing to polish shared scaffolding
- A Shau tactical/strategic map tuning and the smaller-mode product passes should now happen on top of the new runtime seams

### Exact Next Moves

1. Start the A Shau tactical/strategic product pass on the new map-intel/runtime foundation.
2. Do the Zone Control product pass next so the baseline mode gets the clearest player-facing identity lift.
3. Follow with Team Deathmatch and Open Frontier product passes once the shared objective/HUD language is cleaner.
4. After that, move to Phase 6 team/faction generalization on top of the now-explicit mode/runtime seams.

## Primary Code Entry Points

- `src/config/gameModeDefinitions.ts`
- `src/config/gameModeTypes.ts`
- `src/systems/world/GameModeManager.ts`
- `src/core/GameEngineInit.ts`
- `src/systems/player/PlayerRespawnManager.ts`
- `src/systems/player/RespawnUI.ts`
- `src/systems/player/LoadoutService.ts`
- `src/systems/combat/CommandInputManager.ts`
- `src/systems/combat/PlayerSquadController.ts`
- `src/ui/hud/CommandModeOverlay.ts`
- `src/ui/hud/CommandTacticalMap.ts`
- `src/ui/minimap/MinimapRenderer.ts`
- `src/ui/map/FullMapSystem.ts`

## Guardrails For The Next Agent

- do not add new `if (mode === ...)` branches outside the runtime/policy layer
- do not bypass `LoadoutService` for spawn equipment changes
- do not regress desktop/touch command mode back to radial-first
- update `GAME_MODES_EXECUTION_PLAN.md` and the relevant `blocks/*.md` docs with every architectural change
