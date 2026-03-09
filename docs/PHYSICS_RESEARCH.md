# Physics Research: Terror in the Jungle

> Research for aligning on a physics strategy.
> Updated: 2026-03-08

---

## 1. What Our Engine Actually Does (and Why It Matters)

Before looking at external solutions, it's critical to understand what we already have. Our engine is NOT a traditional game engine - it has specific constraints and strengths that should drive physics decisions.

### 1.1 Current Physics Surface

We have **five independent physics models** running at variable dt, with three different gravity values:

| System | Gravity | Integration | Collision | Notes |
|--------|---------|-------------|-----------|-------|
| Player | -25 m/s2 | lerp velocity + euler position | AABB (sandbags), heightfield snap | Snappy, arcade feel |
| Helicopter | -9.81 m/s2 | force/mass -> accel, exponential damping, quaternion rotation | Ground clamp + world boundary bounce | Best physics in engine (6DOF) |
| Grenades | -52 m/s2 | euler with per-frame air resistance | Heightfield bounce + roll friction | Fast arcs, surface friction model |
| Mortars | -9.8 m/s2 | euler, 0.1s timestep trajectory | Ray vs heightfield per step | Ballistic preview only |
| NPCs | none | direct velocity set, position += v * dt | None (terrain Y snap) | Billboard sprites, no physics |

**Key observation:** Each system already has physics tuned for its game feel. The helicopter feels heavy and momentum-driven. Grenades arc fast and bounce satisfyingly. Player movement is snappy and responsive. These are not bugs - they are design choices embedded in the variable gravity values and damping curves.

### 1.2 What We Have That Works

- **HeightQueryCache**: Cached terrain height with `getSlopeAt()` and `getNormalAt()` - ready to use, zero consumers
- **BVH-based LOS**: 200m radius, 4m grid terrain mesh for raycasts (via three-mesh-bvh, already a dependency)
- **Terrain foundation sampling**: `sampleTerrainHeightRange()` - 115 samples for flat-structure placement
- **Helicopter 6DOF**: Full force-based model with per-aircraft config, ground effect, auto-level spring-damper
- **GrenadePhysics**: Bounce damping, surface friction, rotation - a solid rigid body on heightfield

### 1.3 What We Don't Have

- **Slope physics**: `speedMultiplier = 1.0` hardcoded. Player climbs cliffs at full speed. NPCs ignore terrain angle entirely.
- **Step-up gating**: `getEffectiveHeightAt()` returns AABB top - player teleports to helipad/structure surface from any angle.
- **NPC pathfinding**: Zero. NPCs steer toward destinations with no obstacle or slope awareness. Works because jungle terrain is gentle and obstacles are sparse.
- **Ground vehicles**: Zero. M151 jeep GLB exists. No wheel/suspension/drivetrain code.
- **Vehicle-terrain interaction**: Helicopter only touches terrain at ground clamp. No wheel-heightfield contact, no suspension.
- **Roads/trails**: Zero. Terrain is uniform surface with biome-blended material.
- **Rigid body collision between objects**: Zero. No vehicle-vehicle, vehicle-structure, or player-vehicle collision beyond AABB.

### 1.4 Our Unique Constraints

| Constraint | Implication |
|------------|-------------|
| **Browser/WebGL** | No native physics. WASM is ceiling for compute. ~16ms total frame budget at 60fps. |
| **CDLOD heightmap** | Terrain is a single instanced mesh from quadtree, not triangle soup. Physics heightfield must come from HeightQueryCache, not render mesh. |
| **Billboard NPCs** | No ragdolls, no mesh collision, no physics bodies for NPCs. They're sprites with Y snap. |
| **Variable dt game loop** | SystemUpdater passes real dt. No fixed timestep. Physics engine would need accumulator + interpolation. |
| **~60 active NPCs** | Not thousands. Navmesh/crowd sim is trivially cheap at this scale. |
| **3 runtime deps** | three, signals, three-mesh-bvh. Adding a physics engine is a significant dependency increase. |
| **Per-system budgets** | Combat: 5ms, Terrain: 2ms, untracked catch-all for rest. Physics must fit within budget. |
| **Custom helicopter physics** | Already tuned and working. Replacing with physics engine would be a downgrade in feel. |

