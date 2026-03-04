# Terrain Rewrite Master Plan

Last updated: 2026-03-04
Status: Active control document
Owner: terrain rewrite

This is the only terrain rewrite plan that should drive implementation.

Do not preserve terrain debate trails, rebuttal docs, or alternative terrain plans once their conclusions are absorbed here.
Do not start new terrain architecture docs in `docs/` root unless this plan explicitly calls for one.

---

## Mission

Deliver one terrain architecture that:
- preserves authoritative gameplay terrain semantics,
- supports current small procedural modes with per-match random seeds,
- supports current DEM-backed A Shau,
- scales toward full Vietnam coverage (Hue, Mekong Delta, Central Highlands, DMZ) via tiled DEM,
- leaves room for hydrology-driven river systems without splitting the engine into incompatible terrain codepaths.

The rewrite is successful only if:
- gameplay height truth is unified,
- world extent comes from map data,
- terrain runtime is honest about what it does,
- vegetation and biome config reach the live runtime,
- large-map rendering improves without breaking combat feel.

---

## Rewrite Rules

1. Production architecture wins over legacy test scaffolding.
2. Keep useful behavioral tests.
3. If brittle tests block the rewrite, remove and rewrite them after the architecture lands.
4. Do not preserve fake semantics just to satisfy old tests.
5. Validation should focus on behavior that matters:
   - world extent,
   - height authority,
   - readiness semantics,
   - vegetation wiring,
   - large-map runtime correctness.

---

## Non-Negotiables

1. `HeightQueryCache` is the current canonical gameplay terrain height authority.
2. `TerrainSystem` is a terrain runtime, not an unproven god-object.
3. World extent comes from mode/map config, never from render distance.
4. GPU-baked terrain data is for rendering unless explicitly validated for gameplay use.
5. Hydrology is a first-class terrain-adjacent layer, not just a shader decoration.
6. Small modes and large modes must share one terrain contract; scale changes through providers and budgets, not a second terrain engine.

---

## Proven Issues

### P0

`T-001` World-size authority bug
- Evidence: `src/config/AShauValleyConfig.ts`, `src/core/GameEngineInit.ts`, `src/systems/terrain/TerrainSystem.ts`
- Current failure: A Shau config is `21136m`, runtime terrain derives `3072m`.

### P1

`T-002` Gameplay height fidelity split
- Evidence: `src/systems/terrain/TerrainSystem.ts`, `src/systems/terrain/HeightmapGPU.ts`, `src/systems/terrain/HeightQueryCache.ts`
- Current failure: helicopters and some terrain consumers query the GPU-baked grid, while most gameplay systems query the provider/cache directly.

`T-003` Dead vegetation and biome config paths
- Evidence: `src/core/GameEngineInit.ts`, `src/systems/terrain/TerrainWorkerPool.ts`, `src/systems/terrain/TerrainSystem.ts`, `src/systems/terrain/VegetationScatterer.ts`
- Current failure: config is stored but not applied to live vegetation/runtime behavior.

### P2

`T-004` Compat stubs still drive readiness logic
- Evidence: `src/core/SystemManager.ts`, `src/systems/player/PlayerRespawnManager.ts`, `src/systems/helicopter/HelipadSystem.ts`, `src/systems/terrain/TerrainSystem.ts`

`T-005` Terrain runtime block boundaries are still muddied
- Evidence: `src/systems/terrain/TerrainSystem.ts`, `src/systems/terrain/TerrainQueries.ts`, `src/systems/terrain/HeightQueryCache.ts`

### P3

`T-006` CDLOD transition quality is unproven
- Evidence: `src/systems/terrain/CDLODRenderer.ts`, `src/systems/terrain/TerrainMaterial.ts`, `src/systems/terrain/CDLODQuadtree.ts`

`T-007` Terrain material stack is infrastructure, not final content
- Evidence: `src/systems/terrain/TerrainMaterial.ts`

