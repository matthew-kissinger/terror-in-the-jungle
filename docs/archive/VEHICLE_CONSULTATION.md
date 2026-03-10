# Vehicle Systems Consultation

Comprehensive analysis and implementation plan for vehicle systems in Terror in the Jungle.

Last updated: 2026-03-09

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [What Works, What's Missing](#2-what-works-whats-missing)
3. [Aircraft Weapon Systems](#3-aircraft-weapon-systems)
4. [NPC Vehicle Integration](#4-npc-vehicle-integration)
5. [AC-47 Spooky Gunship](#5-ac-47-spooky-gunship)
6. [Air Support Call-Ins](#6-air-support-call-ins)
7. [Anti-Aircraft Systems](#7-anti-aircraft-systems)
8. [Vehicle Damage Model](#8-vehicle-damage-model)
9. [Crew Rendering (Half-Body Sprites)](#9-crew-rendering-half-body-sprites)
10. [GLB Model Pipeline](#10-glb-model-pipeline)
11. [Ground Vehicles & Watercraft](#11-ground-vehicles--watercraft)
12. [Control Schemes](#12-control-schemes)
13. [Visual Effects Pipeline](#13-visual-effects-pipeline)
14. [Implementation Phases](#14-implementation-phases)
15. [Performance Budget](#15-performance-budget)

---

## 1. Current State Assessment

### What Exists (Production-Quality)

The helicopter system is the most complete vehicle system in the game. It spans 9 files under `src/systems/helicopter/` with full physics, animation, audio, HUD, and player interaction.

**Three aircraft types fully configured:**

| Aircraft | Role | Seats | Weapons | GLB |
|----------|------|-------|---------|-----|
| UH-1 Huey | Transport | 4 | None | `vehicles/aircraft/uh1-huey.glb` |
| UH-1C Gunship | Gunship | 2 | M60 Door Gun (500 rds) | `vehicles/aircraft/uh1c-gunship.glb` |
| AH-1 Cobra | Attack | 1 | M134 Minigun (4000 rds) + Rocket Pod (14 rds) | `vehicles/aircraft/ah1-cobra.glb` |

**Physics** (`HelicopterPhysics.ts`): Force-based with gravity, lift, cyclic, ground effect, deceleration braking, damping, auto-stabilization, speed caps. Per-aircraft tuning (mass 1400-2400kg, lift 28-38kN, speed 55-75 m/s). Flight data getters: `getAirspeed()`, `getHeading()`, `getVerticalSpeed()`.

**Animation** (`HelicopterAnimation.ts`): Main/tail rotor spin keyed to engine RPM. Visual tilt/banking from cyclic input (max 18 degrees). Smooth lerp with auto-level.

**Audio** (`HelicopterAudio.ts`): Positional 3D audio (RotorBlades.ogg), volume/rate modulated by collective + RPM.

**HUD** (`HelicopterHUD.ts`): Airspeed, heading compass, VSI, thrust bar, RPM, auto-hover/boost status, weapon status (attack/gunship only), damage bar.

**Crosshair** (`CrosshairSystem.ts`): 4 modes - infantry, helicopter_transport (hidden), helicopter_gunship (hidden), helicopter_attack (pipper).

**Interaction** (`HelicopterInteraction.ts`): 5m proximity detection, E key enter/exit, exit position calculation with terrain snap.

**Squad Deploy** (`SquadDeployFromHelicopter.ts`): G key, altitude <15m + speed <5m/s constraint, 30s cooldown, 4-position cardinal spawn layout.

**Helipad System** (`HelipadSystem.ts`): Mode-specific helipad configs (Open Frontier: 3, A Shau: 3). Terrain integration with vegetation clearing and foundation depth.

**Model Loading** (`HelicopterGeometry.ts`): GLB via ModelLoader, rotor node wiring by name search (mainBlades/tailBlades), synthetic fallback if no blades found. -90 degree Y rotation for forward alignment.

### Modes with Vehicles

| Mode | Vehicles | Deploy Flow |
|------|----------|-------------|
| Open Frontier | 3 helipads (Huey/Gunship/Cobra) | `frontier` - helipad spawn option |
| A Shau Valley | 3 LZs (Goodman/Stallion/Eagle) | `air_assault` - forward insertion |
| TDM / Zone Control / AI Sandbox | None | Standard ground spawn |

### Asset Inventory (Models Available But Not Wired)

**Aircraft (in modelPaths.ts, GLBs in public/models/):**
- AC-47 Spooky, F-4 Phantom, A-1 Skyraider

**Ground Vehicles (in modelPaths.ts, GLBs in public/models/):**
- M151 Jeep, M35 Truck, M113 APC, M48 Patton, PT-76

**Watercraft (in modelPaths.ts, GLBs in public/models/):**
- Sampan, PBR (Patrol Boat River)

**Structures (AA emplacements already modeled):**
- 37mm AA, ZPU-4 AA, SA-2 SAM

---

## 2. What Works, What's Missing

### Working Well
- Flight physics feel good (arcade-sim hybrid, per-aircraft tuning)
- HUD instruments are comprehensive
- Rotor animation + audio sells the helicopter feel
- Enter/exit + squad deploy gameplay loop works
- Touch controls dual-joystick layout for mobile
- Mode-specific helipad integration clean

### Missing (Priority Order)

| Gap | Impact | Difficulty |
|-----|--------|------------|
| **Weapons don't fire** | Critical - attack heli has no gameplay value | Medium |
| **No NPC pilots/gunners** | High - vehicles are player-only | High |
| **No crew rendering** | Medium - vehicles look empty from outside | Medium |
| **No vehicle damage model** | Medium - no progressive degradation | Medium |
| **No AA threats** | Medium - no risk while flying | Medium |
| **No air support call-ins** | Nice-to-have - adds commander gameplay | High |
| **No Spooky gunship orbit** | Nice-to-have - iconic Vietnam experience | Medium |
| **Ground vehicles not wired** | Low priority - helicopter gameplay first | High |
| **No countermeasures** | Low until AA exists | Low |

---

## 3. Aircraft Weapon Systems

### Option A: Forward-Fixed Weapons (Recommended First)

The simplest path. Pilot weapons (M134 minigun, rockets) fire where the helicopter nose points.

**How it works:**
- Left click fires current weapon
- Weapon aims along helicopter forward vector
- Mouse aim confined to weapon gimbal limits (nose turret: +/-15 degrees, rockets: fixed forward)
- Number keys (1/2) switch weapon groups
- Existing TracerPool, MuzzleFlashSystem, ImpactEffectsPool, ExplosionEffectsPool all reusable
- KillFeed already has `helicopter_minigun`, `helicopter_rocket`, `helicopter_doorgun` weapon types

**M134 Minigun (AH-1 Cobra):**
- Fire rate: ~50 rounds/sec (3000 RPM gameplay, real is 2000-6000)
- Tracer every 3rd round = ~17 tracer sprites/sec
- Existing TracerPool supports 64 concurrent - sufficient
- Damage: ~15 per hit (infantry dies in 6-7 hits), falloff past 400m
- Spread: 2-3 degree cone
- Sound: looping minigun whine/buzz, distinct from infantry weapons
- Muzzle position: nose turret node from GLB, or hardcoded offset

**Rocket Pod (AH-1 Cobra):**
- 14 rounds, alternating left/right pods
- Fire rate: 1 per 0.3 seconds
- Projectile: visible mesh (cylinder) with smoke trail particle emitter
- Travel: ~150 m/s, slight drop over distance (not hitscan)
- Impact: reuse ExplosionEffectsPool, 8m lethal radius, 15m damage radius
- Sound: whoosh on launch, explosion on impact
- Reload: return to helipad (or no reload during flight)

**M60 Door Gun (UH-1C Gunship):**
- This is `firingMode: 'crew'` - see NPC Gunner section
- If player controls it: seat switch (F2) or AI gunner auto-targets

### Option B: Gimbal/Turret Weapons (Phase 2)

For the Cobra's nose turret specifically:
- Mouse controls turret aim independent of aircraft heading
- Turret has gimbal limits (+/-60 degrees azimuth, +30/-60 elevation)
- Visual: turret mesh rotates to track mouse
- Crosshair shows pipper at turret aim point (already have `helicopter_attack` mode)
- More complex but more satisfying for attack helicopter gameplay

### Recommendation

Start with Option A (forward-fixed) for rockets, Option B (gimbal turret) for the M134 minigun. The Cobra's minigun was turret-mounted historically, and the pipper crosshair already exists. Rockets are always fixed forward.

### Integration Points

```
Player Input (left click)
  -> VehicleWeaponSystem.fire(helicopterId, weaponIndex)
    -> Check ammo, cooldown
    -> Calculate ray/projectile from weapon mount position + aim direction
    -> Hitscan (minigun) or projectile spawn (rockets)
    -> Spawn tracer/muzzle flash at mount position
    -> On hit: ImpactEffectsPool or ExplosionEffectsPool
    -> Update ammo count in HelicopterHUD
    -> KillFeed entry with helicopter weapon type
```

Shared systems: TracerPool, MuzzleFlashSystem, ImpactEffectsPool, ExplosionEffectsPool, AudioWeaponSounds (new entries for minigun loop, rocket whoosh).

---

## 4. NPC Vehicle Integration

### Current NPC Architecture

NPCs use a 7-state FSM: PATROLLING, ALERT, ENGAGING, SUPPRESSING, ADVANCING, SEEKING_COVER, DEFENDING. They're rendered as directional billboard sprites (front/back/side). Movement is velocity-based with navmesh crowd steering for high/medium LOD.

The `Combatant` interface has no vehicle-related fields. HelicopterInteraction only detects player proximity.

### Design: Seat Occupancy System

**New types needed:**

```
VehicleSeat {
  index: number           // 0=pilot, 1=gunner, 2-N=passenger
  role: 'pilot' | 'gunner' | 'passenger'
  occupantId: string | null   // combatant ID or 'player'
  weaponMount?: AircraftWeaponMount
  positionOffset: Vector3     // local space offset from vehicle center
  exitOffset: Vector3         // where to place occupant on exit
}

VehicleOccupancy {
  vehicleId: string
  seats: VehicleSeat[]
  enterVehicle(combatantId, preferredRole): boolean
  exitVehicle(combatantId): Vector3  // returns exit position
  getOccupant(seatIndex): string | null
  getPilot(): string | null
  getGunners(): string[]
}
```

**Combatant interface additions:**
- `vehicleId?: string` - which vehicle they're in
- `vehicleSeatIndex?: number` - which seat
- `isInVehicle?: boolean` - quick check

**New AI states:**
- `BOARDING` - moving toward vehicle entry point
- `IN_VEHICLE` - seated, movement disabled, position locked to vehicle
- `DISMOUNTING` - exiting vehicle, brief animation delay

### NPC Pilot AI

**FSM states for AI pilot:**

| State | Behavior | Transitions |
|-------|----------|-------------|
| IDLE | Parked at helipad, rotors spooling | Order received -> TAKEOFF |
| TAKEOFF | Increase collective, climb to cruise altitude | Altitude >50m -> PATROL |
| PATROL | Follow waypoint route at cruise altitude/speed | Detect threat -> ATTACK, Ordered -> SUPPORT |
| ATTACK | Attack run: approach, fire, break away, circle for another pass | Target destroyed -> PATROL, Damaged -> EVADE |
| SUPPORT | Orbit friendly position, engage targets of opportunity | Threat -> ATTACK, Ammo depleted -> RTB |
| EVADE | Gain altitude, break engagement, use terrain | Threat clear -> PATROL, Critical damage -> CRASH |
| RTB | Navigate to helipad, land, rearm | Rearmed -> IDLE |
| CRASH | Autorotation attempt or uncontrolled descent | Ground contact -> destroyed |

**Simplified approach (recommended for first pass):** Script-based rather than full AI. Pilot follows predefined routes with basic threat response. Think of it as a "rail shooter" pilot that the player rides with.

### NPC Gunner AI

The gunner is simpler - it's an extension of existing NPC combat AI:

- **Target acquisition:** Reuse `AITargeting` with constrained arc (weapon gimbal limits)
- **Lead calculation:** Reuse `CombatantBallistics` with adjusted projectile speed
- **Firing:** Same fire budget system (`tryConsumeCombatFireRaycast()`)
- **Accuracy:** Skill profile modifiers + range exponential (existing system)
- **Priority:** Threats to own vehicle > infantry in the open > vehicles

**Door gunner specifics (M60 on UH-1C):**
- Side mount, left or right firing arc
- 120-degree azimuth, +20/-60 elevation
- Burst fire pattern (5-10 round bursts, 0.5-1s pause)
- Half-body sprite visible at gun mount point (see section 9)

### NPC Passenger Behavior

Passengers are the simplest case:
- Position locked to vehicle seat offset
- No AI updates while in vehicle (LOD: CULLED)
- Rendered as half-body sprites at seat positions
- On deploy signal: exit vehicle at offset position, resume normal AI
- On vehicle destruction: killed or ejected with damage

### Performance Impact

- **Pilot AI:** 1 per vehicle, lightweight FSM (fewer states than infantry, no pathfinding)
- **Gunner AI:** 1-2 per vehicle, reuses existing fire budget system
- **Passengers:** Zero AI cost (CULLED LOD)
- **Position sync:** Passengers copy vehicle position each frame (cheap)
- **Net impact:** ~2-3 active AI agents per vehicle, staggered updates

---

## 5. AC-47 Spooky Gunship

### Concept

The AC-47 Spooky orbits a target area in a left-bank pylon turn, firing 3x 7.62mm miniguns from the port side. In-game, it can be:

1. **Player-piloted** (full control, manual orbit + firing)
2. **NPC-piloted, player as gunner** (automated orbit, player aims guns)
3. **Call-in support** (fully automated, AI orbits and fires on area, commander ability)

### Option 1: Player-Piloted Spooky

Same flight physics as other helicopters but tuned for fixed-wing:
- Higher speed, wider turn radius, no hover capability
- Player must manually maintain bank angle and orbit
- Weapons fire from left side only (port-mounted miniguns)
- Camera: cockpit or side-gunner view
- Challenge: maintaining orbit while aiming is hard - this is the skill ceiling

**Pros:** Most engaging, skill-based, unique gameplay.
**Cons:** Hard to implement well, fixed-wing physics are different from helicopter.

### Option 2: NPC Pilot, Player Gunner (Recommended)

The Call of Duty "Death From Above" model adapted for Vietnam:
- Aircraft orbits automatically on a pylon turn around a designated point
- Player controls the side-mounted weapon camera
- Thermal/night-vision camera view (optional, could just be normal view looking down)
- 3 minigun positions, player switches between them or fires all at once
- Player places orbit center on map, aircraft circles automatically

**Implementation:**
```
angle += angularSpeed * deltaTime
position.x = target.x + radius * cos(angle)
position.z = target.z + radius * sin(angle)
position.y = orbitAltitude  // fixed, e.g. 300-500m
rotation.z = bankAngle      // ~25 degrees left bank
rotation.y = angle + PI/2   // nose tangent to circle
```

**Camera:** Fixed to aircraft, looking down-left toward orbit center. Player can pan within a cone (the weapon arc). Crosshair shows where miniguns will impact.

**Weapon firing:** Miniguns fire toward crosshair point on ground. Tracers stream from aircraft to ground (spectacular visual at night). Damage applied in small radius around impact.

**Pros:** Simpler flight code (scripted orbit), unique gameplay feel, iconic.
**Cons:** Player gives up infantry control while operating.

### Option 3: Commander Call-In (Simplest)

Rising Storm 2 model:
- Player calls in Spooky via radio/map interface
- Designates target area on map
- After delay, AC-47 appears, orbits area for 60-120 seconds
- AI fires bursts at detected enemies within orbit radius
- Area denial tool, not precision weapon
- Player returns to normal gameplay immediately

**Implementation:** Spawn AC-47 model at altitude, run orbit math, fire tracers at ground with AI target detection within radius. Despawn after duration.

**Pros:** Simplest, adds strategic depth, looks spectacular from ground.
**Cons:** Player doesn't directly control it (less engaging).

### Recommendation

**Phase 1:** Option 3 (call-in) - get the visual spectacle working with minimal code. AC-47 model orbits, fires tracer streams at ground, area denial for 60-120s.

**Phase 2:** Option 2 (player as gunner) - add the ability to "ride" the Spooky and control weapons directly. This becomes a powerful gameplay mode.

---

## 6. Air Support Call-Ins

### System Design (Rising Storm 2 Inspired)

**Radio mechanic:** Player accesses a radio (equipment item or fixed radio at base). Opens tactical map for target designation. Support arrives after delay.

**Support types:**

| Call-In | Aircraft | Effect | Duration | Cooldown |
|---------|----------|--------|----------|----------|
| Napalm Strike | F-4 Phantom | Line of fire along approach vector | 10-15s fire on ground | 90s |
| Spooky Gunship | AC-47 | Orbit + minigun bursts on area | 60-120s | 180s |
| Rocket Run | AH-1 Cobra | Attack run with rockets on point | 5-10s | 60s |
| Recon Flyover | A-1 Skyraider | Reveals enemies in area on minimap | 30s | 45s |

**Napalm Strike flow:**
1. Player marks target point + approach direction on map
2. 15-second delay ("Phantom inbound, danger close")
3. F-4 model flies overhead along approach vector
4. 2 napalm canisters drop (visible tumbling cylinders)
5. Impact: fireball, then line of fire (50m long x 10m wide)
6. Fire persists 10-15 seconds, instant kill on contact
7. Black smoke column visible from across map
8. Ground scorch decal remains

**Visual effects pipeline for napalm:**
- Canister drop: cylinder mesh with slight tumble rotation, thin smoke trail
- Initial impact: ExplosionEffectsPool.spawn() (large variant)
- Fire spread: particle system along line (orange/yellow core, dark smoke rising)
- Multiple point lights along fire line for ground illumination
- Decal: dark scorched texture applied to terrain after fire fades

**Rocket Run flow:**
1. Player marks target point on map
2. 10-second delay ("Cobra inbound on your mark")
3. AH-1 Cobra NPC flies attack run at target
4. Fires 6-8 rockets during approach
5. Break-off and exit map (or RTB to helipad)

### Integration with Existing Systems

- Map overlay: reuse RespawnMapController's map rendering
- Target designation: click-to-place marker on map
- Cooldown tracking: simple timer per call-in type
- Audio: new radio chatter sounds ("Spooky on station", "Phantom rolling in")
- GameEventBus: `AIR_SUPPORT_CALLED`, `AIR_SUPPORT_ARRIVED`, `AIR_SUPPORT_COMPLETE`

---

## 7. Anti-Aircraft Systems

### Historical Context

Light AAA caused 77% of USAF losses in Vietnam. The ZPU-4 is the most gameplay-relevant because it's visually dramatic (4 tracer streams converging) and effective against helicopters without requiring lock-on mechanics.

### Emplacement Types

**ZPU-4 (Primary AA Threat)**
- 4x 14.5mm barrels, ~600 RPM per barrel (practical: 150 RPM)
- Effective range: ~1400m (helicopters), ~2000m (low-flying aircraft)
- No lock-on - pure ballistic (NPC gunner leads target)
- Visual: 4 converging tracer streams (existing TracerPool, green tracers for NVA)
- Damage: medium per-hit, high rate of fire = dangerous over time
- Model: `structures/zpu4-aa.glb` (already exists)

**37mm AA**
- Single barrel, heavier rounds
- Effective range: ~3000m
- Visual: slower tracer + flak burst at altitude (black puff sprite)
- Damage: high per-hit, lower rate of fire
- Model: `structures/37mm-aa.glb` (already exists)

**SA-2 SAM (High-Altitude Threat)**
- Radar-guided missile
- Only threatens aircraft above ~500m altitude
- Lock-on mechanic: warning tone -> solid lock -> missile launch
- Player countermeasure: flares (break lock) or dive below radar
- Visual: missile with smoke trail rising from launcher
- Model: `structures/sa2-sam.glb` (already exists)

### Implementation Approach

**Phase 1: ZPU-4 as static emplacement**
- Place ZPU-4 models at map feature positions (mode config)
- NPC gunner AI: detect aircraft within range, lead target, fire bursts
- Use existing TracerPool with green tracer color
- Damage applies to helicopter health (existing damage bar)
- Player can destroy ZPU-4 with helicopter weapons or infantry

**Phase 2: Flares + lock-on warning (for SA-2)**
- HUD: "MISSILE WARNING" indicator with directional arrow
- Audio: escalating lock-on tone
- Flare key (X): deploy flares behind aircraft, break lock
- 10-second flare cooldown
- Visual: bright flare sprites falling from aircraft

### AA Placement Strategy

Place AA at strategic points that create risk corridors:
- Near contested zones (force low-altitude approach)
- Along common flight paths
- Destroyable by infantry flanking (encourages combined arms)
- Respawn after ~120 seconds (or reinforcement wave)

---

## 8. Vehicle Damage Model

### Recommended: 4-Zone Component System

| Zone | HP% | Damage Effects | Visual |
|------|-----|----------------|--------|
| **Engine** | 40% | Progressive power loss, reduced climb rate, max speed drops | Smoke -> fire |
| **Tail Rotor** | 20% | Yaw drift -> oscillation -> uncontrolled spin | Sparks, trailing smoke |
| **Fuselage/Crew** | 30% | Direct HP damage, crew injuries | Bullet holes, blood decal |
| **Fuel System** | 10% | Fuel leak over time, eventual engine failure, fire risk | Vapor trail, flame |

### Progressive Degradation

**Engine damage stages:**
- 75% HP: occasional black smoke puffs, `liftForce *= 0.9`
- 50% HP: persistent grey smoke trail, `liftForce *= 0.7`, `maxSpeed *= 0.8`
- 25% HP: black smoke + intermittent fire, `liftForce *= 0.4`, warning klaxon
- 0% HP: engine failure, gravity only, autorotation possible

**Tail rotor damage stages:**
- 50% HP: `yawRate *= 0.6`, slight drift (apply constant small yaw force)
- 25% HP: strong yaw oscillation (sinusoidal yaw force)
- 0% HP: uncontrolled spin (`angularVelocity.y += spinForce * dt`), crash imminent

**Visual feedback:**
- Smoke: particle emitter at engine position, intensity scales with damage
- Fire: orange/red particles when HP < 25%, point light attached
- Sparks: on hit impact, brief particle burst
- Oil/fuel trail: thin particle stream behind aircraft when fuel damaged

### Emergency Autorotation

When engine dies above 50m altitude:
- Collective becomes "collective pitch" (trade altitude for rotor RPM)
- Rotor spins from airflow, generating some lift
- Skilled player can glide to survivable landing
- Below 3 m/s vertical speed on ground contact = survive
- Above 3 m/s = crash (existing ground collision bounce, but with damage)

**Game feel:** This creates the best moments - "can I nurse this smoking bird back to base?" Damage isn't instant death but a ticking clock.

### Integration

Modify `HelicopterPhysics.update()`:
- Read damage state from vehicle health system
- Apply multipliers to `liftForce`, `yawRate`, `maxSpeed`
- Spawn smoke/fire particles based on damage thresholds
- Existing damage bar in HelicopterHUD shows overall health

---

## 9. Crew Rendering (Half-Body Sprites)

### Current System

NPCs use directional billboard sprites: 18 textures per faction (3 directions x 2 states x walk animation). `CombatantRenderer` uses `InstancedMesh` per faction/state/direction combo. Direction determined by dot product between camera direction and NPC facing (threshold 0.45).

### Vehicle Crew Sprites

**What's needed:**
- Half-body (waist-up) sprite for crew at gun mounts
- Position: fixed offset from vehicle model (door gun mount, cockpit)
- Rotation: locked to vehicle rotation (crew rotates with vehicle)
- Direction: same camera dot-product system as infantry

**New sprite assets (6 per faction, 2 factions = 12 total):**
- Door gunner: manning gun (front/back/side)
- Seated crew: sitting pose (front/back/side) - for passengers visible through open doors

**Rendering approach:**
1. When NPC enters vehicle, hide ground-level billboard
2. Create half-body sprite at seat offset position
3. Update sprite position each frame: `vehiclePosition + seatOffset.applyQuaternion(vehicleQuaternion)`
4. Use same direction-switching logic as infantry billboards
5. On exit: remove half-body sprite, restore ground billboard

**LOD for crew sprites:**
- Near (<50m): visible with direction switching
- Medium (50-150m): single static sprite
- Far (>150m): hidden (vehicle dot is enough at this range)

### Sprite Availability

The codebase references NPC sprites in `AssetLoader.ts` as directional billboards loaded from `assets/sprites/`. Current sprites are full-body (walking, firing). Half-body seated/gunner sprites would be new assets that need creation.

**Options for new sprites:**
1. Crop existing full-body sprites to waist-up (quickest, may look odd)
2. Create new half-body sprite sheets (better quality, takes time)
3. Skip crew rendering initially - just have the gun animate (simplest first pass)

**Recommendation:** Start without crew sprites (just animate the gun/turret rotating). Add half-body sprites as a polish pass.

---

## 10. GLB Model Pipeline

### Current Pipeline

```
deploy-3d-assets/*.glb  ->  public/models/**/*.glb  ->  ModelLoader.loadModel()
                                                            |
                                                     LRU cache + clone
                                                            |
                                                     prepareModelForPlacement()
                                                     normalizeModel() (profiles)
```

**ModelLoader** (`src/systems/assets/ModelLoader.ts`): GLTFLoader, LRU cache, pending-promise deduplication, flat shading applied, clones returned.

**Rotor wiring** (`HelicopterGeometry.ts`): Case-insensitive search for `mainBlades`/`tailBlades` nodes. Groups blades under spin parents. Synthetic fallback blades if none found.

### GLB Model Requirements

For vehicle weapons and articulated parts, GLB models need named nodes:

**Helicopter GLB naming convention:**
```
Scene
  ├── Fuselage (main body mesh)
  ├── MainRotor OR MainBlades (rotor group)
  │     ├── Blade_1, Blade_2, ...
  │     └── RotorHub (optional)
  ├── TailRotor OR TailBlades
  ├── NoseTurret (AH-1 Cobra - rotatable turret mount)
  │     ├── TurretBase (yaw rotation)
  │     └── TurretBarrel (pitch rotation)
  ├── RocketPod_L (left rocket pod)
  ├── RocketPod_R (right rocket pod)
  ├── DoorGun_L (left door gun mount point)
  ├── DoorGun_R (right door gun mount point)
  ├── Seat_0 (pilot seat position)
  ├── Seat_1 (co-pilot/gunner seat)
  ├── Seat_2..N (passenger seats)
  ├── ExhaustPoint (engine smoke/fire spawn point)
  └── Muzzle_* (weapon muzzle flash points)
```

**What needs checking in existing GLBs:**
1. Do the current helicopter GLBs have named weapon mount nodes?
2. Do they have turret geometry that can rotate?
3. Are there seat position markers?
4. Is there an exhaust/engine node for damage smoke?

If existing GLBs lack these nodes, options:
- **Re-export with named empties** (ideal - add empty nodes in Blender as markers)
- **Hardcode offsets** (quick - define mount positions in AircraftConfigs per aircraft type)
- **Create new GLBs** (last resort - only if existing models are fundamentally inadequate)

### Hardcoded Fallback Approach

If GLBs lack named nodes (likely for first pass):

```
AircraftMountPoints = {
  AH1_COBRA: {
    noseTurret: { position: [0, -0.5, 2.5], rotationLimits: { yaw: 60, pitch: [-60, 30] } },
    rocketPodL: { position: [-1.2, -0.3, 0.5] },
    rocketPodR: { position: [1.2, -0.3, 0.5] },
    muzzle: { position: [0, -0.6, 3.0] },
    exhaust: { position: [0, 1.5, -3.0] },
    seat_0: { position: [0, 0.5, 1.0] }  // pilot
  },
  UH1C_GUNSHIP: {
    doorGunL: { position: [-1.5, 0.3, -0.5] },
    doorGunR: { position: [1.5, 0.3, -0.5] },
    seat_0: { position: [0, 0.8, 1.5] },   // pilot
    seat_1: { position: [-1.5, 0.5, -0.5] } // gunner
  }
}
```

This approach is used by many games - mount points are defined in config, not in the model. It's faster to iterate and doesn't require re-exporting GLBs.

### Ground Vehicle GLBs

The ground vehicle models exist but likely need:
- Wheel nodes (for rotation animation)
- Turret nodes (for M48 Patton tank turret, M113 .50cal mount)
- Seat positions
- Exhaust points

Ground vehicles are lower priority but same pattern applies.

---

## 11. Ground Vehicles & Watercraft

### Available Models

| Vehicle | Type | Potential Role |
|---------|------|----------------|
| M151 Jeep | Light utility | Fast transport, mounted M60 |
| M35 Truck | Heavy transport | Squad transport (8+ passengers) |
| M113 APC | Armored transport | Armored squad transport, .50cal |
| M48 Patton | Main battle tank | Heavy fire support, 90mm cannon |
| PT-76 | Light tank (NVA) | Amphibious, 76mm cannon |
| Sampan | Small boat | River transport, ambush |
| PBR | Patrol boat | River patrol, twin .50cal |

### Implementation Priority

**Skip for now.** Ground vehicles require:
- Ground pathfinding with vehicle-width clearance and turning radius
- Terrain following (different from infantry - wheels track surface)
- Physics: suspension, traction, steering (much more complex than helicopter)
- Road/path system (vehicles can't drive through dense jungle)
- Bridge/crossing mechanics

Ground vehicles are a separate project phase. The helicopter system is the Vietnam War vehicle. Ground vehicles add variety but aren't essential.

**If implementing one ground vehicle:** The M151 Jeep is simplest (no turret, 2-4 seats, fast). Think Battlefield 1942 jeep - drive to objective, hop out, fight. Simple arcade steering.

### Watercraft

Even lower priority. Requires water surface detection, buoyancy, current flow. The PBR could be interesting for river patrol missions but needs dedicated water physics.

---

## 12. Control Schemes

### Desktop (Keyboard + Mouse)

**Current helicopter controls (keep as-is):**
- W/S: collective (altitude)
- A/D: yaw (rotate)
- Arrow keys: cyclic (pitch/roll)
- Shift: engine boost
- Space: auto-hover toggle
- E: enter/exit
- RCtrl: toggle mouse control mode
- G: squad deploy

**New weapon controls (add):**
- Left click: fire current weapon
- Right click: secondary fire OR zoom (attack helicopter optics)
- 1/2/3: weapon group select
- R: reload current weapon
- X: deploy flares/countermeasures (when AA exists)
- F: switch seat (when multi-seat NPC system exists)
- Tab/M: tactical map (for air support call-ins)
- Mouse wheel: zoom (gunner optics mode)

**Design principle:** Flight always responds to current controls. Weapon controls overlay on top. Player never loses flight control while shooting.

### Touch (Mobile)

**Current helicopter touch layout (keep as-is):**
- Left joystick: collective (Y) + yaw (X)
- Right joystick (TouchHelicopterCyclic): pitch (Y) + roll (X)

**New weapon controls (add to right side):**
- Fire button: large, right thumb, always visible in attack/gunship
- Weapon switch: swipe on fire button or tap cycle button
- Flare button: near fire button (when AA exists)

**Auto-hover is critical for mobile weapon use.** Without auto-hover, mobile players can't aim and fly simultaneously. Auto-hover lets them stabilize, then use right thumb for weapon control.

### Spooky Gunner Controls

When operating AC-47 weapons (orbiting gunship):
- Mouse/touch: pan crosshair within weapon arc cone
- Left click: fire miniguns
- 1/2/3: switch between gun positions (different angles)
- E or Escape: exit gunner mode, return to infantry
- Auto-orbit means no flight controls needed

### Air Support Call-In Controls

- Open tactical map (Tab/M or radio interaction)
- Click to designate target point
- Drag to set approach direction (napalm/rocket run)
- Confirm with Enter or click button
- Close map, return to gameplay

---

## 13. Visual Effects Pipeline

### What Exists (Reusable)

| System | File | Capacity | Notes |
|--------|------|----------|-------|
| TracerPool | `effects/TracerPool.ts` | 64 concurrent | Dual-line (core + glow), 120ms lifetime |
| ImpactEffectsPool | `effects/ImpactEffectsPool.ts` | 32 concurrent | Blood + sparks + decal |
| MuzzleFlashSystem | `effects/MuzzleFlashSystem.ts` | 32 player + 64 NPC | GLSL shaders, per-weapon variants |
| ExplosionEffectsPool | `effects/ExplosionEffectsPool.ts` | 16 concurrent | Flash + smoke + fire + debris + shockwave |

### What's Needed (New)

**Minigun tracer stream:**
- Spawn tracer every 3rd round at ~50/sec = ~17 tracers/sec
- Existing TracerPool handles 64 concurrent - may need increase to 128 for multiple miniguns
- Elongated tracers (2x normal length) at high speed look like streams
- Orange/red for US, green for NVA AA tracers

**Rocket projectile + trail:**
- Visible mesh (small cylinder, 0.5m long)
- Smoke trail: particle emitter at tail, particles persist in world space
- Each particle: starts small/bright, grows larger/grey, fades
- 2-3 second trail lifetime
- On impact: ExplosionEffectsPool.spawn()

**Napalm fire spread:**
- Layered particle system along impact line
- Bright core particles (orange/yellow) + dark smoke particles rising
- Multiple point lights along fire line
- Ground scorch decal (dark texture overlay on terrain)
- 10-15 second duration, particles fade out at end

**Smoke trail (damaged vehicles):**
- Continuous particle emitter at engine/exhaust position
- Light damage: thin, white/grey, intermittent puffs
- Heavy damage: thick, black, continuous stream
- Fire: add orange/red particles interleaved with smoke

**Flare deployment:**
- 4-6 bright white/yellow sprites ejected behind aircraft
- Gravity + slight spread, 3-second lifetime
- Intensity bloom (if post-processing available)

### Performance Budget for Effects

At peak vehicle combat (2 helicopters + AA fire + napalm):
- Tracers: ~30-50 active (minigun streams + AA)
- Rocket trails: 2-4 active rockets with ~20 trail particles each = ~80 particles
- Explosions: 2-3 concurrent
- Napalm fire: ~100-200 fire/smoke particles
- Smoke trails: ~50-100 particles per damaged vehicle

**Total particle budget:** ~400-500 concurrent particles. This is manageable with instanced rendering (existing pattern). GPU instancing means draw calls stay low even with high particle counts.

---

## 14. Implementation Phases

### Phase 1: Helicopter Weapons (Highest Impact, Medium Effort)

**Goal:** Make the AH-1 Cobra and UH-1C Gunship actually combat-effective.

**Tasks:**
1. VehicleWeaponSystem - fire logic, ammo tracking, cooldowns
2. M134 minigun - hitscan, tracer stream, minigun audio loop
3. Rocket pod - projectile spawn, arc trajectory, explosion on impact
4. Weapon switching (1/2 keys on Cobra)
5. Ammo display in HelicopterHUD (already has placeholder)
6. KillFeed integration (weapon types already defined)
7. Rearm at helipad (land on helipad = refill ammo over time)

**Estimated scope:** ~600-800 lines new code. Heavy reuse of existing weapon/effects systems.

### Phase 2: Vehicle Damage + AA Threats (Medium Impact, Medium Effort)

**Goal:** Create risk/reward for helicopter gameplay.

**Tasks:**
1. Component damage system (engine/tail rotor/fuselage/fuel)
2. Progressive physics degradation (modify HelicopterPhysics multipliers)
3. Smoke/fire particle emitters on damaged vehicles
4. Autorotation emergency mechanic
5. ZPU-4 emplacement AI (detect aircraft, lead target, fire tracers)
6. Place ZPU-4s at strategic map positions
7. Destroyable AA (infantry can flank and destroy)

**Estimated scope:** ~800-1000 lines. Damage model touches HelicopterPhysics, new AA NPC type.

### Phase 3: NPC Gunner (Medium Impact, Medium Effort)

**Goal:** UH-1C door gunner fires at enemies while player flies.

**Tasks:**
1. VehicleOccupancy system (seat tracking)
2. NPC gunner AI (target in arc, lead, burst fire)
3. M60 door gun firing (reuse TracerPool + audio)
4. Gunner enters/exits with helicopter (spawned on vehicle creation)
5. Gunner killable (reduces vehicle capability)

**Estimated scope:** ~500-700 lines. Reuses existing AI targeting + fire budget.

### Phase 4: Air Support Call-Ins (High Impact, Medium-High Effort)

**Goal:** Strategic air support adds commander-level gameplay.

**Tasks:**
1. Radio/tactical map UI for target designation
2. Napalm strike - F-4 fly-over + fire spread effect
3. Spooky call-in - AC-47 orbit + minigun bursts (automated)
4. Cooldown/charge system per support type
5. Audio: radio chatter, engine sounds, weapon reports
6. GameEventBus events for support lifecycle

**Estimated scope:** ~1000-1500 lines. New UI, new aircraft behaviors, new effects.

### Phase 5: Spooky Player Gunner Mode (Medium Impact, Medium Effort)

**Goal:** Player can ride the AC-47 and control weapons directly.

**Tasks:**
1. Pylon turn orbit controller (scripted flight path)
2. Gunner camera (looking down-left from aircraft)
3. Weapon arc constraint system
4. Minigun firing with tracer rain visual
5. Enter/exit Spooky mode
6. Optional: thermal camera shader (stretch goal)

**Estimated scope:** ~600-800 lines. Orbit math is simple, camera setup is the tricky part.

### Phase 6: NPC Pilots + Crew Rendering (Medium Impact, High Effort)

**Goal:** Helicopters can fly without player, crew visible from outside.

**Tasks:**
1. AI pilot FSM (patrol, attack run, RTB)
2. Waypoint/route system for AI flight paths
3. Boarding/dismounting AI states
4. Half-body crew sprite assets (new art needed)
5. Crew sprite rendering at vehicle mount points
6. Crew targetability (shoot the pilot)

**Estimated scope:** ~1200-1500 lines + art assets. Most complex phase.

### Phase 7: SA-2 SAM + Countermeasures (Low Priority)

**Goal:** High-altitude threat forces tactical decisions.

**Tasks:**
1. SA-2 lock-on mechanic (detection -> tracking -> launch)
2. Missile projectile with smoke trail
3. Lock-on warning HUD + audio
4. Flare deployment mechanic
5. Evasion gameplay (dive below radar altitude)

### Phase 8: Ground Vehicles (Future)

Separate project phase. Not recommended until helicopter systems are complete.

---

## 15. Performance Budget

### Current Baseline

- combat120 scenario: p99 ~34ms, avg ~12.3ms
- Target: maintain p99 < 40ms with vehicle systems active

### Per-System Cost Estimates

| System | Per-Frame Cost | Notes |
|--------|---------------|-------|
| Helicopter physics | ~0.1ms per heli | Already paid for existing 3 helis |
| Vehicle weapon hitscan | ~0.05ms per shot | Same as infantry shot |
| Rocket projectile update | ~0.02ms per rocket | Position + collision check |
| Tracer pool update | ~0.2ms for 64 tracers | Instanced mesh update |
| Smoke/fire particles | ~0.3ms for 200 particles | Billboard sprites, instanced |
| AA NPC targeting | ~0.1ms per emplacement | Staggered updates (every 3rd frame) |
| NPC gunner AI | ~0.1ms per gunner | Reuses fire budget system |
| NPC pilot FSM | ~0.05ms per pilot | Simple state machine |
| Crew sprite update | ~0.05ms per crew | Position copy + direction switch |
| Spooky orbit math | ~0.01ms | Trivial trig |

**Total estimated overhead (worst case, all systems active):** ~1.5-2.0ms per frame. Well within budget.

### Optimization Levers

- Stagger AA/gunner AI updates across frames (already done for infantry)
- LOD crew sprites (skip at distance)
- Particle budget caps per effect type
- Disable vehicle systems on modes that don't use them (already the pattern)

---

## Summary of Recommendations

1. **Start with helicopter weapons** (Phase 1) - highest impact, most reuse of existing code
2. **Add AA threats next** (Phase 2) - creates the risk/reward loop that makes vehicle combat fun
3. **NPC gunner** (Phase 3) - makes the Gunship useful without a second player
4. **Air support call-ins** (Phase 4) - adds strategic depth, spectacular visuals
5. **Keep custom physics** - don't add a physics engine, the existing HelicopterPhysics is well-tuned
6. **Hardcode mount points** - don't re-export GLBs yet, define weapon positions in config
7. **Defer ground vehicles** - helicopter gameplay is the core Vietnam experience
8. **Crew sprites are polish** - animate the guns first, add visible crew later
9. **Spooky as call-in first** - get the visual spectacle working, add player control later
10. **Progressive damage over instant death** - creates the best moments in vehicle gameplay