---

## 2. The Core Question: Full Physics Engine vs Selective Adoption

### 2.1 The Anti-Pattern: Physics Engine for Everything

Traditional game engines (Unity, Unreal, Godot) run a single physics world that owns all rigid bodies. This works when:
- Everything is a mesh with a collider
- Physics timestep is fixed and decoupled from rendering
- Ragdolls, destructibles, cloth, stacking are needed
- The engine is already built around the physics pipeline

**None of these apply to us.** Our NPCs are billboard sprites. Our helicopter physics are deliberately tuned with per-aircraft configs. Our grenades use intentionally exaggerated gravity (-52 m/s2) for game feel. Migrating all of this into Rapier or Jolt would mean:
- Rewriting 5 working physics models to speak a different API
- Adding fixed-timestep accumulator + interpolation to our variable-dt loop
- Introducing a ~3-8MB WASM dependency
- Fighting the physics engine when we want non-physical behavior (billboard Y snap, exaggerated gravity, auto-level)
- No measurable benefit for the things that already work

### 2.2 The Right Pattern: Physics Engine as Vehicle Subsystem

What we actually need a physics engine for:
1. **Ground vehicles** (jeep, tank) - wheel suspension, steering, drivetrain, terrain contact
2. **Vehicle-vehicle collision** - if two jeeps meet
3. **Vehicle-structure collision** - jeep hits a bunker
4. **Maybe grenades** - CCD for tunneling prevention through thin walls (currently not an issue)

What we should NOT put in a physics engine:
- Player movement (keep custom, add slope factor)
- Helicopter flight (keep custom 6DOF, already excellent)
- NPC movement (billboard sprites, use navmesh instead)
- Mortar ballistics (preview trajectory, not runtime physics)
- Terrain collision for non-vehicles (HeightQueryCache is perfect for this)

### 2.3 The Hybrid Architecture

```
                   ┌──────────────────────────────┐
                   │       Game Loop (variable dt) │
                   └──────────┬───────────────────-┘
                              │
        ┌─────────────────────┼──────────────────────┐
        │                     │                      │
   Custom Physics        Physics Engine         Navmesh
   (keep existing)       (vehicles only)        (NPCs only)
        │                     │                      │
   ┌────┴─────┐        ┌─────┴──────┐         ┌─────┴─────┐
   │ Player   │        │ Rapier or  │         │ Recast    │
   │ Movement │        │ Jolt world │         │ +Detour   │
   │ (+slope) │        │            │         │ crowd     │
   ├──────────┤        │ heightfield│         │           │
   │ Heli     │        │ collider   │         │ walkable  │
   │ Physics  │        │ from HQC   │         │ slope     │
   ├──────────┤        │            │         │ angle     │
   │ Grenade  │        │ vehicle    │         │           │
   │ Physics  │        │ controllers│         │ 60 agents │
   ├──────────┤        │            │         │ ORCA      │
   │ Mortar   │        │ fixed dt   │         │ avoidance │
   │ Ballistic│        │ accumulator│         │           │
   └──────────┘        └────────────┘         └───────────┘
        │                     │                      │
        └─────────────────────┼──────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  HeightQueryCache  │
                    │  (shared terrain   │
                    │   data authority)  │
                    └───────────────────-┘
```

**Key principle:** HeightQueryCache remains the single terrain data authority. Both the physics engine heightfield collider and the navmesh generator consume it. Custom physics systems continue to read it directly.

---

## 3. Physics Engine Options (2026 State)

Two viable options for the vehicle subsystem. Everything else is either dead or legacy.

### 3.1 Rapier

| | |
|---|---|
| Package | `@dimforge/rapier3d-simd-compat` (WASM + SIMD, base64 embedded) |
| Version | 0.19.x (Jan 2026 review, 2-5x faster vs 2024) |
| Language | Rust -> WASM via wasm-bindgen |
| Bundle | ~2-3MB separate .wasm, ~8MB base64 embedded (-compat) |
| Three.js | Official addon: `three/addons/physics/RapierPhysics.js` + heightfield terrain demo |
| npm | ~2M weekly downloads |
| Vehicle | `DynamicRayCastVehicleController` - per-wheel suspension, steering, engine force, brake |
| Heightfield | `ColliderDesc.heightfield(rows, cols, heights, scale)` - Float32Array grid |
| 2026 frontier | WASM SIMD broadphase, persistent islands, new friction model. GPU physics roadmap (wgrapier: 93K bodies in browser) |