`T-008` Hydrology is present as a basic runtime but not yet a system layer
- Evidence: `src/systems/environment/RiverWaterSystem.ts`, `data/vietnam/DATA_PIPELINE.md`, `data/vietnam/reference/a-shau-rivers.json`

---

## Execution Phases

## Phase 0: Control Plane

Goal:
- one canonical plan,
- no conflicting terrain debate docs in `docs/` root,
- task tracking embedded here.

Tasks:
- `T-000` Create canonical master plan.
- `T-000A` Delete superseded terrain debate docs and stale terrain option docs.

Acceptance criteria:
- one root plan doc exists and is current,
- superseded terrain debate docs are removed from the repo,
- future terrain work updates this file instead of spawning more argument docs.

Validation:
- `Get-ChildItem docs`
- verify only current terrain docs remain in active documentation

## Phase 1: Restore Correct Terrain Authority

Goal:
- terrain world extent matches mode config,
- gameplay height queries use one authoritative path.

Tasks:
- `T-001` Add explicit world-size setter/config path to `TerrainSystem`.
- `T-001A` Update `GameEngineInit` to pass mode world size into the terrain runtime.
- `T-001B` Ensure `setChunkSize` / `setRenderDistance` no longer mutate map extent.
- `T-002` Change `TerrainSystem.getHeightAt()` to delegate to `TerrainQueries` / `HeightQueryCache`.
- `T-002A` Keep `HeightmapGPU` for rendering, normals, and derived runtime data only.
- `T-002B` Add tests covering A Shau world size and query path behavior.

Acceptance criteria:
- A Shau terrain runtime world size equals `21136`.
- Changing render distance changes LOD selection behavior, not map extent.
- `TerrainSystem.getHeightAt()` and `TerrainQueries.getHeightAt()` agree for gameplay queries.
- No gameplay system is forced onto the baked GPU field for base height.

Validation:
- targeted tests for `TerrainSystem`
- runtime log confirms A Shau initializes at `21136m world`
- grep confirms gameplay height path no longer defaults to `HeightmapGPU.sampleHeight()`

## Phase 2: Wire Live Configuration

Goal:
- biome and vegetation config affect live runtime behavior.

Tasks:
- `T-003` Add a real terrain runtime configuration entrypoint.
- `T-003A` Forward vegetation config into `VegetationScatterer.configure()`.
- `T-003B` Make biome config drive material and vegetation behavior.
- `T-003C` Delete worker-pool config methods that are compatibility dead ends if they remain unused.

Acceptance criteria:
- runtime biome selection changes billboard vegetation behavior,
- terrain config passed from mode startup reaches live terrain code,
- dead config methods are either removed or meaningfully applied.

Validation:
- new integration test for mode config -> terrain runtime
- runtime smoke test with changed biome profile
- grep shows no dead store-only config paths remain

## Phase 3: Remove Dishonest Compat Semantics

Goal:
- readiness and terrain existence are represented honestly.

Tasks:
- `T-004` Replace `isChunkLoaded()` callsites that rely on local readiness.
- `T-004A` Replace `getChunkAt()` checks with explicit terrain/runtime readiness checks.
- `T-004B` Shrink the terrain runtime interface surface to truthful semantics.
- `T-004C` Update debug/telemetry paths that still expect queue/merge metrics.

Acceptance criteria:
- spawn, respawn, and helipad flow do not rely on fake chunk objects,
- terrain readiness naming matches actual runtime meaning,
- no critical gameplay flow depends on placeholder chunk semantics.

Validation:
- grep for `getChunkAt(` and `isChunkLoaded(` confirms no live gameplay references remain
- startup and respawn smoke tests
- helipad creation still works after interface cleanup

## Phase 4: Clarify Terrain Block Boundaries

Goal:
- formalize the existing separation instead of letting `TerrainSystem` absorb every concern.

