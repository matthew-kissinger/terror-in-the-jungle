# Architecture Recovery Plan

Last updated: 2026-03-04
Scope: runtime architecture stabilization with performance and gameplay fidelity gates.

## Current Goal

- Deliver stable large-scale combat with consistent frame tails.
- Stabilize A Shau mode flow so it is testable and tactically coherent.

## Priority Board

| Priority | Workstream | Status | Notes |
|---|---|---|---|
| P0 | Harness integrity and measurement quality | IN_PROGRESS | Startup contamination and observer overhead still require careful run discipline. |
| P1 | Spatial ownership unification (F3) | DONE | Legacy SpatialOctree removed from CombatantSystem. All consumers (AI, LOD, spawn, hit detection) use SpatialGridManager singleton. Secondary sync and dedup feature flags removed. |
| P2 | Heap growth triage in combat-heavy runs | IN_PROGRESS | New diagnostics added; source still mixed between transient waves and retained growth. |
| P3 | A Shau gameplay flow and contact reliability | IN_PROGRESS | Immediate contact improved; sustained close-contact remains inconsistent. |
| P4 | UI/HUD update budget discipline | DONE | UI Engine Phases 0-7 complete. 11 UIComponents migrated to CSS Modules + signals. Grid layout with 17 named slots. VisibilityManager wired. All touch controls on pointer events as UIComponent subclasses. UnifiedWeaponBar replaces 3 duplicates. Renderer subscribes to ViewportManager. 12 dead component files + 7 dead style files deleted. |
| P5 | Terrain runtime stabilization | IN_PROGRESS | Terrain rewrite is active under `TERRAIN_REWRITE_MASTER_PLAN.md`: world-size authority, truthful terrain API, biome/vegetation runtime wiring, terrain block-boundary cleanup, and large-world startup cost reduction validated in preview smoke. |

## Keep Decisions (Recent)

