# Game Modes Execution Plan

Last updated: 2026-03-08
Status: ACTIVE - Canonical execution plan for game modes, deploy/loadout flow, command UX, map intel policy, and faction generalization

## Why This Exists

The codebase is no longer a prototype engine, but the player-facing game modes still behave like thin config variants over one shared runtime. This document turns the current assessment into an execution plan that can be iterated against.

Use this document as the working plan for:

- game mode differentiation
- deploy and respawn flow
- customizable loadouts
- squad command UX
- tactical vs strategic map policy
- team and faction generalization
- death presentation cleanup

For broad aspirational direction, keep `ROADMAP.md`. For the actual implementation order of this track, use this file.

## Validated Current State

Validated on 2026-03-06:

- focused Vitest coverage for deploy/loadout flow and command-surface flow passed
- `npm run build` passed
- build still warns about oversized chunks, but no blocking build failure

Latest validation slice:

- `npx vitest run src/ui/minimap/MinimapRenderer.test.ts src/ui/hud/CommandTacticalMap.test.ts src/ui/hud/CommandModeOverlay.test.ts src/systems/combat/CommandInputManager.test.ts src/systems/player/PlayerController.test.ts src/ui/map/FullMapSystem.test.ts`
- result: `102` tests passed

## Phase Status Board

| Phase | State | Summary |
|---|---|---|
| Phase 0. Truth Sync | complete | Canonical docs and handoff doc are now active. |
| Phase 1. Runtime Foundation | substantially complete | Mode definitions, runtime hooks, deploy session model, and spawn resolver are live. Config fan-out reviewed and accepted as thin coordinator. |
| Phase 2. Deploy And Loadout | substantially complete | Shared deploy flow, side/faction selection, presets, and `2 weapons + 1 equipment` loadouts are live. |
| Phase 3. Command Surface | complete | Map-first command flow now spans desktop, touch, and gamepad, with selected-squad detail and squad selection inside the overlay. |
| Phase 4. Map Intel Policy | substantially complete | Runtime-owned map intel drives minimap/full-map policy. A Shau strategic layer tuned (minimap excludes strategic agents, full map shows them). |
| Phase 5. Mode Vertical Slices | substantially complete | Mode cards, deploy copy, and per-mode product passes done. Each mode has distinct HUD/objective behavior. Live gameplay testing remains. |
| Phase 6. Team And Faction Generalization | complete | `ZoneState.BLUFOR_CONTROLLED` across 23 files, dynamic `TicketDisplay` faction labels, alliance-level zone ownership. |
| Phase 7. Death Presentation | complete | Ground-sinking replaces scale-to-zero. 6s ground persistence, 2s fadeout. Four animation types updated. |

## Handoff Status

For another agent taking over this track, use `ACTIVE_GAME_MODES_HANDOFF.md` as the short resume document and this file as the full execution contract.

Codebase reality:

- the engine layer is substantial and tested
- the mode layer is still underpowered
- A Shau Valley is the only mode that feels structurally different
- Open Frontier work improved scale and terrain pressure, but did not solve game-mode identity

## Core Diagnosis

The main problem is not missing systems. The main problem is missing product structure.

What exists already:

- combat simulation
- terrain and DEM support
- war sim for A Shau
- respawn map variants
- full map and minimap infrastructure
- squad command foundations
- helicopter systems
- perf harness and architecture recovery process

What is missing:

- a proper mode runtime layer
- a unified deploy loop before first spawn and respawn
- customizable loadouts wired into live flow
- a deliberate command control surface
- clear tactical vs strategic intel rules
- mode-specific objective, spawn, and UI behaviors

## Current Mode Truth

| Mode | Current Reality | Main Gap |
|------|-----------------|----------|
| Zone Control | Best baseline conquest mode. Mostly config plus zone/ticket tuning. | Needs stronger frontline pacing, clearer deploy loop, and better identity. |
| Team Deathmatch | Conquest stack with TDM toggle and capture logic mostly muted. | Needs dedicated scoring, spawn logic, and HUD language. |
| Open Frontier | Larger map with helipads and custom respawn map. | Still feels like bigger conquest instead of a distinct insertion/mobility mode. |
| A Shau Valley | Only truly distinct runtime: DEM, war sim, insertion pressure, no-contact assists. | Current behavior is partly mode-specific glue because no general runtime layer exists yet. |
| AI Sandbox | Useful internal mode and perf target. | Not a player-facing product mode and should stay separate from the shipping mode set. |

