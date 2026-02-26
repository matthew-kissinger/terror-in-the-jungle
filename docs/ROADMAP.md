# Terror in the Jungle - Roadmap

Last updated: 2026-02-25
Status: DRAFT - Awaiting alignment

> **Note:** This is an aspirational planning document. Phase dates and scope are not commitments. See `ARCHITECTURE_RECOVERY_PLAN.md` for active work status and `UI_ENGINE_PLAN.md` for UI migration status.

## Vision

This is a **war simulation engine** - not a single game. The engine powers game modes from squad-level FPS to theater-level combined arms RTS, all running in a browser.

Core loop: **Play in first person AND command simultaneously.** The player is both a combatant and a commander. At squad scale, you're issuing move/hold/assault orders to your fire team. At battalion scale, you're directing troop movements, calling airstrikes, managing reinforcements via helicopter, and coordinating combined arms - all while still being able to pick up a rifle and fight.

Vietnam War is the first theater. The architecture should generalize to any war with different factions, terrain, vehicles, and doctrine.

**Three.js reference:** https://threejs.org/docs/llms-full.txt

## Current State Summary

| Domain | State | Key Limitation |
|--------|-------|----------------|
| Vehicles | 1 player-only UH-1 Huey | No NPC boarding, no weapons, no damage, no enemy aircraft, throttle sticks |
| Weapons | 4 player + 2 NPC types | No loadout selection, all weapons always available |
| AI | 8-state FSM, 2 factions (US/OPFOR) | No vehicle usage, no turret manning, limited tactical intelligence |
| Squad | 5 commands via Z-menu | Conflicting mobile/PC controls, dead code paths, radial menu race condition on touch |
| Terrain | Noise + DEM chunking | Single ground texture, no biome variation, no terrain engine module |
| Vegetation | 7 billboard types | Old assets, uniform distribution, no biome awareness |
| Water | Global plane + shader rivers | No swimming, no boats, disabled in A Shau, shader is basic |
| Assets | 75 GLBs generated (not yet integrated), all in-engine still procedural | Models staged in `deploy-3d-assets/`, engine still uses boxes/cylinders |
| HUD/UI | UI Engine Phases 0-7 complete (CSS Modules + signals) | Squad UI scattered, no RTS command surface, no vehicle weapon HUD |
| Scale | 3000 agents / 21km map | Heap growth warnings at current scale, architecture recovery P0-P3 active |
| Factions | US vs OPFOR (labeled VC) | No NVA/ARVN/VC visual distinction, no faction switching |

## Known Bugs (Confirmed)

### Helicopter Throttle
- **Symptom:** Collective stays elevated after releasing W key
- **Root cause:** PlayerMovement.ts lerps collective to 0.4 (hover point) on key release with autoHover on. With autoHover off, collective doesn't decay AT ALL.
- **Two-layer smoothing** (PlayerMovement lerp @ 2.0 + HelicopterPhysics lerp @ 8.0) compounds the stickiness.
- **Fix needed:** Explicit control schema - hold for thrust, release for none, dedicated lock button for maintaining altitude.

### Squad Controls
- **Dead code:** TouchActionButtons has no squad button but TouchControls wires a 'squad' case that never fires.
- **Race condition:** SquadRadialMenu touchend fires command before touchmove can select correct segment.
- **Split input paths:** Z-key handled in PlayerInput.ts, Shift+1-5 handled directly in PlayerSquadController.ts.
- **See:** `docs/SQUAD_COMMAND_REARCHITECT.md` for full analysis.

## Resolved Decisions

