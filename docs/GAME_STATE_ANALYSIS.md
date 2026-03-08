# Terror in the Jungle - Comprehensive State Analysis

Last updated: 2026-03-08
Author: Independent code review (Claude Opus 4.6)

> **NOTE: This analysis was written 2026-03-06. Some items have since been addressed (ProgrammaticGunFactory deleted, graphics quality wired, grenade/kill-streak audio added, player tracers wired, 2 new weapons added, structure placements on TDM/ZC/A Shau, AnimalSystem created).**

---

## Executive Summary

Terror in the Jungle is a browser-based 3D Vietnam War combat simulator built on Three.js r182 with an ambitious scope: from squad-level FPS to battalion-level combined arms, all running in-browser with single-player AI opponents. The project is at a **mid-development inflection point** - foundational systems are solid and well-tested, performance work is evidence-driven and disciplined, but the game is still pre-content: most gameplay involves sprite-based NPCs fighting on procedural terrain with placeholder weapons. The engineering is significantly ahead of the player-facing experience.

### By the Numbers

| Metric | Value |
|--------|-------|
| Source files (non-test) | 327 |
| Test files | 128 |
| Source lines of code | ~70,400 |
| Test lines of code | ~50,000 |
| Tests passing | 3,035+ |
| Integration scenarios | 3 (combat-flow, zone-capture, squad-lifecycle) |
| Runtime dependencies | 3 (three, @preact/signals-core, three-mesh-bvh) |
| Game modes | 5 (TDM, Zone Control, Open Frontier, A Shau Valley, AI Sandbox) |
| Systems directories | 13 |
| HUD components | 30+ |
| CSS Modules | 19 |
| AI state handlers | 4 (patrol, engage, movement, defend) |
| AI tactical subsystems | 6 (cover, flanking, LOS, targeting, suppression, influence map) |
| 3D model assets (GLB) | 80+ |
| Sprite assets (WebP) | 63 |
| Terrain textures | 14 |
| Git commits (all time) | 756 |
| Commits since Mar 1, 2026 | 73 |
| Peak commit day (Mar 4) | 23 commits |

---

## What Is Good

### 1. Architecture and Code Organization

The codebase has a clean, systems-based architecture with a clear orchestrator pattern. Key strengths:

- **Thin GameEngine core**: `GameEngine.ts` delegates to split modules (`GameEngineInit`, `GameEngineInput`, `GameEngineLoop`) keeping the entry point readable. `SystemUpdater.ts` handles per-frame dispatch with budget tracking, EMA timing, and cooldown-gated warnings - genuinely sophisticated for a solo/small-team project.

- **Systems isolation**: 13 system domains (combat, terrain, strategy, player, weapons, helicopter, effects, environment, audio, debug, input, assets, world) each in their own directory with clear boundaries. Cross-system communication goes through `SystemReferences` injected via `SystemInitializer` and `SystemConnector`.

- **Policy-driven game modes**: `GameModeManager` uses `objective.kind` policy checks instead of hardcoded mode ID comparisons. Mode configs are data-driven (`AShauValleyConfig.ts`, `OpenFrontierConfig.ts`, etc.) with a `GameModeRuntime` hook system for mode-specific behavior. This is a clean pattern that will scale.

- **Terrain rewrite quality**: The CDLOD quadtree terrain system is genuinely well-engineered. Single InstancedMesh for the entire terrain (1 draw call), HeightmapGPU baking to R32F DataTexture + RGB8 normal maps, MeshStandardMaterial PBR injection via `onBeforeCompile`, XZ morphing for LOD transitions, auto-scaling LOD levels based on world size. This is production-grade terrain tech.

- **War Simulator tiering**: The `WarSimulator` uses a 3-tier agent model (MATERIALIZED ~2KB / SIMULATED / STRATEGIC ~120 bytes) that allows 3,000 agents at A Shau scale. `MaterializationPipeline` prioritizes nearest squads. `StrategicDirector` biases activity toward the player. `AbstractCombatResolver` reduces kill rates near the player to prevent silent deaths. This is a thoughtful design for scale.