## Current Documentation Drift

These mismatches should be corrected early so planning does not drift further.

| Doc | Drift | Status |
|-----|-------|--------|
| `docs/ROADMAP.md` | Overstates asset non-integration and understates current engine maturity. | Minor; asset row updated 2026-03-06. |
| `docs/ROADMAP.md` | Helicopter throttle note is stale relative to current code and tests. | Fixed 2026-03-06. |
| `docs/blocks/world.md` | Open Frontier description no longer matches live zone/ticket behavior. | Open. |
| `docs/README.md` | Did not have a canonical execution doc for game-mode and flow work. | Fixed; README points to block map. |

## Decisions Locked In

These decisions should be treated as settled unless implementation proves them wrong.

### 1. Mode Selection Comes Before Loadout

Best UX sequence:

1. player picks game mode
2. player picks side or faction if the mode allows it
3. player enters a deploy screen
4. deploy screen handles spawn selection, loadout, squad brief, and deploy

Why this order is correct:

- mode determines valid factions, spawn topology, command affordances, map scale, and loadout pool
- loadout before mode asks the player to make a decision without context
- one deploy surface can then be reused on respawn with less duplication

### 2. Deploy Screen Is The Shared Loop

There should be one shared deploy flow used in two places:

- first spawn after mode selection
- every respawn after death

The first-spawn version is full-size and instructional.
The respawn version is condensed and faster.

### 3. Loadout Model

Player loadout should support:

- 2 weapon slots
- 1 equipment slot

Initial direction:

- no fake customization where only one slot is real
- faction-aware weapon pool
- saved presets plus custom builds
- player can change loadout on respawn

Not in scope for this phase:

- enemy weapon drops
- enemy ammo pickup
- persistent scavenging loop

But the runtime inventory model must not block those later features.

### 4. Command Transition Must Preserve Existing Squad Control

During the transition:

- current quick squad commands must keep working
- new UI surfaces should call into the same command execution path where possible
- the radial menu can remain as an interim fallback until overlay parity exists

Do not break squad commanding in the name of a redesign.

### 5. Tactical And Strategic Intel Must Be Separate On Purpose

Policy direction:

- minimap is tactical-first
- full map can expose tactical plus optional strategic layers
- strategic war-sim markers should be aggregated and visually distinct
- no raw strategic noise on the minimap

### 6. Death Presentation Must Stop Shrinking Corpses

The current shrink and fade behavior is not acceptable.

Replace it with:

- impact reaction
- grounded fall or collapse
- corpse persistence for a short readable window
- controlled cleanup by distance, budget, or time

Optional enhancement if it stays within budget:

- localized billboard shatter or chip burst at the hit point for near-field lethal hits

## Target Product Flow

### Match Start

1. Start screen shows mode cards.
2. Player chooses mode.
3. If the mode supports more than one playable side, show side or faction choice.
4. Enter deploy screen.
5. Deploy screen shows:
   - spawn map
   - loadout builder
   - mode briefing
   - squad and team summary
   - deploy button
6. Player deploys into match.

### Death And Respawn

1. Player dies.
2. Death presentation plays.
3. Short death or spectate state appears.
4. Condensed deploy overlay opens.
5. Player can:
   - choose spawn point
   - adjust loadout
   - review brief state
   - redeploy

This keeps one mental model for the player and one reusable UI architecture for the codebase.

## Architecture Direction

### Goal

Keep static mode config, but move behavior into composable runtime policies.

The current `GameModeManager` should stop growing into a god object. It should become a thin coordinator or be retired behind a new mode runtime coordinator.

### Proposed Structure

#### Static Definition

`GameModeDefinition`

- id
- presentation metadata
- static world config
- allowed factions or sides
- default deploy profile
- runtime policy references

This layer should hold values, not per-mode branching behavior.

#### Runtime Layer

`GameModeRuntime`

- owns mode-specific runtime state
- wires together objective, respawn, intel, command, and flow policies
- provides lifecycle hooks for match start, player spawn, player death, update, and teardown

#### Policy Modules

Keep runtime behavior as small composable policies instead of one giant mode class.

`ObjectivePolicy`

- scoring
- ticket behavior
- capture logic
- win and loss checks
- mode-specific objective UI strings

`RespawnPolicy`

