# System Packageability Audit

Audit date: 2026-04-28

Scope: static source audit, current repo-state docs, git history shape,
dependency graph extraction, starter-kit extraction closeout, and current
local validation checks. This report does not claim human playtest sign-off and
does not replace perf captures.

Current checkout notes:

- Branch: `master`, tracking `origin/master`.
- `npm run typecheck` passed during the initial audit.
- Follow-up Wave 1 package validation passed after extraction:
  `game-field-kits` `npm run check`, `game-field-kits` `npm run
  smoke:browser`, TIJ targeted Wave 1 tests, and TIJ `npm run validate:fast`.
- Worktree already had untracked asset/review files before this report: `60-free-plants.zip`, `foliage-pack.zip`, `survival-kit.zip`, `pixel-forge-tij-asset-handoff/`, `viewer-screenshot.png`, `viewer-typed.png`.
- The audit now has a concrete sibling-repo implementation: `game-field-kits`
  with agnostic package scope `@game-field-kits/*`. TIJ consumes only the Wave
  1 low-risk packages through local compatibility wrappers.

## Executive Verdict

This is a real game codebase, not a toy engine. It has a playable combined-arms loop, current validation gates, a serious browser probe/perf harness culture, and several systems that already look like candidate libraries. The best work in the repo is the work that has a named contract, a narrow runtime surface, and a probe or behavior test behind it.

It is not package-ready as a whole. The code is modular by folder, but several modules are not modular by dependency direction. The main runtime knot is a 46-file production import cycle spanning combat, world state, player respawn, map UI, ticketing, and game mode runtime. Counting type-only imports makes the knot much larger because `src/types/SystemInterfaces.ts` imports concrete game classes and game-domain types.

The blunt version: you have a strong vertical game implementation with several reusable cores buried inside it. You do not yet have a reusable engine or reusable packages. Trying to publish packages directly from the current folders would mostly export the coupling and make it harder to improve the game.

The right strategy is staged extraction:

1. Extract small infrastructure pieces that already have clean boundaries.
2. Create a game-agnostic `ports` layer that stops shared interfaces from importing concrete game systems.
3. Replace session-global singletons with explicit service instances.
4. Split the combat/world/player/UI runtime knot before packaging gameplay.
5. Only package combat and vehicles after their data ownership and playtest contracts stabilize.

## Evidence Snapshot

Static domain size from `src/`:

| Domain | Files | Prod | Tests | Approx lines | Read |
|---|---:|---:|---:|---:|---|
| `systems/combat` | 103 | 62 | 41 | 33.9k | largest, hot path, most valuable, least package-ready |
| `ui` | 160 | 117 | 43 | 27.5k | broad surface, mixed modern/raw DOM styles |
| `systems/player` | 56 | 37 | 19 | 20.1k | central gameplay orchestrator, high coupling |
| `systems/vehicle` | 48 | 27 | 21 | 11.1k | stronger recent ownership, still tied to player/HUD/terrain |
| `systems/world` | 36 | 23 | 13 | 9.4k | game-mode/ticket/zone authority, central coupling hub |
| `core` | 53 | 35 | 18 | 9.1k | composition shell, good control plane, manual ceremony |
| `systems/weapons` | 23 | 15 | 8 | 8.9k | split between reusable ballistics and game-specific inventory/combat wiring |
| `systems/terrain` | 51 | 31 | 20 | 8.7k | valuable runtime, partly blocked by global cache and world-feature coupling |
| `systems/helicopter` | 23 | 12 | 11 | 6.5k | mature enough for game, not package-clean |
| `systems/environment` | 17 | 10 | 7 | 5.0k | good backend seam, art still not final |

Top production fan-in:

- `src/utils/Logger.ts`: 133 runtime imports.
- `src/systems/combat/types.ts`: 107 runtime imports.
- `src/types/SystemInterfaces.ts`: 66 type-only imports.
- `src/systems/world/ZoneManager.ts`: 44 runtime imports.
- `src/config/gameModeTypes.ts`: 36 runtime imports.

Top production fan-out:

- `src/core/SystemInitializer.ts`: 51 imports.
- `src/core/SystemManager.ts`: 49 imports.
- `src/core/SystemRegistry.ts`: 45 imports.
- `src/core/GameEngine.ts`: 38 imports.
- `src/systems/combat/CombatantSystem.ts`: 36 imports.
- `src/systems/player/PlayerController.ts`: 33 imports.

Static import cycle findings:

- Runtime-only production graph has a 46-file strongly connected component crossing `CombatantSystem`, `ZoneManager`, `GameModeManager`, `TicketSystem`, `PlayerRespawnManager`, `FullMapSystem`, `MinimapSystem`, `SandbagSystem`, combat AI/movement/damage, and spawn logic.
- Including type-only imports creates a much larger game-wide component. That is not the same as runtime breakage, but it is a packaging blocker because published packages still need type surfaces that do not drag the whole game with them.

## Packageability Grades

| Grade | Meaning |
|---|---|
| A | Can be extracted soon with light dependency injection and path cleanup. |
| B | Good reusable core exists, but it needs a facade or concrete-game decoupling first. |
| C | Valuable but currently too coupled to package directly. Extract by carving internal submodules first. |
| D | Keep app-specific for now. It is product code, not library code. |
| F | Rewrite or retire before attempting package extraction. |