1. **Loadout:** Default loadout presets per faction + fully customizable loadouts. Player can change loadout on respawn. Implies rearchitect of start/deploy screen and respawn flow.
2. **Command mode:** Fully real-time. No time slowdown. Controls and HUD must be designed so commanding at scale is viable without pausing. This means the command UX must be extremely efficient - quick-access shortcuts, map-based point-and-click, minimal menu depth.
3. **Water:** Part of larger plan. Needs proper implementation as terrain engine module. Sandbox test mode for isolated water/biome development before integration.
4. **Survival:** Roguelite survival mode is a future game mode. Note it but don't architect for it now. Animals serve triple purpose: ambient decoration, environmental hazard, and food source (in survival modes later).
5. **NPC rendering:** Sprites for now. Possible 3D NPC models later if performant, with billboard LOD fallback at distance. Don't over-invest in sprite infrastructure that blocks 3D transition.
6. **Sandbox test mode:** Configurable engine module, not one monolith mode. Break into blocks: terrain sandbox, vehicle sandbox, asset preview, system toggle panel. Each block independently useful.
7. **Historical accuracy vs gameplay:** Case-by-case. Ask before making a call on conflicts.
8. **Campaign:** Engine module. Architect so linear missions, dynamic campaign, and sandbox operations can all be built as game modes. Not a near-term build.
9. **Multiplayer:** Not building now. Architect so it's not blocked. Single-player with AI is the focus.
10. **Respawn/deploy flow:** Full revamp. Map with spawn point selection + loadout customization + deploy button. Cross-platform (desktop, mobile, gamepad).

## Architecture Principles

1. **Engine-first:** Every system built as a reusable module, not a one-off feature. Terrain is a terrain engine. Vehicles are a vehicle system. Factions are data-driven configs.
2. **Scale-agnostic:** Same systems power 8v8 and 3000v3000. Materialization tiers handle the scale transition.
3. **Input-agnostic:** Single control schema drives keyboard, touch, and gamepad. No platform-specific input wiring.
4. **Asset-driven:** Models, textures, and sprites loaded from files (GLB/WebP/PNG), not generated procedurally in code.
5. **Faction-flexible:** Player can play any faction. Factions are configs (sprites, weapons, AI doctrine, voice lines), not hardcoded.
6. **Sandbox-testable:** Every major system (terrain, water, vehicles, structures) has a sandbox test mode for isolated development and iteration.

---

## Phase 0: Asset Manifest [DONE]
**Deliverable:** `docs/ASSET_MANIFEST.md` - comprehensive generation queue for Pixel Forge agent.
**Contents:** 80+ assets with prompts, tri budgets, mesh part naming, animations, scale specs.
**Categories:** 6 aircraft, 5 ground vehicles, 2 watercraft, 8 weapons, 12 structures, 6 defense systems, 6 animals, 8 terrain textures, 13 vegetation billboards, 4 faction sprite sets, UI/HUD assets.
**Priority sprints:** 4 sprints ordered by dependency (replace procedural -> expand visual -> combat systems -> extended content).

---

## Phase 1: Asset Generation Sprint
**Goal:** Generate HIGH priority assets via Pixel Forge.
**Method:** Mount coding agent in Pixel Forge repo with ASSET_MANIFEST.md as context.
**Deliverable:** GLB files in `public/models/`, sprites/textures in `public/assets/`.

### Sprint 1 Priority Order
1. All 7 vegetation billboard remakes + bamboo grove
2. Dense jungle floor + muddy trail textures
3. UH-1 Huey Transport + UH-1C Gunship GLBs
4. M16A1, AK-47, M60 weapon viewmodel GLBs
5. Sandbag Wall, Bunker, Ammo Crate, Helipad GLBs
6. M2 Browning .50 cal mounted weapon GLB
7. NVA Regular infantry sprites (9 sprites, replace VC)

### Workflow
1. Agent reads ASSET_MANIFEST.md for prompts and specs
2. Kiln API for 3D models (GLB) with named mesh parts
3. Sprite Generator for 2D assets (vegetation, soldiers, textures)
4. Use existing US soldier sprites as image input for faction variants
5. Export to Terror in the Jungle public/ directory
6. Iterate: review in-engine, regenerate if quality insufficient

---