- **Minimal dependency footprint**: Only 3 runtime dependencies. The project avoids framework bloat. Preact signals for UI reactivity is a good lightweight choice.

### 2. Performance Engineering

The performance work is the project's standout quality. It is evidence-driven, disciplined, and well-documented:

- **Perf harness**: Full Playwright-based capture system with headed/headless modes, configurable scenarios, warm/cold distinction, matched-pair methodology. Captures include avg frame time, p99, AI starvation index, heap growth/recovery, shots/hits combat pressure validation. This is more rigorous than most commercial indie projects.

- **Regression gates**: `perf:compare` against committed baselines, wired into CI. Deploy is gated on lint + test + build. `validate:full` includes a combat120 perf check.

- **Documented decision trail**: Every optimization attempt is recorded with before/after evidence, including reverted experiments. The `ARCHITECTURE_RECOVERY_PLAN.md` has 40+ "Keep Decisions" with rationale. This institutional memory is invaluable.

- **Current numbers**: combat120 at avg ~12.3ms, p99 ~34ms (was 86.9ms). frontier30m at avg ~6.6ms. These are strong for 120 materialized NPCs in-browser.

- **Specific optimizations landed**: Numeric quantization keys for HeightQueryCache, batch eviction (10% on overflow), BVH grid step reduction (4m to 6m), cover search grid from 12x12 to 8x8 with early-out, terrain tick staggering, AI neighborhood cache reuse, vegetation Poisson cache, adaptive vegetation shedding. Each backed by evidence.

### 3. Testing Infrastructure

- **3,035+ unit tests** across 128 test files with a ~71% test-to-source line ratio
- **Integration scenario tests** (`combat-flow`, `zone-capture`, `squad-lifecycle`) that wire real systems with minimal mocks (only HeightQueryCache + Logger mocked)
- **Vitest** with jsdom, fast execution, dot reporter for quick runs
- **Knip** for dead code detection
- **ESLint** with TypeScript plugins
- **Separated test commands**: `test:quick` (unit only), `test:integration`, `test:frontier` (targeted subset), `validate` (type-check + unit + build), `validate:full` (+ perf)

### 4. Documentation Discipline

The documentation is unusually thorough and well-maintained:

- `NEXT_WORK.md`: Tiered checklist with acceptance criteria, results, and completion log
- `ARCHITECTURE_RECOVERY_PLAN.md`: Priority board, keep decisions, open risks, evidence requirements
- `ROADMAP.md`: 10-phase aspirational roadmap with resolved decisions
- `CODEBASE_BLOCKS.md`: Hub index with coupling heatmap and tick graph
- 10 per-domain block docs in `docs/blocks/`
- `PROFILING_HARNESS.md`, `AGENT_TESTING.md`, `TERRAIN_REWRITE_MASTER_PLAN.md`
- CLAUDE.md kept current with daily commands and current focus

### 5. UI System

- CSS Grid layout with 18 named HUD regions - clean and maintainable
- CSS Modules + Preact signals for reactive updates
- VisibilityManager drives HUD state via data attributes (`data-phase`, `data-vehicle`, `data-ads`, `data-device`)
- Unified weapon bar replacing 3 duplicates
- Pointer events throughout (no touch/mouse split)
- Mobile-aware: compact fullscreen prompt, touch controls, responsive layout
- Match end screen, kill feed, damage numbers, hit markers, ticket display with urgency pulses

### 6. Asset Pipeline

- 80+ GLB models already generated (6 aircraft, 5 ground vehicles, 2 watercraft, 9 weapons, 34 structures, 6 animals, 12 buildings, 1 prop)
- 4 faction sprite sets (US, NVA, ARVN, VC) with directional variants
- 14 terrain biome textures
- 13+ vegetation billboard sprites
- Asset optimization script (`assets:optimize`) with sharp for image processing
- Assets organized by category in `public/models/` and `public/assets/`

