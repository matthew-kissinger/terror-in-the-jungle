# Playtest Issues - 2026-03-16

Structured analysis of issues found during PC playtesting session.

## Issue Summary

| # | Issue | Severity | Category | Status |
|---|-------|----------|----------|--------|
| 1 | NPCs stuck on inclines (both factions) | **GAME-BREAKING** | Movement/Pathfinding | OPEN |
| 2 | Loadout selection not persisting | **GAME-BREAKING** | UI/Loadout | OPEN |
| 3 | Tower/structure models broken scales | HIGH | Assets/World | OPEN |
| 4 | ~~Ghost radio audio playing~~ | ~~MEDIUM~~ | ~~Audio~~ | **DONE** |
| 5 | Spawn map requires scrolling | MEDIUM | UI/UX | OPEN |
| 6 | Player movement degraded on hills | HIGH | Player Physics | OPEN |
| 7 | M60 model needs replacement | LOW | Assets | OPEN |
| 8 | ~~Animal system removed~~ | - | Cleanup | **DONE** |

---

## Issue 1: NPCs Stuck on Inclines (GAME-BREAKING)

### Symptoms (from playtesting)
- ALL NPCs stuck - near the player (navmesh-steered) AND far away (beeline)
- Friendly NPCs stuck right outside firebase on slopes
- Enemy NPCs stuck in their base
- Maybe 1-2 make it out eventually
- Especially bad on Zone Control (800m map, steep slopes everywhere)
- Steep slopes are ubiquitous due to terrain noise generation

### Why the Terrain Is So Steep

NoiseHeightProvider.ts generates heights with:
- Mountain ridges: `ridgeNoise * 80` (up to 80m amplitude)
- Hills: `hillNoise * 35` (35m amplitude, frequencies 0.015-0.06)
- Valley carving: `valleyNoise * 40`
- Total range: -8 to ~150m

On Zone Control (800m map), hill noise at frequency 0.015 means a full hill cycle is ~67m wide. A 20m rise over 33m horizontal = ~31 degrees just from hills. Add ridge noise and slopes routinely hit 45-60+ degrees.

The terrain was designed to look realistic/dramatic but was never tuned for AI traversability.

### Root Cause: Slope Penalty Kills ALL NPC Movement

**Pipeline (per frame, CombatantMovement.ts:88-141):**
1. State handler sets velocity + destination
2. Spacing force applied (pushes apart when < 4m)
3. Navmesh crowd overrides XZ velocity (high/medium LOD only, max 64 agents)
4. **LINE 127-132: Slope penalty applied AFTER everything else**
5. Position += velocity * dt
6. Terrain snap: Y = terrainHeight + 3m

**The slope penalty curve (SlopePhysics.ts):**
```
computeSlopeSpeedMultiplier(slopeValue):
  slopeDot = 1 - slopeValue   (= terrain normal.y)
  slopeDot >= 0.7 (0-45 deg):  return slopeDot      (linear, 1.0 at flat -> 0.7 at 45 deg)
  slopeDot >= 0.5 (45-60 deg): return slopeDot * 0.5 (crawl, 0.25-0.35)
  slopeDot < 0.5  (>60 deg):   return 0              (BLOCKED)
```

**Why navmesh NPCs (near player) get stuck:**
- Crowd simulation gives good steered velocity to escape the slope
- Then line 127-132 samples slope AT THE NPC'S CURRENT POSITION
- Multiplies the escape velocity by slope penalty
- On a 50-degree slope: escape velocity * 0.25 = barely moves
- On a 60-degree slope: escape velocity * 0 = frozen in place
- The navmesh is trying to route them out, but the post-hoc penalty overrides it

**Why beeline NPCs (far from player) get stuck:**
- Low/culled LOD NPCs don't get navmesh at all
- They just aim straight at their destination
- Beeline into a hillside + slope penalty = zero velocity = permanent stuck
- No local avoidance, no alternate path finding

**Why spacing forces make it worse:**
- NPCs bunch at slope base (all getting slowed by penalty)
- Spacing forces push them sideways into steeper terrain
- Steeper terrain = more penalty = more stuck = more bunching
- Feedback loop traps entire squads

**Additional navmesh config issues:**
- `NAVMESH_CELL_SIZE = 4.0` - coarse (effective cs = 1.0m)
- `MAX_CROWD_AGENTS = 64` - only 64 of potentially 120 NPCs get pathfinding
- `WALKABLE_CLIMB = 0.4m` - very low step height
- `WALKABLE_SLOPE_ANGLE = 40` deg - navmesh already avoids steep slopes, but the game-level penalty redundantly punishes them anyway