## Phase 1.5: Sandbox & Test Infrastructure
**Goal:** Modular sandbox blocks for isolated testing of engine systems.
**Dependencies:** Independent. Can start anytime. Each block is independently useful.

### Architecture
Not one monolith sandbox mode. Instead, composable blocks that can be combined:

| Block | Purpose | URL Param |
|-------|---------|-----------|
| Terrain Sandbox | Test biome textures, vegetation placement, chunk rendering, noise params | `?sandbox=terrain` |
| Vehicle Sandbox | Test vehicle physics, GLB loading, controls, damage | `?sandbox=vehicle` |
| Asset Preview | Load and inspect any GLB/sprite, rotate, zoom, check mesh parts | `?sandbox=asset` |
| Water Sandbox | Test water shader, swimming, buoyancy, river rendering | `?sandbox=water` |
| Combat Sandbox | Spawn NPCs, test weapons, turrets, AI behavior | `?sandbox=combat` |
| System Toggle | Debug panel to enable/disable any system at runtime | Always available via `?debug=1` |

### Shared Infrastructure
- `SandboxConfig` in `src/config/gameModes.ts` - configurable per block
- Flat terrain default, free camera, no win/loss, no timers
- Debug panel UI: spawn entity dropdown, teleport, toggle systems, perf overlay
- Reuse existing `SandboxModeDetector` infrastructure (already exists in code)
- Each block registers its own debug controls via a plugin interface

### Implementation Order
1. System toggle panel (debug overlay, useful immediately)
2. Asset preview block (validates Pixel Forge output)
3. Terrain sandbox (biome iteration)
4. Vehicle sandbox (physics tuning)
5. Water sandbox (shader development)
6. Combat sandbox (AI iteration)

---

## Phase 2: Asset Integration & Engine Wiring
**Goal:** Replace all procedural geometry with GLB models. Build asset loading infrastructure.
**Dependencies:** Phase 1 assets generated.

### 2A. GLB Loading Infrastructure
- GLTFLoader utility with caching and error handling
- Asset registry: map model IDs to file paths
- LOD strategy for GLB models (distance-based swap or billboard fallback)

### 2B. Helicopter Model Swap
- Replace HelicopterGeometry.ts + HelicopterGeometryParts.ts with Huey.glb
- Wire named mesh parts: mainRotor (spin), doorGunLeft/Right (aim), cockpitGlass (transparency)
- Adjust collision bounds and interaction radius to match new geometry
- Add gunship variant loading (UH-1C.glb with rocket pods + minigun parts)

### 2C. Weapon Viewmodel Swap
- Replace ProgrammaticGunFactory.ts with GLB loading
- Wire animation clips from GLB (reload, fire recoil, ADS transition)
- Map muzzle flash spawn point to named `muzzle` mesh part
- Weapon-specific animations: M60 belt feed, shotgun pump, pistol slide

### 2D. Structure Integration
- Replace procedural sandbag mesh with GLB
- Place bunkers, ammo crates, guard towers at objective zones (zone config driven)
- Ammo crate `lid` part animated on interaction (weapon swap at captured objectives)
- Wire firebase structures to game mode configs

### 2E. Vegetation Billboard Swap
- Replace 7 billboard textures with new Pixel Forge sprites
- Add new vegetation types (bamboo, banana, tall grass) to ChunkVegetationGenerator
- Maintain performance: same InstancedMesh billboard rendering, new textures only

### 2F. Terrain Texture Expansion
- Multi-texture terrain material (per-chunk or per-vertex biome selection)
- Initial: height/slope-based texture selection (jungle floor low, rocky high, laterite cleared)
- Texture atlas or array texture for GPU-efficient multi-texture rendering

---

## Phase 3: Helicopter & Vehicle Controls Overhaul
**Goal:** Fix helicopter controls, add weapons, build unified vehicle control schema.
**Dependencies:** Phase 2B (GLB loaded), Phase 2C (weapon models).