Tasks:
- `T-005` Document and enforce:
  - data authority,
  - terrain runtime,
  - gameplay terrain queries.
- `T-005A` Reduce direct responsibility inside `TerrainSystem` where it is only carrying compatibility baggage.
- `T-005B` Update architecture docs after the code lands.

Acceptance criteria:
- `HeightQueryCache`, `TerrainQueries`, and `TerrainSystem` roles are explicit in code and docs,
- the root architecture docs match live runtime wiring,
- future hydrology work has a clean insertion point.

Validation:
- docs review,
- interface review,
- grep confirms reduced compat leakage

## Phase 5: Prove Large-Map Visual Runtime

Goal:
- earn the right to claim CDLOD-grade transitions and better terrain visuals.

Tasks:
- `T-006` Implement XZ morphing or equivalent validated LOD transition handling.
- `T-006A` Add wireframe capture/check workflow for transition validation.
- `T-007` Upgrade terrain material to authored layer inputs, proper normals, and better slope handling.

Acceptance criteria:
- transition behavior is visually validated on camera motion,
- no obvious LOD pop regressions on steep terrain,
- material stack is no longer just procedural fallback colors.

Validation:
- wireframe captures,
- perf capture before/after,
- A Shau visual smoke run

## Phase 6: Hydrology Layer

Goal:
- support streams, rivers, deltas, crossings, and future patrol-boat logic as a terrain-adjacent system.

Tasks:
- `T-008` Define hydrology runtime/query boundary.
- `T-008A` Keep `RiverWaterSystem` as runtime seed, not final authority.
- `T-008B` Add query primitives for river presence, width, and crossing logic where needed.
- `T-008C` Plan delta and major-river cases separately from mountain stream cases.

Acceptance criteria:
- river data is not just visual,
- gameplay systems can ask hydrology questions without reading render meshes,
- future Hue / Mekong / A Shau cases fit the same layer.

Validation:
- docs and interface review
- sample integration with at least one gameplay consumer

---

## Task Tracker

| ID | Task | Priority | Status | Notes |
|----|------|----------|--------|-------|
| T-000 | Create master plan | P0 | `done` | Canonical plan created |
| T-000A | Delete stale terrain docs | P0 | `done` | Superseded terrain debate trail and stale terrain options doc removed |
| T-001 | Fix world-size authority | P0 | `done` | Explicit world-size support added to `TerrainSystem` |
| T-001A | Pass mode world size into terrain runtime | P0 | `done` | `GameEngineInit` now calls `setWorldSize(config.worldSize)` |
| T-001B | Decouple render distance from map extent | P0 | `done` | Chunk size/render distance no longer override explicit map extent |
| T-002 | Unify gameplay height path | P1 | `done` | `TerrainSystem.getHeightAt()` now delegates to gameplay queries |
| T-003 | Wire vegetation and biome config | P1 | `in_progress` | terrain material and vegetation both consume biome rules; automated preview smoke is now fully clean in `zone_control` and `a_shau_valley`, manual visual review/tuning is still pending |
| T-004 | Remove dishonest compat semantics | P2 | `done` | Dishonest chunk stubs and alias interfaces are gone from the runtime boundary; core callers use truthful terrain semantics |
| T-005 | Clarify terrain block boundaries | P2 | `done` | runtime/query/data roles are explicit, gameplay/world consumers use injected terrain runtime, and remaining direct height-cache usage is confined to terrain internals plus bootstrap/provider setup |
| T-006 | Prove CDLOD transitions | P3 | `pending` | morphing + validation |
| T-007 | Finish terrain material stack | P3 | `in_progress` | biome textures, roughness, slope-aware triplanar sampling, terrain-appropriate ground texture filtering, and base-aware loading/start-screen asset paths are live; large-world surface bake now scales down to a 512 grid at A Shau size, and automated preview smoke is shader-clean, terrain-warning-clean, and request-error-clean, but authored per-layer normal/PBR inputs are still pending because they are not yet in the asset inventory |
| T-008 | Add hydrology layer plan and interfaces | P3 | `pending` | river gameplay |
| T-009 | Per-match random terrain seeds | P1 | `done` | `terrainSeed` on GameModeConfig, `rebakeHeightmap()` on TerrainSystem, wired in GameEngineInit |
| T-010 | Vietnam-scale tiled DEM support | P2 | `pending` | heightmap streaming for maps beyond 21km; needed for Hue, Mekong Delta, DMZ theaters |

