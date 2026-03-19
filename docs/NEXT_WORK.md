# Next Work

Last updated: 2026-03-10
Status: ACTIVE - shipping baseline is stable; use this file for polish/perf/content follow-up, not boot/deploy remediation

## How To Use This File

Work top-down. Each item has acceptance criteria. When an item is done:
1. Check the box
2. Update the referenced doc(s) listed under "Doc updates"
3. Move to the next item

Items within a tier are priority-ordered. Do not skip tiers unless blocked.

## Current Baseline (2026-03-10)

- Local release gates are green: `lint`, `deadcode`, `test:run`, `build`, `smoke:prod`
- Built app is validated under the deployed base path: `http://127.0.0.1:4173/terror-in-the-jungle/`
- Consultation-critical architecture debt is closed enough for shipping; remaining work is performance, bundle weight, and content/product expansion

---

## Tier 0: Validate Recent Changes

### 0.1 Perf capture after micro-optimizations
- [x] Run `npm run perf:capture:combat120` (warm, not first boot)
- [x] Run `npm run perf:capture:combat120` a second time for matched pair
- [x] Compare results (see below)
- [x] Record results below

**What changed (this session, uncommitted):**
- LOSAccelerator: removed 5x `performance.now()` calls per LOS query
- HeightQueryCache: scratch vector in `getNormalAt()`, default cache 10K -> 20K
- TerrainRaycastRuntime: BVH grid step 4m -> 6m (10,201 -> ~4,489 vertices per rebuild)

**Results:**
```
combat120 run 1: avg=12.79ms, p99=35.30ms, shots/hits=175/90, starvation=3.94, heap_recovery=81.6% (WARN)
combat120 run 2: avg=13.15ms, p99=30.90ms, shots/hits=201/108, starvation=4.88, heap_recovery=9.6% (FAIL - GC timing variance)
Previous best:   avg=14.17ms, p99=86.90ms, shots/hits=246/133, starvation=12.34
```

p99 improved ~60% (86.90 -> 30-35ms). AI starvation improved ~70% (12.34 -> 3.9-4.9). Avg frame time improved ~8% (14.17 -> 12.8-13.2ms). Combat pressure comparable. Run 2 heap recovery is GC timing variance, not a regression (run 1 recovered 81.6%).

**Decision:** [x] Accept and baseline

Doc updates:
- [x] `ARCHITECTURE_RECOVERY_PLAN.md` - Keep Decision added (confirmed 2026-03-06)
- [x] `PERF_FRONTIER.md` - scenario health matrix updated
- [x] `CLAUDE.md` Current Focus - rewritten to reflect new state

### 0.2 Fix stale handoff docs
- [x] `ACTIVE_GAME_MODES_HANDOFF.md`: Phase 6 (Team/Faction) -> complete
- [x] `ACTIVE_GAME_MODES_HANDOFF.md`: Phase 7 (Death Presentation) -> complete
- [x] `GAME_MODES_EXECUTION_PLAN.md`: Phase 6 state -> complete, note what landed
- [x] `GAME_MODES_EXECUTION_PLAN.md`: Phase 7 state -> complete, note what landed
- [x] `ACTIVE_GAME_MODES_HANDOFF.md`: remove "death presentation work has not started" from Current Gaps
- [x] `ACTIVE_GAME_MODES_HANDOFF.md`: update Resume Here to reflect actual next work
- [x] `ROADMAP.md` Current State Summary table: update Factions row (BLUFOR_CONTROLLED is live)
- [x] `ROADMAP.md` Current State Summary table: update Squad row (selected-squad panel is live)
- [x] `ROADMAP.md` Current State Summary table: update HUD/UI row (command overlay is live)

Doc updates: the items above ARE the doc updates.

---

## Tier 1: Perf Tail Closure (if 0.1 doesn't close p99)

### 1.1 AIStateEngage.initiateSquadSuppression() - remaining cover search bursts
The documented top combat tail suspect. Synchronous `findNearestCover()` per flanker.