### 3A. Helicopter Control Fix
- **Collective:** Direct input (hold W = thrust, release = no thrust). Remove lerp-to-0.4 behavior.
- **Altitude lock:** Dedicated key (Space or H) to hold current altitude. Visual indicator in HUD.
- **Input smoothing:** Single-layer smoothing in HelicopterPhysics only, remove PlayerMovement lerp.
- **Auto-hover:** Only engages when altitude lock active, not by default.
- **Unified control schema for all platforms:**

| Action | Desktop | Touch | Gamepad |
|--------|---------|-------|---------|
| Collective Up | W | Right stick up | Right trigger |
| Collective Down | S | Right stick down | Left trigger |
| Cyclic Pitch | Mouse Y / Arrow Up/Down | Cyclic pad | Left stick Y |
| Cyclic Roll | Mouse X / Arrow Left/Right | Cyclic pad | Left stick X |
| Yaw | A/D | Twist or buttons | Bumpers |
| Altitude Lock | Space | Button | A button |
| Fire Door Guns | Mouse Click | Fire button | Right trigger (when locked) |
| Camera Mode | Right Ctrl | Swipe | Right stick click |
| Enter/Exit | E | Interaction button | Y button |

### 3B. Door Gun Weapons
- Left/right M60 door guns fire independently or together
- Weapon HUD shows ammo, overheat bar, traverse arc
- Tracers + bullet impact effects
- Damage to ground NPCs from door gun fire
- AI door gunner behavior (NPC fires when enemies in arc)

### 3C. NPC Helicopter Interaction
- `IBoardable` interface: board(npc), disembark(npc), getPassengers(), getCapacity()
- Player command: "Board helicopter" (nearby allied NPCs board)
- Transport flight: player flies, NPCs are passengers (attached to helicopter position)
- Deploy: hover + command to disembark (NPCs fast-rope or jump at low altitude)
- AI pilot mode: order helicopter to fly to waypoint autonomously

### 3D. Vehicle System Abstraction
- `IVehicle` interface shared by helicopter, ground vehicles, boats
- Common: enter/exit, damage/health, physics update, render update
- Common controls abstraction: throttle, steering, brake, weapons
- Vehicle manager: spawn, track, despawn vehicles per faction/mode

---

## Phase 4: Squad Command & RTS Layer
**Goal:** Unified, intuitive command interface that scales from squad to army.
**Dependencies:** Independent (can start parallel with Phase 3).
**See:** `docs/SQUAD_COMMAND_REARCHITECT.md`

### 4A. Input Unification
- All squad input routed through single CommandInputManager
- Remove: direct keyboard handling in PlayerSquadController
- Remove: dead code squad wiring in TouchActionButtons/TouchControls
- Desktop: Z opens command mode, mouse selects on map/radial, click confirms
- Mobile: dedicated command button opens command mode, touch selects/confirms
- Gamepad: D-pad for quick commands, R3 for command mode

### 4B. Command Mode (Real-Time)
- Toggle between FPS and command mode (not overlay - full mode switch)
- **Fully real-time** - no time slowdown. Player is vulnerable while commanding.
- Command mode: camera pulls to overhead/tactical view
- Map becomes primary interaction surface
- Click map to set waypoints, select units, assign objectives
- UX must be extremely efficient: minimal menu depth, quick-access shortcuts, point-and-click on map
- Player can snap back to FPS instantly (Escape or Z release)
- Audio cues for incoming threats while in command view (gunfire near player, taking damage)

### 4C. Command Scaling
- **Squad scale (8-16):** Direct orders to individual squad (follow, hold, assault, defend, retreat)
- **Platoon scale (30-60):** Orders to 2-4 squads, formation commands, support requests
- **Company scale (100-200):** Macro objectives, air support calldown, reinforcement allocation
- **Battalion+ scale (500+):** Strategic map, front line management, resource allocation, theater-level