---

## What Is Done Poorly / Needs Rework

### 1. GLB Models Are Unused

This is the single largest disconnect in the project. There are **80+ GLB models** sitting in `public/models/` covering aircraft, ground vehicles, watercraft, weapons, structures, animals, and buildings - but the game still uses:

- **Procedural geometry** for the helicopter (HelicopterGeometry.ts still creates geometry in code)
- ~~**ProgrammaticGunFactory** for first-person weapons (code-generated box/cylinder meshes)~~ **(deleted 2026-03-08, all weapons now load GLBs)**
- **No structures placed** on the map from the GLB library (bunkers, guard towers, village huts, etc.)
- **No animals** spawned despite 6 animal GLBs ready
- **No ground vehicles or watercraft** despite 7 models ready
- **ModelLoader.ts and ModelPlacementProfiles.ts exist** but are minimally wired

The engine has an entire content library that has never been integrated. The asset-driven architecture principle from the roadmap is aspirational, not actual. The game looks like a prototype despite having production assets available.

**Impact**: This is the #1 thing holding back the player-facing experience. A player launching the game sees procedural boxes for weapons and simple geometry for helicopters, not the GLB models in the asset library.

### 2. First-Person Weapon Presentation

~~`ProgrammaticGunFactory.ts` creates weapons from boxes and cylinders.~~ **Update (2026-03-08): ProgrammaticGunFactory has been deleted. All first-person weapons now load GLB models.** With 9 weapon GLBs ready (`m16a1.glb`, `ak47.glb`, `m60.glb`, `m1911.glb`, `m79.glb`, `rpg7.glb`, `ithaca37.glb`, `m3-grease-gun.glb`, `m2-browning.glb`), this concern has been resolved.

### 3. Audio Is More Present Than Expected But Still Incomplete

The audio situation is better than a first glance suggests - weapon sounds, death sounds, explosions, and jungle ambience ARE wired through `AudioWeaponSounds` with pooling (gunshot pool: 20, death: 10, explosion: 8) and 3D spatial positioning. However:

- `VoiceCalloutSystem` was fully deleted (removed 2026-03-06, was never enabled)
- Grenade audio has 3 TODO(audio) comments waiting on dedicated assets
- Kill streak audio stings disabled (noted as TODO in StatsPanel)
- Bullet whiz/flyby sounds commented out in config
- Hit marker sound commented out in config
- No music system
- `RadioTransmissionSystem` exists with transmission assets in `public/assets/transmissions/` - one of the more complete audio subsystems
- `FootstepAudioSystem` is terrain-aware (grass/mud/water/rock, 4-8 concurrent sounds, 30m range)

**Impact**: The combat audio foundation exists (weapon fire, death, explosions, ambient) but voice feedback, hit confirmation sounds, and the immersive "radio chatter during firefight" experience are missing. The gap is more about polish and immersion than total silence.

### 4. Water System Is Basic

- `WaterSystem.ts`: global water plane with basic shader
- `RiverWaterSystem.ts`: shader-based rivers
- No swimming mechanics
- No boats (despite PBR and sampan GLBs existing)
- Disabled in A Shau mode
- The water shader appears basic (no depth-based rendering, no foam, no reflection)

### 5. NPC Sprites Are Functional But Visually Limiting

The sprite system works (directional billboards with walk animation), but:
- 512x512 sprites downscaled from 1024 with nearest-neighbor filtering
- Only 2 animation frames for walk cycle (front/back/side)
- No wounded/crawling animations
- No faction-specific behavior animations (NVA crouch, VC hide)
- At close range, the flat billboard nature is very visible
- No transition plan to 3D NPCs (roadmap mentions it as possibility but no technical groundwork)