---

## Progress Log

### 2026-03-03

Completed:
- created canonical rewrite plan,
- deleted superseded terrain debate docs and the stale terrain options doc,
- added explicit world-size control to `TerrainSystem`,
- wired mode `worldSize` from `GameEngineInit`,
- changed `TerrainSystem.getHeightAt()` to use gameplay query authority,
- wired live vegetation config from billboard biome state into `VegetationScatterer`,
- removed dead worker vegetation/biome config posts and dead worker-pool config methods,
- restored `biomeRules` as live runtime data and wired them into terrain material classification using real biome ground textures,
- upgraded vegetation scattering from single-biome mode to biome-classified cell generation driven by the same biome rules used by terrain material classification,
- changed billboard vegetation configuration to allocate the union of vegetation types across all active biomes instead of only the default biome,
- moved startup, respawn, helipad, and helicopter flow off fake chunk semantics and onto explicit terrain readiness/coverage checks,
- narrowed the shared terrain runtime interface to truthful terrain semantics and removed `getTerrainHeightAt()` / `IChunkManager` aliases,
- updated terrain block docs and tests to reflect the truthful runtime contract,
- rewrote affected `TerrainSystem` tests to match the new contract,
- removed fake chunk queue/loading/merger metrics from `TerrainSystem`,
- switched console and overlay telemetry to truthful terrain-ready, active-tile, and worker-pool metrics,
- removed the core `chunkManager` alias and committed core wiring to `terrainSystem`,
- removed `getLoadedChunkCount()` after migrating core telemetry/startup callers to `getActiveTerrainTileCount()`,
- committed to `ITerrainRuntime` as the terrain interface name with no alias fallback,
- renamed combat, AI, and weapons terrain dependencies from `chunkManager` to `terrainSystem`,
- switched player, combat, AI, helicopter, weapons, world, and audio terrain consumers to depend on `ITerrainRuntime` instead of the concrete `TerrainSystem` class where only runtime semantics are needed,
- removed the combat/LOS `as any` terrain resolver chains and committed those paths to direct terrain API calls,
- cleaned the repo search surface so `setChunkManager`, `getTerrainHeightAt`, `getLoadedChunkCount`, and live `chunkManager` runtime fields no longer exist in `src/`,
- extracted biome runtime assembly out of `TerrainSystem` into `TerrainBiomeRuntimeConfig` so material-layer config and vegetation-runtime config are no longer built inline in the top-level terrain facade,
- extracted frustum extraction, quadtree tile selection, and instanced terrain draw submission out of `TerrainSystem` into `TerrainRenderRuntime`,
- extracted heightmap bake, terrain material creation, and material refresh out of `TerrainSystem` into `TerrainSurfaceRuntime`,
- extracted near-field BVH terrain mesh rebuild and LOS registration out of `TerrainSystem` into `TerrainRaycastRuntime`,
- removed the last world/bootstrap gameplay bypasses around terrain authority by moving zone placement, war-sim grounding, startup spawn grounding, and river mesh grounding onto injected terrain runtime access instead of direct external `HeightQueryCache` reads,
- rewrote the last stale respawn test that was still preserving the old global height-cache assumption and replaced it with an explicit `ITerrainRuntime` mock,
- formalized the runtime controller surface as `ITerrainRuntimeController` for systems that both query terrain and tune runtime policy such as render distance,
- advanced `T-007` by wiring the existing `triplanarSlopeThreshold` config into `TerrainMaterial`, so steep slopes now blend from planar XZ sampling toward triplanar biome texture sampling instead of stretching one projection across cliffs,
- fixed terrain ground texture filtering in `AssetLoader` so ground-category textures use linear mipmapped sampling instead of the old nearest/no-mipmap path that was appropriate for UI sprites but wrong for large terrain surfaces,
- updated active architecture docs and block maps so they describe `TerrainSystem` / `HeightQueryCache` / truthful terrain wiring instead of the deleted chunk stack,
- finished `T-005`: direct `getHeightQueryCache()` usage is now confined to terrain internals (`TerrainQueries`, `TerrainSystem`, `VegetationScatterer`) and startup/provider wiring in `GameEngineInit`,
- updated the docs index so `TERRAIN_REWRITE_MASTER_PLAN.md` is the only terrain control document and terrain is described in runtime/query terms instead of chunk-era terms,
- validated with:
  - `npx tsc --noEmit`
  - `npx vitest run src/systems/terrain/TerrainSystem.test.ts`
  - `npx vitest run src/systems/terrain/TerrainSystem.test.ts src/systems/helicopter/HelipadSystem.test.ts src/systems/helicopter/HelicopterModel.test.ts`
  - `npx vitest run src/systems/terrain/TerrainSystem.test.ts src/systems/environment/WeatherSystem.test.ts`
  - `npx vitest run src/systems/terrain/TerrainSystem.test.ts src/systems/helicopter/HelipadSystem.test.ts src/systems/helicopter/HelicopterModel.test.ts src/systems/environment/WeatherSystem.test.ts`
  - `npx vitest run src/systems/terrain/TerrainMaterial.test.ts src/systems/terrain/TerrainSystem.test.ts src/systems/environment/WeatherSystem.test.ts src/systems/helicopter/HelipadSystem.test.ts src/systems/helicopter/HelicopterModel.test.ts`
  - `npx vitest run src/systems/combat/CombatantAI.test.ts src/systems/combat/CombatantCombat.test.ts src/systems/combat/ai/AILineOfSight.test.ts src/systems/combat/ai/AICoverFinding.test.ts src/systems/combat/ai/AICoverSystem.test.ts src/systems/combat/ai/AIFlankingSystem.test.ts src/systems/combat/ai/FlankingRoleManager.test.ts src/systems/combat/SquadManager.test.ts`
  - `npx vitest run src/systems/terrain/TerrainSystem.test.ts src/systems/terrain/TerrainMaterial.test.ts src/systems/environment/WeatherSystem.test.ts src/systems/player/PlayerController.test.ts src/systems/player/PlayerMovement.test.ts src/systems/world/ZoneManager.test.ts src/systems/audio/FootstepAudioSystem.test.ts src/systems/combat/CombatantAI.test.ts src/systems/combat/CombatantCombat.test.ts src/systems/combat/ai/AILineOfSight.test.ts src/systems/combat/ai/AICoverFinding.test.ts src/systems/combat/ai/AICoverSystem.test.ts src/systems/combat/ai/AIFlankingSystem.test.ts src/systems/combat/ai/FlankingRoleManager.test.ts src/systems/combat/SquadManager.test.ts`
  - `npx vitest run src/systems/weapons/SandbagSystem.test.ts src/systems/combat/CombatantAI.test.ts src/systems/combat/CombatantCombat.test.ts src/systems/combat/ai/AILineOfSight.test.ts src/systems/terrain/TerrainSystem.test.ts src/systems/player/PlayerController.test.ts src/systems/world/ZoneManager.test.ts`
  - `npx vitest run src/systems/terrain/VegetationScatterer.test.ts src/systems/terrain/TerrainSystem.test.ts`
  - `npx vitest run src/systems/terrain/TerrainSystem.test.ts src/systems/terrain/VegetationScatterer.test.ts src/systems/terrain/TerrainMaterial.test.ts`
  - `npx vitest run src/systems/terrain/TerrainSystem.test.ts src/systems/terrain/VegetationScatterer.test.ts src/systems/terrain/TerrainMaterial.test.ts src/systems/player/PlayerController.test.ts src/systems/player/PlayerMovement.test.ts src/systems/combat/CombatantCombat.test.ts src/systems/combat/ai/AILineOfSight.test.ts src/systems/helicopter/HelipadSystem.test.ts src/systems/helicopter/HelicopterModel.test.ts src/systems/world/ZoneManager.test.ts src/systems/audio/FootstepAudioSystem.test.ts src/systems/weapons/SandbagSystem.test.ts`
  - `npx vitest run src/systems/terrain/TerrainSystem.test.ts src/systems/terrain/TerrainMaterial.test.ts src/systems/terrain/VegetationScatterer.test.ts src/systems/player/PlayerController.test.ts src/systems/world/ZoneManager.test.ts`
  - `npx vitest run src/systems/terrain/TerrainSystem.test.ts src/systems/terrain/TerrainMaterial.test.ts src/systems/terrain/VegetationScatterer.test.ts src/systems/player/PlayerController.test.ts src/systems/world/ZoneManager.test.ts src/systems/combat/ai/AILineOfSight.test.ts src/systems/combat/CombatantCombat.test.ts`
  - `npx vitest run src/systems/player/PlayerRespawnManager.test.ts src/systems/world/ZoneManager.test.ts src/systems/audio/FootstepAudioSystem.test.ts src/systems/combat/SquadManager.test.ts src/systems/combat/ai/AICoverFinding.test.ts src/systems/combat/ai/AICoverSystem.test.ts src/systems/terrain/TerrainSystem.test.ts src/systems/combat/CombatantCombat.test.ts`
  - `npx vitest run src/systems/world/ZoneManager.test.ts src/systems/player/PlayerRespawnManager.test.ts src/systems/terrain/TerrainSystem.test.ts src/systems/combat/CombatantCombat.test.ts`
  - `npx vitest run src/systems/terrain/TerrainMaterial.test.ts src/systems/terrain/TerrainSystem.test.ts src/systems/terrain/VegetationScatterer.test.ts src/systems/world/ZoneManager.test.ts`
  - `npx tsc --noEmit`