### 4D. Command HUD
- Minimap with selectable unit icons
- Full map as tactical command surface (overlay or separate view)
- Selected unit info panel (squad composition, status, ammo, morale)
- Command queue visualization (waypoint lines on map)
- Air support / artillery request interface

---

## Phase 5: Terrain Engine Module
**Goal:** Architect terrain as a standalone engine module with biome support.
**Dependencies:** Phase 2F (textures), Phase 2E (vegetation types).

### 5A. Biome System
- Biome enum: DENSE_JUNGLE, HIGHLAND, RICE_PADDY, RIVERBANK, FIREBASE_CLEAR, PLANTATION, BAMBOO_GROVE, VILLAGE
- Classification rules: height + slope + moisture + distance-to-water + noise
- Per-biome config: ground texture, vegetation set + density, prop set, audio ambiance
- Smooth biome transitions (blending at boundaries, ~20m transition zones)

### 5B. Terrain Generation Module
- Abstract terrain generator interface (noise-based, DEM-based, hybrid)
- Road/trail generation (A* between zones, cleared path with mud texture)
- Firebase perimeter generation (cleared circle + structures from config)
- Village generation (huts, paths, rice paddies from template)
- Landing zone generation (cleared areas with helipad markers)

### 5C. Improved Chunk System
- Better LOD transitions (geometry morphing, not popping)
- Texture splatting per-vertex for biome blending
- Chunk merging for distant terrain (reduce draw calls)
- Async chunk priority: visible chunks first, then ring expansion

### 5D. Water Engine
- River system overhaul (proper Three.js Water2 or custom shader)
- Depth-based rendering (shallow wading vs deep swimming)
- Swimming mechanics (player movement in water)
- Watercraft physics (buoyancy, current, steering)
- Re-enable water for A Shau with stream/river focus

---

## Phase 6: Ground Vehicles & Watercraft
**Goal:** Drivable ground vehicles and boats.
**Dependencies:** Phase 3D (vehicle abstraction), Phase 5D (water engine).

### 6A. Ground Vehicle Physics
- Wheel-based physics (simplified: no suspension sim, just terrain following)
- Speed limits by terrain type (road fast, jungle slow, mud very slow)
- Collision with structures and vegetation
- Vehicle damage from weapons + terrain hazards

### 6B. Ground Vehicles
- M151 MUTT Jeep (fast, 4 passengers, mounted M60)
- M113 APC (armored, 11 passengers, .50 cal turret)
- M35 Deuce-and-a-Half (16 passengers, no weapons, supply truck)
- NVA equivalents as needed (trucks, PT-76 later)

### 6C. Watercraft
- Sampan (quiet, 4 passengers, NPC transport)
- PBR Mark II (fast, twin .50 cal, river patrol)
- Water navigation: river-following pathfinding for AI

---

## Phase 7: Combat & Loadout Expansion
**Goal:** Loadout system, new weapons, turrets, animals.
**Dependencies:** Phase 2C (weapon GLBs), Phase 3B (vehicle weapons).

### 7A. Loadout System
- **Default presets** per faction (e.g., Rifleman = M16 + M1911 + frags, Support = M60 + M1911 + smoke)
- **Custom loadouts:** player can build and save custom loadouts from faction weapon pool
- **Changeable on respawn:** loadout selection screen appears on each respawn, not just match start
- **Requires rearchitect:** Start/deploy screen flow, respawn flow, and loadout persistence (localStorage)
- Equipment slot: grenade type, mortar, sandbags, claymore, medkit
- Weapon swap at captured objectives: interact with ammo crate, choose replacement
- Loadout screen shows weapon stats (damage, RPM, range, recoil)
- Faction-specific weapon pools (US gets M16/M60, NVA gets AK-47/RPG-7)

### 7B. Stationary Weapons
- M2 .50 cal emplacement at objectives (sandbag ring + tripod)
- Player mount/dismount (E key / interaction button)
- NPC manning: defenders automatically use turrets when enemies approach
- Traverse arc limit (90-180 degrees), elevation limits
- Turret HUD: arc indicator, ammo counter, overheat bar