## Wheat

These are the strongest reusable candidates.

### `SimulationScheduler` And Frame Budget Metadata

Grade: A

Why it is good:

- `src/core/SystemUpdateSchedule.ts` makes update phases and budgets inspectable.
- `src/core/SystemUpdater.ts` uses the schedule to avoid double-updating tracked systems.
- `src/core/SimulationScheduler.ts` is likely reusable as a small cadence scheduler.

Dependencies:

- Currently uses `GameSystem`, `SystemKeyToType`, and repo-specific phase names.

Package shape:

- `@game-field-kits/frame-scheduler`
- Expose a generic cadence scheduler plus an optional budgeted update-runner.
- Keep game-specific phase tables in the app, not in the package.

Extraction work:

- Move `SimulationScheduler` and schedule collection helpers behind generic types.
- Keep `SystemUpdateSchedule.ts` in the game repo as a consumer-side config.

### `GameEventBus`

Grade: B

Why it is good:

- Small, typed, queue-and-flush model.
- Easy mental model for per-frame event delivery.
- Already has focused tests.

Bad:

- It is a singleton static export, so tests and multiple game sessions need explicit reset discipline.
- Event names are game-specific.

Package shape:

- `@game-field-kits/event-bus`
- Export `createEventBus<EventMap>()`, not one global instance.
- Keep `GameEventBus` as the game app's singleton wrapper.

### `EffectPool<T>` And Visual Pool Patterns

Grade: A for the base pattern, B for current game effects

Why it is good:

- `EffectPool<T>` captures the right render-performance pattern: allocate once, keep scene membership stable, toggle `visible`.
- `TracerPool`, `ImpactEffectsPool`, `ExplosionEffectsPool`, and `SmokeCloudSystem` show the pattern working in real gameplay.

Bad:

- Specific effect classes are tied to this game's art, colors, weapons, and `THREE.Scene`.
- `SmokeCloudSystem` has a module-level global setter/spawner, which should not be exported as a package pattern.

Package shape:

- `@game-field-kits/three-effect-pool`
- Generic pool lifecycle, effect handle, scene add/remove policy, disposal helpers.
- Game repo keeps tracer/explosion/smoke implementations.

### `ModelDrawCallOptimizer`

Grade: A

Why it is good:

- `src/systems/assets/ModelDrawCallOptimizer.ts` is focused on static GLB hierarchy optimization.
- Uses Three.js `BatchedMesh` for material-bucketed static placements.
- The behavior is useful beyond this game.

Bad:

- It assumes Three.js r184 behavior and app-specific static/dynamic conventions.
- Rotor/prop preservation rules need to become caller-provided predicates instead of Vietnam-aircraft assumptions.

Package shape:

- `@game-field-kits/three-model-optimizer`
- API: `optimizeStaticModel(root, { preserveNode, strategy, batchNamePrefix })`.

### Height Providers, Stamping, And Terrain Query Primitives

Grade: B

Why it is good:

- `DEMHeightProvider`, `NoiseHeightProvider`, `BakedHeightProvider`, `StampedHeightProvider`, and `TerrainStampGridBaker` are conceptually reusable.
- `ITerrainRuntime` is one of the better existing fenced contracts.
- Terrain features/stamps are a real domain abstraction, not just view code.

Bad:

- `HeightQueryCache` is still a global-ish second authority.
- `TerrainSystem` combines rendering, streaming, biome assignment, vegetation scattering, collision registration, and feature application.
- World/airfield feature compilation imports across terrain/world boundaries.

Package shape:

- `@game-field-kits/terrain-height-core`: height providers, stamp math, heightmap baking, slope/normal helpers.
- Later `@game-field-kits/terrain-three`: CDLOD renderer and Three.js runtime.

Extraction work:

- Extract providers first.
- Replace global cache usage with an explicit `TerrainQueryService` instance.
- Split `TerrainSystem` into data/runtime/render/vegetation facades before packaging the full runtime.

### `UIComponent`, Focus Management, And Responsive Utilities

Grade: B

Why it is good:

- `src/ui/engine/UIComponent.ts` gives a clear lifecycle and auto-disposed effects/listeners.
- `FocusTrap`, responsive manager, design tokens, and CSS Modules are sensible reusable infrastructure.

Bad:

- The UI folder still mixes `UIComponent` with raw `document.createElement` systems such as `FullMapSystem`.
- Some UI components import gameplay systems directly.
- `ViewportManager` is a singleton.

Package shape:

- `@game-field-kits/dom-ui-core`
- Export component lifecycle, focus trap, responsive helpers, and typed state primitives.
- Keep HUD/minimap/full-map/gameplay controls app-specific until their data inputs are DTOs.

### Fixed-Wing `Airframe`

Grade: B now, A after feel lock

Why it is good:

- `src/systems/vehicle/airframe/Airframe.ts` is relatively cohesive compared with surrounding vehicle code.
- The code has serious evidence probes and targeted tests.
- `FixedWingControlLaw` is separated from the physical sim.

Bad:

- The product feel is not fully human-signed off.
- `FixedWingModel` ties the airframe to scene graph, HUD, terrain, player session, diagnostics, and NPC pilots.
- Airfield surface authority is not solved yet.