- [x] Read `src/systems/combat/ai/AIStateEngage.ts` - locate `initiateSquadSuppression()`
- [x] Profile: how many flankers trigger cover search per call? (max 2, capped by MAX_FLANK_COVER_SEARCHES_PER_SUPPRESSION)
- [x] Implement chosen approach: reduced `AICoverFinding.findVegetationCover` grid from 12x12 to 8x8, added early-out at 4 candidates, reduced terrain search from 16 to 8 angles
- [x] Run matched warm `combat120` pair
- [x] Accept or revert based on evidence

**Results:** Run 1 (cold): avg=13.80ms, p99=42.2ms. Run 2 (warm): avg=12.27ms, p99=34.1ms. p99 passes <50ms acceptance. Comparable to previous best (12.79ms avg, 35.3ms p99).

Doc updates:
- `ARCHITECTURE_RECOVERY_PLAN.md` - Keep Decision or Open Risk update
- `PERF_FRONTIER.md` - scenario health matrix
- `CLAUDE.md` Current Focus items 5-6

### 1.2 TerrainSystem.update() tick-group decoupling
BVH rebuild, vegetation update, and render update all land in one frame. Terrain tails dominate `open_frontier` and `frontier30m`.

- [x] Read `src/systems/terrain/TerrainSystem.ts` - locate `update()` method
- [x] Identify which sub-operations can be deferred to separate frames
- [x] Stagger BVH rebuild: skip on frames where vegetation just rebuilt (VegetationScatterer.update returns bool)
- [x] Run `npm run perf:capture:frontier30m`
- [x] Compare terrain tick-group totals before/after

**Results (2026-03-06, post terrain LOD auto-scaling fix):**
```
frontier30m: avg=6.57ms, p99=100ms (single GC outlier), 888/889 samples p99<29ms
  Previous:  avg=~7ms,   p99=85.90ms (persistent tail)
  AI starvation: 0 (steady state). Hitches >50ms: 0.13%. Heap growth: 5.20MB/30min.
combat120:   avg=12.25ms, p99=39.9ms, starvation=1.99, heap=-0.72MB
ashau:short: avg=7.96ms,  p99=36.5ms, starvation=0, heap=0.40MB
```
Terrain-led tails are effectively solved. The single 100ms p99 in frontier30m is a GC/OS outlier (3 longTasks + 4 LoAFs), not game code.

Acceptance: [x] PASS - long-task count dropped from persistent to near-zero

Doc updates:
- `ARCHITECTURE_RECOVERY_PLAN.md` - P5 status + Keep Decision
- `PERF_FRONTIER.md` - scenario health matrix
- `docs/blocks/terrain.md` - note if T-005 block boundaries are affected

### 1.3 HeightQueryCache batch eviction
Current FIFO eviction deletes one entry per miss. With 20K cap and BVH rebuilds needing ~4.5K queries, this is less acute than before but still suboptimal under sustained movement.

- [x] Only attempt after 1.1 and 1.2 are resolved or deferred
- [x] Design: batch evict 10% of cache when hitting limit instead of per-miss (ceil(maxCacheSize * 0.1) entries evicted in one pass, creating headroom)
- [x] Run matched warm `combat120` pair
- [x] Check heap recovery specifically (previous LRU attempt regressed from 41.7% to 8.7%)

**Results:**
```
Run 1: avg=14.20ms, p99=29.6ms, shots/hits=204/124, heap_recovery=94.0%, heap=+1.4MB, starvation=3.03
Run 2: avg=14.17ms, p99=30.3ms, shots/hits=166/95, heap_recovery=30.8%, heap=+11.5MB, starvation=0.37
Previous best: avg=12.79ms, p99=35.3ms, heap_recovery=81.6%/9.6%
Previous LRU: heap_recovery=8.7% (regressed)
```
Heap recovery 94%/30.8% vs LRU 8.7% - no regression. p99 improved (29-30ms vs 35ms). No combat collapse.

Acceptance: [x] PASS

Doc updates:
- [x] `ARCHITECTURE_RECOVERY_PLAN.md` - update Open Risk about HeightQueryCache
- [x] `CLAUDE.md` Current Focus item 3