### 6. Squad Command UX Is Incomplete

- Desktop and touch command entry works through `CommandInputManager` with map-first overlay
- **Gamepad still falls back to radial menu** while desktop/touch gets the new map-first surface
- No company/battalion-level command scaling (same squad UI at all scales)
- The `QuickCommandStrip` is basic (move/hold/assault/defend/retreat)
- No waypoint queuing, no formation commands, no support request interface
- The "RTS layer" from the vision is still aspirational

### 7. Helicopter Is Functionally Cosmetic

Per the Open Frontier product pass audit:
- Helicopters can be flown manually but serve no tactical purpose
- No NPC boarding/transport mechanic
- No door gun weapons
- No damage model
- No enemy aircraft
- Throttle still feels sticky (known bug documented in ROADMAP.md)
- No AI pilot mode
- The helicopter is a tech demo within the game, not an integrated combat system

### 8. Post-Processing Is Crude

`PostProcessingManager.ts` applies:
- Pixelation (render at 1/3 resolution, nearest-neighbor upscale)
- Color quantization (24 color levels)

This gives a "retro" look but:
- No bloom, no SSAO, no depth of field, no motion blur
- No volumetric fog/lighting
- Antialias is disabled (`antialias: false`)
- The "pixel-perfect" aesthetic may be intentional but limits visual appeal for a 3D combat game
- ~~No graphics quality settings for users who want higher fidelity~~ **Update (2026-03-08): `applyGraphicsQuality()` now exists in GameEngine.ts with 4 tiers (low/medium/high/ultra).**

### 9. No Save/Persistence System

- No match persistence (closing tab = losing progress)
- No player progression between matches
- No settings persistence beyond `SettingsManager` (which uses localStorage for basic prefs)
- No campaign state
- The `PersistenceSystem.ts` in strategy/ appears to be for war sim state, not player save data

### 10. Version Is 0.0.0

`package.json` still has `"version": "0.0.0"`. No versioning scheme, no changelog, no release process. This makes it hard to track what state a deployed build is in.

### 11. Type Safety Has Gaps

The codebase has ~157 instances of `any`/`unknown` in production code and ~48 type suppression comments (`@ts-ignore`/`@ts-expect-error`). Window globals (`__engine`, `__renderer`, `__metrics`) use `as any` casts. `SystemReferences` is initialized as `{} as SystemReferences`, forcing an empty object assertion across 50+ properties. This is acceptable at the current scale but will become a maintenance burden as the system grows.

### 12. AI Raycast Budget Creates Perceptual Issues

`AILineOfSight` uses a per-frame raycast budget (default 8). When 50+ NPCs compete for LOS checks, raycasts get denied 40-60% of the time - making AI appear blind even when enemies are clearly visible. The 150ms LOS cache helps but new combatants bypass it. This is the hard ceiling on perceived AI quality at scale and isn't surfaced to the player in any way.

### 13. 15+ Systems Run Without Performance Tracking

`SystemUpdater` tracks 9 tick groups (Combat, Terrain, Billboards, WarSim, etc.) with budget enforcement, but 15+ systems run in an untracked catch-all: AssetLoader, AudioManager, Skybox, PlayerHealth, PlayerRespawn, Helipad, Helicopter, GameMode, SquadController, Inventory, CameraShake, Suppression, Flashbang, Smoke, InfluenceMap, FootstepAudio. These are performance blind spots that could contribute to p99 tail spikes without attribution.

---

## What Is In Progress

### Active Work (from NEXT_WORK.md Tier Status)