Package shape:

- `@game-field-kits/airframe-core`: `Airframe`, command/config types, terrain probe interface.
- Keep `FixedWingModel`, player adapter, HUD, NPC pilot, and airfield staging in the game.

Extraction work:

- Publish only after Cycle 11 airfield surface authority and a human flight feel decision.

## Chaff

These are not worthless, but they are not package candidates in their current shape.

### `SystemInitializer` / `SystemRegistry` / `SystemConnector`

Grade: C

The good:

- There is a real composition root.
- Runtime composers are a major improvement over one giant wiring file.
- Initialization progress and deferred systems are useful.

The bad:

- Adding a system still touches multiple files: initializer, registry, schedule, composers, sometimes disposer.
- `SystemInitializer` imports nearly every concrete system.
- `SystemRegistry` is a typed map of concrete game systems, which is fine for an app shell but not a library boundary.

Package path:

- Do not package this exact composition root.
- Package a tiny generic lifecycle runner only if needed.
- Keep the game-specific system manifest in the app.

Recommended next step:

- Move toward a declarative system manifest with fields: `key`, `construct`, `initPhase`, `updatePhase`, `deferred`, `dispose`.
- Generate registry/schedule consistency checks from that manifest.

### `SystemInterfaces.ts`

Grade: C as a fence, D as a reusable package API

The good:

- The fence discipline is valuable.
- `ITerrainRuntime`, `ISkyRuntime`, `ICloudRuntime`, `IAudioManager`, and `IGameRenderer` are good starts.

The bad:

- The file imports many concrete systems: `PlayerController`, `FirstPersonWeapon`, `HelicopterModel`, `CombatantSystem`, `ZoneManager`, `HUDSystem`, and more.
- `IHUDSystem` contains a very broad game-specific surface including weapons, helicopter instruments, fixed-wing instruments, score popups, mortar UI, squad prompts, and weapon slot callbacks.
- `IPlayerController` mixes lifecycle, movement, camera, recoil, weapons, helicopter lifecycle, fixed-wing lifecycle, and dependency setters.

Package path:

- Create a new `@game-field-kits/ports` package only after replacing concrete class imports with DTOs and capability interfaces.
- Keep `SystemInterfaces.ts` fenced, but stop treating it as a future package. It is currently an anti-drift shield for this repo, not an engine API.

### `GameModeManager`

Grade: D

The good:

- It centralizes mode configuration and prevents mode setup from being scattered everywhere.

The bad:

- It mutates combat, tickets, terrain, minimap, full map, HUD, player respawn, war sim, and sandbox tuning.
- It is one of the runtime cycle participants.
- It mixes data-driven mode definition with imperative cross-system mutation.

Package path:

- Do not package.
- Extract data schema and pure mode resolution helpers first.
- Leave the imperative orchestration app-local.

### `PlayerController`

Grade: D

The good:

- It is the real player orchestration point and has absorbed many responsibilities that previously drifted across the repo.
- Vehicle session integration is in better shape after `VehicleSessionController`.

The bad:

- It owns or wires movement, input, camera, weapons, touch controls, inventory, HUD, player squad control, vehicle session, respawn/spectator transitions, pointer lock, and settings modal behavior.
- It is a central runtime-cycle participant.
- It exposes a large interface and many compatibility setters.

Package path:

- Do not package `PlayerController`.
- Package smaller pieces after they are carved:
  - movement core,
  - camera rigs,
  - input context manager,
  - vehicle session controller,
  - weapon firing pipeline.

### `HUDSystem` And Gameplay UI

Grade: D for full HUD, B for UI primitives

The good:

- `GameplayPresentationController` points in the right direction: UI renders state, gameplay owns state.
- CSS Modules and `UIComponent` are a good modern path.

The bad:

- `HUDSystem` is a broad game-specific facade.
- It imports gameplay systems and owns many callbacks.
- `FullMapSystem` and some legacy UI still build DOM manually and participate in world/combat cycles.

Package path:

- Package UI primitives only.
- Convert HUD/minimap/full-map to consume `GamePresentationSnapshot` DTOs before considering package extraction.

### `CombatantSystem`

Grade: C internally, D as a package today

The good:

- Combat is the real hot path and has the most disciplined subsystem doc.
- It has internal layers: types/spatial, spawn/lifecycle, AI, damage, movement/render/LOD, squad command.
- It already has budget gates for cover search, LOS, LOD, and spatial sync.
- Pixel Forge hit proxies and actor-height contracts are good examples of centralizing facts.

The bad:

- `CombatantSystem` is both subsystem facade and internal service locator.
- Combat imports world state and player systems; world and UI import combat back.
- `combat/types.ts` is imported by 100+ production sites and acts as a global domain bucket.
- The concrete `Map<string, Combatant>` OOP store is unlikely to reach the 3,000-agent vision without data-oriented work.
- Spatial singleton compatibility remains.

Package path:

- Do not package combat as one package.
- First extract:
  - `combat-domain`: factions, alliances, target helpers, hit proxy math.
  - `spatial-core`: grid/octree/query interfaces.
  - `combat-ai-behavior`: only after AI inputs/outputs are DTOs.
  - `combat-render-runtime`: only after renderer is fed by snapshots, not live combat objects.

