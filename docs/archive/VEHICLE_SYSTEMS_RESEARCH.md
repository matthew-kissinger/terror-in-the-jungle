# Vehicle Systems Research

Research compilation for Terror in the Jungle vehicle systems. Research only - no code.

Last updated: 2026-03-08

---

## 1. Multi-Seat Vehicle Systems (Battlefield / Rising Storm 2 / Squad)

### Seat Switching Mechanics

**Battlefield series (1942 through 2042):**
- BF1942: Keys 1-6 switch positions within a vehicle (F-keys reserved for radio comms)
- BF V/2042: F1-F5 keys switch between seat positions (F1 = driver/pilot, F2 = gunner, etc.)
- BF 2042 bug note: pressing F1 briefly occupies driver seat before snapping back; holding 4-5 seconds keeps you seated - suggests seat transitions need animation/delay to feel correct
- BattleBit Remastered (BF-like): also uses F-key seat switching

**Rising Storm 2: Vietnam:**
- Huey (UH-1H): 8 seats total - 1 pilot, 1 co-pilot, 2 door gunners (M60D, 550 rounds each), 4 passengers
- Cobra (AH-1G): 2 seats - 1 pilot, 1 gunner
- Loach (OH-6): small scout helicopter
- If the pilot is killed, controls auto-transfer to co-pilot (seamless failover)
- V key = tell passengers to bail out
- Pilot can lift helicopter while switching seats (exploit/glitch - helicopter flies with no pilot until pilot or heli destroyed)

**Squad:**
- F8 for quick switch to next free seat
- Helicopter controls: W/S altitude, A/D sideways, Q/E rudder, mouse for smooth pitch/roll
- Community consensus: mouse-based helicopter controls are awkward; keyboard-only not viable either
- Hybrid joystick/keyboard/mouse experimental support added

### Pilot vs Gunner Weapon Distribution (Battlefield 4 model)

This is the clearest reference for how to split weapons between crew positions:

**Pilot gets:**
- Primary: Hydra rockets (14 cap, fast), Zuni rockets (high damage, small mag), Smart rockets (self-adjusting)
- Secondary: Heatseekers (lock-on), TOW missiles (manual, high damage)
- Countermeasures: Flares (break lock), ECM jammer (prevent locks), Extinguisher (remove critical state)
- Upgrades: Stabilizer, airborne radar, stealth coating

**Gunner gets:**
- Primary: Cannon with wide swivel range
- Secondary: Laser-guided AT missile (paint targets), TV missile (manually guided first-person)
- Optics: Zoom, IRNV (near), Thermal (long range)
- Upgrades: Belt feeder (faster reload), proximity scan

**Design principle:** Pilot controls movement + forward-facing weapons + countermeasures. Gunner controls turret/swivel weapons + precision targeting + optics. "The gunner is at the mercy of someone else to fly the helicopter."

### Vehicle Seat Configurations (BF 2042 reference)

- Transport helicopter: 7 seats (1 pilot, 2 gunners, 4 passengers)
- Attack helicopter: 2 seats (1 pilot, 1 gunner)
- Scout helicopter: 4 seats (1 pilot, 1 gunner, 2 passenger bench seats)
- Armored transport: 4 seats (1 driver, 1 remote rooftop gunner, 2 turret gunners)

### Key Takeaways for Implementation

- Seat system is an array of SeatConfig objects, each with: position index, role (pilot/gunner/passenger), allowed weapons, camera config, control scheme
- F-keys (or number keys) for instant seat switching is the established convention
- Co-pilot failover (RS2) is excellent for single-player or AI crew scenarios
- Pilot should always have countermeasures; gunner should have optics/precision weapons
- "Every seat has a vital role" - avoid empty passenger seats with no gameplay value

---

## 2. AC-130/Spooky Gunship Circling Mechanics

### The Pylon Turn (Core Orbit Pattern)

The real AC-130 (and Vietnam-era AC-47 Spooky) uses a "pylon turn" - a constant left-bank orbit around a target point. This is because all weapons are mounted on the port (left) side of the aircraft.

**Implementation pattern:**
- Aircraft maintains constant altitude (historically 7,000-8,000 feet AGL at night)
- Constant left bank angle determines orbit radius (steeper bank = tighter circle)
- Weapons fire downward-left through fixed or limited-traverse mounts
- The aiming point is the center of the orbit circle
- Pilot adjusts orbit radius/altitude to move the weapon impact point

**Rising Storm 2 AC-47 Spooky (commander ability):**
- Called in via radio by commander
- Orbits a selected target point
- Fires bursts from miniguns automatically
- Duration: 60-180 seconds (map-dependent)
- Functions as area denial - not primarily for kills but to prevent enemy movement
- Can be cancelled by commander to reduce cooldown

