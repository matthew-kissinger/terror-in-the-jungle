# Architecture Recovery Plan

Last updated: 2026-03-06
Scope: runtime architecture stabilization with performance and gameplay fidelity gates.

## Current Goal

- Deliver stable large-scale combat with consistent frame tails.
- Stabilize A Shau mode flow so it is testable and tactically coherent.

## Progress Checkpoint (2026-03-04, Evening)

- Harness fidelity has materially improved: duplicate player-death accounting is fixed, long-run ammo sustain is explicit, and required scenarios are behavior-valid.
- Architecture risk has shifted from "measurement reliability" to "tail closure":
  - `combat120` still fails on p99/starvation despite better average frame time and stronger combat pressure.
  - `frontier30m` still fails on long-tail stability while mean frame time remains healthy.
- Strategic posture is unchanged: continue low-friction, evidence-backed CPU/harness work first; hold frontier block replacements (WebGPU/WASM/worker architecture shifts) until tail gates are met.

## Priority Board

| Priority | Workstream | Status | Notes |
|---|---|---|---|
| P0 | Harness integrity and measurement quality | IN_PROGRESS | Required Phase 1 scenarios are behavior-valid. Duplicate HUD death accounting and long-run ammo depletion in active-driver runs were fixed on 2026-03-04. Remaining gap: `systemTop` is still secondary to `userTimingByName` for authoritative tick-group analysis. |
| P1 | Spatial ownership unification (F3) | DONE | Legacy SpatialOctree removed from CombatantSystem. All consumers (AI, LOD, spawn, hit detection) use SpatialGridManager singleton. Secondary sync and dedup feature flags removed. |
| P2 | Heap growth triage in combat-heavy runs | IN_PROGRESS | New diagnostics added. Latest Phase 2 evidence still points to churn-heavy waves rather than a proven unbounded leak. A frame-local `AITargetAcquisition` neighborhood cache improved warm `combat120` starvation (`16.82 -> 12.91`) and heap growth (`15.73MB -> 3.64MB`). A second accepted March 4 optimization in `AIStateEngage.initiateSquadSuppression()` (flank-probe elevation + probe allocation cleanup) reduced warm combat tails/stalls again (`Combat.maxDurationMs 259.7ms -> 218.6ms/182.3ms`, long tasks `74 -> 47/31`), but rare p99 spikes still appear in some runs. |
| P3 | A Shau gameplay flow and contact reliability | IN_PROGRESS | Short harness capture is now behavior-valid (`270` shots / `150` hits on 2026-03-04). Remaining work is performance analysis, not basic contact acquisition. |
| P4 | UI/HUD update budget discipline | DONE | UI Engine Phases 0-7 complete. 11 UIComponents migrated to CSS Modules + signals. Grid layout with 17 named slots. VisibilityManager wired. All touch controls on pointer events as UIComponent subclasses. UnifiedWeaponBar replaces 3 duplicates. Renderer subscribes to ViewportManager. 12 dead component files + 7 dead style files deleted. |
| P5 | Terrain runtime stabilization | IN_PROGRESS | Terrain rewrite is active under `TERRAIN_REWRITE_MASTER_PLAN.md`: world-size authority, truthful terrain API, biome/vegetation runtime wiring, terrain block-boundary cleanup, and large-world startup cost reduction validated in preview smoke. Phase 2 warm captures still show terrain max-duration spikes of `849.6ms` (`open_frontier`), `869.7ms` (`frontier30m`), and `2225.2ms` (`a_shau_valley`). March 6 fix: half-texel UV correction in vertex shader eliminates render/collision/vegetation positional drift (up to 3.1m at map edges for Open Frontier). |

## Keep Decisions (Recent)

