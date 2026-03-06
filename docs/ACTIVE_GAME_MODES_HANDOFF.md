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
| Phase 3. Command Surface | in progress | Command coordinator, quick strip, desktop/touch map-first overlay, tactical placement map, and map guidance are live. Gamepad still uses radial fallback. |
| Phase 4. Map Intel Policy | not started | Tactical/strategic policy still depends on globals and ad hoc renderer toggles. |
| Phase 5. Mode Vertical Slices | not started | No dedicated product pass yet for Zone Control, TDM, Open Frontier, or A Shau. |
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
- desktop and touch command mode are now map-first for ground orders
- minimap and full map now mirror squad command placement with guidance

## Current Gaps

- `GameModeManager` is still a legacy fan-out point and not yet a thin coordinator
- `MapIntelPolicy` is not the source of truth yet
- strategic map visibility still depends on globals:
  - `__MINIMAP_TACTICAL_RANGE__`
  - `__MINIMAP_SHOW_STRATEGIC_AGENTS__`
  - `__FULLMAP_SHOW_STRATEGIC_AGENTS__`
- command overlay still lacks selected-squad detail and map-click squad selection
- gamepad command flow still relies on radial fallback rather than the map-first surface
- mode-specific objective and HUD behavior are not vertically sliced yet
- death presentation work has not started

## Resume Here

### Recommended Next Task

Phase 4: `MapIntelPolicy`

Reason:
- command placement and deploy flow are good enough to stop changing blindly
- tactical vs strategic map policy is still undefined in code
- mode differentiation will stay muddy until intel policy is explicit

### Exact Next Moves

1. Replace renderer globals with runtime-owned map intel policy.
2. Thread `MapIntelPolicy` from `GameModeDefinition` into minimap/full-map render paths.
3. Define per-mode policy for:
   - tactical contact range
   - strategic-agent visibility
   - full-map strategic overlays
4. Use A Shau as the first full tactical/strategic split.
5. After that, return to Phase 3 and finish:
   - selected-squad detail panel
   - map-click squad selection
   - gamepad parity with the map-first overlay

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
- keep gamepad fallback working until parity exists
- update `GAME_MODES_EXECUTION_PLAN.md` and the relevant `blocks/*.md` docs with every architectural change