**Call of Duty MW "Death From Above" mission:**
- Player operates AC-130 weapons from thermal camera view (black/white inverted)
- Three weapon tiers: 105mm cannon (huge blast, slow reload), 40mm Bofors (medium area, auto), 25mm Gatling (rapid fire, highest zoom, smallest splash)
- Player switches between weapons, each with different zoom levels
- Aircraft circles automatically - player only controls weapon aim and firing
- Thermal view creates distinctive look: friendlies marked with IR strobes, difficult to distinguish terrain details
- Design lesson: The constrained viewpoint (fixed orbit, thermal only) actually creates tension because you can see threats but engagement is indirect

**What makes it feel good:**
- The slow, inevitable circling creates a sense of overwhelming power
- Weapon switching gives tactical depth (105mm for groups, 25mm near friendlies)
- Thermal camera aesthetic is iconic and sells the "eye in the sky" fantasy
- Sound design: distant engine drone, weapon reports with delay, radio chatter
- The orbit is mostly automated - player focuses on targeting, not flying

### Implementation Approach for Three.js

To implement the pylon turn:
```
// Pseudocode - orbit around target
angle += angularSpeed * dt
position.x = target.x + radius * Math.cos(angle)
position.z = target.z + radius * Math.sin(angle)
position.y = orbitAltitude
// Bank the aircraft model toward center
aircraft.rotation.z = bankAngle  // ~30 degrees
// Aircraft nose tangent to circle
aircraft.rotation.y = angle + Math.PI/2
```

The camera for the weapon operator looks down-left from the aircraft toward the orbit center. Weapon aim is constrained to a cone below the aircraft on the port side.

---

## 3. Three.js Vehicle Physics

### Physics Engine Comparison

**Rapier (WASM, Rust-based):**
- Written in Rust, compiled to WebAssembly
- Near-native performance
- Actively maintained
- Better raw performance for complex simulations
- Recommended by Three.js community for new projects
- Supports 2D and 3D

**Cannon.js / cannon-es:**
- Pure JavaScript, lightweight
- In maintenance mode (cannon-es fork by pmndrs)
- Only minor fixes, no fundamental improvements
- "Very slow, I would not use it these days" (Three.js forum consensus)
- Still functional for simple scenarios
- Better documentation and more tutorials available

**Ammo.js (Bullet port):**
- Fully featured, stable (Bullet physics compiled to JS)
- Large bundle (~1.9MB)
- Used in most Three.js physics examples
- Works with web workers

**PhysX / Havok (WASM):**
- PhysX: most general and full-featured
- Havok: fastest but lacks built-in vehicle controllers
- Both have WASM memory management complexity

**DIY/Custom physics:**
- Recommended only for "really simple stuff"
- Going custom means "an endless rabbit hole" for anything complex
- BUT: for arcade helicopter physics, custom is often the right call because physics engines add overhead for constraints you don't need

### Key Insight: Custom Physics for Helicopters

The Three.js helicopter physics tutorial (sbcode.net) demonstrates a Cannon.js approach:
- Uses `CANNON.PointToPointConstraint` to connect rotor to fuselage
- Thrust vector `new CANNON.Vec3(0, 5, 0)` applied to rotor body
- Stable hover at thrust value 14.7 (balances gravity)
- Yaw: directly set `angularVelocity.y`
- Pitch/Roll: modify thrust vector X/Z components
- Auto-stabilization when controls released (dampen angular velocity)
- Damping values: rotor 0.5, fuselage 0.9

**However:** For an arcade combat game like Terror in the Jungle, a full physics engine may be overkill. The current game already has custom helicopter physics (`HelicopterPhysics.ts`). A simplified force model gives more control over game feel.

### Performance Considerations

- Running physics on main thread "will burn your performance"
- Web workers significantly improve results
- For the existing game architecture (already has custom physics), adding a physics engine just for vehicles would add bundle size and complexity for marginal benefit
- Rapier is the best choice IF a physics engine is needed (WASM performance, active maintenance)

---

## 4. NPC Vehicle AI Patterns

### State Machine for Vehicle AI

A helicopter NPC needs these core states:

**Patrol State:**
- Follow waypoint path at cruise altitude/speed
- Scan for threats within detection radius
- Transitions: detect enemy -> Attack, take damage -> Evade, low fuel/ammo -> RTB

**Attack State (helicopter-specific):**
- Attack run: approach target at speed, fire weapons, break away
- Orbit attack: circle target at standoff distance (like AC-130 pylon turn)
- Strafing run: linear pass over target with guns blazing
- Transitions: target destroyed -> Patrol, low health -> Evade, ammo depleted -> RTB