**Vehicle API (Rapier):**
```
addWheel(connectionPoint, direction, axle, suspensionRest, radius)
setWheelSuspensionStiffness(i, value)
setWheelSuspensionCompression(i, value)  // damping on compress
setWheelSuspensionRelaxation(i, value)   // damping on extend
setWheelEngineForce(i, value)            // forward thrust
setWheelBrake(i, value)
setWheelSteering(i, value)              // radians
setWheelFrictionSlip(i, value)
wheelIsInContact(i) -> bool
currentVehicleSpeed() -> number
```

**Pros for us:** Best WASM perf, heightfield collider, raycast vehicle, Three.js addon ready, massive community.
**Cons for us:** No tracked vehicle controller (tanks would need multi-wheel approximation). 8MB bundle for `-compat` (or separate .wasm file loading).

### 3.2 Jolt Physics

| | |
|---|---|
| Package | `jolt-physics` v0.39.0 (Feb 2026) |
| Language | C++ -> WASM via Emscripten |
| Pedigree | Horizon Forbidden West, Death Stranding 2 |
| Three.js | Official addon: `three/addons/physics/JoltPhysics.js` |
| Vehicle | `WheeledVehicleController` + **`TrackedVehicleController`** (tanks) + `MotorcycleController` |
| Heightfield | `HeightFieldShape` - NxN grid, static body only |
| 2026 frontier | Multithread WASM builds (SharedArrayBuffer + SIMD), parallel constraint solver |

**Unique advantage:** TrackedVehicleController is the ONLY JS-available tracked vehicle physics. Simulates continuous treads, differential steering. Has a working JS tank demo.

**Pros for us:** Built-in tank physics (if tanks are a priority). AAA-proven. CharacterVirtual class.
**Cons for us:** Thinner Three.js addon (no heightfield helper). Less community than Rapier. No deterministic build.

### 3.3 Recommendation

**If jeeps come first (M151):** Use Rapier. Better Three.js integration, heightfield demo exists, raycast vehicle is simple and proven.

**If tanks come first:** Use Jolt. TrackedVehicleController is irreplaceable. Approximating tank treads with multi-wheel raycast is fragile and unsatisfying.

**Either way:** The physics engine is a vehicle-only subsystem with its own fixed-dt accumulator. It reads the heightfield from HeightQueryCache at map load (or on rebake). It does NOT replace our existing custom physics.

### 3.4 What We Do NOT Need

| Engine/Lib | Why Skip |
|------------|----------|
| cannon-es | Dormant since Aug 2022. Pure JS, slow. No CCD. |
| Ammo.js | Complex memory management (manual destroy). Minimal maintenance. Bullet is powerful but the JS bindings are painful. |
| Custom physics engine | Rapier/Jolt are free, faster, and better tested. |
| Full-scene physics world | We don't need physics for sprites, terrain, or UI. Vehicle subsystem only. |
| XPBD/PBD | For deformables/cloth/fluids. We have none of these. |
| GPU physics (wgrapier) | Experimental. 93K bodies is exciting but we have ~5-10 physics bodies. |

---

## 4. Slope Physics (No Engine Needed)

This is the highest-impact, lowest-cost improvement. Zero new dependencies.

### 4.1 Current State

```typescript
// PlayerMovement.ts:95
const speedMultiplier = 1.0; // Could be extended for different states

// CombatantMovement.ts:84
combatant.position.y = terrainHeight + 3; // No slope awareness
```

`HeightQueryCache.getSlopeAt()` and `getNormalAt()` exist with zero consumers.

### 4.2 The Standard Model (Quake/Source Heritage)

Every FPS since Quake uses a variant of this:

```
slope_dot = dot(terrain_normal, UP)     // 1.0 = flat, 0.0 = vertical
slope_angle = acos(slope_dot)           // radians

if slope_angle > MAX_WALKABLE (45 deg, dot < 0.7):
    block movement
    apply gravity slide along surface plane
else:
    speed *= slope_dot                   // 1.0 on flat, 0.7 at 45 deg
```

Quake constants: MAX_WALKABLE = ~45 deg (normal.y >= 0.7), step height = 0.45m, slide gravity = full.

### 4.3 What Makes Sense For Us

Our terrain is gentler than Quake maps. Procedural heightmap terrain doesn't have sheer walls - slopes are gradual. But A Shau Valley DEM has real mountain ridges where angle gating matters.

**Proposed implementation:**

For player (PlayerMovement.ts):
```
slope = HeightQueryCache.getSlopeAt(x, z)    // 0=flat, 1=vertical
slopeDot = 1 - slope                          // dot(normal, UP)

if slopeDot < 0.5:                            // >60 deg: blocked
    reject movement, apply slide
elif slopeDot < 0.7:                          // 45-60 deg: slow crawl
    speedMultiplier = slopeDot * 0.5
else:
    speedMultiplier = slopeDot                 // 0-45 deg: gentle penalty
```

For NPCs (CombatantMovement.ts):
- Same slope check, but simpler: if slope > 0.5, skip movement toward that direction
- Better solved by navmesh (walkableSlopeAngle) than per-frame checks

### 4.4 Step-Up Height Gating

Current problem: `getEffectiveHeightAt()` returns the top of any AABB collision object. Player walking near a helipad teleports to the pad surface regardless of approach angle.

Fix: Before applying effective height, check height delta against step threshold:

```
effectiveHeight = getEffectiveHeightAt(newPos.x, newPos.z)
heightDelta = effectiveHeight - currentGroundHeight

if heightDelta > MAX_STEP_HEIGHT (0.5m):
    // Too tall to step up - treat as wall
    reject horizontal movement
else:
    // Normal step-up
    groundHeight = effectiveHeight + eyeHeight
```

---

## 5. Navmesh Pathfinding

### 5.1 Why We Need It