### Options Under Consideration

#### Option A: Remove slope penalty for navmesh-steered NPCs (quick fix)
- Skip lines 127-132 when `navmeshAdapter.hasAgent(combatant.id)` is true
- Trust the navmesh: it already respects WALKABLE_SLOPE_ANGLE=40
- For beeline NPCs: soften the curve (start penalty at 40 deg instead of 0)
- Pro: Minimal code change, unblocks navmesh NPCs immediately
- Con: Beeline NPCs still bad, doesn't fix root terrain steepness

#### Option B: Dramatically soften slope penalty for all NPCs
- New curve: no penalty below 45 deg, gentle ramp 45-70, block only >70
- Or: remove NPC slope penalty entirely (let navmesh handle it, beeline NPCs just go)
- Pro: All NPCs move freely on typical terrain
- Con: NPCs may look weird climbing very steep terrain (visual, not gameplay)

#### Option C: Tame the terrain generation
- Reduce noise amplitudes (ridgeNoise * 40 instead of 80, hillNoise * 20 instead of 35)
- Add terrain flattening along spawn-to-objective corridors
- Pro: Fixes root cause, terrain actually designed for gameplay
- Con: Changes the look of all maps, may need re-tuning of everything

#### Option D: Improve navmesh + remove slope penalty for crowd NPCs
- Increase MAX_CROWD_AGENTS to 128 or 256
- Finer cell size (2.0 or 1.0)
- Skip slope penalty for all crowd agents
- Add simple slope avoidance for beeline NPCs (steer around, not through)
- Pro: Best of both worlds
- Con: Navmesh gen time + memory cost increase

#### Option E: Remove navmesh, replace with flowfield or simpler system
- Delete @recast-navigation entirely
- Flowfield: precompute per-cell movement direction across whole map, slope-aware
- Pro: All NPCs get pathfinding (no 64 cap), inherently terrain-aware
- Con: Migration cost, flowfield resolution tradeoffs, lose crowd avoidance

#### Option F: Hybrid navmesh + terrain softening
- Soften terrain amplitudes AND fix slope penalty
- Gives breathing room for both near and far NPCs
- Pro: Most complete fix
- Con: Most work, changes map aesthetics

#### Option F: Tiled flow fields (replace DetourCrowd)
- Precompute per-cell movement direction with slope costs baked into the cost field
- O(1) per agent per frame once built - no agent count ceiling
- Naturally routes around steep terrain (high cost cells = avoided)
- Tiled approach (Game AI Pro Ch.23) handles large maps: only generate fields for tiles the path crosses
- Can layer Yuka-style steering behaviors for inter-agent avoidance on top
- Pro: All NPCs get pathfinding, inherently terrain-aware, proven in RTS games (Supreme Commander 2, Planetary Annihilation)
- Con: Memory scales with grid resolution * active goals, 2D grid assumption (no bridges), no built-in local avoidance

