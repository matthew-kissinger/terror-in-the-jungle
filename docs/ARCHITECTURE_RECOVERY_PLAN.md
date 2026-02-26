# Architecture Recovery Plan

Last updated: 2026-02-26
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
| P5 | Terrain/chunk lifecycle bounded work | TODO | Keep chunk generation/merge costs under frame budget at large map scale. |

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
- Keep: ZoneTerrainAdapter.setChunkManager() no-op removed (uses HeightQueryCache).
- Keep: createUH1HueyGeometry() legacy wrapper removed (createHelicopterGeometry is the API).
- Keep: FirstPersonWeapon.setEnemySystem() deprecated stub removed.
- Keep: HUDElements.combatStats placeholder div removed (was hidden, never updated).
- Keep: ObjectiveDisplay.ticketDisplay dead property removed (real TicketDisplay is UIComponent).
- Keep: RespawnButton module + HUDElements.respawnButton removed (never mounted to layout; RespawnUI has its own button).
- Keep: 20 dead interfaces removed from SystemInterfaces.ts (never imported). 9 used interfaces retained.
- Keep: HUDUpdater forwarding layer eliminated; HUDSystem calls UIComponents directly. HUDZoneDisplay owned by HUDSystem. Bleed text logic inlined.
- Keep: 29 mock-wiring/setter-propagation tests deleted from CombatantAI.test.ts; 40 behavioral tests retained (suppression decay, movement callouts, squad command overrides).
- Keep: VoiceCalloutSystem.test.ts deleted (1 trivial test for disabled system).
- Keep: UI_ENGINE_PLAN.md archived to docs/archive/ (completed project, 1302 lines).
- Keep: PROFILING_HARNESS.md updated with perf:quick, perf:compare, perf:update-baseline commands; stale spatial feature flag env vars removed.

## Deferred Decisions

(None active.)

## Open Risks

- High-intensity runs can still show heap growth warnings.
- A/B startup variance can hide small wins/losses.
- ZoneManager no longer falls back to linear scan if spatial query returns empty; if SpatialGridManager has sync bugs, zone capture may stall.

## Required Evidence For Major Changes

- One matched throughput pair (`combat120`) with comparable startup quality.
- One soak run (`frontier30m`) when change targets memory/stability.
- Behavior validation (shots/hits, objective flow, no freeze/teleport artifacts).

## Next Execution Slice

1. Isolate retained heap growth sources with focused captures and subsystem counters.
2. Complete A Shau contact-flow loop so player reaches and sustains skirmish pressure without harness warps.
3. Re-baseline and lock regression checks after each accepted change.

## Update Rule

Any accepted architecture change must update:
- this file (decision + risk impact), and
- `docs/PROFILING_HARNESS.md` if capture semantics changed.