NPCs currently steer toward destinations with zero obstacle or terrain awareness. This works because:
- Jungle terrain is gentle
- Obstacles are sparse
- Billboard sprites visually mask bad pathing (you don't see them clip through things)

It will NOT work when:
- Structures increase (firebases, bunkers on TDM/ZC/A Shau)
- Roads exist (NPCs should prefer roads)
- Terrain has steep slopes (A Shau ridges)
- Vehicles exist (NPCs should avoid vehicle paths)

### 5.2 recast-navigation-js (Recommended)

| | |
|---|---|
| Package | `@recast-navigation/three` v0.35.0 |
| Type | WASM Recast+Detour via Emscripten |
| Key API | `threeToTiledNavMesh(meshes, config)`, `NavMeshQuery`, `Crowd` |
| Crowd | ORCA local avoidance, handles 60 agents trivially (designed for thousands) |
| Slope | `walkableSlopeAngle` parameter in config - auto-excludes steep terrain |
| Dynamic | `TileCache` for runtime obstacle add/remove |

**Heightmap -> navmesh workflow:**
1. Generate a dedicated PlaneGeometry mesh from HeightQueryCache at ~4m resolution
2. Pass to `threeToTiledNavMesh([mesh], { walkableSlopeAngle: 40, walkableClimb: 0.4, agentRadius: 0.5, agentHeight: 3.0 })`
3. One-time cost at map load (~100-500ms depending on map size)
4. Use `NavMeshQuery.findPath()` for pathfinding
5. Use `Crowd` for local avoidance between agents

**For structures:** Register structure footprints as TileCache obstacles -> navmesh auto-updates around them.

### 5.3 Alternative: navcat

Pure JS reimplementation of Recast by the same author. No WASM loading, tree-shakeable, transparent JS objects (no manual destroy). Slower generation but good enough for 60 agents. Dynamic off-mesh connections (bridges, doors) without tile regeneration.

**Trade-off:** Slower generation, smaller bundle, simpler API.

### 5.4 Integration Pattern

```
Map Load:
  1. HeightQueryCache ready
  2. Generate navmesh grid mesh (4m resolution)
  3. Add structure footprints as obstacles
  4. threeToTiledNavMesh() -> NavMesh
  5. Create Crowd with 60 agent slots

Per Frame:
  1. Crowd.update(dt) -> updates all agent positions
  2. CombatantMovement reads agent.position from crowd
  3. CombatantMovement sets agent.target when state changes
```

NPCs would get pathfinding "for free" through the Detour crowd sim rather than our current direct velocity steering.

---

## 6. Road/Trail System

### 6.1 Spline-Based Roads on Heightmap Terrain

Roads are a terrain modification + material blend + navmesh annotation. Not a separate mesh system.

**Pipeline:**

```
Author road control points (per-mode config)
          |
          v
CatmullRomCurve3 spline
          |
          v
Sample at 2m intervals -> centerline points
          |
     ┌────┼─────────────────────────┐
     |    |                         |
     v    v                         v
Modify    Terrain splatmap          Navmesh
height    road channel              annotation
provider  (blend road texture)      (higher speed
(flatten  via TerrainMaterial       on roads)
under     alpha channel)
road)
```

### 6.2 Height Provider Integration

Roads fit naturally into our existing `StampedHeightProvider` pattern:

1. Define `RoadSplineTerrainStamp` - flattens terrain in a corridor along a spline
2. Apply as stamps before GPU heightmap bake (same as structure stamps)
3. Road grade follows spline Y values with smooth shoulder blend at edges

This reuses the exact same stamp pipeline that structures use. No new height provider architecture needed.

### 6.3 Material Integration

Add a road splatmap channel to `TerrainMaterial`:
- Compute distance-to-nearest-road for each terrain vertex
- Set alpha channel > 0 within road width
- Blend road texture (packed dirt, gravel) based on splatmap
- Vegetation exclusion within road corridor (VegetationScatterer already has exclusion zones)

### 6.4 Three.js Spline Tools

`CatmullRomCurve3` is built into Three.js:
- `getSpacedPoints(n)` for evenly-spaced samples
- `getTangentAt(t)` for road direction at any point
- `getPointAt(t)` for position interpolation
- Centripetal parameterization avoids cusps

No external library needed for the spline itself.

---

## 7. Vehicle Physics Deep Dive

### 7.1 Raycast Vehicle Model (How It Works)

This is what both Rapier and Jolt use for wheeled vehicles:

```
For each wheel:
  1. Cast ray downward from attachment point
  2. compression = suspensionRestLength - rayHitDistance
  3. suspensionForce = stiffness * compression + damping * compressionVelocity
  4. Apply suspensionForce upward at wheel contact point
  5. Apply engineForce forward along wheel heading
  6. Apply lateralFriction perpendicular to wheel heading
  7. Apply brakeForce opposing velocity

Chassis rigid body integrates all forces -> position/rotation update
```

**Why this model is good for us:**
- Heightfield terrain is the perfect surface for wheel raycasts
- No need for physical wheel bodies (visual only)
- Per-wheel suspension gives natural terrain following
- Steering geometry is simple (front wheel angle)
- Can easily degrade to "hover" mode if wheels lose ground contact

### 7.2 M151 Jeep Implementation Shape

```typescript
// Hypothetical VehicleSystem.ts
const chassis = physicsWorld.createRigidBody(
  RigidBodyDesc.dynamic().setTranslation(x, y, z)
);
const chassisCollider = ColliderDesc.cuboid(1.0, 0.5, 2.0); // half-extents

const vehicle = physicsWorld.createVehicleController(chassis);
// Front left
vehicle.addWheel(
  new Vector3(-0.8, -0.3, 1.2),  // connection point (local space)
  new Vector3(0, -1, 0),          // direction (down)
  new Vector3(-1, 0, 0),          // axle
  0.4,                             // suspension rest length
  0.3                              // wheel radius
);
// ... 3 more wheels

vehicle.setWheelSuspensionStiffness(0, 30.0);
vehicle.setWheelSuspensionCompression(0, 4.4);
vehicle.setWheelSuspensionRelaxation(0, 2.3);
vehicle.setWheelFrictionSlip(0, 2.0);
```

### 7.3 Tank Treads

**Jolt TrackedVehicleController** is the only JS solution with built-in tread simulation. If we need tanks, this is the primary reason to choose Jolt over Rapier.

**DIY approximation with Rapier:** Model each tread as 5-6 raycast wheels in a line. Apply differential torque (left tread faster than right = turn right). No visual tread animation from physics - that would be cosmetic UV scroll or bone chain.

### 7.4 Fixed Timestep Integration

A physics engine requires fixed-dt stepping. Our game loop is variable-dt. Bridge:

```typescript
const PHYSICS_DT = 1 / 60;  // 60 Hz physics
let accumulator = 0;

function updateVehicles(dt: number) {
  accumulator += Math.min(dt, 0.25);  // cap to prevent spiral of death

  while (accumulator >= PHYSICS_DT) {
    physicsWorld.step();
    accumulator -= PHYSICS_DT;
  }

  // Interpolate visual positions for smooth rendering
  const alpha = accumulator / PHYSICS_DT;
  for (const vehicle of vehicles) {
    vehicle.mesh.position.lerpVectors(vehicle.prevPosition, vehicle.currPosition, alpha);
    vehicle.mesh.quaternion.slerpQuaternions(vehicle.prevRotation, vehicle.currRotation, alpha);
  }
}
```

Only vehicles (and their passengers) need interpolation. Everything else continues at variable dt.

---

## 8. What Other Engines Do (And What We Can Learn)

### 8.1 Quake/Source (FPS Movement Gold Standard)

- Fixed-dt physics (usually 66 tick or 128 tick)
- Capsule player collider against BSP/mesh world
- Slope speed: `speed *= dot(groundNormal, UP)`
- Step-up: test forward + up, then forward, then down. Max 18 units (~0.45m).
- Air control: reduced (Source: 30% of ground accel)
- Bunny hopping: emergent from air strafe mechanics

**What to take:** Slope speed formula, step-up pattern, MAX_WALKABLE angle concept.
**What to skip:** BSP collision (we have heightfield), fixed tick rate for player (unnecessary overhead for our scale).

### 8.2 Battlefield/Squad (Large-Map Vehicle Combat)

- PhysX/Havok for vehicles, separate infantry controller
- Heightfield terrain collision for vehicles
- Navmesh for infantry AI pathfinding
- Vehicle-terrain interaction: raycast suspension
- Separate physics rates: vehicles at 60Hz, infantry at variable

**What to take:** Vehicle-only physics subsystem pattern. Heightfield from terrain data. Separate physics rates.
**What to skip:** Full PhysX integration (overkill for our 5-10 vehicles).

### 8.3 Arma (Military Sim, Large Maps)

- Custom vehicle physics with per-wheel terrain sampling
- Roads as spline + terrain modification (exactly what we're planning)
- AI pathfinding via precalculated navmesh with road preferences
- Terrain-following vehicles use heightfield raycasts

**What to take:** Road-as-terrain-modification pattern. AI road preference via navmesh cost.

### 8.4 What We Do Better (Seriously)

Our helicopter physics model is arguably better-engineered than most indie vehicle physics:
- Per-aircraft config with 12 tunable parameters
- Force-based with proper mass integration
- Ground effect, auto-level spring-damper, exponential damping
- Quaternion rotation (no gimbal lock)
- Three distinct aircraft with different handling characteristics

This is a genuine asset. Do not replace it with a physics engine ragdoll that "kind of flies."

---

## 9. Phased Implementation Plan

### Phase 1: Slope Physics + Step-Up Gating (No Dependencies)

**Cost:** ~100 lines across 2 files. **Impact:** Player can no longer scale cliffs. NPCs respect terrain.

1. PlayerMovement.ts: Read slope from HeightQueryCache, multiply speed, block > 60 deg, slide
2. PlayerMovement.ts: Step-up height check before applying getEffectiveHeightAt delta
3. CombatantMovement.ts: Slope speed penalty (simple: multiply velocity by slopeDot)

### Phase 2: Navmesh for NPC Pathfinding

**Cost:** ~1 new dependency (recast-navigation), ~300 lines. **Impact:** NPCs path around obstacles and avoid steep slopes.

1. Install `@recast-navigation/three`
2. Generate navmesh from HeightQueryCache at map load
3. Replace NPC velocity steering with navmesh pathfinding
4. Use DetourCrowd for local avoidance (60 agents trivial)
5. Set walkableSlopeAngle=40, walkableClimb=0.4

### Phase 3: Road/Trail System

**Cost:** ~400 lines (spline config + stamp + splatmap). **Impact:** Visible roads, NPC road preference.

1. Define road splines per mode config (CatmullRomCurve3)
2. Add RoadSplineTerrainStamp to StampedHeightProvider pipeline
3. Add road channel to terrain splatmap + TerrainMaterial
4. Vegetation exclusion in road corridors
5. Regenerate navmesh with road areas (higher speed on roads)

### Phase 4: Vehicle Physics Engine (Jeep First)

**Cost:** ~1 new dependency (Rapier or Jolt), ~500 lines. **Impact:** Driveable M151 jeep.

1. Install physics engine
2. Create heightfield collider from HeightQueryCache
3. Implement jeep as raycast vehicle (4 wheels)
4. Fixed-dt accumulator + interpolation
5. Enter/exit mechanic (reuse helicopter pattern)
6. Vehicle-structure collision

### Phase 5: Tank (If Needed)

**Cost:** Depends on Phase 4 engine choice.

- If Rapier: Multi-wheel approximation (~8 wheels per side, differential steering)
- If Jolt: TrackedVehicleController (built-in, best option)
- Evaluate after Phase 4 which engine we're using

---

## 10. Decision Points for Review

1. **Slope physics first?** Yes/No. (Recommended: yes, zero-dependency, high impact)
2. **Navmesh library?** recast-navigation-js (WASM, faster) vs navcat (pure JS, simpler). Or defer.
3. **Physics engine?** Rapier (better ecosystem, jeep-first) vs Jolt (tanks built-in). Or defer until vehicles.
4. **Roads before or after vehicles?** Roads are independent of physics engine. Could come before Phase 4.
5. **Keep custom grenade physics?** Or migrate to physics engine for CCD. (Recommended: keep custom, tunneling isn't a real problem at current velocities.)

---

## Sources

### Physics Engines
- [Rapier 2025 Review + 2026 Goals](https://dimforge.com/blog/2026/01/09/the-year-2025-in-dimforge/)
- [Rapier JS Docs](https://rapier.rs/docs/user_guides/javascript/getting_started_js/)
- [Rapier DynamicRayCastVehicleController API](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html)
- [Three.js Rapier Terrain Heightfield Demo](https://threejs.org/examples/physics_rapier_terrain.html)
- [JoltPhysics.js](https://github.com/jrouwe/JoltPhysics.js)
- [Jolt TrackedVehicle Demo](https://jrouwe.github.io/JoltPhysics.js/)
- [Web Game Dev Physics Comparison](https://www.webgamedev.com/physics)

### Navmesh/Pathfinding
- [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js)
- [@recast-navigation/three docs](https://docs.recast-navigation-js.isaacmason.com/)
- [navcat](https://github.com/isaac-mason/navcat)
- [Yuka Game AI](https://mugen87.github.io/yuka/)

### Vehicle Physics
- [Car Physics for Games (Marco Monster)](https://www.asawicki.info/Mirror/Car%20Physics%20for%20Games/Car%20Physics%20for%20Games.html)
- [Rapier Raycast Vehicle Sketch](https://sketches.isaacmason.com/sketch/rapier/dynamic-raycast-vehicle-controller)

### Slope/Movement
- [Quake Metrics - Level Design Book](https://book.leveldesignbook.com/process/blockout/metrics/quake)
- [Quake 4 Physics_Player.cpp](https://github.com/Reddragoon244/Quake-4-Source-Code/blob/master/game/physics/Physics_Player.cpp)

### General
- [Fix Your Timestep! (Gaffer On Games)](https://gafferongames.com/post/fix_your_timestep/)
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (already a dependency)