- Keep: `ZoneState.BLUFOR_CONTROLLED` (renamed from `US_CONTROLLED`). All zone ownership now uses alliance-level naming. 23 files updated.
- Keep: `TicketDisplay.setFactionLabels()` for dynamic HUD faction names derived from `factionMix` config. `GameEngineInit.applyLaunchSelection()` resolves labels at mode start.
- Keep: Helipad spawn points wired into `PlayerRespawnManager` for Open Frontier. BLUFOR players see helipads as spawn options; frontier deploy flow prefers helipad_main.
- Keep: Graduated supermajority zone bleed in `TicketBleedCalculator`: 70%+ control = 1.5x multiplier, 100% = 3x (was flat 2x).
- Keep: TDM kill-target urgency in `TicketDisplay`: 75% threshold = amber pulse, 90% = red pulse. Reuses existing `.low`/`.critical` CSS classes.
- Keep: Death presentation: 6s ground persistence (was 4s), 2s fadeout (was 1s), ground-sinking replaces scale-to-zero.
- Keep: `GameModeManager.applyModeConfiguration()` uses `objective.kind === 'deathmatch'` policy check instead of hardcoded `GameMode.TEAM_DEATHMATCH` comparison.
- Keep: `SystemConnector` split into 11 named private methods (`wirePlayer`, `wireCombat`, `wireHUD`, etc.) for dependency graph readability.
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
- Keep: frame-local AI neighborhood cache in `AITargetAcquisition`; patrol/defend cluster-density checks now reuse the widest per-combatant spatial query issued that frame.
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
- Keep: repo-tracked perf baselines now cover the active Phase 1 scenario set (`combat120`, `openfrontier:short`, `ashau:short`, `frontier30m`). `perf:baseline` is now a compatibility wrapper over `perf-compare --update-baseline`, `validate:full` runs `combat120`, and CI checks `summary.json` from the committed regression scenario instead of the stale `capture-summary.json` path.
- Keep: `GameModeManager.applyModeConfiguration()` reviewed and accepted as thin coordinator (94 lines, 8 systems, null-guarded setter calls). Moving config into individual systems would couple them to `GameModeConfig`. `GameModeRuntime.onEnter()` hook exists for mode-specific custom logic.
- Keep: Zone dominance bar in `HUDZoneDisplay` showing faction control ratio (BLUFOR/contested/OPFOR percentages) with colored track and summary label ("2 HELD / 1 CONTESTED / 4 HOSTILE").
- Keep: Priority-sorted zone display capped at 5 visible zones (contested first, then player-owned-under-attack, then nearest). Overflow label shows "+N more zones" count. Solves A Shau 15-zone HUD overload.
- Keep: terrain startup no longer double-rebakes the render surface at mode start after a world-size change; `GameEngineInit` now lets `setWorldSize()` own that rebake path.
- Keep: large-world terrain surface bake budget is scale-aware instead of fixed. `TerrainSurfaceRuntime` now reduces the render-only bake grid at A Shau scale from `1024` to `512`, while gameplay height authority remains on `HeightQueryCache`.
- Keep (confirmed 2026-03-06): `maxLODLevels` is now auto-scaled from world size via `computeMaxLODLevels()` in `TerrainConfig.ts`. At 4 fixed LOD levels, Open Frontier (3200m) had 225m LOD 0 tiles with 7m vertex spacing; the GPU mesh was too coarse to match the CPU heightmap (6.26m texel spacing), causing 1-10m render/collision divergence and floating vegetation/NPCs. Auto-scaling gives Open Frontier 5 levels (3.52m spacing), A Shau 8 levels (2.63m spacing). Heightmap grid for 1024-4095m worlds also increased from 512 to 1024 (4m/sample instead of 8m). TDM/ZC keep 4 levels (already fine).
- Keep: `TerrainRaycastRuntime` no longer computes unused vertex normals for the near-field LOS mesh.
- Keep: loading/start-screen asset URLs are base-aware; root-relative screen asset paths that produced preview/Page `404`s were removed.
- Keep: CDLODQuadtree `range * 1.5` early-return removed. The skip created coverage holes when a parent subdivided but children fell outside `childRange * 1.5`, leaving terrain patches invisible (collision and vegetation still worked via HeightQueryCache). Every node now must either emit or subdivide.
- Keep: World boundary enforcement now reads playable bounds explicitly from `ITerrainRuntime.getPlayableWorldSize()` in `PlayerMovement.updateMovement()` and `HelicopterModel.updateHelicopterPhysics()`. Boundary hit bounces velocity inward at 50% strength. Playable bounds are now a first-class contract instead of a compatibility path over `getWorldSize()`.
- Keep: Terrain visual overflow is now an explicit mode/runtime setting (`visualMargin`) instead of a duplicated hardcoded constant. `TerrainRenderRuntime` inflates the CDLOD quadtree by the configured margin, while `TerrainSystem` exposes `getVisualMargin()` / `getVisualWorldSize()` for runtime clarity. Margin tiles still sample clamped heightmap UVs (explicit `clamp()` in vertex shader + `ClampToEdge` wrapping), extending edge terrain seamlessly.
- Keep: `TerrainMaterial.applyTerrainMaterialOptions()` updates existing shader uniform values in place (not replacing objects) on subsequent calls to preserve compiled shader references. First call creates uniforms and sets up `onBeforeCompile`; later calls only update `.value` fields.
- Keep: Vegetation cell bounds check in `VegetationScatterer.generateCell()` limits scatter to `worldHalfExtent + visualMargin`, matching the terrain render overflow. Player can't walk there; it's visual filler only.
- Keep: Helipad creation no longer has a synthetic fallback pad. Vehicle systems only activate when the active `GameModeConfig` explicitly declares `helipads`. Modes that omit helipads pay zero hidden vehicle cost and no longer mask config errors.
- Keep: perf diagnostics are gated behind `import.meta.env.DEV` and `?perf=1`. Harness-only globals, renderer counters, and user-timing spans must stay out of production bundles.
- Keep: `GameRenderer` captures per-frame `renderer.info` stats for perf harness sampling; this is harness evidence, not shipping HUD/debug behavior.
- Keep: player death accounting is single-source in `PlayerHealthSystem`; `CombatantDamage` no longer applies a second HUD death increment for player-proxy lethal events.
- Keep: active perf driver sustain policy is bounded and behavior-preserving (respawn debounce, cooldown-based low-health top-up without spawn-protection refresh, and ammo refill guardrails).
- Keep: suppression-init cover-search budget is explicitly bounded in `AIStateEngage` (max 2 flank cover lookups per initiation) to constrain single-frame burst cost; promote to full perf-accepted status only after a clean warm A/B pair on the updated harness.
- Keep (confirmed 2026-03-06): low-overhead hotspot cleanup targeting read-side churn: `HeightQueryCache` uses numeric quantization keys with read-only hits and 20K default cache (up from 10K), `TerrainRaycastRuntime` reuses near-field geometry buffers when grid size is unchanged and uses 6m grid step (down from 4m, reducing rebuild from ~10K to ~4.5K height queries), `LOSAccelerator` no longer calls `performance.now()` per LOS query (5 calls removed from hot path), `HeightQueryCache.getNormalAt()` reuses scratch vector instead of per-call allocation, and `AIStateEngage` skips flank cover re-search when a flanker already has a nearby destination. Warm `combat120` matched pair confirms: p99 improved from 86.90ms to 30.9-35.3ms, AI starvation from 12.34 to 3.9-4.9, avg frame time from 14.17ms to 12.8-13.2ms.
- Keep: suppression flank-cover discovery remains in the suppression-init path only; a March 4 deferred recheck attempt in `AIStateMovement.ADVANCING` was reverted after warm captures increased hitch/AI-starvation risk without a clean pressure-matched win.
- Keep: `MaterializationPipeline` materializes nearest squads first so large-map scenarios establish combat around the player before distant squads consume the budget.
- Keep: `SpatialOctree` vertical world bounds scale with world size. Fixed Y bounds were invalid on mountainous maps and caused empty high-altitude hit-detection queries.