#### Option G: WebGPU compute for flow fields + agent movement
- WebGPU is production-ready in Three.js since r171 (we're on r182)
- TSL compute shaders can generate flow field tiles on GPU
- wayne-wu/webgpu-crowd-simulation demonstrates browser-based GPU crowd sim
- Path to 500+ agents without frame-time regression
- Pro: Massive parallelism, future-proof
- Con: High implementation effort, GPU readback latency for game logic, WebGPU not yet universal

### Research Findings (2026-03-16)

**Critical: Recast cell size is 20-30x too coarse**
- Mikko Mononen (Recast author) recommends cell size = `agentRadius/2` or `agentRadius/3`
- For our agent radius 0.5m, that's **0.17-0.25m**, not 4.0m
- Our effective cs = 4.0 * 0.25 = 1.0m is still 4-6x too coarse
- The navmesh literally cannot represent slope transitions at this resolution
- Reducing to 0.5-1.0m would dramatically improve slope fidelity

**Crowd agent cap workaround: multiple Crowd instances**
- Create 2-4 Crowd instances partitioned spatially
- Only agents near player need full crowd avoidance
- Doubles/quadruples effective capacity with minimal code change

**Flowfield pathfinding is the strongest fit:**
- Cost field naturally encodes slope: steep neighbor height deltas = high cost = avoided
- O(1) per agent after field generation (no per-agent pathfinding)
- No agent count ceiling (unlike DetourCrowd)
- Tiled approach proven in RTS games for large maps
- Can be GPU-accelerated with WebGPU compute shaders

**Slope penalty architecture is wrong:**
- Every major engine (Unreal, Unity) applies slope at TWO levels:
  1. Path planning: slope cost baked into navmesh area costs or flow field costs
  2. Movement execution: speed scaling based on terrain normal dot product
- Neither engine overrides steering DIRECTION - they only scale SPEED
- Our code overrides the crowd's steering velocity, which is the worst pattern

**Yuka library for steering behaviors:**
- Engine-agnostic game AI library, works with Three.js
- Steering: seek, flee, arrive, wander, pursuit, evasion, obstacle avoidance, flocking
- Can layer on top of flow field vectors for inter-agent avoidance
- Active project, no agent count limits

### Recommended Approach (Updated)

**Phase 1 - Immediate unblock (1 session):**
1. Remove slope penalty for navmesh-steered NPCs (trust the crowd)
2. Soften penalty curve for beeline NPCs: no penalty below 45 deg, gentle 45-65, block >65
3. This alone should unblock most NPCs

**Phase 2 - Fix navmesh quality (1-2 sessions):**
1. Reduce cell size from 4.0 to 1.5-2.0 (test gen time)
2. Use multiple Crowd instances (2-4, spatially partitioned) to raise agent cap to 128-256
3. Bake slope cost into navmesh area weights instead of post-hoc penalty

**Phase 3 - Architecture upgrade (future):**
1. Evaluate tiled flow fields as DetourCrowd replacement
2. Layer Yuka steering behaviors for local avoidance
3. Consider WebGPU compute for flow field generation at scale
4. Consider terrain amplitude tuning for gameplay friendliness

---

## Issue 2: Loadout Selection Not Persisting

### Symptoms
- Always shows MG, SMG, and sandbag regardless of what player selects
- Loadout choices don't apply to gameplay

### Root Cause Analysis

**LoadoutService flow:**
1. `cycleField()` / `cyclePreset()` updates `currentState.currentLoadout`
2. Persists to localStorage (`titj.player-loadout.v2`)
3. `handleLoadoutChange()` in PlayerRespawnManager calls:
   - `loadoutService.cycleField(field, direction)` - updates internal state
   - `inventoryManager.setLoadout(updatedLoadout)` - updates inventory slots
   - `respawnUI.updateLoadout(updatedLoadout)` - updates UI display
4. On deploy: `applyActiveLoadout()` calls `loadoutService.applyToRuntime(targets)`

**applyToRuntime() (LoadoutService:483-497):**
```typescript
targets.inventoryManager?.setLoadout(loadout);
targets.inventoryManager?.reset();
targets.firstPersonWeapon?.setPrimaryWeapon(loadout.primaryWeapon as RuntimeWeaponType);
// Note: ONLY sets primaryWeapon on firstPersonWeapon
// secondaryWeapon is NOT applied to firstPersonWeapon
```

**Possible bugs:**
1. **Secondary weapon never applied to FirstPersonWeapon** - only `setPrimaryWeapon()` is called
2. **WeaponBar display may read from InventoryManager slots** which have a fixed mapping (PRIMARY/SHOTGUN/GRENADE/etc.) that may not match the loadout
3. **localStorage corruption** - stale v1 data or invalid weapon enum values surviving migration
4. **Context key mismatch** - if faction/alliance context changes between select and deploy

### Options

#### Fix the persistence bug:
- Audit InventoryManager.createConfiguredSlotDefinitions() slot mapping
- Ensure applyToRuntime() sets BOTH primary and secondary weapons
- Clear localStorage and test fresh
- Add logging to trace loadout flow from selection through deploy

#### Redesign loadout selection (from UI research):
- **Current prev/next carousel is the weakest UI pattern for this** - with 6 weapons, user must click "Next" up to 5 times to reach a specific weapon
- Every modern game uses direct selection: grid, dropdown, or slot-click-to-open-picker
- **Recommended**: Slot-and-replace pattern - click a slot, see all options as clickable icon tiles
- With only 6 weapons and 5 equipment items, everything fits in a single row per slot
- Already have IconRegistry with weapon PNG icons - can render directly
- Preset row at top (Rifleman/Recon/Engineer) for one-click full loadout
- This eliminates the persistence bug indirectly - explicit selection maps directly to enum values instead of cycling through indices

---

## Issue 3: Tower/Structure Model Scale Issues

### Symptoms
- All towers in firebase and enemy base have messed up scales

### Root Cause Analysis

**Scale chain (3 multiplicative layers):**
1. Native GLB model scale (varies per model)
2. `STRUCTURE_SCALE = 2.5` (global, applied to ALL structures)
3. Per-model `displayScale` override (towers: 0.85-0.9, props: 0.5)

**Effective tower scales:**
- GUARD_TOWER: native * 2.5 * 0.9 = 2.25x
- COMMS_TOWER: native * 2.5 * 0.85 = 2.125x
- WATER_TOWER: native * 2.5 * 0.9 = 2.25x

**Problems:**
- No validation that GLB models have consistent base scale
- `prepareModelForPlacement()` may or may not normalize model bounds
- displayScale values (0.85, 0.9) look like arbitrary tweaks with no documentation of what they're compensating for
- `collisionMode: 'none'` on all towers means no collision registration - NPCs walk through them

### Options
- Audit actual GLB bounding boxes to determine correct scales
- Consider normalizing all models to a standard unit size before applying STRUCTURE_SCALE
- Use `normalizeBy: 'height'` with `expectedDimensions` for towers (like SANDBAG_WALL does)
- Potentially need new/fixed tower GLB assets

---

## Issue 4: Ghost Radio Audio -- DONE

Removed 2026-03-16.

**Deleted:**
- `src/systems/audio/RadioTransmissionSystem.ts` (219 lines)
- `src/systems/audio/RadioTransmissionSystem.test.ts`
- `public/assets/transmissions/` (10 .ogg files)
- All references from SystemInitializer, SystemRegistry, SystemManager, OperationalRuntimeComposer

## Issue 8: Animal System Removed -- DONE

Removed 2026-03-16. Cosmetic wildlife system was unnecessary weight.

**Deleted:**
- `src/systems/world/AnimalSystem.ts` (~300 lines)
- `AnimalModels` export from `src/systems/assets/modelPaths.ts`
- `public/models/animals/` (6 GLB files: egret, water-buffalo, macaque, tiger, king-cobra, wild-boar)
- All references from SystemInitializer, SystemRegistry, SystemManager, GameplayRuntimeComposer

---

## Issue 5: Spawn Map Requires Scrolling

### Symptoms
- Deploy/respawn screen forces user to scroll down
- Layout not well thought out for PC

### Root Cause Analysis

**Layout structure:**
```
root (fixed, inset: 0)
  layout (flex column)
    header (~80px with padding)
    contentArea (flex: 1, overflow: auto, padding: 24px, gap: 24px)
      mapPanel (flex: 1)
        map (min-height: 500px)  <-- FORCES HEIGHT
      sidePanel (width: min(420px, 100%))
        selectedPanel
        sequencePanel
        loadoutPanel   <-- UNBOUNDED HEIGHT (400-500px)
        controlPanel
        legend
```

**On 1920x1080:**
- Viewport: 1080px
- Header: ~80px
- ContentArea padding: 48px (top+bottom)
- Available: ~952px
- Side panel content: 700-900px (5 panels stacked)
- Map min-height: 500px
- Total needed > available = scroll

**Problems:**
- `.map { min-height: 500px }` - hardcoded, not responsive
- `.sidePanel` has no max-height or overflow containment
- `.loadoutPanel` has no height budget
- On desktop at 1080p, everything overflows

### Industry Research (2026)

**Every successful FPS uses map-dominant layout, NOT map+sidebar:**
- Battlefield V/2042: Full-bleed map background, loadout in a thin horizontal bottom bar (60-80px)
- Hell Let Loose: Map fills viewport, role selection is a modal overlay (not persistent sidebar)
- Squad: Two tabs - "Deploy" (map-dominant) and "Role Loadout" (separate screen). Never both at once.

**No successful FPS uses a map-left + tall-sidebar-right layout at 1:1 proportions.**

**Current layout anti-patterns:**
1. `overflow: auto` on `.contentArea` - direct cause of scrolling
2. `min-height: 500px` on `.map` - hard pixel minimum forces overflow
3. `width: min(420px, 100%)` sidebar steals ~40% of 1080p width
4. 5 stacked panels with no height budget = guaranteed overflow

### Recommended Redesign: Map + Bottom Bar

```
+--------------------------------------------------+
|  DEPLOY                              [Timer]      |  <- header (auto height)
|                                                    |
|              TACTICAL MAP                          |  <- fills remaining space
|         (flex: 1, min-height: 0)                   |
|                                                    |
|    [Spawn info tooltip near selected marker]       |
|                                                    |
+--------------------------------------------------+
| [Rifleman][Recon][Engineer] | Pri | Sec | Eq | [DEPLOY] |  <- bottom bar (60-100px)
+--------------------------------------------------+
```

**Key changes:**
1. Kill the sidebar. Replace with bottom bar: `height: clamp(60px, 10vh, 100px)`
2. Map fills everything above bottom bar
3. Spawn point info = floating tooltip near selected map marker (not a panel)
4. Preset buttons = one-click class selection in bottom bar
5. Loadout slots = clickable buttons that open popup grid above the bar (6 weapon icons)
6. Deploy sequence/checklist = remove (first-time users get onboarding overlay)
7. Legend = small transparent overlay in map corner

**CSS fixes:**
- `.contentArea`: `overflow: hidden` (not auto)
- `.map`: `flex: 1; min-height: 0` (not `min-height: 500px`)
- `.root`: `height: 100dvh`
- `.layout`: `grid-template-rows: auto 1fr auto`

**Loadout interaction fix:**
- Replace prev/next carousel with direct selection grid
- Each slot button opens inline picker with all weapon/equipment icons
- Uses existing IconRegistry PNG icons
- Explicit selection = no persistence ambiguity

---

## Issue 6: Player Movement Degraded on Hills

### Symptoms
- Movement much worse since slope physics were added
- Terrain is quite hilly and physics punishes that too aggressively

### Root Cause Analysis

**Player slope physics (PlayerMovement.ts:152-222):**
1. Sample terrain normal at current position
2. `slopeValue = 1 - normal.y`
3. `speedMultiplier = computeSlopeSpeedMultiplier(slopeValue)` (same curve as NPCs)
4. Target velocity scaled by multiplier
5. If multiplier = 0 (>60 deg), slide downhill at 8 m/s
6. Step-up check: blocks movement if terrain rise > 0.5m per frame

**The problem:**
- Same aggressive slope curve as NPCs
- At 30 deg slope (common on Open Frontier), player moves at ~87% speed
- At 45 deg, player moves at ~70% speed
- Combined with step-up blocking (0.5m max per frame), steep hills feel very restrictive
- Player expects to be able to push through moderate slopes at reasonable speed

**Additional issue - step-up gating:**
```typescript
// PlayerMovement.ts: blocks if terrain rise exceeds step height
if (!isWalkableSlope(targetSlopeValue) || !canStepUp(currentTerrainHeight, targetTerrainHeight)) {
  // Block horizontal movement entirely
}
```
- `canStepUp` checks if height delta > 0.5m (MAX_STEP_HEIGHT)
- On terrain with rapid elevation changes, this can block even on "walkable" slopes
- Combined with slope penalty = player feels stuck on moderate hills

### Industry Research (2026)

**No major engine penalizes slope starting at 0 degrees.** Our current curve is wrong by industry standards.

**Engine defaults:**
- Unreal Engine: walkable floor = 44.76 deg. NO speed penalty below that - binary cutoff. Custom speed penalty requires explicit implementation.
- Unity: `slopeLimit` defaults to 45 deg. NavMesh supports up to 60 deg.
- Source/Quake: NO speed penalty at all. `ClipVelocity()` projects velocity onto surface plane. Speed is only lost at moment of collision, not continuously. This enables ramp-sliding/boosting.
- Rapier: Separate `setMaxSlopeClimbAngle()` and `setMinSlopeSlideAngle()`. Example uses 45 deg climb, 30 deg slide.

**Key insight: Players and NPCs should use completely different slope systems.**
- Players: character controller with game-feel-tuned curve
- NPCs: navmesh area costs handle slope avoidance at path-planning time, NOT runtime penalty

**Recommended player slope curve:**
- **0-15 deg: Full speed** (dead zone - covers normal terrain undulation)
- **15-45 deg: Graduated penalty** (smoothstep, not linear). At 30 deg ~85-90%, at 45 deg ~60-70%
- **45-60 deg: Heavy penalty** (30-50% speed), optional slide
- **60+ deg: Blocked**, auto-slide

**Separate uphill/downhill:**
- Compute signed slope using dot(moveDirection, terrainNormal)
- Uphill: penalty curve above
- Downhill: **speed bonus** (not just "no penalty"): `1.0 + smoothstep(5, 25, abs(angle)) * 0.15`

**Step-up fix (Brendan Keesing pattern):**
- Raycast from hip height (0.5m above feet) downward
- If ground is within 0.5m above current feet, **smoothly lerp Y** over 2-3 frames (not instant snap)
- If >0.5m vertical change, treat as wall
- Eliminates "blocked on rapid elevation changes" while keeping same step-up limit

**Momentum smoothing:**
- Don't snap speed to penalized value
- Lerp current speed toward target at 4-8 units/sec
- Gives "wading uphill" feel instead of instant speed wall

**Physics engine option (Rapier):**
- Built-in KinematicCharacterController: autostep, snap-to-ground, slope thresholds
- Heightfield collider maps directly to our terrain
- 2-5x faster WASM in 2025-2026 vs 2024 (SIMD support)
- Would give step-up and ground snapping for free
- Significant architecture change - current raycast approach can cover 90% with the curve fixes above

### Recommended Fix

**Phase 1 - New slope curve (immediate):**
1. Add 0-15 deg dead zone (multiplier = 1.0)
2. Smoothstep penalty 15-50 deg (not linear from 0)
3. Block at 60+ deg
4. Separate uphill/downhill behavior

**Phase 2 - Step-up smoothing:**
1. Replace hard `canStepUp` check with lerp-based ground following
2. Raycast from above, smooth Y transition over multiple frames

**Phase 3 - Future consideration:**
1. Evaluate Rapier KinematicCharacterController
2. Consider downhill speed bonus for game feel

---

## Issue 7: M60 Model

### Symptoms
- Need new M60 LMG model

### Notes
- M60 was added as weapon type in 2026-03-08 content pass
- May be using placeholder or incorrect model
- Lower priority than gameplay-breaking issues

---

## Research References

### Pathfinding / NPC Movement
- [recast-navigation-js v0.43](https://github.com/isaac-mason/recast-navigation-js) - Latest WASM bindings
- [Recast Settings Uncovered](http://digestingduck.blogspot.com/2009/08/recast-settings-uncovered.html) - Cell size guidance from author
- [Red Blob Games: Flow Field Pathfinding](https://www.redblobgames.com/blog/2024-04-27-flow-field-pathfinding/) - Flow field fundamentals
- [Game AI Pro Ch.23: Flow Field Tiles](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf) - Tiled flow field for large maps
- [Yuka Game AI Library](https://mugen87.github.io/yuka/) - Steering behaviors for Three.js
- [wayne-wu/webgpu-crowd-simulation](https://github.com/wayne-wu/webgpu-crowd-simulation) - GPU crowd sim in browser
- [Three.js TSL Compute Shaders](https://discourse.threejs.org/t/learning-compute-shaders-in-tsl/90013) - WebGPU compute in Three.js

### Slope Physics / Character Controllers
- [UE5 Walkable Slope](https://dev.epicgames.com/documentation/en-us/unreal-engine/walkable-slope-in-unreal-engine) - Unreal's 44.76 deg default
- [UE4 Speed based on Slope](https://gregmladucky.com/articles/lets-make-character-speed-based-on-slope/) - Line trace slope detection
- [Rapier Character Controller](https://rapier.rs/docs/user_guides/javascript/character_controller/) - Autostep, snap-to-ground, slope angles
- [Rapier 2025 Review](https://dimforge.com/blog/2026/01/09/the-year-2025-in-dimforge/) - 2-5x WASM perf improvement
- [Character Controller: Stairs](https://brendankeesing.com/blog/character_controller_stairs/) - Lerp-based step climbing
- [Rampsliding in Quake](https://www.ryanliptak.com/blog/rampsliding-quake-engine-quirk/) - Surface projection technique
- [Naismith's Rule](https://en.wikipedia.org/wiki/Naismith%27s_rule) - Real-world march rate vs slope
- [FM 90-5: Jungle Operations](https://irp.fas.org/doddir/army/fm90-5.pdf) - Vietnam jungle movement rates

### Deploy UI / Loadout
- [Game UI Database - Loadout](https://www.gameuidatabase.com/index.php?scrn=56)
- [Coherent Labs FPS HUD Kit](https://coherent-labs.com/Documentation/Exporter/content/Kits/FPS/fps.html)
- [Modern CSS Viewport Units (dvh/svh)](https://web.dev/blog/viewport-units)
- [CSS clamp() Responsive Design](https://theosoti.com/short/fluid-css-clamp/)