| Item | Status | Notes |
|------|--------|-------|
| Perf capture validation (Tier 0) | DONE | p99 improved 60%, AI starvation improved 70% |
| Doc sync (Tier 0) | DONE | Phase 6/7 status updated across all docs |
| Cover search optimization (Tier 1.1) | DONE | 8x8 grid, 4-candidate early-out |
| Terrain tick stagger (Tier 1.2) | DONE | BVH skip on vegetation frames |
| HeightQueryCache batch eviction (Tier 1.3) | DONE | 10% batch evict, heap recovery 94%/30.8% |
| Zone Control product pass (Tier 2.1) | DONE | Zone dominance bar added |
| TDM product pass (Tier 2.2) | DONE | Clean audit, no bleed-through |
| Open Frontier product pass (Tier 2.3) | DONE | 60% distinct, 40% reskin |
| A Shau product pass (Tier 2.4) | DONE | Priority zone display (top 5) |
| GameModeManager review (Tier 3.1) | DONE | Accepted as-is (94-line thin coordinator) |
| Terrain rewrite items (Tier 3.2) | PARTIAL | T-002/T-004/T-005 done; T-003/T-007 in_progress (asset-blocked); T-008 pending |

### Partially Complete Systems

- **Terrain CDLOD**: Core working, LOD morphing done, biome/vegetation wired but visual tuning pending. Hydrology (T-008) not started.
- **Loadout system**: Default presets per faction + customizable loadouts live. Field pickup and objective crate swapping are future work.
- **Map features**: `TerrainFeatureCompiler`, `WorldFeatureSystem`, `WorldFeaturePrefabs` exist with prefab definitions (firebase, bunker, village) but integration with GLB models is incomplete.
- **Influence map**: `InfluenceMapSystem` with grid computation exists but is lightly used by AI decision-making.

### Architecture Recovery Priority Board

| Priority | Status |
|----------|--------|
| P0: Harness integrity | IN_PROGRESS (mostly done) |
| P1: Spatial ownership | DONE |
| P2: Heap growth triage | IN_PROGRESS |
| P3: A Shau gameplay flow | IN_PROGRESS |
| P4: UI/HUD discipline | DONE |
| P5: Terrain stabilization | IN_PROGRESS |

---

## What Remains on the Roadmap

### Near-Term (Tiers 3-4 in NEXT_WORK.md)

- T-008: Hydrology system layer (rivers as gameplay feature)
- Vegetation billboard remakes (Sprint 1 asset work)
- Terrain textures (authored PBR assets for biome blending)
- Helicopter GLB swap (UH-1 Huey, UH-1C Gunship)
- Weapon viewmodel GLB swap
- System toggle debug panel
- Asset preview sandbox
- Terrain sandbox

### Medium-Term (Roadmap Phases 2-4)

- **Phase 2**: Full GLB integration across all systems (helicopters, weapons, structures, vegetation)
- **Phase 3**: Helicopter controls overhaul (door guns, NPC boarding, AI pilot, vehicle abstraction)
- **Phase 4**: Full squad command and RTS layer (company/battalion scaling, tactical view, waypoint system)

### Long-Term (Roadmap Phases 5-10)

- **Phase 5**: Terrain engine module (biome system, road/trail generation, village generation, water engine)
- **Phase 6**: Ground vehicles and watercraft
- **Phase 7**: Combat expansion (loadout depth, stationary weapons, new weapon types, animals)
- **Phase 8**: Fixed-wing aircraft and air war
- **Phase 9**: Faction expansion and new game modes (survival/roguelite)
- **Phase 10**: Full-Vietnam scale simulation

### Performance Targets Not Yet Met

| Target | Current | Goal |
|--------|---------|------|
| Avg frame time | ~12.3ms | <8ms |
| P99 frame time | ~34ms | <16ms |
| Heap budget | Warnings at scale | <512MB |
| Load time | Not measured | <5s to first frame |

---

## Independent Observations and Ideas

### 1. The Content Gap Is the Critical Path

The engineering is ahead of the content. The game has production-grade terrain, sophisticated AI, evidence-driven performance, solid testing - but a player sees procedural weapons, sprite NPCs, empty terrain, and hears almost nothing. **The single highest-impact work is wiring up the existing 80+ GLB models.** This would transform the visual impression of the game overnight without requiring new code architecture.