### 7C. New Weapon Types
- M60 as deployable LMG (bipod deploy for accuracy bonus)
- M79 grenade launcher (indirect fire, single shot, arc preview)
- RPG-7 (anti-vehicle, high damage, backblast danger zone)
- Claymore mines (directional, place and detonate or tripwire)

### 7D. Animals
- **Passive:** Water buffalo (blocking, flee on gunfire), bird flocks (scatter on explosions)
- **Neutral:** Macaque monkeys (scatter, screech alerts NPCs of player position)
- **Aggressive:** Tiger (rare, attacks lone soldiers), snake (hidden, proximity damage)
- **Survival:** Water buffalo and wild boar huntable for food in survival game modes
- **Implementation:** Simple state machine (idle/alert/flee/attack), billboard sprites for performance, GLB optional later
- **Performance:** Max 20 active animals per chunk, despawn beyond 200m

---

## Phase 8: Fixed-Wing & Advanced Air War
**Goal:** Planes, close air support, gunship gameplay, anti-air defense.
**Dependencies:** Phase 3D (vehicle system), Phase 6A (vehicle physics generalized).

### 8A. Fixed-Wing Framework
- Flight physics: speed-based lift, stall at low speed, no hover
- AI flight patterns: patrol circuit, attack run (dive + strafe/bomb), loiter orbit
- Runway/airstrip zones for takeoff/landing (or air-spawn for simplicity)

### 8B. Close Air Support
- A-1 Skyraider: slow, heavy ordnance, player-flyable (Vietnam workhorse)
- F-4 Phantom: fast, bombs/napalm, AI-scripted strafing runs
- AC-47 Spooky: player mans side guns while AI circles target zone
- Effects: napalm (area fire, smoke, damage over time), bomb craters, strafing tracers

### 8C. Anti-Air Defense
- ZPU-4 quad 14.5mm AA (NPC manned, visual tracers, threat to helicopters)
- 37mm AA autocannon (threat to fixed-wing)
- SA-2 SAM sites (advanced, threat to high-altitude aircraft)
- Aircraft damage: engines, control surfaces, crew hit
- Bailout / crash landing mechanics

---

## Phase 9: Faction & Game Mode Expansion
**Goal:** Multiple playable factions, game-mode-driven faction composition.
**Dependencies:** Phase 1 (faction sprites), Phase 7A (loadout).

### 9A. Faction System
- `FactionConfig`: sprites, weapon pool, vehicle pool, AI doctrine, voice lines, insignia
- 4 factions: US Army, NVA (North Vietnamese Army), ARVN (South Vietnamese), Viet Cong
- Player selects faction at match start (game mode permitting)
- AI doctrine per faction: US (air superiority, firepower), NVA (tunnels, ambush, mass assault), ARVN (defensive, combined ops), VC (guerrilla, traps, hit-and-run)

### 9B. Game Mode Scaling
- **Skirmish (Squad):** 1 faction per side, 8-16 per team, single zone, 10 min
- **Zone Control (Platoon):** 1 faction per side, 30-60 per team, 3-5 zones, 20 min
- **Open Frontier (Company):** 1-2 factions per side, 60-120 per team, 6+ zones, 30 min
- **A Shau Valley (Battalion):** 2 factions per side (US+ARVN vs NVA+VC), 1500+ per side, 18 zones, 60 min
- **Theater (Division+):** Full Vietnam map, province control, campaign progression

### 9C. Survival Mode (Roguelite)
- Extended solo or small-team operation behind enemy lines
- **Roguelite elements:** permadeath per run, meta-progression between runs, randomized objectives
- Animals as food source (hunt to sustain)
- Environmental hazards (snakes, weather, terrain)
- Limited ammo and supplies (scavenge from crates and fallen enemies)
- Extraction objective (reach LZ for helicopter pickup)
- **Note:** This is a future game mode direction. Don't over-architect for it now. Animal systems should be designed to support food mechanics later without requiring rewrite.