- valid spawn locations
- cooldown rules
- spawn filtering by zone, helipad, insertion, or pressure
- first spawn vs later spawn behavior

`DeployPolicy`

- which deploy widgets are shown
- what must be chosen before deploy
- what is editable on respawn
- briefing content and onboarding hints

`MapIntelPolicy`

- minimap tactical range
- friendly and enemy visibility rules
- strategic layer availability
- aggregation rules for war-sim entities

`CommandProfile`

- quick command set
- whether command mode exists
- what map interactions are legal
- what scale bands are available in the mode

`TeamRules`

- side and faction availability
- alliance definitions
- ownership semantics for zones and objectives

#### Supporting Runtime Services

`MatchFlowController`

- transitions from start screen to deploy to active play to respawn to end state

`LoadoutService`

- owns saved presets
- validates 2-weapon and 1-equipment slot rules
- exposes available weapon pools by faction and mode
- applies chosen loadout on spawn

`RuntimeInventory`

- owns current carried weapons, ammo, and equipment
- can diverge from the saved loadout during play
- later supports field pickups without mutating the saved preset model

## Mode Runtime Rules

Rules for the new runtime layer:

- do not add more `if (mode === ...)` branches across unrelated systems
- do not encode mode behavior as loose globals
- do not keep adding flags to `GameModeManager` as the primary extension path
- mode-specific behavior should enter through policies and flow coordinators
- small modes and large modes should use the same contracts even if their policies differ

## UX And UI Decision

The correct flow is:

mode selection first, then deploy screen, then spawn.

This is better than showing loadout first because:

- the player needs mode context before making gear and spawn choices
- deploy UI can explain what the chosen mode actually is
- the same component architecture works for both first spawn and respawn

## Loadout Plan

### Slot Model

Persistent loadout:

- weapon slot 1
- weapon slot 2
- equipment slot 1

Runtime inventory:

- current equipped weapon
- secondary carried weapon
- carried equipment counts
- ammo pools
- temporary pickups

Saved loadouts and runtime inventory should be different objects.
That separation is required for later enemy drops and ammo pickups.

### Initial Validation Rules

Start simple and permissive:

- weapons must be legal for chosen faction or side
- equipment must be legal for chosen mode
- one slot can be reserved for sidearm-only items if needed later
- later balance systems can add weight or class limits without rewriting the model

Do not over-design class locks now.

### UX Expectations

Deploy screen should show:

- weapon cards with stat summary
- equipment slot chips with quick swap
- saved presets
- current spawn summary
- explicit deploy confirmation

Respawn version should reuse the same components, but minimize friction.

## Command Plan

### Principles

- preserve current command functionality while replacing the fragile UI path
- keep quick commands available without entering full command mode
- make command mode map-first, not radial-first
- keep desktop, touch, and gamepad semantics aligned

### Control Schema Direction

Desktop:

- hold or tap `Z` for command mode
- `F1` to `F4` for quick commands
- left click to select
- right click to place waypoint or confirm location orders
- `Escape` to cancel

Touch:

- dedicated command button
- visible quick command strip
- tap to select
- long press to place waypoint or open context action

Gamepad:

- `Back` or `Select` for command mode
- D-pad for quick commands
- face buttons for select, confirm, cancel

Keep current shortcuts as compatibility aliases during migration if needed.

### Transition Sequence

1. unify all command input through a single command input coordinator
2. keep `PlayerSquadController` as the execution backend at first
3. add `QuickCommandStrip`
4. add `CommandModeOverlay`
5. keep radial menu only until overlay reaches parity
6. remove dead code and old paths after parity is proven

## Tactical Vs Strategic Map Policy

### Tactical Layer

Default information on minimap:

- player
- squad
- nearby friendlies
- nearby enemies when detection rules allow
- active objective markers
- current waypoints

This layer must stay readable under combat stress.

### Strategic Layer

Only on full map, and only where the mode supports it:

- front lines
- battalion or company pressure
- aggregated force arrows
- objective risk state
- insertion and reinforcement state

Do not render raw war-sim entities on the minimap.

### Product Rules

- minimap should never silently depend on ad hoc globals
- mode runtime should provide intel policy explicitly
- A Shau should be the first mode that uses both tactical and strategic layers well
- Open Frontier can optionally expose a lighter strategic layer later

## Mode Differentiation Targets

### Zone Control

Identity:

- platoon-scale frontline capture mode

Required product work:

- faster deploy loop
- stronger zone ownership language
- clearer frontline feedback
- better spawn pressure rules

### Team Deathmatch

Identity:

- kill-race firefight mode

Required product work:

- dedicated spawn logic
- no conquest leftovers in HUD or flow
- explicit kill target presentation
- faster turnaround and smaller tactical loop

### Open Frontier

Identity:

- company-scale insertion and maneuver mode

Required product work:

- helipad and mobility loop
- insertion and redeploy emphasis
- more deliberate distance and route planning
- command surface that supports maneuver without full strategic overload

### A Shau Valley

Identity:

- battalion-scale war-zone mode

Required product work:

- clean tactical plus strategic map split
- insertion pressure and no-contact flow refinement
- better objective and pressure readability
- less hardcoded special behavior leaking across systems

## Team And Faction Generalization

Current code still treats ownership and respawn as US vs OPFOR in several places. That will block both faction variety and proper mode composition if left in place.

Target model:

- `TeamId` for match ownership and scoring
- `FactionId` for unit visuals, weapons, doctrine, and voice
- `AllianceId` only if a mode needs multiple factions per side

Rules:

- zones belong to teams, not hardcoded US or OPFOR labels
- respawn eligibility depends on team rules and mode policy
- HUD and map colors come from team presentation config
- faction data should not decide ownership semantics

Do this after the mode runtime layer exists, not before.

## Death Presentation Plan

### What Must Change

Remove the current end-of-life shrink and fade presentation from combatant deaths.

Replace it with:

- directional hit reaction
- fall, spinfall, or crumple chosen by damage type
- grounded persistence window
- cleanup via distance and corpse budget

### Optional Near-Field Enhancement

If performance holds, add a near-field impact effect for lethal hits:

- detect approximate hit point in billboard-local space
- spawn a small pooled shard or chip burst from that point
- bias impulse by shot direction and damage type
- cap active effects hard
- disable beyond a short camera distance

This should read as the billboard getting hit where it was hit, not as the whole sprite shrinking away.

If full localized shatter is too expensive, fall back to:

- directional chip burst
- impact decal or flash
- better collapse and corpse persistence

## Workstreams

### Phase 0. Truth Sync

Deliverables:

- make this doc canonical for the track
- update `docs/README.md`
- correct stale statements in `docs/ROADMAP.md`
- correct world-mode inaccuracies in `docs/blocks/world.md`
- update relevant block docs when implementation lands

Acceptance:

- active docs point to the right execution source
- no known high-impact doc drift remains on game modes, loadout flow, map policy, or command flow

### Phase 1. Runtime Foundation

Deliverables:

- define `GameModeDefinition`
- define `GameModeRuntime`
- add policy interfaces
- reduce `GameModeManager` to configuration bootstrap and coordinator responsibilities

Current implementation note:

- foundational contracts are now in code: `GameModeDefinition`, policy bundles, a policy-backed `GameModeRuntime`, and runtime lifecycle hooks inside `GameModeManager`
- initial policy-driven behavior is live for map intel application and respawn-map selection
- initial spawn insertion and pressure-front respawn fallback now resolve through a shared policy-driven spawn resolver instead of hardcoded A Shau branches
- a shared deploy-session model now drives mode-aware deploy copy for the front menu and respawn UI, so deploy presentation is no longer duplicated as hardcoded strings
- first spawn now waits on the same deploy-selection path as respawn, using policy-driven default insertion selection before startup flow positions the player
- `applyModeConfiguration()` reviewed 2026-03-08: 94 lines of null-guarded setter calls across 8 systems. This IS a thin coordinator already - moving config into individual systems would couple them to `GameModeConfig`, which is worse. Accepted as-is.

Acceptance:

- mode behavior is no longer primarily expressed as ad hoc manager branching
- A Shau-specific runtime behavior can be expressed without leaking into every other mode

### Phase 2. Deploy And Loadout

Deliverables:

- build shared deploy screen
- wire first spawn through deploy
- wire respawn through condensed deploy
- implement customizable 2-weapon and 1-equipment-slot loadouts
- persist presets by faction or side

Current implementation note:

- first spawn and respawn already share the same deploy-session flow
- deploy UI now includes live loadout editing for 2 weapon slots plus 1 equipment slot represented by grenade, sandbag kit, or mortar kit
- deploy UI now surfaces deploy sequence steps, faction context, preset identity, and preset save state instead of only raw field cycling
- `LoadoutService` now persists the selected loadout by faction context and applies it on match start and respawn
- runtime inventory is now separate from the saved loadout model, which keeps the later enemy-drop and ammo-pickup path open
- initial deploy now opens immediately after mode setup, before chunk pre-generation, so terrain prep can target the player's chosen insertion point
- initial deploy now supports backing out to mode select without surfacing a startup error
- faction-aware weapon and equipment pools plus preset slots now exist for US, ARVN, NVA, and VC
- start flow now includes explicit side and faction selection between mode select and deploy, and that selection now drives deploy copy, spawn filtering, player proxy faction, rally placement, and first-person rifle variant
- the AK first-person rig is now loaded and selected automatically for OPFOR rifle loadouts

Acceptance:

- player can choose and save custom loadouts
- chosen loadout actually applies in match
- first spawn and respawn use the same underlying flow

### Phase 3. Command Surface

Deliverables:

- single command input coordinator
- quick command strip
- command mode overlay
- transition off fragile radial-first UX

Current implementation note:

- `CommandInputManager` now sits between gameplay input and `PlayerSquadController`, so squad command entry is centralized instead of being hard-wired straight to the radial menu
- `QuickCommandStrip` is live in the HUD `command-bar` region and mirrors current command state while keeping quick commands visible across desktop, touch, and gamepad
- `CommandModeOverlay` is now live across desktop, touch, and gamepad as the map-first command surface, with the coordinator handling pointer unlock on open and relock on close
- `CommandTacticalMap` now lets HOLD, PATROL, and RETREAT arm first and then resolve on a local tactical map instead of firing as blind quick commands
- `PlayerSquadController` is now the execution backend plus radial fallback instead of owning the visible quick-command UI
- the overlay now includes selected-squad detail for squad id, leader, formation, and faction
- the tactical map now supports friendly squad selection when no ground-placement order is armed
- gamepad command mode now uses the map-first overlay, with D-pad quick orders plus cursor-driven selection/confirmation
- dead inline squad-help UI in `PlayerSquadController` has been removed so the strip is the one truthful quick-command surface
- minimap and full map now mirror the squad command position with guidance lines, and the full map also shows player-squad highlighting plus a distance label on the placed command point

Acceptance:

- existing squad commands still work during migration
- desktop, touch, and gamepad have a coherent command story
- point-and-click commanding is viable without pausing the game

### Phase 4. Map Intel Policy

Deliverables:

- explicit `MapIntelPolicy`
- tactical minimap cleanup
- strategic full-map layer for modes that support it
- A Shau tactical and strategic product pass

Current implementation note:

- `MapIntelPolicy` now threads from `GameModeDefinition` through `GameModeManager` into `MinimapSystem` and `FullMapSystem` instead of routing through renderer globals
- tactical contact range is now runtime-owned on the minimap renderer
- strategic-agent visibility is now explicit and separated for minimap vs full map
- A Shau product pass completed 2026-03-08: strategic agents on full map (alpha 0.2-0.4), excluded from minimap, zone display capped at 5 visible with priority sort (contested first, then nearest), dominance bar for aggregate faction control

Acceptance:

- no global-only map policy toggles
- minimap remains readable in combat
- strategic layer is useful instead of noisy

### Phase 5. Mode Vertical Slices

Deliverables:

- Zone Control product pass
- Team Deathmatch product pass
- Open Frontier product pass
- A Shau Valley product pass on top of the new runtime

Current implementation note:

- mode cards now describe the exposed modes as distinct products instead of generic scale variants
- deploy/initial/respawn session copy now differentiates Zone Control, Team Deathmatch, Open Frontier, and A Shau with mode-specific headlines, map titles, and readiness language
- Zone Control (2026-03-08): zone dominance bar added showing faction control ratio; zone status already comprehensive (CAPTURING/LOSING/ATTACKING/CONTESTED/SECURED/HOSTILE), capture bars with contextual coloring, bleed pulse, compass markers, center-screen capture notifications
- Team Deathmatch (2026-03-08): audit clean - zero conquest bleed-through. Zone HUD hidden via display:none, kill target display with 75%/90% urgency pulses, bleed indicator hidden, spawn logic uses home bases only, victory on kill count (not ticket depletion). Cleanly isolated via policy-driven routing
- Open Frontier (2026-03-08): 60% distinct (pressure corridor + helipads + 4x world + double force), 40% reskin (same capture mechanics, cosmetic helicopter, label-only command scale). Helipads wired with terrain flattening, helipad_main preferred on initial deploy. Helicopter auto-start deferred (needs NPC pilot AI)
- A Shau Valley (2026-03-08): 15-zone HUD overflow solved with priority-sorted display capped at 5 visible (contested first, then urgent, then nearest), overflow label for hidden zones. Zone dominance bar provides aggregate view. Strategic agents on full map only. Remaining gaps (deferred): mission briefing card, front-line map overlay, strategic agent legend