## Deferred Decisions

- Terrain architecture pivot evaluation deferred. Full research documented in `docs/TERRAIN_RESEARCH.md` covering CDLOD vs geoclipmaps vs GPU tessellation vs CBT, WebGPU compute-driven quadtree, virtual texturing, heightmap streaming, and fragment-level displacement. Current CDLOD + InstancedMesh + BakedHeightProvider architecture is at or above industry standard. Primary evolutionary path is WebGPU compute-driven quadtree when Three.js WebGPU matures (UBO fix, Safari stability). No code changes needed now.

## Open Risks

- High-intensity runs can still show heap growth warnings.
- A/B startup variance can hide small wins/losses; first capture after a fresh boot should be treated as cold-start data.
- ZoneManager no longer falls back to linear scan if spatial query returns empty; if SpatialGridManager has sync bugs, zone capture may stall.
- The immediate A Shau terrain-startup spike has improved in preview smoke, but this is not yet a substitute for broader perf-harness evidence under sustained combat and camera motion.
- `combat120` now has a valid harness run, but it fails on `peak_p99_frame_ms` and AI starvation. This is the clearest measured hotspot.
- Deep `combat120` capture localizes the worst tails to `CombatantAI.updateAI()` inside high-LOD full updates. March 4 diagnostic probes now show those nominal `suppressing` / `advancing` spikes are actually `AIStateEngage.handleEngaging()` work that transitions into those states.
- The accepted March 4, 2026 frame-local `AITargetAcquisition` cache reduced matched warm `combat120` starvation (`16.82 -> 12.91`), average frame time (`15.10ms -> 14.59ms`), and heap growth (`15.73MB -> 3.64MB`) under slightly higher combat pressure, but `peak_p99_frame_ms` still fails and `SystemUpdater.Combat.maxDurationMs` rose slightly (`224.4ms -> 233.6ms`).
- A March 4, 2026 attempt to disable friendly-spacing work on visual-only high-LOD frames was reverted. Two warm post-change runs lowered mean frame time slightly, but tails, stall totals, and AI-starvation signals worsened; one rerun also under-shot badly (`54 / 32` shots / hits).
- A March 4, 2026 attempt to reuse targets and throttle advancing threat reacquisition during flank movement was also reverted. The warm rerun improved mean frame time but reduced combat pressure sharply (`220 / 140 -> 90 / 53` shots / hits) while worsening hitch rate, combat dominance, long-task totals, and `SystemUpdater.Combat.maxDurationMs`.
- March 4, 2026 short diagnostic captures (`2026-03-04T18-35-30-494Z`, `2026-03-04T18-39-02-145Z`) localize the rare `CombatantAI` spikes to `AIStateEngage.initiateSquadSuppression()`. The inner spike logs are dominated by `suppression.initiate` `65-214ms`; source inspection shows this path synchronously runs `findNearestCover()` for each flanker, which is the leading candidate for the remaining combat tails.
- March 4, 2026 warm reruns after the suppression-init flank-probe cleanup (`2026-03-04T19-00-58-280Z`, `2026-03-04T19-03-09-563Z`) show lower combat tail/stall pressure than warm pre-control `2026-03-04T18-56-58-892Z`, but run-to-run combat pressure still varies (`shots/hits` drift), so acceptance remains evidence-backed but not yet final-tail closure.
- March 4, 2026 deferred flank-cover recheck attempt (`2026-03-04T23-35-55-753Z`, `2026-03-04T23-37-57-165Z`) improved p99 but worsened warm hitch/starvation/over-budget means versus warm pre-controls (`2026-03-04T23-26-57-305Z`, `2026-03-04T23-29-06-527Z`) and ran at higher combat pressure; it was reverted and should not be treated as an accepted path.
- Active-driver stop logs still report `moved` as frontline compression movement count, not literal player-distance moved; pressure comparability should rely primarily on shots/hits and frame progression.
- `HeightQueryCache.getHeightAt()` is unexpectedly hot in combat-heavy runs because string-key generation and LRU churn sit directly on terrain and movement paths.
- The March 4, 2026 numeric-key linked-list `HeightQueryCache` experiment was reverted. Open Frontier improved, but warm `combat120` evidence was inconsistent and one matched pair worsened heap recovery from `41.7%` to `8.7%`.
- `open_frontier` and `frontier30m` are throughput-pass / tail-fail patterns: averages stay low while long-task and LoAF totals remain high.
- Terrain tails are currently more suspicious than CDLOD selection itself. `TerrainSystem.update()` still couples render update, vegetation update, and near-field BVH rebuild in the same tick group.
- Asset loading is still on `TextureLoader` + `.webp/.png/.jpg`; no KTX2/Basis pipeline is in place yet. This remains a secondary frontier opportunity, not the first measured bottleneck.
- `systemTop` remains a secondary signal in some captures; authoritative frame-budget analysis should use `browserStalls.totals.userTimingByName`.