Long-term:

- Make the ECS/data-oriented decision before packaging high-count combat.
- If the object-map model stays, package it as a tactical combat sim for small counts, not as the 3,000-agent solution.

### `TerrainSystem`

Grade: B internally, C as a package today

The good:

- The terrain stack has valuable pieces: DEM, baked heightmaps, procedural noise, stamped providers, CDLOD, raycast runtime, terrain surface runtime, worker pool.
- A Shau has forced real-world asset handling and startup failure discipline.

The bad:

- `TerrainSystem` is too many systems in one facade.
- `HeightQueryCache` is still a global compatibility path.
- Terrain and world features are crossed by airfield stamps and LOS registration.
- Vegetation scattering is terrain-owned while billboard rendering is world-owned.

Package path:

- Extract data math and providers now.
- Package render/runtime only after terrain query authority is entirely injected and airfield surface authority is solved.

### `NavmeshSystem`

Grade: B core, C package

The good:

- Uses Recast, worker/WASM awareness, static-tiled large-world generation, pre-baked assets, connectivity validation.
- Explicit A Shau failure is the right production behavior.

The bad:

- It currently knows game-world features and startup expectations.
- It is optional in combat movement, and long-route NPC movement still is not fully signed off.
- It is directly wired into `CombatantMovement`, `WorldFeatureSystem`, and startup.

Package path:

- Extract a `nav-core` adapter around Recast only after obstacle/feature input is DTO-based.
- Keep game startup and A Shau policy in the app.

### `WorldFeatureSystem`

Grade: C

The good:

- Good static model optimization path.
- Handles airfield/firebase/building placement and links with terrain features.

The bad:

- World features, terrain stamps, fixed-wing staging, navmesh obstacles, LOS registration, and model rendering overlap.
- Direct LOS accelerator side channel exists because `ITerrainRuntime` does not expose the right collision/LOS registration surface.
- Airfield surface authority is explicitly not done.

Package path:

- Do not package.
- Extract pure layout generators only if they are made data-only and do not import live systems.

### Vehicles And Helicopters

Grade: B for cores, C/D for full runtime

The good:

- `VehicleSessionController` gives one owner for player session state.
- `PlayerVehicleAdapter` is a useful pattern.
- Fixed-wing `Airframe` and `FixedWingControlLaw` have meaningful tests/probes.
- Helicopter physics has explicit engine lifecycle now.

The bad:

- Full vehicle runtime is still tied to player, HUD, terrain, input, scene graph, interaction systems, and airfield metadata.
- Fixed-wing feel, A Shau taxi/takeoff, and emergency/bailout UX still need human sign-off.
- Helicopter and fixed-wing adapters still translate directly into `PlayerInput` details.

Package path:

- Package `VehicleSessionController` as a generic state machine only after it stops importing game-specific types.
- Package `Airframe` separately from `FixedWingModel`.
- Keep helicopter/fixed-wing model classes game-local.

### Air Support

Grade: D

The good:

- It is useful product functionality and now participates in the scheduled AirSupport phase.

The bad:

- It mixes missions, combat damage, grenade/explosion effects, HUD, audio, terrain, aircraft models, and direct positioning.
- Some mission types are physics-driven, others are legacy direct-positioned.

Package path:

- Do not package yet.
- Extract mission planning DTOs only after all mission types share one vehicle/trajectory authority.

### Weapons

Grade: B for gunplay core, C/D for full weapons folder

The good:

- The player weapon pipeline is cleanly named: input -> shot command builder -> firing -> shot executor.
- `GunplayCore` and shot command validation are package candidates.
- Mortar/grenade/sandbag systems are behavior-rich and tested.

The bad:

- Full weapons systems depend on scene, camera, combat, inventory, ticketing, audio, effects, terrain, and HUD.
- Some weapon systems own visuals and gameplay in the same class.

Package path:

- Extract `gunplay-core`: weapon stats, recoil/spread, ammo, shot command, ray math.
- Keep visual presentation and inventory/HUD integration in the app.

### Assets And Pixel Forge Runtime

Grade: B

The good:

- Asset loader and model loader have clear jobs.
- Pixel Forge cutover guard is strong operational discipline.
- Runtime art contracts are increasingly manifest-backed.

The bad:

- Texture assets are game-specific.
- `AssetLoader` bundles exact app asset lists.
- Pixel Forge NPC runtime currently lives inside combat and is tied to this game's factions/clips.

Package path:

- Package generic GLTF/model cache and draw-call optimizer.
- Keep Pixel Forge manifests and faction animation mapping app-specific until a generic animated-impostor schema stabilizes.

### Audio

Grade: C

The good:

- Audio has a manager, pool manager, ducking system, ambient manager, and weapon sounds.

The bad:

- Game event subscription is direct.
- Sound names and configs are app-specific.
- WebAudio/Three audio details are not abstracted cleanly for packaging.

Package path:

- Possible future `three-audio-pool`, but not a priority.

### Environment

Grade: B

The good:

- `ISkyRuntime` and `ICloudRuntime` are good seams.
- `AtmosphereSystem` has an internal backend seam (`ISkyBackend`) and scenario presets.
- Weather forwards intent instead of owning sky rendering.