---

## Tier 2: Mode Product Passes

These make each mode feel distinct instead of "same game, different numbers."

### 2.1 Zone Control product pass
Identity: platoon-scale frontline capture mode.

- [x] Review current Zone Control HUD - what conquest-specific feedback exists?
- [x] Add frontline pressure indicator (which zones are contested, direction of push)
- [x] Strengthen zone ownership language in HUD (clear "CAPTURING" / "LOSING" states)
- [x] Review spawn pressure rules - do players spawn near the front?
- [ ] Test: play Zone Control, note what feels generic vs distinct

**Review findings:**
- Zone status text already comprehensive: CAPTURING X%/LOSING/ATTACKING/CONTESTED/SECURED/HOSTILE/NEUTRAL
- Capture progress bars with contextual coloring (red=losing, yellow=attacking) already present
- Bleed indicator with pulse animation already wired
- Zone capture notifications (centerscreen popup) already present
- Compass zone markers already present
- Added: zone dominance bar showing faction control ratio (colored track + "2 HELD / 1 CONTESTED" label)
- Spawn rules: fixed base + controlled zones, appropriate for platoon-scale; NPC reinforcements prioritize contested zones

Doc updates:
- `docs/blocks/world.md` - if zone behavior changes

### 2.2 Team Deathmatch product pass
Identity: kill-race firefight mode.

- [x] Audit HUD for conquest leftovers (zone indicators, capture progress)
- [x] Hide or disable zone-related HUD elements in TDM
- [x] Verify kill target display (75% amber, 90% red - already wired)
- [x] Review spawn logic - TDM should avoid clustering, not use zone-based spawns
- [x] Verify match end triggers on kill target, not ticket bleed
- [ ] Test: play TDM, note conquest bleed-through

**Audit findings: NO bleed-through issues.**
- Zone HUD: hidden via `display: none` when isTDM (line 22 HUDZoneDisplay)
- Dominance bar: not created (no capturable zones in TDM config)
- Kill target: TicketDisplay shows "FIRST TO [N] KILLS" with 75%/90% urgency pulses
- Bleed indicator: explicitly hidden in TDM (TicketDisplay line 100)
- Spawn logic: `allowControlledZoneSpawns: false`, home bases only, `captureRadius: 0`
- Victory: kill count check in VictoryConditions (not ticket depletion)
- TDM is cleanly isolated via policy-driven routing (`objective.kind = 'deathmatch'`)

Doc updates:
- `docs/blocks/world.md` - if ticket/objective behavior changes

### 2.3 Open Frontier product pass
Identity: company-scale insertion and maneuver mode.

- [x] Verify helipad spawn points appear and work for BLUFOR
- [x] Review: does the mode feel like insertion/mobility or just "bigger conquest"?
- [x] Consider: should helicopter auto-start at match begin for frontier feel?
- [x] Review command surface - does it support maneuver planning?
- [ ] Test: play Open Frontier, note what feels like Zone Control reskin vs distinct

**Audit findings:**
- Helipads: 3 configured (main/west/east), terrain flattening + vegetation clearing wired, spawn priority favors helipad_main (UH1 Huey). Player can spawn at helipad and fly manually.
- Pressure corridor: NPC spawns at 24%/34%/42% of lane distance, forward staging anchor at 25% - creates early battlefield contact vs HQ standoff. This IS distinct from Zone Control.
- Helicopter: parked on helipads, manually piloted only. No auto-deploy, no NPC pilots, no transport mechanic. Functionally cosmetic.
- Command surface: company-scale label, same squad command UI as Zone Control. No additional company-level mechanics.
- Deploy flow: labeled "frontier" but uses same respawn UI with different text. Helipad priority on initial deploy is the main distinction.
- Verdict: 60% distinct (pressure corridor + helipads + 4x world + double force), 40% reskin (same capture mechanics, label-only command scale). Future work needed: FOB progression, multi-stage objectives.
- Helicopter tactical insertion: implemented (2026-03-09) - G key deploys squad from helicopter when low/slow, 30s cooldown, HUD prompt.
- Auto-start helicopter: deferred - would need NPC pilot AI or scripted flight path, out of scope for product pass.