**Evade State:**
- Break from engagement, gain altitude, use terrain masking
- Pop flares/chaff if missile lock detected
- Transitions: threat clear -> Patrol, health critical -> Crash

**RTB (Return to Base):**
- Navigate to helipad/LZ
- Land and rearm/repair
- Transitions: rearmed -> Patrol

**Orbit/Support State:**
- Circle a friendly position providing overwatch
- Engage targets of opportunity within orbit
- Transitions: direct threat -> Attack, ordered elsewhere -> Patrol

### Behavior Tree vs FSM

- **FSM** is better for vehicles because vehicle behavior is more rigid and predictable than infantry
- Vehicles have fewer valid states (can't take cover, can't prone, limited maneuvers)
- **Behavior trees** excel when decision complexity is high (infantry combat, squad tactics)
- Hybrid approach works well: FSM for high-level state, behavior tree within each state for decision-making

### AI Gunner Targeting

The AI gunner is a sub-agent attached to the vehicle:
- Independent target selection within weapon arc constraints
- Lead calculation based on target velocity and projectile speed
- Priority system: threats to own vehicle > soft targets > opportunity targets
- Burst fire patterns (don't hold trigger continuously)
- Accuracy variation based on difficulty setting and engagement range

### AI Pilot Behavior Patterns

**Patrol routes:** Defined as waypoint arrays with altitude/speed at each point. Use spline interpolation between waypoints for smooth flight paths.

**Attack runs:**
1. Acquire target bearing
2. Set up approach vector (ideally from behind/above target)
3. Begin run at engagement range
4. Fire weapons during approach
5. Break off at minimum range (avoid collision)
6. Climb and circle for another pass

**Orbit patterns:**
- Fixed radius orbit at constant altitude (simplest)
- Racetrack pattern: two straight legs connected by semicircles (more realistic for fixed-wing)
- Variable radius based on threat level (tighter = more aggressive)

### Vehicle Pathfinding

- Helicopters don't need ground pathfinding - they navigate in 3D with altitude constraints
- Keep above minimum altitude (terrain following)
- Avoid known AA positions (threat avoidance layer)
- Landing requires approach path calculation (glide slope to LZ)
- For ground vehicles: navmesh with vehicle-width clearance checks, turning radius constraints

---

## 5. Anti-Aircraft Systems (Vietnam War Era)

### Historical Weapon Systems

**Light AAA (accounted for 77% of USAF losses in Vietnam):**
- ZPU-4: Four-barreled 14.5mm, ~600 RPM per barrel (practical: 150 RPM), effective against helicopters and low-flying aircraft
- 37mm: Medium-caliber AA, radar-guided or optical
- 57mm: Heavier AA, used in batteries

**SA-2 Guideline SAM:**
- Soviet-supplied, radar-guided
- Forced aircraft to low altitude where AAA was deadlier
- Countered by US ECM, chaff, and Wild Weasel missions
- In Strike Fighters 2: Vietnam, SAMs have increasing lethality as campaign progresses

### Game Implementation Patterns

**Lock-On Mechanics (Battlefield model):**
1. Detection: radar/visual acquisition of target within range
2. Tracking: lock-on tone begins (rising pitch beep)
3. Lock achieved: solid tone, "LOCKED" indicator on target HUD
4. Missile fired: "INCOMING" warning on target vehicle HUD, fast beeping
5. Missile tracks with lead pursuit
6. Target can deploy countermeasures (flares/chaff) or evade

**Player Warning UI:**
- Audio: escalating beep pattern (slow detection -> fast lock -> solid fire tone)
- Visual: "MISSILE INCOMING" text, directional indicator showing missile bearing
- Timing window: ~2-3 seconds between lock tone and missile arrival for countermeasure deployment

**Countermeasure Mechanics:**
- **Flares:** Break heat-seeker lock, deploy behind aircraft, ~10 second cooldown
- **ECM Jammer:** Block radar lock, prevent new locks briefly
- **Evasive maneuvers:** Sharp turns, terrain masking, altitude changes
- Timing matters: flare too early = enemy re-locks before cooldown expires

**Flak Visual Effects:**
- Black puff clouds at burst altitude (sprite particles with fade-out)
- Tracer streams from ground (every 5th round visible)
- Shrapnel sparks on near-misses
- Screen shake and flash on hits

**Damage Application:**
- Component-based: engine, rotor, tail rotor, fuel system, controls
- Each component has HP threshold for malfunction/destruction
- Cumulative small-arms damage vs single large-caliber hits

### Implementation for Terror in the Jungle

**ZPU-4 (most relevant for helicopter gameplay):**
- Visible tracer streams from ground position
- Player hears snap/crack of near-misses
- No lock-on - pure ballistic (lead the target)
- Effective range ~1,400m, lethal to helicopters
- Visual: 4 streams of tracers converging on aircraft path

**SA-2 (if included for high-altitude gameplay):**
- Radar lock warning tone
- Missile launch visible (smoke trail from ground)
- Player must deploy flares or dive below radar
- Long cooldown between launches

---

## 6. Napalm/Air Strike Call-In Systems

### Rising Storm 2: Vietnam Commander System

**How it works:**
1. Commander approaches a stationary radio OR stands near a radioman
2. Selects support type from ability menu
3. Places target marker on map
4. Brief delay, then support arrives
5. Cooldown begins (map-dependent duration)
6. "Tap and go" design - call in and return to fighting

**Available support types (US/ARVN):**

| Ability | Effect | Duration | Notes |
|---------|--------|----------|-------|
| Artillery | 5 airburst salvos, 25m radius | ~30 sec | Kills everything in area |
| Napalm | F-4 Phantom drops 2 canisters | 10 sec fire | Instant kill in blast, fire persists |
| Spooky (AC-47) | Gunship orbits, minigun bursts | 60-180 sec | Area denial, map-dependent |
| Aerial Recon | Recon plane spots moving enemies | Variable | Can be shot down |
| Force Respawn | Instantly deploys all dead teammates | Instant | Drains tickets if overused |
| Cancel | Terminates active support | Instant | Reduces cooldown |

**Napalm specifics:**
- F-4 Phantom fly-over delivering two canisters
- Instant kill on impact
- Fire persists 10 seconds on ground
- Damages friendlies (friendly fire warning)
- Can be cancelled before canisters drop
- Strategic use: block enemy routes, flush positions, not primarily for kills

**Design philosophy:** "Support uses are not mainly purposed to kill the enemy, but prevent them from achieving their objectives" - area denial over kills.

### Implementation Patterns

**Radio call-in flow:**
1. Player activates radio (interact with object or carry radio item)
2. Map overlay opens for target placement
3. Confirmation with brief "inbound" audio callout
4. Delay (15-30 seconds for realism, adjustable)
5. Visual/audio approach (engine sound, visible aircraft)
6. Delivery (bombs, napalm, strafing)
7. Effect on ground (explosions, fire spread, smoke)
8. Cooldown timer begins

**Cooldown/resource system options:**
- Pure cooldown (RS2 model): each ability on independent timer
- Point-based: earn points from kills/objectives, spend on support
- Radio charges: limited uses per match
- Commander-only: single player has support authority (RS2 model)

For Terror in the Jungle, the RS2 model fits well - commander/squad leader radio call with cooldowns.

---

## 7. Vehicle Weapon Visual Effects

### Minigun Tracer Streams

**Real-world reference:**
- Standard military loading: 1 tracer per 4 rounds (4:1 ratio, "every 5th round")
- At minigun fire rates (2,000-6,000 RPM), tracers create continuous visible streams
- Streams look like "laser beams" at full fire rate
- Red/orange tracer color (US), green (NVA/VC)

**Game implementations:**
- Battlefield 2: tracers visible every 3rd shot on LMGs, present on miniguns/autocannons
- Red Orchestra: tracers every 3 rounds
- Many games use "Every Bullet Is a Tracer" trope for visual impact over realism

**Implementation approach:**
- Spawn tracer particle every Nth bullet (configurable, 3-5 for miniguns)
- Tracer = elongated bright sprite/mesh along velocity vector
- Lifetime: ~0.5-1.0 seconds
- Color: bright core (white/yellow) with colored glow (red for US, green for NVA)
- At high fire rates, individual tracers blend into streams visually
- GPU instancing for tracer meshes (hundreds visible simultaneously)

### Rocket Exhaust Trails

**Three.js approaches:**
- Particle emitter attached to rocket rear, spawning smoke sprites along path
- Each smoke particle: starts small/bright, grows larger, fades to transparent
- Use `PointsMaterial` with additive blending for exhaust glow
- Persistent smoke trail: particles remain in world space after rocket passes
- Trail lifetime: 2-5 seconds for visual persistence
- Rocket itself: bright point light + elongated mesh

**Technique:**
- Spawn particles at rocket position each frame
- Initial: small, bright orange/white, high opacity
- Over lifetime: grow larger, shift to grey, reduce opacity
- Apply slight turbulence/wind drift to aged particles
- Use billboard sprites for smoke puffs (always face camera)

### Door Gun Muzzle Flash

- Rapid strobe effect at muzzle point
- Additive blending sprite (orange/white)
- Random rotation each frame for organic feel
- Scale variation (0.8x-1.2x) per flash
- Duration: 1-2 frames per flash, continuous during fire
- Light source at muzzle position (point light, short range, matching flash timing)
- Shell casing particle ejection (small brass-colored sprites falling with gravity)

### 40mm Grenade Arcs

- Visible projectile with slow, lobbing arc (low muzzle velocity ~76 m/s)
- Subtle smoke trail behind grenade (thin, short-lived)
- Audible "thump" on launch, whistle during flight
- Impact: medium explosion sprite + expanding smoke ring + shrapnel particles
- Effective radius ~10m, lethal radius ~5m
- Parabolic trajectory easily visible to both shooter and target

### Napalm Visual Effects

**Canister delivery:**
- Tumbling canister model falling from aircraft
- Thin smoke trail during fall
- Impact: initial bright flash/fireball

**Fire spread:**
- Elongated fire zone (napalm splashes in a line, not a circle)
- Billowing orange/black smoke rising
- Fire particles on ground with flickering light sources
- Thick black smoke column visible from distance
- Ground scorching decal (dark texture overlay)
- Duration: 10-30 seconds of active fire

**Three.js fire approach:**
- Layered particle system: bright core particles (orange/yellow) + dark smoke particles (black/grey) rising above
- Custom shader with noise-based distortion for heat shimmer
- Multiple point lights along fire line for ground illumination
- Volumetric smoke using billboard sprite stacks

### What Makes Weapon Effects Feel Good

1. **Exaggeration over realism:** Tracers are more visible than real life, explosions are bigger, smoke is thicker
2. **Sound sells the effect:** The visual is 50% of the impact, audio is the other 50%
3. **Screen feedback:** Camera shake, flash overlay, chromatic aberration on nearby explosions
4. **Persistence:** Effects that linger (smoke, fire, scorched ground) make the world feel affected
5. **Contrast:** Bright tracers against dark environments, fire glow in shadow areas
6. **Particle variety:** Mix sprite sizes, speeds, and lifetimes for organic feel

---

## 8. Vehicle Crew Rendering

### The Problem

How to show crew members (pilots, door gunners) visible in open vehicles from the outside, without spending full character model budgets on each crew position.

### Approaches

**Full 3D models (AAA approach):**
- Skeletal mesh characters seated in vehicle
- Animated (gunner turns with weapon, pilot moves controls)
- Expensive: each crew member = full character render cost
- Used by: Battlefield, Squad, Arma 3

**Billboard impostor sprites (optimized approach):**
- Camera-facing quad with pre-rendered character image
- Multiple angles captured in spritesheet (8-16 directions)
- Switch sprite based on camera viewing angle
- Very cheap to render
- Terror in the Jungle already uses this for NPC infantry (directional billboards with front/back/side)

**Hybrid billboard cloud:**
- Multiple intersecting billboards creating volume appearance
- Better depth perception than single billboard
- Still much cheaper than full 3D model

**LOD transition:**
- Close range: low-poly model with basic animation
- Medium range: billboard impostor
- Far range: skip crew rendering entirely

### Recommendation for Terror in the Jungle

The game already has a directional billboard sprite system for NPCs (front/back/side via dot product, threshold 0.45). The same system can render vehicle crew:

- Door gunner: half-body sprite (waist up) positioned at gun mount point
- Pilot: barely visible through cockpit, simplified or skip
- Seated passengers: half-body sprites on bench positions
- Sprite rotates with vehicle, camera-angle switching same as infantry

Key consideration: door gunners need to animate (turning with gun, recoil). Options:
- Multiple sprite sheets per pose (firing left, firing right, firing forward)
- Or: keep it simple with a single "manning gun" sprite and let the gun model do the visual work

### Historical Reference

Rising Storm 2 renders helicopter crew as visible characters that can be shot (pilots wear ballistic vests making them harder to kill). Players target crew through cockpit glass or open door positions. This implies crew must be rendered with enough fidelity to be targetable.

---

## 9. Vehicle Damage Models

### Component-Based Damage (Rising Storm 2 model)

RS2 tracks 3 helicopter components independently:

| Component | Damage Effect | Severity |
|-----------|--------------|----------|
| Engine | Hard to gain altitude, easy to sink, reduced power | Critical - RTB immediately |
| Main Rotor | Hard to gain altitude, vertical speed loss in maneuvers | Serious - use remaining ammo, RTB |
| Tail Rotor | Reduced yaw control, helicopter starts spinning | Critical - fight the spin or crash |

### DCS World Damage Model (simulation reference)

More granular component tracking:
- Oil system: brownish haze trail (severity = trail size)
- Hydraulic system: white/reddish vapor trail
- Cooling system: bright white steam clouds
- Fuel system: fine white vapor trail, potential fire
- Engine: progressive power loss, eventual failure
- Flight controls: reduced authority, trim issues
- Structural elements: progressive weakening, catastrophic failure under load

Uses 4 damage texture levels (0-3) applied progressively as hits accumulate.

### War Thunder Visual Damage Effects

- Volumetric fire with long smoky tails for fuel damage
- Bullet holes show flames through them
- Fuel leaking effects when tanks/engines damaged
- Material-based destruction (metal vs canvas hulls produce different effects)
- Broken components rotate in air with physics
- Ground crash: aircraft slides with inertia, sparks on solid surfaces, extended burn-out

### GTA-Style Progressive Damage (arcade reference)

- Engine damage: clunking sounds, smoke from hood
- Fuel leak: visible fuel trail, can be ignited
- Fire: vehicle burning = imminent explosion
- Visual deformation of body panels (not applicable to aircraft)

### Recommended Damage Model for Terror in the Jungle

**Tiered approach (arcade-simulation hybrid):**

**Health Zones (3-4 components):**
1. **Engine** (40% of total HP)
   - 75% HP: slight power reduction, occasional black smoke puffs
   - 50% HP: persistent grey smoke trail, reduced max speed, harder to climb
   - 25% HP: black smoke + intermittent fire, severe power loss
   - 0%: engine failure, autorotation only

2. **Tail Rotor** (20% of total HP)
   - 50% HP: slight yaw drift, correctable
   - 25% HP: strong yaw oscillation, hard to control
   - 0%: uncontrolled spin, crash imminent

3. **Fuselage/Crew** (30% of total HP)
   - Crew hits = direct HP damage
   - Pilot killed = crash (or co-pilot takeover)
   - Gunner killed = weapon offline

4. **Fuel System** (10% of total HP)
   - Damage causes fuel leak trail (visible particles)
   - Fuel depletion over time = eventual engine failure
   - Leak can catch fire from tracers (probability-based)

**Visual feedback per state:**
- Healthy: clean aircraft
- Light damage: occasional smoke puffs, minor oil streaks
- Medium damage: persistent smoke trail, sparks
- Heavy damage: smoke + fire, flickering systems
- Critical: heavy black smoke, fire engulfing, systems failing

**Emergency procedures:**
- Autorotation: if engine dies above 50m, skilled pilot can glide to survivable landing
- Crash landing: below certain speed threshold, crew survives with injury
- Catastrophic: instant destruction (fuel explosion, structural failure)

---

## 10. Control Scheme Design (Pilot + Gunner Combo)

### Single-Player Multi-Role Challenge

The core problem: one player needs to fly AND shoot. Games solve this several ways:

### Approach A: Pilot Has Forward Weapons (Battlefield model)

- Pilot controls flight + fires rockets/missiles forward
- Weapons aim where aircraft points
- No seat switching needed for basic combat
- Gunner position is for a second player or AI crew
- **Pros:** Simple, intuitive, always in control
- **Cons:** Can't aim precisely while maneuvering

### Approach B: Seat Toggle (RS2 / Arma model)

- Player switches between pilot and gunner seats
- While in gunner seat, helicopter maintains last course (or hovers if AI co-pilot)
- F-key or dedicated key to switch
- **Pros:** Full access to all weapons
- **Cons:** Dangerous mid-combat, aircraft uncontrolled during switch

### Approach C: Weapon Groups (recommended for Terror in the Jungle)

- Pilot seat has multiple weapon groups bound to number keys
- 1 = forward guns/minigun
- 2 = rockets
- 3 = guided missiles
- Mouse aims within weapon gimbal limits
- No seat switching needed
- **Pros:** Fast weapon access, intuitive, always flying
- **Cons:** Can't access turret-style weapons (those are AI gunner or second player)

### Keyboard + Mouse Control Scheme

**Flight controls (always active):**
- W/S: collective (altitude up/down)
- A/D: yaw (rotate left/right)
- Arrow keys OR mouse: cyclic (pitch/roll for movement)
- Shift: boost/afterburner
- Space: auto-hover toggle
- E: enter/exit vehicle
- G: tactical insertion (squad deploy)

**Weapon controls:**
- Left click: fire current weapon
- Right click: secondary fire OR zoom/optics
- 1/2/3: weapon group select
- R: reload
- F: switch seat (if multi-seat)
- Mouse wheel: zoom (gunner optics)

**Countermeasures:**
- X or C: deploy flares/chaff
- Visual + audio feedback on deployment

### Touch Controls (Mobile)

**Left side:**
- Virtual joystick: flight control (collective + yaw)
- Altitude buttons (up/down) if joystick handles yaw only

**Right side:**
- Fire button (large, thumb accessible)
- Weapon switch (swipe or tap cycle)
- Secondary fire button (smaller)

**Additional:**
- Tilt device for cyclic (optional, can be disorienting)
- Auto-hover button (essential for mobile - flight is too hard without it)
- Flare button (near fire button)

### Key Design Principles

1. **Flight first, weapons second:** Player must always feel in control of the aircraft. Weapon aiming is secondary.
2. **Auto-hover is essential:** Especially for casual/mobile players. Let them stop and shoot.
3. **Forward weapons aim with aircraft:** Pilot rockets/guns go where the nose points. Simple.
4. **Turret weapons are AI or second player:** Don't make one player manage turret aim + flight simultaneously.
5. **Countermeasures must be instant:** One button, no menu, immediate response.
6. **Visual feedback for current weapon:** HUD shows selected weapon, ammo count, reload state.
7. **Progressive complexity:** Basic controls are simple (fly + shoot). Advanced controls (weapon switching, countermeasures, optics) are available but not required.
8. **BF model works best for single-player:** Pilot has forward weapons (rockets, guns), AI gunner handles turret. Player can optionally switch to gunner for precision work during auto-hover.

---

## Cross-Cutting Themes

### What Makes Vehicle Combat Feel Good

1. **Weight and momentum:** Vehicles should feel heavy. Input -> slight delay -> smooth response.
2. **Audio feedback:** Engine pitch changes with throttle, rotor wash sound, weapon reports echo off terrain.
3. **Camera work:** Slight camera lag behind vehicle movement, shake on weapon fire, trauma shake on taking hits.
4. **Visible impact:** Tracers hitting targets spark, explosions throw debris, damaged vehicles trail smoke.
5. **Risk/reward:** Flying low is dangerous (AA fire, terrain collision) but effective (better weapon accuracy, harder to lock on).
6. **Progressive degradation:** Damage doesn't instantly kill - it degrades performance, creating tense "can I make it back to base" moments.

### Performance Budget Considerations (Three.js)

- Particle systems: use GPU instancing, limit max particles per emitter
- Tracer rendering: instanced meshes, not individual objects
- Smoke/fire: billboard sprites with atlas textures, batch draw calls
- Physics: keep custom (game already has HelicopterPhysics.ts), don't add a physics engine
- AI vehicles: stagger AI updates across frames (already done for infantry)
- LOD: crew sprites only rendered within meaningful range
- Sound: spatial audio with distance culling

### Relevant Existing Systems in Terror in the Jungle

- `HelicopterPhysics.ts` - flight model (airspeed, heading, verticalSpeed getters)
- `AircraftConfigs.ts` - per-aircraft physics + weapon configs
- `AircraftWeaponMount` - UH1_HUEY (none), UH1C_GUNSHIP (M60), AH1_COBRA (M134 + rockets)
- `HelicopterModel.ts` - visual model
- `HelicopterInteraction.ts` - enter/exit
- `SquadDeployFromHelicopter.ts` - tactical insertion (G key)
- `CrosshairSystem.ts` - 4 modes including helicopter_transport/gunship/attack pipper
- `HelicopterHUD.ts` - flight instruments (airspeed, heading, VSI, weapon status, damage bar)
- NPC directional billboard sprite system (reusable for crew rendering)
- Existing weapon tracer system (player tracers for all weapon types)

---

## Sources

### Vehicle Seat Systems
- [RS2 Cobra Wiki](https://wiki.rs2vietnam.com/index.php?title=AH-1G_%22Cobra%22)
- [RS2 Huey Wiki](https://wiki.rs2vietnam.com/index.php?title=UH-1H_%22Huey%22)
- [RS2 Combat Pilot Wiki](https://rs2vietnam.com/wiki/doku.php/snrole/combat_pilot)
- [RS2 Helicopter Control Guide](https://www.gameskinny.com/tips/rising-storm-2-vietnam-helicopter-control-guide/)
- [BF 2042 Seat Switching Forum](https://forums.ea.com/discussions/battlefield-2042-technical-issues-en/why-cant-i-switch-seats-in-any-vehicle/6948440)
- [BF1942 FAQ](https://www.realtimerendering.com/erich/bf1942/faq.html)
- [BF4 Attack Helicopters](https://lparchive.org/Battlefield-4/Update%2012/)
- [BF 2042 Vehicles](https://www.ea.com/en/games/battlefield/battlefield-6/news/vehicles)

### AC-130/Gunship
- [CoD AC-130 Wiki](https://callofduty.fandom.com/wiki/AC-130)
- [CoD Death From Above Wiki](https://callofduty.fandom.com/wiki/Death_From_Above)
- [AC-47 Spooky Wikipedia](https://en.wikipedia.org/wiki/Douglas_AC-47_Spooky)
- [RS2 Commander Wiki](https://wiki.rs2vietnam.com/index.php?title=Commander_(South_Vietnam))
- [AC-130 Gunship Operator (Steam)](https://store.steampowered.com/app/1466310/AC130_Gunship_Operator/)

### Three.js Physics
- [Rapier vs Cannon Forum](https://discourse.threejs.org/t/rapier-vs-cannon-performance/53475)
- [Preferred Physics Engine Forum](https://discourse.threejs.org/t/preferred-physics-engine-cannon-js-ammo-js-diy/1565)
- [Three.js Helicopter Physics Tutorial](https://sbcode.net/threejs/physics-heli/)
- [Simplified Flight Model](https://discourse.threejs.org/t/simplified-flight-model/15058)
- [Everest Flight Sim (GitHub)](https://github.com/mpaccione/everest_flight_sim)

### Vehicle AI
- [Game AI: Behavior Trees, FSMs](https://developers-heaven.net/blog/game-ai-behavior-trees-state-machines-and-pathfinding/)
- [Behavior Trees Tutorial (PDF)](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter06_The_Behavior_Tree_Starter_Kit.pdf)
- [Behavior Trees Wikipedia](https://en.wikipedia.org/wiki/Behavior_tree_(artificial_intelligence,_robotics_and_control))

### Anti-Aircraft Systems
- [North Vietnam Light AAA](https://historynet.com/north-vietnams-light-anti-aircraft-artillery/)
- [ZPU Fandom Wiki](https://vietnamwar.fandom.com/wiki/ZPU)
- [BF IR Flares Wiki](https://battlefield.fandom.com/wiki/IR_Flares)
- [BF Missile Countermeasures](https://battlefield.fandom.com/wiki/Missile_Countermeasures)
- [Strike Fighters 2: Vietnam](https://en.wikipedia.org/wiki/Strike_Fighters_2:_Vietnam)

### Napalm/Air Strikes
- [RS2 Commander Role](https://wiki.rs2vietnam.com/index.php?title=Commander_(South_Vietnam))
- [RS2 Commander Guide](https://primagames.com/tips/rising-storm-2-vietnam-how-be-good-commander)
- [RS2 Commander Steam Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=953563279)

### Weapon Visual Effects
- [Tracer Ammunition Wikipedia](https://en.wikipedia.org/wiki/Tracer_ammunition)
- [Tracer Ratio (Quora)](https://www.quora.com/What-is-the-ratio-of-standard-rounds-vs-tracer-rounds-typically-used-in-a-mini-gun)
- [Three.js Rocket Particle System](https://www.shanebrumback.com/threejs-examples/rocket-engine-particle-system.html)
- [Three.js Fire Simulation (GitHub)](https://github.com/neungkl/fire-simulation)
- [Three.js Particle Trail Forum](https://discourse.threejs.org/t/particle-trail-effect/31642)

### Vehicle Damage
- [War Thunder Aviation VFX](https://warthunder.com/en/news/6911-development-new-visual-effects-for-aviation-en)
- [DCS Damage Model](https://www.digitalcombatsimulator.com/en/news/2020-11-06/)
- [War Thunder Helicopter Physics](https://warthunder.com/en/news/5742-development-flight-models-and-physics-of-war-thunder-helicopters-en)
- [RS2 Helicopter Damage Discussion](https://steamcommunity.com/app/418460/discussions/0/1643168996825130016/)
- [RS2 Cobra Domination Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=936584960)

### Control Schemes
- [Arma 3 Vehicle Controls](https://community.bistudio.com/wiki/Arma_3:_Field_Manual_-_Vehicle_Controls)
- [Squad Helicopter Controls](https://steamcommunity.com/app/393380/discussions/6/1644304412667844781/)
- [BF Helicopter Flying Tips](https://www.gamesradar.com/games/battlefield/battlefield-6-flying-jet-helicopter/)
- [Mobile Touch Controls (MDN)](https://developer.mozilla.org/en-US/docs/Games/Techniques/Control_mechanisms/Mobile_touch)
- [Billboard Impostor Rendering](https://www.alanzucconi.com/2018/08/25/shader-showcase-saturday-7/)
- [Impostor Rendering In-Depth](https://www.oreateai.com/blog/indepth-explanation-of-impostors-rendering-technology-a-visual-deception-system-based-on-paper-constructs/22c0adb19b2206b8597bc30923476aa9)