Recommended priority:
1. First-person weapon GLBs (player stares at this constantly)
2. Structure placement at objectives (bunkers, sandbags, guard towers give zones visual identity)
3. Helicopter GLB swap (most visible vehicle)
4. Animal spawning in vegetation (ambient life makes the jungle feel alive)

### 2. Audio Should Be Treated as a P0

The game is a combat simulator that is mostly silent. Even placeholder/synthesized audio would dramatically improve game feel:
- Weapon fire sounds (the footstep synthesis approach could be extended)
- Explosion/impact sounds
- Ambient jungle soundscape (birds, insects, wind)
- Helicopter rotor audio (already has `HelicopterAudio.ts` and `RotorBlades.ogg`)
- Radio chatter between squads
- Rain/storm ambience for weather states

The `AudioManager`, `AudioPoolManager`, and `AudioDuckingSystem` infrastructure already exists. The gap is content and wiring, not architecture.

### 3. The Retro Aesthetic May Be Limiting Audience

The intentional pixelation + color quantization post-processing gives a retro look, but:
- It clashes with the serious military simulation tone
- It makes the terrain PBR work (triplanar mapping, splatmap blending) invisible
- It reduces readability at distance (harder to spot NPCs)
- ~~There's no option to disable it~~ **Update (2026-03-08): Graphics quality tiers now exist; higher tiers can disable the retro filter.**

Consider: make the retro filter optional (graphics settings), or replace with more modern post-processing (subtle bloom, SSAO, color grading) that enhances rather than reduces visual fidelity. The terrain system and lighting setup deserve to be seen at full resolution.

### 4. The "Play and Command Simultaneously" Vision Needs a UX Breakthrough

The core vision - "player is both a combatant and a commander" - is the most compelling and most challenging aspect. Current state: the command UI is a basic overlay with move/hold/assault/defend orders. To realize the vision of commanding battalion-scale operations while fighting, consider:

- **Contextual command shortcuts**: Instead of opening a map, let the player point at terrain and issue orders directly. "Send squad to where I'm looking" with a single key.
- **Audio-driven command feedback**: Instead of requiring visual attention on the map, use radio transmissions to report squad status. "Alpha squad taking heavy fire at Firebase Bravo" tells the player what's happening without leaving first-person view.
- **Adaptive command delegation**: At battalion scale, auto-delegate routine orders to AI subordinate commanders. The player only needs to set strategic objectives; company/platoon leaders handle tactics. This is how real military command works and it scales the UX naturally.
- **Heat map minimap**: Replace per-unit dots with an influence heat map on the minimap. At battalion scale, individual units are noise - the player needs to see "where is the front line moving?"

### 5. Map Feature System Could Drive Gameplay Variety

`WorldFeaturePrefabs.ts` defines firebase layouts, bunker clusters, NVA trail bases, villages, and AA sites. Combined with the GLB model library, this could generate rich, distinct objective areas:

- Firebase with sandbag walls, guard towers, ammo bunkers, helipad, command tent
- NVA tunnel complex with concealed entrances and bunkers
- Village with huts, rice barn, market stall, pagoda
- AA site with ZPU-4 and SAM launchers

This transforms zones from "invisible capture radius on featureless terrain" to "distinct tactical locations with cover, elevation, and personality." The code infrastructure exists; it needs content wiring.

### 6. The WarSimulator Architecture Is Underexploited

The 3-tier agent model is sophisticated but mostly invisible to the player. Ideas to surface it:

- **Front line visualization**: Draw the BLUFOR/OPFOR contact line on the full map as a dynamic front. This gives the player strategic awareness and makes the war sim tangible.
- **Strategic events**: When the StrategicDirector makes major decisions (reinforcement surge, zone abandonment, flanking maneuver), surface these as radio intel. "HQ reports enemy reinforcements moving through grid reference..."
- **Casualty reports**: Show aggregate losses per zone/time period. This makes the abstract combat resolver's work visible.
- **War correspondent moments**: Snapshot particularly intense battles (high kill rates, zone flips) and surface them as "news ticker" events.