## Required Evidence For Major Changes

- One matched throughput pair (`combat120`) with comparable startup quality.
- One soak run (`frontier30m`) when change targets memory/stability.
- Behavior validation (shots/hits, objective flow, no freeze/teleport artifacts).

## Next Execution Slice

1. Continue `combat120` tail reduction in `AIStateEngage.initiateSquadSuppression()`: the flank-probe cleanup is accepted, and remaining outliers still point to synchronous per-flanker cover search bursts. Keep work in this init path; do not reintroduce deferred `ADVANCING` flank-cover retries unless a pressure-matched warm A/B proves a win.
2. Normalize `combat120` acceptance loops for pressure comparability (treat shots/hits drift as a first-class acceptance signal when active-driver movement stays compressed).
3. `HeightQueryCache` batch eviction accepted (2026-03-08): batch-evict 10% on overflow instead of per-miss FIFO. Heap recovery 94%/30.8% (matched pair) vs previous LRU 8.7%. No combat pressure collapse. The numeric-key linked-list LRU attempt remains reverted.
4. Break down `TerrainRaycastRuntime` near-field rebuild and vegetation update cost inside `TerrainSystem.update()` for `open_frontier`, `frontier30m`, and `a_shau_valley`.
5. Re-baseline and lock regression checks after each accepted change. Deploy now gated on CI (lint+test+build). `perf:compare` wired into perf-check.yml workflow.
6. Keep terrain rewrite progress aligned with `TERRAIN_REWRITE_MASTER_PLAN.md`; do not reintroduce chunk-era semantics into active runtime code. T-006 (CDLOD LOD transitions) done: XZ morphing in vertex shader, wireframe debug toggle.
7. Hold WebGPU, WASM, worker offload, and navmesh adoption until the low-friction CPU fixes above are re-measured against warm baselines.

## Update Rule

Any accepted architecture change must update:
- this file (decision + risk impact), and
- `docs/PROFILING_HARNESS.md` if capture semantics changed.