Acceptance:

- each exposed mode has a distinct loop, not just different numbers
- mode cards and mode behavior agree

### Phase 6. Team And Faction Generalization

Deliverables:

- team-owned zone states
- team-aware respawn logic
- faction config cleanup
- HUD and map presentation driven by team presentation config

Current implementation note:

- `ZoneState.US_CONTROLLED` renamed to `BLUFOR_CONTROLLED` across 23 files
- `TicketDisplay.setFactionLabels()` drives dynamic HUD faction names from `factionMix` config
- `GameEngineInit.resolveFactionLabels()` resolves display names at mode start
- `GameModeManager` uses `objective.kind === 'deathmatch'` policy check instead of hardcoded `GameMode.TEAM_DEATHMATCH` comparison
- graduated supermajority zone bleed in `TicketBleedCalculator`: 70%+ = 1.5x, 100% = 3x
- helipad spawn points wired into `PlayerRespawnManager` for Open Frontier BLUFOR players

Acceptance:

- modes are no longer blocked on US-vs-OPFOR assumptions - DONE
- mixed-faction teams are possible where desired - DONE (alliance-level ownership)

### Phase 7. Death Presentation

Deliverables:

- remove shrink and fade corpse behavior
- implement grounded death persistence
- add optional near-field impact shatter if it survives perf testing

Current implementation note:

- scale-to-zero replaced with ground-sinking across all 4 animation types (shatter, spinfall, crumple, fallback)
- ground persistence extended from 4s to 6s, fadeout from 1s to 2s
- `CombatantLODManager` death timing: FALL_DURATION=0.7s, GROUND_TIME=6.0s, FADEOUT_DURATION=2.0s
- `CombatantRenderer` phase ratios updated to 8.7s total; corpse sinks 3.5-5.5 units below terrain during fadeout
- near-field impact shatter not yet attempted (deferred pending perf budget confirmation)

Acceptance:

- death reads clearly at close range and mid-range - DONE
- no immersion-breaking shrink-away deaths remain - DONE
- perf impact stays within budget with strict caps and pooling - DONE (no new allocations)

## Immediate File Targets

These are the likely first files to touch when implementation starts:

- `src/config/gameModeTypes.ts`
- `src/systems/world/GameModeManager.ts`
- `src/core/GameEngineInit.ts`
- `src/core/SystemInitializer.ts`
- `src/ui/loading/StartScreen.ts`
- `src/ui/loading/ModeCard.ts`
- `src/systems/player/RespawnUI.ts`
- `src/systems/player/LoadoutService.ts`
- `src/ui/map/RespawnMapView.ts`
- `src/systems/player/PlayerRespawnManager.ts`
- `src/systems/combat/PlayerSquadController.ts`
- `src/ui/hud/SquadRadialMenu.ts`
- `src/ui/minimap/MinimapRenderer.ts`
- `src/ui/map/FullMapSystem.ts`
- `src/systems/world/ZoneManager.ts`
- `src/systems/world/ZoneCaptureLogic.ts`
- `src/systems/world/VictoryConditions.ts`
- `src/systems/combat/CombatantRenderer.ts`
- `src/systems/combat/CombatantDamage.ts`

## Non-Goals For This Track

Do not expand scope into these yet:

- theater campaign implementation
- survival mode implementation
- enemy loot and ammo pickup systems
- full multiplayer architecture
- speculative perf rewrites not tied to measured regressions

## Working Standard

Every implementation step in this track should answer four questions:

1. does this create a more distinct player-facing mode loop
2. does this reduce branching and hidden assumptions in the runtime
3. does this preserve or improve command usability during combat
4. does this keep the path open for later faction and inventory expansion

If the answer is no, the change is probably not aligned with this plan.