### 7. A Shau Valley Could Be the Showcase Mode

A Shau is the most ambitious mode (3000 agents, 21km DEM terrain, 18 zones, 60-min matches). It could become the project's signature:

- It's the only mode using real-world terrain data (DEM)
- It's the only mode with the full war simulator running
- It has the most unique tactical feel (air assault insertion, strategic agent pressure)

But it needs: mission briefing, clearer objectives for new players, front line overlay, and visual landmarks (structures at key zones). The DEM terrain alone is impressive; with placed structures and audio it could be a compelling experience.

### 8. Consider a "First Five Minutes" Sprint

Right now, a new player launches the game and sees:
1. Start screen
2. Mode selection
3. Deploy map
4. Drops into procedural terrain with a procedural gun
5. Sees sprite NPCs
6. Hears footsteps

The first impression undersells the engineering. A focused sprint on the first five minutes could include:
- GLB weapon in first-person
- Structures at the first objective zone
- Ambient audio (jungle sounds, distant gunfire)
- A brief text overlay explaining the mode objective
- One helicopter visible on a helipad (GLB model)

This would dramatically change the perception of completeness.

### 9. Multiplayer Architecture Readiness

The roadmap says "architect so it's not blocked" but the current design has several patterns that would complicate multiplayer:

- `SystemUpdater` runs all systems synchronously in a single thread
- `SpatialGridManager` is a singleton with frame-local state
- AI runs on the main thread with no serialization boundary
- No client/server separation in the game loop
- No network-aware input handling

This is fine for the stated single-player focus, but if multiplayer ever becomes a goal, the refactoring cost would be significant. This isn't a criticism - it's the right tradeoff for now. Just worth being explicit about.

### 10. TypeScript Configuration and Build

- TypeScript 5.9 with strict mode is good
- Vite 7.3 for fast dev iteration is excellent
- Build output includes gzip compression (`vite-plugin-compression`)
- No bundle size tracking or budget enforcement
- No tree-shaking analysis of the 3 runtime deps
- Production build doesn't strip `import.meta.env.DEV` guards (they're correctly dead-code eliminated by Vite, but this isn't verified)

### 11. Quick Visual Wins That Would Transform Combat Feel

The rendering agent identified several high-impact, low-effort visual improvements:

**Tier 1 (1-2 days each):**
- Muzzle flash sprites on weapon fire (100ms additive flash at muzzle position)
- Tracer rounds for suppressive fire (visible line trails for bursts >5 shots)
- Impact dust/dirt spray at bullet impact points (use biome color for tint)
- Helicopter rotor dust (particles when hovering <50m)

**Tier 2 (3-5 days each):**
- Destructible vegetation (billboards fade/remove on nearby explosions)
- NPC run animation sprites (separate from walk cycle)
- Wounded/limping sprites for units below 50% health
- Volumetric fog/mist at river valleys and depressions

These would transform combat from "sprites shooting silently at each other" to "visceral firefight with visible tracers, muzzle flashes, and terrain impact."

### 12. Combat AI Has Sophisticated Tactics That Players Can't See

The AI combat system is genuinely deep - multi-stage flanking with suppression/positioning/engagement phases, cover evaluation based on threat direction/height/occupation, cluster-aware target distribution, peek-and-fire from cover with burst variation. But almost none of this is visible to the player:

- Suppression level is internal (no UI indication that an NPC is suppressed)
- Flanking maneuvers happen but the player can't tell a coordinated flank from random movement
- Cover usage is sophisticated but NPCs don't animate into cover positions (sprite limitation)
- The influence map drives squad behavior but the player has no visibility into it