---

## Phase 10: Scale & Performance Frontier
**Goal:** Push to full-Vietnam simulation scale.
**Dependencies:** All prior phases provide the systems to scale.

### 10A. Performance Architecture
- Evaluate ECS migration for combat entities (if object pooling insufficient)
- Spatial partitioning optimization for 3D queries (octree or BVH)
- Render budget enforcement: adaptive LOD, aggressive culling, draw call batching
- Memory pooling for ALL transient objects (bullets, effects, debris)
- Profile and optimize per-phase with perf harness

### 10B. Historical Data Integration
- Additional DEM regions: Khe Sanh, Hue, DMZ, Ia Drang Valley, Mekong Delta
- Historical unit positions and operations data for campaign scenarios
- Real river/road network data

### 10C. Larger Map Infrastructure
- Tile-based region loading (only active region + neighbors in memory)
- Hierarchical terrain LOD (satellite texture at 10km+, chunks at 2km, full detail at 500m)
- Strategic AI operates on abstract map (not per-agent pathfinding)
- Multi-region campaign: player can redeploy between active theaters

---

## Cross-Cutting Concerns

### Performance Budget (All Phases)
- Target: 60 FPS with 120+ materialized NPCs
- Frame budget: <8ms average, <16ms P99
- Memory: <512MB heap for standard modes
- Load time: <5s to first meaningful frame
- Every phase: run perf captures before/after, reject regressions

### Testing (All Phases)
- Unit tests for all new systems
- Integration scenario tests in `src/integration/scenarios/` (real system wiring, minimal mocks)
- Perf captures via `npm run perf:capture` after each phase
- Perf baseline comparison via `npm run perf:compare` (auto pass/warn/fail)
- Agent validation workflow: see `docs/AGENT_TESTING.md`
- Mobile smoke tests for touch controls
- A/B comparison for architectural changes

### Compatibility
- Desktop: Chrome, Firefox, Edge (keyboard + mouse)
- Mobile: Chrome Android, Safari iOS (touch)
- Gamepad: Xbox/PS controller support
- WebGPU preferred, WebGL2 fallback

### Documentation Contract
- Update this file after each phase completion
- Update `ARCHITECTURE_RECOVERY_PLAN.md` for architecture decisions
- Update `PROFILING_HARNESS.md` for capture flag changes
- Update `ASSET_MANIFEST.md` when new asset needs are identified

---

## Resolved Questions

| Question | Decision |
|----------|----------|
| Loadout philosophy | Default presets + fully customizable. Changeable on respawn. |
| Command mode UX | Fully real-time. No time slowdown. UX must be efficient enough to command under fire. |
| Water rendering | Full implementation as terrain engine module. Sandbox test mode first. |
| Survival depth | Roguelite game mode, future direction. Animals designed to support food mechanics later. |
| NPC rendering | Sprites for now. 3D later if performant, billboard LOD fallback. |
| Asset style | GLB for all 3D objects. Sprites for NPCs. Pixel Forge generates everything. |
| Historical accuracy vs gameplay | Case-by-case. Ask before making a call. |
| Campaign structure | Engine module - architect so all three (linear, dynamic, sandbox) can be built as game modes when ready. Not a near-term build. |
| Multiplayer | Architect for it (don't block it) but not building it now. Single-player with AI is the focus. |
| Respawn flow UX | Full revamp: spawn point selection on map + loadout customization + deploy. Cross-platform compatible (desktop, mobile, gamepad). |
| Sandbox test mode | Configurable engine module. Break down into smaller blocks: terrain sandbox, vehicle sandbox, asset preview, system toggle panel. Not just one monolith mode. |

## Open Questions

(None at this time. All major direction questions resolved. Specific implementation details will be decided per-phase.)