Next:
- continue `T-003` with in-engine smoke validation on A Shau and one small mode to verify biome-texture and biome-vegetation alignment visually,
- continue `T-007` by adding authored per-layer normal/PBR inputs instead of heightmap-derived normals alone; current evidence from `AssetLoader` inventory is that only biome albedo ground textures are present today,
- then validate biome rendering on A Shau and one small mode with real runtime smoke captures,
- then move to `T-006` LOD transition proof from the cleaner terrain runtime/query foundation.

### 2026-03-03 (session 2)

Completed:
- `T-009`: added per-match random terrain seeds for procedural modes,
  - `terrainSeed` field on `GameModeConfig` (number for deterministic, `'random'` for per-match variety),
  - all 4 procedural modes set to `'random'` (Zone Control, Open Frontier, TDM, AI Sandbox),
  - A Shau Valley uses DEM (seed field ignored),
  - `TerrainSystem.rebakeHeightmap()` re-bakes GPU heightmap, updates material, propagates provider to workers, rebuilds BVH, regenerates vegetation,
  - `GameEngineInit.startGameWithMode()` resolves seed, creates `NoiseHeightProvider`, pushes to `HeightQueryCache` and workers, logs seed for reproducibility,
- validated: `tsc --noEmit` clean, 2939 tests passing, build succeeds.