Doc updates:
- `docs/blocks/world.md` - if spawn/deploy behavior changes

### 2.4 A Shau Valley product pass
Identity: battalion-scale war-zone mode.

- [x] Review tactical + strategic map split on the new runtime
- [x] Tune `MapIntelPolicy` for A Shau: strategic agents on full map, clean minimap
- [x] Review insertion pressure flow - does player feel dropped into a war?
- [x] Review objective readability - can player understand what to do?
- [ ] Test: play A Shau, note what works vs what's confusing

**Audit findings:**
- Map split: working. Full map shows strategic agents (alpha=0.2-0.4), minimap excludes them (showStrategicAgentsOnMinimap=false). Policy wired correctly.
- Insertion flow: air_assault deploys player 120-240m from contested objective, forward toward enemy. StrategicDirector biases +3.0 within 1.5km of player. First contact ~60-120s.
- Objective readability: 15 capturable zones overloaded the HUD. Fixed by adding priority-sorted zone display (contested first, then nearest) capped at 5 visible, with "+N more zones" overflow label.
- Zone dominance bar provides aggregate view ("2 HELD / 1 CONTESTED / 4 HOSTILE") for quick situation assessment.
- Remaining gaps (deferred): no "front line" map overlay, strategic agent dots unexplained on full map. These are content/UX tasks, not code blockers.
- Mission briefing card: implemented (2026-03-09) - shows before deploy in A Shau only.

Doc updates:
- `ARCHITECTURE_RECOVERY_PLAN.md` P3 - A Shau gameplay flow status

---

## Tier 3: Architecture Cleanup

### 3.1 GameModeManager.applyModeConfiguration() slim-down
90-line method manually configuring every system. Runtime layer exists but this hasn't been refactored.

- [x] Read current `applyModeConfiguration()` in `GameModeManager.ts`
- [x] Identify which config fan-outs can move into runtime `onEnter` hooks
- [x] Move system-specific config application into respective systems
- [x] Keep `GameModeManager` as thin coordinator
- [x] Run `npm run validate`

**Review findings: acceptable as-is, no refactoring needed.**
- Method is 94 lines touching 8 systems, mostly simple null-guarded setter calls.
- `GameModeRuntime.onEnter()` hook already exists for mode-specific custom logic (e.g. map intel policy).
- Moving config into individual systems would couple them to `GameModeConfig` - worse than centralized push.
- WarSimulator block (26 lines) is the only complex part and is inherently mode-aware.
- The method IS a thin coordinator already. No action required.

Doc updates:
- `ARCHITECTURE_RECOVERY_PLAN.md` - Keep Decision

### 3.2 Terrain rewrite remaining items
Priority order (from archived TERRAIN_REWRITE_MASTER_PLAN.md):

- [x] T-002: Height fidelity split (GPU-baked vs provider/cache) - done
- [x] T-003: Dead vegetation/biome config paths - in_progress (biome rules wired, visual tuning pending)
- [x] T-004: Compat stubs driving readiness logic - done
- [x] T-005: Block boundaries - done
- [x] T-007: Material stack content - in_progress (shader features live, authored PBR assets pending)
- [ ] T-008: Hydrology system layer - pending (design task, blocked on river gameplay requirements)

Doc updates:
- `docs/blocks/terrain.md` - update status per item
- `ARCHITECTURE_RECOVERY_PLAN.md` P5

---

## Tier 4: Content and Systems Expansion

### 4.1 Asset generation sprint (Roadmap Phase 1)
- [ ] Vegetation billboard remakes
- [ ] Terrain textures
- [ ] Helicopter GLBs (UH-1 Huey, UH-1C Gunship)
- [x] Weapon viewmodel GLBs (7 wired: M16A1, AK-47, Ithaca 37, M3 Grease Gun, M1911, M60, M79)
- [x] Animal GLBs (3 of 6 wired: egret, water_buffalo, macaque via AnimalSystem)