- Keep: CSS Grid HUD layout (`#game-hud-root`) with 17 named slots replacing 33+ position:fixed elements.
- Keep: UnifiedWeaponBar (single weapon UI for desktop + touch, replaces TouchWeaponBar + InventoryManager hotbar + WeaponAmmoDisplay).
- Keep: pointer events (pointerdown/up/cancel + setPointerCapture) on all touch controls, replacing touch events (zero touchstart/end/move listeners remain in controls).
- Keep: VisibilityManager drives HUD visibility via data attributes on #game-hud-root; CSS rules respond to data-phase, data-vehicle, data-ads, data-device, data-layout.
- Keep: data-show="infantry" on weapon-bar and action-btns slots (hidden in helicopter via CSS rule).
- Keep: score/touch/gameplay HUD ownership under `#game-hud-root` instead of direct gameplay body mounts.
- Keep: `InputManager` + `InputContextManager` as central gameplay action gate for map/menu/modal contexts.
- Keep: single compact fullscreen prompt on mobile entry (auto-fades 6s); landscape prompt removed as redundant (Deploy tap auto-enters fullscreen + locks landscape).
- Keep: squared-distance and allocation reductions in spatial queries.
- Keep: AI target acquisition scratch-buffer reuse.
- Keep: heap validation expansion (`growth`, `peak`, `recovery`) in harness output.
- Keep: Single SpatialGridManager as sole spatial owner. Legacy SpatialOctree direct usage removed from CombatantSystem and all sub-modules.
- Keep: ISpatialQuery interface for AI state handlers (decouples AI from concrete spatial implementation).
- Keep: spatialGridManager injected through SystemReferences in core orchestration (SystemInitializer, SystemConnector, SystemUpdater).
- Keep: DayNightCycle removed entirely (conflicted with WeatherSystem; rebuild if needed for night modes).
- Keep: LoadingScreen facade deleted; GameEngine uses StartScreen directly.
- Keep: gameModes.ts barrel re-exports removed; consumers import from gameModeTypes.ts or specific config files.
- Keep: HUDElements.attachToDOM() requires HUDLayout (no body-mount fallback).
- Keep: WeaponFiring.fire() deprecated method + fireSingleShot/fireShotgunPellets removed; executeShot() is the sole API.
- Keep: ZoneManager spatial query resilience fallback removed; SpatialGridManager is trusted as sole spatial authority.
- Keep: ZoneTerrainAdapter no longer carries terrain-manager setter baggage; it uses canonical terrain height queries directly.
- Keep: createUH1HueyGeometry() legacy wrapper removed (createHelicopterGeometry is the API).
- Keep: FirstPersonWeapon.setEnemySystem() deprecated stub removed.
- Keep: HUDElements.combatStats placeholder div removed (was hidden, never updated).
- Keep: ObjectiveDisplay.ticketDisplay dead property removed (real TicketDisplay is UIComponent).
- Keep: RespawnButton module + HUDElements.respawnButton removed (never mounted to layout; RespawnUI has its own button).
- Keep: 20 dead interfaces removed from SystemInterfaces.ts (never imported). 9 used interfaces retained.
- Keep: HUDUpdater forwarding layer eliminated; HUDSystem calls UIComponents directly. HUDZoneDisplay owned by HUDSystem. Bleed text logic inlined.
- Keep: Per-aircraft physics config (AircraftConfigs.ts). Each aircraft type (UH1_HUEY, UH1C_GUNSHIP, AH1_COBRA) has distinct mass, lift, agility, speed, damping. HelicopterPhysics constructor accepts AircraftPhysicsConfig.
- Keep: Helicopter interaction uses findNearestHelicopter() instead of hardcoded 'us_huey' key (fixed post-multi-helipad migration).
- Keep: Unoccupied airborne helicopters continue physics simulation (gravity pulls them down). Grounded unoccupied helicopters skip physics.
- Keep: HUD RPM reads from HelicopterPhysics.engineRPM (real spool-up/down) instead of fake formula.
- Keep: HelicopterGeometryParts.ts deleted (307 lines of unused procedural cockpit/door-gun geometry; GLBs are the source).
- Keep: HelicopterModel.getControlInputs() dead method removed (returned empty object; controls flow through PlayerMovement.setHelicopterControls).
- Keep: 29 mock-wiring/setter-propagation tests deleted from CombatantAI.test.ts; 40 behavioral tests retained (suppression decay, movement callouts, squad command overrides).
- Keep: VoiceCalloutSystem.test.ts deleted (1 trivial test for disabled system).
- Keep: UI_ENGINE_PLAN.md archived to docs/archive/ (completed project, 1302 lines).
- Keep: PROFILING_HARNESS.md updated with perf:quick, perf:compare, perf:update-baseline commands; stale spatial feature flag env vars removed.
- Keep: terrain startup no longer double-rebakes the render surface at mode start after a world-size change; `GameEngineInit` now lets `setWorldSize()` own that rebake path.
- Keep: large-world terrain surface bake budget is scale-aware instead of fixed. `TerrainSurfaceRuntime` now reduces the render-only bake grid at A Shau scale from `1024` to `512`, while gameplay height authority remains on `HeightQueryCache`.
- Keep: `TerrainRaycastRuntime` no longer computes unused vertex normals for the near-field LOS mesh.
- Keep: loading/start-screen asset URLs are base-aware; root-relative screen asset paths that produced preview/Page `404`s were removed.
- Keep: CDLODQuadtree `range * 1.5` early-return removed. The skip created coverage holes when a parent subdivided but children fell outside `childRange * 1.5`, leaving terrain patches invisible (collision and vegetation still worked via HeightQueryCache). Every node now must either emit or subdivide.
- Keep: World boundary enforcement now reads playable bounds explicitly from `ITerrainRuntime.getPlayableWorldSize()` in `PlayerMovement.updateMovement()` and `HelicopterModel.updateHelicopterPhysics()`. Boundary hit bounces velocity inward at 50% strength. Playable bounds are now a first-class contract instead of a compatibility path over `getWorldSize()`.
- Keep: Terrain visual overflow is now an explicit mode/runtime setting (`visualMargin`) instead of a duplicated hardcoded constant. `TerrainRenderRuntime` inflates the CDLOD quadtree by the configured margin, while `TerrainSystem` exposes `getVisualMargin()` / `getVisualWorldSize()` for runtime clarity. Margin tiles still sample clamped heightmap UVs (explicit `clamp()` in vertex shader + `ClampToEdge` wrapping), extending edge terrain seamlessly.
- Keep: `TerrainMaterial.applyTerrainMaterialOptions()` updates existing shader uniform values in place (not replacing objects) on subsequent calls to preserve compiled shader references. First call creates uniforms and sets up `onBeforeCompile`; later calls only update `.value` fields.
- Keep: Vegetation cell bounds check in `VegetationScatterer.generateCell()` limits scatter to `worldHalfExtent + visualMargin`, matching the terrain render overflow. Player can't walk there; it's visual filler only.
- Keep: Helipad creation no longer has a synthetic fallback pad. Vehicle systems only activate when the active `GameModeConfig` explicitly declares `helipads`. Modes that omit helipads pay zero hidden vehicle cost and no longer mask config errors.

## Deferred Decisions

(None active.)

## Open Risks

- High-intensity runs can still show heap growth warnings.
- A/B startup variance can hide small wins/losses.
- ZoneManager no longer falls back to linear scan if spatial query returns empty; if SpatialGridManager has sync bugs, zone capture may stall.
- The immediate A Shau terrain-startup spike has improved in preview smoke, but this is not yet a substitute for broader perf-harness evidence under sustained combat and camera motion.

## Required Evidence For Major Changes

- One matched throughput pair (`combat120`) with comparable startup quality.
- One soak run (`frontier30m`) when change targets memory/stability.
- Behavior validation (shots/hits, objective flow, no freeze/teleport artifacts).

## Next Execution Slice

1. Isolate retained heap growth sources with focused captures and subsystem counters.
2. A Shau sustained contact pressure improved (2026-03-03): StrategicDirector biases zone scoring toward player (1.5km radius, +3.0 score), AbstractCombatResolver reduces kill rate within 1km of player (30% multiplier), reinforcements spawn at forward-owned zones near player. Needs live validation.
3. Re-baseline and lock regression checks after each accepted change. Deploy now gated on CI (lint+test+build). `perf:compare` wired into perf-check.yml workflow.
4. Keep terrain rewrite progress aligned with `TERRAIN_REWRITE_MASTER_PLAN.md`; do not reintroduce chunk-era semantics into active runtime code. T-006 (CDLOD LOD transitions) done: XZ morphing in vertex shader, wireframe debug toggle.
5. Re-run matched perf captures after the terrain startup-path changes so the recovery plan has sustained evidence, not just preview smoke evidence.

## Update Rule

Any accepted architecture change must update:
- this file (decision + risk impact), and
- `docs/PROFILING_HARNESS.md` if capture semantics changed.