Acknowledged:
- biome rules are live and driving terrain material classification (T-003 in progress by other agent),
- hydrology layer (T-008) is planned for Phase 6 with river gameplay queries,
- A Shau DEM pipeline proven at 21km; `T-010` tracks tiled DEM for Vietnam-scale maps.

Next:
- `T-010`: design heightmap streaming/tiling for maps beyond 21km (Hue, Mekong, DMZ),
- continue `T-003` and `T-005` (other agent),
- runtime smoke test with random seeds on small modes to verify variety.

Notes:
- The worktree is already dirty from broader terrain migration work; do not treat unrelated modified files as part of this slice without re-review.

### 2026-03-04

Completed:
- ran automated headless terrain smoke validation with a thin Playwright probe for:
  - `zone_control`
  - `a_shau_valley`
- captured screenshots and machine-readable results under:
  - `artifacts/terrain-smoke/2026-03-04T00-16-10-059Z`
- validated runtime terrain state in smoke:
  - `zone_control`: `terrainReady=true`, `activeTiles=58`
  - `a_shau_valley`: `terrainReady=true`, `activeTiles=27`, `worldSize=21136`
- found and fixed a real runtime shader regression in `TerrainMaterial` that unit tests missed:
  - first failure: fragment redefinition / missing symbols from naive chunk replacement
  - second failure: invalid `geometryNormal` assignment in the compiled `MeshStandardMaterial` shader path
  - final smoke result: no terrain shader compile errors in either `zone_control` or `a_shau_valley`