The bad:

- The current cloud art is not final.
- `AtmosphereSystem` still owns both sky runtime and renderer/light/fog side effects.
- `WaterSystem` is legacy/global-plane behavior in several modes.

Package path:

- Extract sky math and `HosekWilkieSkyBackend` after stabilizing API shape.
- Keep scenario presets and water policy app-local.

### Debug, Probes, And Perf Harness

Grade: B as internal product, C as package

The good:

- This repo's verification tooling is unusually strong for an indie codebase.
- `perf-capture.ts`, fixed-wing probe, state/HUD/mobile probes, and atmosphere evidence are real engineering assets.
- Perf target separation between retail and perf-harness builds is correct.

The bad:

- The scripts are app-specific and use broad `window.__engine` access.
- Some scripts are large enough to become their own maintenance problem.

Package path:

- Do not publish now.
- Productize internal harness APIs first: narrow named browser diagnostics instead of broad private engine reach-in.

## The Runtime Clusters

### Cluster 1: App Shell And Runtime Orchestration

Files:

- `src/main.ts`
- `src/core/bootstrap.ts`
- `src/core/GameEngine.ts`
- `src/core/GameEngineInit.ts`
- `src/core/GameEngineLoop.ts`
- `src/core/GameEngineInput.ts`
- `src/core/SystemManager.ts`
- `src/core/SystemInitializer.ts`
- `src/core/SystemConnector.ts`
- `src/core/*RuntimeComposer.ts`
- `src/core/SystemUpdater.ts`
- `src/core/SystemUpdateSchedule.ts`

Current role:

- Owns app boot, system construction, dependency wiring, frame update, renderer handoff, diagnostics hooks, and lifecycle cleanup.

Good:

- Clear entry path.
- Explicit update budgets.
- Deferred system init for first interactive frame.
- Composers are a real improvement over a monolith.

Bad:

- The app shell knows every concrete system.
- System addition remains ceremonial.
- Core imports UI and many gameplay systems, so it cannot become an engine package without inversion.

Ugly:

- `SystemInterfaces.ts` and `SystemRegistry.ts` encode the current concrete app graph. That protects the game today but exports too much app-specific structure for reuse.

Recommendation:

- Keep app shell app-local.
- Extract only generic lifecycle/scheduler pieces.
- Add graph checks that fail if new runtime cycles cross package boundaries.

### Cluster 2: Combat, AI, Spatial, LOD, NPC Rendering

Files:

- `src/systems/combat/**`
- `src/config/CombatantConfig.ts`
- `src/config/FactionCombatTuning.ts`
- `src/systems/world/billboard/**`
- Pixel Forge NPC runtime hooks inside combat renderer/factory.

Current role:

- NPC state, AI, targeting, damage, hit detection, spawning, squads, spatial index, LOD, Pixel Forge close/far rendering, player-squad commands, rally points, influence maps.

Good:

- Strong internal documentation.
- Behavior tests are deep.
- Many hot-path protections exist: spatial grid, LOD cadence, ray budgets, cover budgets, pooled effects, hit proxy centralization.
- Actor height contract and hitbox contract are exactly the kind of facts that should be centralized.

Bad:

- Combat is a facade plus service locator.
- It depends on terrain, navmesh, ticketing, zone state, HUD, audio, player health, player suppression, sandbags, smoke, asset loader, billboard renderer, and event bus.
- `combat/types.ts` has become a global domain dependency.

Ugly:

- Combat is in the largest runtime cycle with world/player/UI.
- The OOP object map may not meet the 3,000-agent vision.

Recommendation:

- Do not package the folder.
- Extract pure domain math and spatial primitives first.
- Treat the ECS/data-oriented decision as a packageability prerequisite for large-scale combat.

### Cluster 3: Terrain, Navigation, World Features, Airfields

Files:

- `src/systems/terrain/**`
- `src/systems/navigation/**`
- `src/workers/terrain.worker.ts`
- `src/workers/navmesh.worker.ts`
- `src/systems/world/WorldFeatureSystem.ts`
- `src/systems/world/AirfieldLayoutGenerator.ts`
- `src/systems/world/FirebaseLayoutGenerator.ts`

Current role:

- Height source setup, terrain render streaming, vegetation scatter, CDLOD, terrain queries/raycast, navmesh generation, feature compilation, airfield/firebase/building placement.

Good:

- Real-world DEM support and asset-manifest hard failure are strong.
- Height provider/stamp abstractions are valuable.
- Static-tiled navmesh generation is the right direction for A Shau.
- Draw-call optimized world features are practical.

Bad:

- Terrain render, data, query, collision, vegetation, and feature application are still entangled.
- `HeightQueryCache` remains a compatibility global.
- World feature LOS registration uses a side channel.
- Airfield surface truth remains split.

Ugly:

- Terrain and world feature compiler have a runtime import cycle.
- A Shau nav connectivity is not the same as NPC route quality or taxi/takeoff usability.

Recommendation:

- Extract terrain data/math before render runtime.
- Complete airfield surface authority before packaging any airfield/world-feature runtime.

### Cluster 4: Player, Input, Camera, First-Person Weapon

Files:

- `src/systems/player/**`
- `src/systems/input/**`
- `src/ui/controls/**`
- `src/systems/player/weapon/**`

Current role:

- Human player state, movement, pointer lock, camera rigs, weapon model/firing, vehicle session calls, inventory/loadout, respawn/deploy, touch controls, gamepad input, suppression/health effects.

Good:

- The weapon pipeline has good internal naming.
- `VehicleSessionController` cleaned up a real drift problem.
- Touch controls increasingly read presentation state rather than inventing gameplay state.

Bad:

- `PlayerController` is too central.
- Input context, HUD state, weapon state, vehicle session, and respawn state cross frequently.
- Some global managers (`InputContextManager`, `SettingsManager`) create hidden process-level state.

Ugly:

- Player/world/UI/combat runtime cycle blocks package extraction.
- `IPlayerController` is too broad for a stable reusable interface.

Recommendation:

- First package small pieces: movement math, camera rigs, weapon command builder.
- Do not package player controller or touch controls until they consume explicit DTOs and ports.

### Cluster 5: Vehicles, Air Support, Aircraft Presentation

Files:

- `src/systems/vehicle/**`
- `src/systems/helicopter/**`
- `src/systems/airsupport/**`
- airfield pieces in `src/systems/world/**`

Current role:

- Fixed-wing sim/control/model/adapter, helicopter physics/model/interaction/weapons/audio, vehicle session, NPC pilots, air support missions, AA emplacements.

Good:

- Session authority is much clearer than older state.
- Airframe is a real reusable candidate.
- Fixed-wing probes are a high-value behavior gate.
- Visibility culling for air vehicles is a good precedent.

Bad:

- Full vehicle runtime is not separated from scene graph, terrain, player, input, HUD, and airfield metadata.
- Air support has mixed movement models.
- Human feel gates are still open.

Ugly:

- Airfield staging/terrain authority can make flight bugs look like physics bugs.

Recommendation:

- Package `Airframe` after feel and airfield decisions.
- Keep models/adapters/air support app-local.

### Cluster 6: UI, HUD, Screens, Maps, Debug Panels

Files:

- `src/ui/**`
- `src/ui/engine/**`
- `src/ui/hud/**`
- `src/ui/map/**`
- `src/ui/minimap/**`
- `src/ui/debug/**`

Current role:

- Title/mode/deploy flow, HUD, weapon UI, touch controls, minimap/full map, debug overlays, live tuning, free-fly/entity inspector, mobile UI.

Good:

- UIComponent lifecycle is a good package candidate.
- HUD layout/presentation controller is moving in the right direction.
- Debug tooling is useful and increasingly organized.

Bad:

- UI imports gameplay systems directly in many places.
- Raw DOM and UIComponent coexist.
- Full map/minimap participate in runtime cycles through direct combat/zone/war sim access.

Ugly:

- A reusable UI library cannot depend on `CombatantSystem`, `ZoneManager`, or `WarSimulator`.

Recommendation:

- Package UI primitives only.
- Convert gameplay UI to presentation snapshots.

### Cluster 7: Assets, Rendering, Pixel Forge Cutover

Files:

- `src/systems/assets/**`
- `src/config/pixelForgeAssets.ts`
- `src/config/vegetationTypes.ts`
- `src/systems/world/billboard/**`
- `public/assets/pixel-forge/**`
- `scripts/validate-pixel-forge-cutover.ts`

Current role:

- Texture/model loading, model optimization, vegetation impostors, Pixel Forge NPC assets, cutover guards.

Good:

- Operational guardrails are strong.
- Model loader and optimizer are valuable.
- Manifest-backed assets are the correct direction.

Bad:

- Asset config is game-specific.
- Runtime mapping of factions/clips/species is not generic.
- Vegetation remains billboard/impostor-only; close LOD decision is not done.

Ugly:

- Asset pipelines can look packageable before their render contracts are settled. Do not package bad art workarounds as a reusable asset system.

Recommendation:

- Package model loading/optimization separately.
- Keep Pixel Forge runtime mappings app-local until schemas stabilize.

### Cluster 8: Tools, CI, Deploy, Probes

Files:

- `scripts/**`
- `.github/workflows/**`
- `cloudflare/**`
- `public/_headers`, `public/_redirects`, `public/sw.js`

Current role:

- Type/lint/test/build gates, perf captures, fixed-wing probes, HUD/state/mobile checks, Cloudflare Pages/R2 asset manifest, production smoke.

Good:

- The repo has rare, valuable runtime evidence discipline.
- Perf/retail build split is correct.
- Deploy freshness is explicit through manifest/header checks.

Bad:

- Scripts are big and app-specific.
- Broad `window.__engine` access is useful but not a stable API.

Ugly:

- Harness code can become a parallel product that nobody wants to maintain unless probe APIs are narrowed.

Recommendation:

- Keep tools internal.
- Productize narrow diagnostic APIs before packaging tooling.

## Key Dependency Problems To Fix Before Packages

### 1. Concrete Types In Shared Interfaces

Problem:

- Shared fenced interfaces import concrete game classes and domain enums.

Impact:

- Any package consuming the "interface" package would also depend on combat, player, UI, helicopter, vehicle, weapons, and world classes.

Fix:

- Create a future `ports` layer with DTOs:
  - `VectorLike` or explicit dependency on Three.js only where justified.
  - `ActorMode`, `VehicleUiSnapshot`, `WeaponUiSnapshot`, `TerrainQueryPort`, `AudioPort`.
  - No concrete `CombatantSystem`, `HUDSystem`, `PlayerController`, `ZoneManager`.

### 2. Runtime Cycles Across Gameplay Domains

Problem:

- Combat, world, player respawn, map UI, and ticket systems import one another in a 46-file cycle.

Impact:

- You cannot package one without pulling the rest.
- Refactors can break in non-local ways.

Fix:

- Introduce read models:
  - combat publishes `CombatSnapshot`.
  - world publishes `ObjectiveSnapshot`.
  - player publishes `PlayerSnapshot`.
  - UI consumes snapshots, not live systems.
- Mutations should flow through commands/events, not cross-system reach-in.

### 3. Session-Global Singletons

Problem:

- `GameEventBus`, `spatialGridManager`, `HeightQueryCache`, `performanceTelemetry`, `objectPool`, `InputContextManager`, `ViewportManager`, and `SettingsManager` are process/session globals.

Impact:

- Package consumers cannot create two worlds cleanly.
- Tests need reset discipline.
- Hidden state undermines agent workflows.

Fix:

- Convert packages to factories.
- Keep app-level singleton wrappers where convenient.

### 4. Mixed State Ownership

Problem:

- Some state is now single-owner, but several ownership boundaries remain incomplete:
  - terrain query authority,
  - airfield surface authority,
  - combat spatial/session storage,
  - HUD presentation state,
  - probe/private runtime access.

Impact:

- Packaging would preserve ambiguity.

Fix:

- Finish ownership cycles before extraction.

### 5. Product-Specific Runtime And Generic Runtime Are Interleaved

Problem:

- Many valuable algorithms live inside game-specific systems.

Examples:

- Airframe core is inside a fixed-wing model pipeline.
- Terrain stamp math is inside game startup/feature compilation.
- UI lifecycle is inside gameplay UI folder.
- Effect pooling is inside weapon/combat visuals.

Fix:

- Extract from the inside out: pure algorithm first, facade second, adapter third.

## Recommended Package Roadmap

### Phase 0: Freeze The Architecture Baseline

Goal:

- Prevent new package-blocking coupling while extraction work begins.

Actions:

- Add a dependency graph script that reports:
  - runtime cycles,
  - type-only cycles,
  - forbidden cross-domain imports,
  - new singleton exports.
- Fail only on newly introduced violations at first.
- Keep current violations as a baseline file.

### Phase 1: Extract Low-Risk Infrastructure

Candidate packages:

- `@game-field-kits/event-bus`
- `@game-field-kits/frame-scheduler`
- `@game-field-kits/dom-ui-core`
- `@game-field-kits/three-effect-pool`
- `@game-field-kits/three-model-optimizer`
- `@game-field-kits/math-utils`

Rules:

- No game mode imports.
- No combat/player/world imports.
- No global singleton exports from the package.
- Every package gets a tiny example and focused tests.

### Phase 2: Build A Real Ports Layer

Candidate package:

- `@game-field-kits/ports`

Contents:

- `GameSystem`
- `TerrainQueryPort`
- `SkyRuntimePort`
- `AudioPort`
- `PresentationSnapshot` shapes
- vehicle session DTOs
- command/event shapes

Non-contents:

- `CombatantSystem`
- `PlayerController`
- `HUDSystem`
- `ZoneManager`
- any app concrete class

### Phase 3: Extract Terrain/Data And Asset/Render Cores

Candidate packages:

- `@game-field-kits/terrain-height-core`
- `@game-field-kits/nav-core`
- `@game-field-kits/animated-impostor-runtime`
- `@game-field-kits/asset-manifest-core`

Prerequisites:

- `HeightQueryCache` replaced or wrapped as app-local compatibility.
- Terrain providers are instance-based.
- Nav obstacle/features are DTOs.
- Animated impostor schema is independent of Pixel Forge faction names.

### Phase 4: Carve Gameplay Read Models

Goal:

- Break the 46-file runtime cycle.

Actions:

- UI reads snapshots.
- World and combat communicate through commands/events.
- Respawn/deploy flow gets a narrow service API.
- `GameModeManager` becomes data resolution plus app-local command application.

### Phase 5: Decide Combat Storage

Goal:

- Avoid packaging a combat architecture that cannot meet the project vision.

Actions:

- Run the ECS/data-oriented spike described in `docs/REARCHITECTURE.md`.
- If data-oriented storage wins, package combat domain and systems around that.
- If OOP stays, explicitly scope the package to small/medium tactical combat and keep the 3,000-agent strategy layer separate.

### Phase 6: Extract Vehicle Cores

Candidate packages:

- `@game-field-kits/airframe-core`
- `@game-field-kits/vehicle-session`

Prerequisites:

- Human flight feel sign-off.
- Airfield surface authority.
- Model/HUD/input adapters separated from sim/control law.

## Practical Cut Lines

If you want reusable packages without blowing up the game, start here.

### Package 1: `@game-field-kits/three-model-optimizer`

Move:

- `ModelDrawCallOptimizer.ts`
- model placement utility types only if needed.