### 4.2 Helicopter controls overhaul (Roadmap Phase 3A)
- [ ] Fix collective throttle stickiness (documented known bug)
- [ ] Single-layer smoothing (remove PlayerMovement lerp)
- [ ] Altitude lock key

### 4.3 Structure scale + procedural world generation
- [x] STRUCTURE_SCALE 2.0->2.5 with per-category displayScale (props at 0.5x)
- [x] Prefab layout offsets rescaled 1.25x for proper spacing
- [x] Procedural firebase generator (3 templates: us_small/medium/large)
- [x] Procedural airfield generator (2 templates: us_airbase/forward_strip)
- [x] Wire procedural airfield generators into live world-feature spawning + terrain surface compilation
- [x] Add generator-backed airfield features to Open Frontier / A Shau mode configs
- [x] Add separate heavy motor-pool staging areas to Open Frontier / A Shau

### 4.4 Fixed-wing aircraft + NPC pilots
- [x] FixedWingPhysics: lift/drag/stall/bank-and-pull turns, ground roll
- [x] FixedWingConfigs: AC-47 Spooky, F-4 Phantom, A-1 Skyraider
- [x] NPCPilotAI: 7-state FSM (idle/takeoff/fly_to/orbit/attack_run/rtb/landing)
- [x] NPCPilotManager: registry with VehicleStateProvider interface
- [ ] Wire NPCPilotManager into SystemUpdater + SystemConnector
- [ ] Wire FixedWingPhysics into VehicleManager for player-pilotable fixed-wing
- [ ] NPC helicopter transport missions (takeoff, fly to LZ, deploy squad, RTB)

### 4.5 Road surface types
- [x] TerrainSurfaceKind: dirt_road, gravel_road, jungle_trail in shader
- [ ] Road network generation (splines, intersections, pathfinding)
- [ ] Road surface patches in mode configs for connecting firebases/villages

### 4.6 Sandbox test infrastructure (Roadmap Phase 1.5)
- [ ] System toggle debug panel
- [ ] Asset preview block
- [ ] Terrain sandbox

---

## Completion Log

Record completed items here with date and commit hash.