Validated findings:
- terrain runtime/query foundation is live in both a small mode and A Shau under headless automation,
- the current terrain material path is shader-clean after the live WebGL fix,
- A Shau remains far over terrain budget in headless smoke:
  - first slow frame reported at roughly `2098ms`
  - `SystemUpdater` terrain EMA warnings reached `1388.81ms`, then `484.29ms`, then `152.01ms`
- `zone_control` also showed world-budget warnings, but not the catastrophic terrain shader failure that existed before the fix.

Validation:
- `npx vitest run src/systems/terrain/TerrainMaterial.test.ts src/systems/terrain/TerrainSystem.test.ts`
- `npx tsc --noEmit`
- custom headless Playwright terrain smoke probe against:
  - `zone_control`
  - `a_shau_valley`

Next:
- manual screenshot review of `artifacts/terrain-smoke/2026-03-04T00-16-10-059Z`
- continue `T-007` only after deciding whether to add authored terrain normal/PBR assets,
- move the next performance-critical terrain effort toward A Shau runtime cost, not more shader feature work.

### 2026-03-04 (session 2)

Completed:
- removed duplicate terrain startup work in `GameEngineInit`:
  - mode startup no longer forces `rebakeHeightmap()` after a world-size change, because `setWorldSize()` already drives the terrain surface rebake path
- reduced raycast runtime waste:
  - `TerrainRaycastRuntime` no longer computes vertex normals for the near-field LOS mesh, because that mesh is used for ray intersections, not shading
- made render-surface bake resolution scale with map size in `TerrainSurfaceRuntime`:
  - small/medium worlds retain higher density,
  - very large worlds use a lower grid budget,
  - A Shau (`21136m`) now bakes the render-only terrain surface at `512` instead of `1024`
- added validation coverage for the large-world surface budget in `TerrainSystem.test.ts`
- rebuilt and re-ran automated preview smoke against the current build
- captured updated machine-readable results under:
  - `artifacts/terrain-smoke/2026-03-04T00-41-49-250Z`

Validated findings:
- `zone_control` remains healthy:
  - `terrainReady=true`
  - `activeTiles=58`
  - `worldSize=500`
- `a_shau_valley` remains correct:
  - `terrainReady=true`
  - `activeTiles=27`
  - `worldSize=21136`
- compared to the earlier artifact `artifacts/terrain-smoke/2026-03-04T00-38-53-189Z`, the current preview smoke no longer reports:
  - slow-frame warnings attributed to terrain
  - `SystemUpdater` terrain EMA budget overruns
  - shader warnings beyond the environment-level `KHR_parallel_shader_compile` availability message