Do not move:

- `WorldFeatureSystem`
- app model path catalogs.

Why first:

- High value, low gameplay risk, clean dependency on Three.js.

### Package 2: `@game-field-kits/dom-ui-core`

Move:

- `UIComponent`
- `FocusTrap`
- responsive manager after factory conversion
- primitive CSS/token utilities if they are not game branded.

Do not move:

- HUD widgets
- minimap
- full map
- touch controls.

Why second:

- Useful across projects and teaches the extraction pattern.

### Package 3: `@game-field-kits/terrain-height-core`

Move:

- height provider interfaces
- DEM/baked/noise providers
- stamped height provider
- stamp grid baker
- slope/normal helpers.

Do not move:

- `TerrainSystem`
- `VegetationScatterer`
- CDLOD renderer yet.

Why third:

- Valuable, but needs a clean instance-based query service.

### Package 4: `@game-field-kits/airframe-core`

Move:

- `Airframe`
- airframe config/command/state types
- terrain probe interface.

Do not move yet:

- `FixedWingModel`
- `FixedWingPlayerAdapter`
- HUD/probe scripts.

Why fourth:

- It is one of the most reusable pieces, but only after the product feel and airfield authority decisions stop shifting.

## What I Would Not Package In 2026-Q2

- `CombatantSystem`
- `PlayerController`
- `HUDSystem`
- `GameModeManager`
- `WorldFeatureSystem`
- `AirSupportManager`
- `FullMapSystem`
- `TerrainSystem` as a whole
- `FixedWingModel`
- `HelicopterModel`

These are not bad systems. They are product integration systems. Package extraction would make them harder to evolve.

## What I Really Think

The repo is healthier than its size suggests. It has a lot of agent-made drift, but it also has unusually good recovery discipline: current-state docs, validation scripts, perf captures, browser probes, and a willingness to retire stale claims. That matters. Many indie projects with this much scope have no way to tell whether they are improving or just rearranging code.

The main architectural mistake would be trying to turn today's folders into packages. Folder boundaries are not package boundaries. A package boundary needs:

- no app-specific concrete imports,
- no hidden singleton state,
- clear input/output DTOs,
- tests that prove behavior without the whole game,
- a reason to exist outside this repo.

Right now, the best reusable systems are inside the game, not at the folder edges. Extract the small kernels first. Leave the big gameplay facades alone until dependency direction is fixed.

The strongest strategic bet is to keep shipping the game while gradually creating package-grade cores. Do not pause the project for a giant engine rewrite. Instead, make every recovery cycle produce one cleaner boundary. After a few cycles, you will have enough clean cores to package without guessing.

## Highest-Leverage Next Actions

1. Add dependency graph reporting and baseline the current cycles.
2. Start `@game-field-kits/three-model-optimizer` as the first low-risk extraction.
3. Create a no-concrete-import `ports` draft, but do not swap the whole repo at once.
4. Convert UI map/minimap/HUD consumers toward snapshots.
5. Replace `HeightQueryCache` and `spatialGridManager` package-facing usage with explicit instances.
6. Finish airfield surface authority before touching vehicle packaging.
7. Run the combat data-oriented spike before packaging combat.

## Short System Scorecard

| System | Quality | Package readiness | Main blocker |
|---|---|---|---|
| Core scheduler/update metadata | good | high | game-specific phase config |
| Game event bus | good | medium | singleton/global event map |
| System initializer/connector | useful app shell | low | concrete app graph |
| Fenced interfaces | useful anti-drift | low | concrete imports, huge surfaces |
| Terrain providers/stamps | good | medium-high | global cache cleanup |
| Full terrain runtime | valuable | medium-low | too many responsibilities |
| Navmesh core | valuable | medium | game startup/feature coupling |
| Combat domain helpers | good | medium | global domain bucket |
| CombatantSystem | strong game system | low | runtime cycle, OOP scale limit |
| AI state handlers | useful | low-medium | coupled to live combat objects |
| Spatial grid/octree | useful | medium | singleton compatibility |
| Pixel Forge NPC renderer | valuable | low-medium | game art/faction coupling |
| Player movement core | useful | medium | global terrain fallback |
| PlayerController | product integration | low | too many responsibilities |
| FirstPersonWeapon core | good | medium | scene/HUD/combat coupling |
| GunplayCore/ShotCommand | good | high | isolate from presentation |
| VehicleSessionController | good | medium | game-specific context types |
| Airframe | good | medium-high | feel/airfield decisions |
| FixedWingModel | product integration | low | scene/player/HUD/terrain coupling |
| Helicopter physics | good game subsystem | medium | model/HUD/game coupling |
| AirSupportManager | product integration | low | mixed mission authorities |
| ModelDrawCallOptimizer | good | high | generalize preserve predicates |
| AssetLoader | app-specific | low-medium | hard-coded asset list |
| UIComponent/FocusTrap | good | high | singleton responsive manager |
| HUDSystem | product integration | low | broad game facade |
| FullMap/Minimap | useful game UI | low | imports live gameplay systems |
| Audio pools | useful | medium-low | event/config coupling |
| Atmosphere backend | good | medium | renderer side effects/art status |
| Perf/probe harness | excellent internal product | medium-low | broad private engine access |



