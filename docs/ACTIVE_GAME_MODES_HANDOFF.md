# Game Modes Handoff

Last updated: 2026-03-08
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
| Phase 1. Runtime Foundation | substantially complete | `GameModeDefinition`, policy-backed runtime hooks, deploy session model, and spawn resolver are live. Config fan-out reviewed and accepted as thin coordinator. |
| Phase 2. Deploy And Loadout | substantially complete | Shared first-spawn/respawn deploy flow is live. `2 weapons + 1 equipment` loadout model, faction pools, presets, and side/faction launch selection are wired. |
| Phase 3. Command Surface | complete | Command coordinator, quick strip, selected-squad detail, map-click squad selection, and map-first overlay are live across desktop, touch, and gamepad. |
| Phase 4. Map Intel Policy | substantially complete | Runtime-owned minimap/full-map policy is live. A Shau strategic layer tuned (minimap excludes strategic agents, full map shows them). |
| Phase 5. Mode Vertical Slices | substantially complete | All four mode product passes done. Zone dominance bar, priority zone display, mode-specific HUD isolation verified. Live gameplay testing remains. |
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
- zone dominance bar shows faction control ratio (colored track + summary label)
- priority-sorted zone display capped at 5 visible (contested first, then urgent, then nearest) with overflow label
- `GameModeManager.applyModeConfiguration()` reviewed and accepted as thin coordinator (not refactored)
- TDM cleanly isolated via policy-driven routing - zero conquest bleed-through confirmed
- A Shau 15-zone HUD overload solved with priority sorting and overflow label

## Current Gaps

- Open Frontier still 40% reskin: helicopter is cosmetic (no NPC pilots, no transport mechanic), command surface is label-only company-scale
- A Shau deferred UX items: no mission briefing card, no front-line map overlay, strategic agent dots unexplained on full map
- Near-field death impact shatter not yet attempted (deferred pending perf budget confirmation)

## Resume Here

### Recommended Next Task

See `docs/NEXT_WORK.md` for the active checklist.

Current priorities:
1. Terrain rewrite remaining items (T-008 hydrology pending design)
2. Content and systems expansion (asset generation, helicopter controls, sandbox infrastructure)
3. Open Frontier mode identity deepening (helicopter as tactical insertion, FOB progression)
4. Live gameplay testing for all four mode product passes

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