- remaining runtime noise in the smoke is limited to two unresolved `404` resource errors, which are outside the terrain runtime core

Validation:
- `npx vitest run src/systems/terrain/TerrainSystem.test.ts src/systems/terrain/TerrainMaterial.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- preview-mode Playwright terrain smoke probe against:
  - `zone_control`
  - `a_shau_valley`

Next:
- manual visual review of `artifacts/terrain-smoke/2026-03-04T00-41-49-250Z`
- continue `T-007` with authored terrain normal/PBR inputs when those assets are added
- move to `T-006` and prove LOD transition quality with wireframe/transition capture, now that the terrain runtime is materially stable again

### 2026-03-04 (session 3)

Completed:
- fixed the last known runtime request errors caused by hard-coded root-relative UI screen asset paths:
  - `StartScreen.ts`
  - `StartScreen.module.css`
  - `LoadingUI.ts`
  - `LoadingUI.css`
  - `index.html` favicon paths
- removed the preview/build mismatch where `/assets/ui/screens/start-screen.webp` and `/assets/ui/screens/loading-screen.webp` returned `404` under the configured Vite base path
- captured a fully clean preview-smoke artifact under:
  - `artifacts/terrain-smoke/2026-03-04T00-54-47-243Z`

Validated findings:
- `zone_control`:
  - `terrainReady=true`
  - `activeTiles=58`
  - `worldSize=500`
  - no request errors
  - no terrain perf warnings
- `a_shau_valley`:
  - `terrainReady=true`
  - `activeTiles=27`
  - `worldSize=21136`
  - no request errors
  - no terrain perf warnings
- the only remaining preview-smoke shader note is the environment warning about `KHR_parallel_shader_compile` availability in `zone_control`; this is not a terrain shader failure

Validation:
- `npx tsc --noEmit`
- `npx vitest run src/systems/terrain/TerrainSystem.test.ts src/integration/scenarios/squad-lifecycle.test.ts src/integration/scenarios/combat-flow.test.ts`
- `npm run build`
- preview-mode Playwright terrain smoke against:
  - `zone_control`
  - `a_shau_valley`

Next:
- manual visual review of `artifacts/terrain-smoke/2026-03-04T00-54-47-243Z`
- continue `T-007` with authored terrain normal/PBR inputs when those assets are added
- move to `T-006` and prove LOD transition quality with wireframe/transition capture

---

## Validation Matrix

| Area | Required validation |
|------|---------------------|
| World extent | test + startup log at mode load |
| Height authority | code grep + test coverage |
| Spawn/respawn readiness | smoke test |
| Helipad creation | smoke test |
| Vegetation config | integration test or runtime assertion |
| Terrain transitions | wireframe/visual validation |
| Large map correctness | A Shau runtime smoke pass |
| Perf stability | perf harness before/after high-risk phases |

---

## References

Local:
- `src/systems/terrain/TerrainSystem.ts`
- `src/systems/terrain/TerrainQueries.ts`
- `src/systems/terrain/HeightQueryCache.ts`
- `src/systems/terrain/HeightmapGPU.ts`
- `src/systems/terrain/TerrainMaterial.ts`
- `src/systems/environment/RiverWaterSystem.ts`
- `src/core/GameEngineInit.ts`
- `src/core/SystemManager.ts`
- `src/config/AShauValleyConfig.ts`
- `docs/ROADMAP.md`
- `data/vietnam/DATA_PIPELINE.md`

Primary external:
- Filip Strugar, CDLOD: `https://github.com/fstrugar/CDLOD`
- Geometry clipmaps project page: `https://hhoppe.com/proj/geomclipmap/`
- Three.js `InstancedMesh`: `https://threejs.org/docs/pages/InstancedMesh.html`
- Three.js `MeshStandardMaterial`: `https://threejs.org/docs/pages/MeshStandardMaterial.html`
- HydroRIVERS: `https://www.hydrosheds.org/products/hydrorivers`