Surfacing these AI behaviors visually (suppression indicators, flanking intent markers, cover usage animation) would make the AI feel dramatically smarter without changing any AI code.

---

## Risk Assessment

### High Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Content gap erodes motivation | Project never feels "playable" despite solid engineering | Prioritize GLB integration and audio; make the game look/sound like a game |
| Performance targets unreachable at scale | A Shau/Open Frontier remain tech demos | Hold scale ambitions until p99 <16ms at combat120; consider worker offload for AI |
| Scope creep from 10-phase roadmap | Each phase adds systems but nothing ships | Define a "v0.1" cut: pick 1 mode, 1 vehicle, full audio, ship it |

### Medium Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Stale baselines | Perf regression detection breaks | Recapture baselines regularly; automate in CI |
| Sprite-to-3D NPC transition | Architectural risk if attempted later | Design the combatant renderer with a swap layer now |
| Single-developer bus factor | All knowledge in one person + docs | Keep docs current (already doing this well) |

### Low Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Three.js breaking changes | r182 dependency | Pin version, upgrade intentionally |
| Browser compatibility | WebGL2 is well-supported | Already testing Chrome/Firefox/Edge/mobile |
| Dependency vulnerabilities | 3 runtime deps, low surface area | Regular npm audit |

---

## Scorecard

| Domain | Grade | Rationale |
|--------|-------|-----------|
| Architecture | A | Clean systems, policy-driven modes, minimal coupling, well-factored |
| Performance Engineering | A+ | Evidence-driven, matched-pair methodology, regression gates, documented decisions |
| Testing | A- | 3000+ tests, integration scenarios, perf harness; gap in E2E/visual tests |
| Documentation | A | Comprehensive, current, well-structured; rare for any project |
| Code Quality | A- | Consistent patterns, dead code cleanup ongoing, few TODOs; 157 `any` casts noted |
| AI/Combat Systems | A- | Sophisticated flanking/cover/suppression/cluster tactics; raycast budget ceiling, invisible to player |
| Visual Presentation | C | Procedural weapons, sprite NPCs, retro filter hides terrain quality, no structures |
| Audio | C- | Weapon/death/explosion/ambient wired with pooling; missing voice, hit feedback, polish |
| Content Integration | D+ | 80+ GLBs unused; terrain textures exist but barely visible through retro filter |
| Gameplay Loop | C+ | Combat works, modes are differentiated, but thin on tactical depth and player feedback |
| Player Experience | C | Functional but raw; undersells the engineering quality dramatically |
| Helicopter/Vehicles | D+ | Flyable but cosmetic; no combat role, no passengers, no damage |
| Command/RTS Layer | C- | Basic squad orders work; battalion-scale vision is far from realized |
| Mobile Experience | B | Full touch controls, responsive 4-tier viewport, fullscreen/landscape lock; no haptics |
| CI/CD | B+ | Lint + test + build gated, GitHub Pages deploy; perf checks advisory; no bundle budgets |
| Terrain System | A | CDLOD quadtree, 1 draw call, PBR splatmap, auto-LOD scaling, BVH collision - production grade |

**Overall: B (Strong engineering foundation, weak content surface, but closer to shippable than it looks)**

---

## Recommended Priority Order

1. **First-person weapon GLB integration** (highest visual impact, player sees this every frame)
2. **Audio foundation** (weapon fire, explosions, ambient jungle - even synthesized)
3. **Structure placement at zones** (makes objectives visually distinct)
4. **Helicopter GLB swap** (most visible model in the game)
5. **Graphics settings** (let players toggle retro filter, adjust quality)
6. **Animal spawning** (ambient life with the 6 existing GLBs)
7. **Helicopter door guns + damage** (makes the helicopter matter)
8. **Mission briefing for A Shau** (showcase mode needs onboarding)
9. **Front line visualization on map** (surface the war sim to players)
10. **Define and ship v0.1** (pick a scope, declare it done, get player feedback)