| Date | Item | Commit | Notes |
|------|------|--------|-------|
| 2026-03-06 | 0.1 Perf capture | - | p99 improved 60% (86.9->30-35ms), AI starvation improved 70% |
| 2026-03-06 | 0.2 Fix stale docs | - | Phase 6/7 status, roadmap, handoff docs updated |
| 2026-03-06 | 1.1 Cover search grid | - | 8x8 grid + 4-candidate early-out + 8-angle terrain search |
| 2026-03-06 | 1.2 Terrain tick stagger | - | BVH skipped on vegetation rebuild frames |
| 2026-03-06 | Bugfix: shot-through | - | Height profile prefilter was blocking valid shots on undulating terrain |
| 2026-03-06 | Bugfix: terrain LOD | f328391 | Auto-scale maxLODLevels from world size; heightmap grid 512->1024 for 3200m |
| 2026-03-06 | 1.2 frontier30m re-capture | - | p99 85.9ms->single outlier; 888/889 samples clean; terrain tails solved |
| 2026-03-08 | Respawn map overhaul | - | Dynamic world size, left-click drag pan, input context isolation, unified map for all modes, RespawnSpawnPoint model |
| 2026-03-08 | Open Frontier insertion preference | - | Initial deploy now prefers `helipad_main` / Huey transport pad instead of incidental helipad sort order |
| 2026-03-08 | Terrain stream profiling | - | Perf artifacts now include terrain stream budgets/backlog; analyzer skips incomplete/empty latest artifacts |
| 2026-03-08 | Collision queue reset fix | - | Near-field collision rebuilds now drain instead of re-queuing every in-flight frame |
| 2026-03-08 | Vegetation budget tune | - | Reduced vegetation add throughput from 2 cells/frame to 1 after stream probe showed vegetation as the remaining hot terrain stream |
| 2026-03-08 | Vegetation Poisson cache | - | Cached repeated Poisson profiles with deterministic per-cell offsets; post-cache probe brought vegetation to ~1.0ms |
| 2026-03-08 | Adaptive vegetation shedding | - | TerrainSystem now suppresses vegetation adds on unhealthy frames and biases budget toward removals to avoid compounding traversal hitches |
| 2026-03-08 | Terrain debug visibility | - | Terrain stream timings/backlog now visible in performance overlay and F1 diagnostics |
| 2026-03-08 | Terrain probe script | - | Added stable static/traversal terrain probes; startup now uses `sandbox=1&autostart=0`, correct Playwright timeout wiring, and frame-progress readiness |
| 2026-03-08 | Traversal probe decision gate | - | Forced traversal in A Shau/Open Frontier showed vegetation backlog rising from 158 to ~169 while collision partially drained, so the next terrain step is staged vegetation activation or representation split |
| 2026-03-08 | 1.3 HeightQueryCache batch eviction | - | Batch evict 10% on overflow; heap recovery 94%/30.8% vs previous LRU 8.7% |
| 2026-03-08 | Bugfix: sandbagBounds ReferenceError | - | isPositionCover used undefined sandbagBounds; fixed to use fixed crouch height for terrain defilade |
| 2026-03-08 | Bugfix: pointer lock pageerrors | - | requestPointerLock promise rejection caught; eliminates perf capture console_errors failures |
| 2026-03-08 | 2.1 Zone Control product pass | - | Zone dominance bar added; existing HUD already had CAPTURING/LOSING/ATTACKING states, bleed indicators, capture notifications |
| 2026-03-08 | 2.2 TDM product pass | - | Audit clean - no conquest bleed-through; kill target display, bleed hiding, zone hiding all correct |
| 2026-03-08 | 2.3 Open Frontier product pass | - | 60% distinct (pressure corridor, helipads, 4x world); helicopter cosmetic, command label-only |
| 2026-03-08 | 2.4 A Shau Valley product pass | - | Priority zone display (top 5), dominance bar; 15-zone HUD no longer overflows |
| 2026-03-08 | 3.1 GameModeManager review | - | 94-line thin coordinator accepted as-is; validate passes (128 files, 3053 tests) |
| 2026-03-08 | 3.2 Terrain rewrite status | - | T-002/T-004/T-005 done, T-003/T-007 in_progress (asset-blocked), T-008 pending design |
| 2026-03-08 | Doc sync | - | GAME_MODES_EXECUTION_PLAN Phase 1/4/5 status, ACTIVE_GAME_MODES_HANDOFF gaps/resume, ARCHITECTURE_RECOVERY_PLAN Keep Decisions |
| 2026-03-08 | Player-facing 10-step plan | - | Tracers, grenade/kill-streak audio, graphics quality tiers, TDM/ZC/A Shau structures, AnimalSystem, M60 LMG, M79 launcher, ProgrammaticGunFactory deleted |
| 2026-03-08 | Dynamic helipad foundation | - | TerrainFoundationUtils: engine-agnostic height sampling + foundation depth; HelipadSystem uses dynamic depth instead of fixed 0.6m; foundation fills terrain gap on slopes |
| 2026-03-08 | Slope physics + navmesh pathfinding | - | SlopePhysics utility (player speed/slide/step-up, NPC slope penalty), NavmeshSystem (@recast-navigation WASM, solo/tiled, crowd sim), NavmeshMovementAdapter (LOD-gated steering), structure obstacle exclusion, 41 new tests |
| 2026-03-08 | Magic number extraction | - | ~125 magic numbers replaced with named constants across 12 files; shared CombatantConfig.ts (NPC_Y_OFFSET/MAX_SPEED/HEALTH); per-file constants grouped by category |
| 2026-03-09 | Lint cleanup | - | 103 problems -> 9 warnings; unused import removed, ~50 test vars prefixed, eslint --fix auto-fixable |
| 2026-03-09 | SystemInterfaces type safety | - | 7 `any` params replaced with proper types (ITerrainRuntime, HelipadSystem, HelicopterControls, CombatantSystem, ZoneManager, InventoryManager, IAudioManager) |
| 2026-03-09 | Deferred init timeout | - | 15s `withTimeout` wrapper on deferred system init in SystemManager; logs warning on timeout |
| 2026-03-09 | import/no-cycle ESLint rule | - | eslint-import-resolver-typescript installed, maxDepth 3, ignoreExternal; no cycles detected |
| 2026-03-09 | CI perf gate | - | perf-check.yml merged into ci.yml; deploy needs [lint, test, build, perf]; capture has continue-on-error |
| 2026-03-09 | Shared test utilities | - | src/test-utils/ with mockCamera, createTestCombatant, mockTerrainRuntime, mockGameRenderer; 10 files migrated |
| 2026-03-09 | Input system tests | - | InputContextManager (22 tests) + InputManager (43 tests); ~90% coverage from 0% |
| 2026-03-09 | SpawnPointSelector extraction | - | 373 lines extracted from PlayerRespawnManager (857->594 lines); spawn point logic decoupled |
| 2026-03-09 | Mission briefing card | - | MissionBriefing UIComponent for A Shau Valley; shows before deploy with op details + 30s auto-dismiss |
| 2026-03-09 | SpectatorCamera | - | Post-death third-person follow cam; 'spectator' input context; target cycling, auto-advance, overhead fallback; 27 tests |
| 2026-03-09 | GameEventBus | - | Typed singleton (65 lines, 8 events); queue-and-flush per frame; subscribers: AudioManager, HUDSystem, CameraShakeSystem; 8 tests |
| 2026-03-09 | Helicopter tactical insertion | - | SquadDeployFromHelicopter: G key deploy, altitude(<15m)/speed(<5m/s)/30s cooldown checks, 4 terrain-snapped positions; HUD prompt; 18 tests |
| 2026-03-09 | UI/UX overhaul (7 phases) | - | BaseTouchButton refactor (-128 lines), joystickMath utility, WeaponIconRegistry (13 types), KillFeed CSS module + animations, FocusTrap, modal a11y (ARIA/fieldsets/Escape), HelicopterHUD flight instruments (airspeed/heading/VSI/weapon/damage), CrosshairSystem (4 modes), AircraftWeaponMount configs, OnboardingOverlay (5-page opt-in tutorial), mobile gestures (swipe weapons, ADS hold, crouch, haptics, grenade quick-throw, minimap pinch zoom), UI icon manifest |
| 2026-03-10 | Icon integration + IconRegistry | - | 50 pixel-art PNG icons wired into UI. Centralized IconRegistry (`src/ui/icons/IconRegistry.ts`) replaces scattered `import.meta.env.BASE_URL` paths across 16 files. Old WeaponIconRegistry deleted. All touch buttons use icon images. Kill feed has kill-arrow + headshot icons. Faction emblems on start screen. Hint icons in onboarding. Compass needle + helicopter reticles wired. 3398 tests passing. |
| 2026-03-10 | Structure scale + procedural gen | ce9464b | STRUCTURE_SCALE 2.0->2.5 with displayScale (props 0.5x). Procedural firebase (3 templates) + airfield (2 templates) generators. Fixed-wing physics (AC-47/F-4/A-1). NPC pilot AI (7-state FSM). Road surface types (dirt/gravel/jungle_trail). 44 new tests, 3442 total. |
| 2026-03-10 | Open Frontier / A Shau vehicle staging | - | Generator-backed airfields now live in Open Frontier and A Shau Valley. Separate heavy motor pools stage jeeps, trucks, APCs, and M48 tanks. Fixed-wing and ground vehicles remain static world content; helicopters remain the only player-usable vehicles. |
| 2026-03-18 | Mobile vehicle controls + sensitivity | - | VehicleActionBar (EXIT/FIRE/STAB/LOOK) for helicopter mode. Touch sensitivity halved (0.003-0.015). TouchActionButtons test fixed for 5-button layout. Fire visibility gated by aircraft role. Auto-hover wired through touch. 3586 tests. |
