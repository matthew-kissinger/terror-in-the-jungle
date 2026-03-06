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
| Phase 6. Team And Faction Generalization | complete | `ZoneState.BLUFOR_CONTROLLED` replaces `US_CONTROLLED` across 23 files. `TicketDisplay.setFactionLabels()` drives dynamic HUD names from `factionMix` config. Alliance-level ownership is now the norm. |
| Phase 7. Death Presentation | complete | Ground-sinking replaces scale-to-zero. 6s ground persistence, 2s fadeout. Four animation types updated (shatter, spinfall, crumple, fallback). |

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
- `ZoneState.BLUFOR_CONTROLLED` replaces `US_CONTROLLED` across 23 files; alliance-level zone ownership is the norm
- `TicketDisplay.setFactionLabels()` drives dynamic HUD faction names from `factionMix` config
- helipad spawn points wired into `PlayerRespawnManager` for Open Frontier BLUFOR players
- graduated supermajority zone bleed: 70%+ = 1.5x, 100% = 3x (was flat 2x)
- TDM kill-target urgency: 75% amber pulse, 90% red pulse
- death presentation: ground-sinking replaces scale-to-zero, 6s ground persistence, 2s fadeout
- `GameModeManager` uses `objective.kind === 'deathmatch'` policy check instead of hardcoded mode ID
- `SystemConnector` split into 11 named private methods for dependency graph readability

## Current Gaps

- `GameModeManager` is still a legacy fan-out point and not yet a thin coordinator
- `MapIntelPolicy` is now the source of truth for minimap/full-map visibility, but per-mode product tuning still needs a dedicated pass
- mode-specific objective, HUD, and pacing behavior are only partially sliced; the current pass is strongest in mode selection and deploy/respawn surfaces

## Resume Here

### Recommended Next Task

See `docs/NEXT_WORK.md` for the active checklist.

Current priorities:
1. Validate recent perf micro-optimizations with warm `combat120` captures
2. Continue perf tail closure if p99 still fails (AIStateEngage cover search, TerrainSystem tick decoupling)
3. Mode vertical slice product passes (Zone Control, TDM, Open Frontier, A Shau)
4. GameModeManager legacy fan-out slim-down

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
