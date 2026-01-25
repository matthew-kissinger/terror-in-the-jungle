# Weapon System Implementation Plan
## Terror in the Jungle - Explosive Weapons & Sandbags

---

## CURRENT PRIORITIES

### Grenade Overhaul (High Priority)
Current grenade system is **poorly implemented**:
- Throwing arc/preview is unclear - **add trajectory line**
- Physics feel floaty - **tighten up gravity/drag**
- Explosion effect is weak - **bigger, louder, more particles**
- Damage radius inconsistent - **fix hitbox detection**
- No cooking mechanic - **add hold-to-cook timer**
- Throw power UX confusing - **visual power meter**

### Mortar System (High Priority)
Currently **disabled** due to camera/physics issues:
- Needs proper **ballistic arc physics** from scratch
- **Trajectory preview** with landing indicator
- Satisfying **impact effects**
- Camera stays usable during aiming

### New Weapons - IMPLEMENTED (2025-01-25)
1. **Shotgun** - Close-range option for jungle combat
   - 10 pellet spread pattern (8 degree spread)
   - High damage close (15), falloff at distance (4)
   - Pump action animation with wooden furniture
   - 8 shell tube magazine, 24 reserve
   - Key: 1

2. **SMG** - Spray option
   - High ROF (900 rpm), lower damage (22/12)
   - Good hip-fire accuracy (1.2 base spread)
   - Compact folding stock design
   - 32 round magazine, 128 reserve
   - Key: 5

### Per-Weapon Ammo System - IMPLEMENTED
Each weapon now tracks its own ammo independently:
- Rifle: 30/90, Shotgun: 8/24, SMG: 32/128
- HUD updates on weapon switch
- All weapons share zone resupply

---

## Original Implementation Plan

This plan details the implementation of:
- **Sandbag placement system** with bullet/vision blocking
- **Grenade first-person view** (hold & throw with arc)
- **Mortar weapon system** (hold mortar tube, aim, fire rounds)
- **Inventory expansion** (add sandbags slot)
- **Procedural geometry** for all new items

---

## Task 1: Procedural Explosives & Item Geometry Factory

**File:** `src/systems/weapons/ProgrammaticExplosivesFactory.ts`

**Zoo Task:** `ec698587` (Procedural Weapon Geometry)

### Metaprompt:
```
Create a Three.js geometry factory class that generates 4 types of procedural models:

1. **Grenade Model (M67 style):**
   - Main body: SphereGeometry (diameter 1.5 units, 16 segments)
   - Top safety lever: BoxGeometry (0.8 x 0.2 x 0.1) positioned on top
   - Pull ring: TorusGeometry (0.3 radius, 0.05 tube, 12 segments) attached to lever
   - Color: Olive drab green (#4A5D23) with metallic material
   - Add subtle texture variation with vertex colors
   - Return as THREE.Group with all parts positioned correctly

2. **Mortar Tube (weapon to hold):**
   - Main tube: CylinderGeometry (radius 1.5, height 12, 16 segments)
   - Bipod legs: Two BoxGeometry legs (0.3 x 6 x 0.3) angled 45° from base
   - Sight mount: Small BoxGeometry (0.4 x 0.3 x 0.2) on top of tube
   - Base plate: CircleGeometry (radius 2.5) at bottom
   - Color: Dark military green (#2F4F2F) with metallic roughness
   - Position for first-person view (angled 30° for shoulder rest)

3. **Mortar Round (projectile):**
   - Body: CylinderGeometry (radius 0.8, height 8, 12 segments)
   - Nose cone: ConeGeometry (radius 0.8, height 2, 12 segments) at top
   - Tail fins: 4 BoxGeometry fins (2 x 1 x 0.1) arranged radially around base
   - Color: Metallic gray (#606060) with high metalness
   - Add nose tip in darker color for impact point

4. **Sandbag:**
   - Base: BoxGeometry (4 x 2 x 2.5) with rounded edges using ExtrudeGeometry
   - Top: Deformed to create "cinched/folded" look using vertex manipulation
   - Apply burlap texture procedurally with NormalMap simulation
   - Color: Tan/brown (#8B7355) with rough material
   - Slight random rotation per vertex for organic sag effect

Export static methods:
- createGrenade(): THREE.Group
- createMortarTube(): THREE.Group
- createMortarRound(): THREE.Group
- createSandbag(): THREE.Mesh

Follow patterns from existing ProgrammaticGunFactory.ts for material setup and organization.
Use MeshStandardMaterial for all models with appropriate metalness/roughness.
All models should be centered at origin for easy positioning.
```

**Dependencies:**
- Existing: `ProgrammaticGunFactory.ts` (reference pattern)
- THREE.js geometries

**Testing:**
- Create test scene to visualize all 4 models
- Verify scale matches existing rifle scale
- Check first-person positioning for grenade, mortar tube

---

## Task 2: Sandbag Placement System

**File:** `src/systems/weapons/SandbagSystem.ts`

**Zoo Task:** `cbcc0ea3` (Combat Raycasting and Collision)

### Metaprompt:
```
Create a SandbagSystem class that implements GameSystem interface:

**Core Functionality:**
1. **Placement Preview:**
   - Show ghosted sandbag model 2-3m in front of player camera
   - Raycast to ground to snap Y position to terrain height
   - Use semi-transparent green material when placement valid
   - Use semi-transparent red material when placement invalid (too close to other sandbags)

2. **Sandbag Storage:**
   - Store placed sandbags as array of THREE.Mesh objects
   - Each sandbag has physics collision box (THREE.Box3)
   - Store world position and rotation
   - Maximum limit: 10 sandbags (configurable)

3. **Collision Detection:**
   - Create method `checkRayIntersection(ray: THREE.Ray): boolean`
     - Returns true if ray intersects any placed sandbag
     - Use THREE.Raycaster against sandbag meshes
   - Create method `getSandbagBounds(): THREE.Box3[]`
     - Returns array of bounding boxes for all placed sandbags
     - Used by AI system for vision checks

4. **Placement Logic:**
   - Listen for click/key press when sandbag is equipped
   - Validate placement position (not intersecting other sandbags)
   - Consume sandbag from inventory
   - Add to scene and collision array
   - Play placement sound (optional)

5. **Visual Rendering:**
   - Each sandbag uses ProgrammaticExplosivesFactory.createSandbag()
   - Casts shadows
   - Has slight random rotation for variety

**Public API:**
- `placeSandbag(): boolean` - Attempts to place sandbag at preview position
- `checkRayIntersection(ray: THREE.Ray): boolean` - For bullet collision
- `getSandbagBounds(): THREE.Box3[]` - For AI vision system
- `showPlacementPreview(show: boolean)` - Toggle preview visibility
- `updatePreviewPosition(camera: THREE.Camera)` - Update preview based on camera

**Integration Points:**
- CombatantCombat: Check sandbag collision before damaging targets
- CombatantAI: Check sandbag blocking before establishing line of sight
- InventoryManager: Consume sandbag count on placement

Reference existing GrenadeSystem for initialization patterns.
Use same scene/camera references as other weapon systems.
```

**Dependencies:**
- `ProgrammaticExplosivesFactory.ts`
- `InventoryManager.ts`
- `ImprovedChunkManager.ts` (for terrain height)

**Integration:**
- Modify `CombatantCombat.ts`: Add sandbag raycast check before hit registration
- Modify `CombatantAI.ts`: Add sandbag bounds check to `canSee()` method

---

## Task 3: Mortar Weapon System

**File:** `src/systems/weapons/MortarSystem.ts`

**Zoo Task:** `8015706a` (Projectile and Explosive Systems)

### Metaprompt:
```
Create a MortarSystem class implementing GameSystem interface, similar to GrenadeSystem:

**States:**
1. **Equipped (not aiming):** Mortar tube visible in first-person view
2. **Aiming:** Arc visualization active, player adjusting aim
3. **Fired:** Mortar round traveling through air
4. **Impact:** Explosion and damage application

**Core Functionality:**

1. **First-Person Mortar Tube Display:**
   - Create separate THREE.Scene for mortar overlay (like FirstPersonWeapon)
   - Use ProgrammaticExplosivesFactory.createMortarTube()
   - Position in bottom-right of screen (x: 0.6, y: -0.5, z: -0.8)
   - Angle tube upward at 45° base angle
   - When player aims, tube tilts up/down to show angle adjustment

2. **Arc Visualization:**
   - Similar to GrenadeSystem.updateArc()
   - Show trajectory line from player position to impact point
   - Show ground impact marker (circle decal)
   - Update in real-time as player adjusts pitch
   - Color: Yellow/orange (#FFA500) for visibility
   - 40-50 trajectory points for smooth curve

3. **Aim Adjustment:**
   - Mouse wheel or keys adjust pitch angle (20° - 85°)
   - Higher angle = shorter distance (mortar physics)
   - Fixed initial velocity (35 units/sec)
   - Show distance to impact on HUD

4. **Mortar Round Physics:**
   - Launch velocity: 35 units/sec at adjusted angle
   - Gravity: Same as grenades (-25)
   - No bouncing - explodes on first ground contact
   - Rotation during flight (tumbling effect)
   - Trails effect (smoke trail optional)

5. **Explosion:**
   - Damage radius: 20-25m (larger than grenades)
   - Max damage: 200 (vs 150 for grenades)
   - Spawn 12-16 impact effects in radius
   - Camera shake for player if nearby
   - Call combatantSystem.applyExplosionDamage()

6. **Player Lock:**
   - While mortar equipped, player movement speed reduced 50%
   - Or optionally: lock player position entirely when aiming
   - Disable sprinting

**Public API:**
- `equipMortar()` - Show mortar tube first-person view
- `unequipMortar()` - Hide mortar tube
- `startAiming()` - Begin aiming mode with arc
- `adjustAim(delta: number)` - Adjust pitch angle
- `fireMortarRound(): boolean` - Launch round if ammo available
- `cancelAiming()` - Exit aiming mode
- `isAiming(): boolean` - Check current state

**Mortar Round Object Interface:**
```typescript
interface MortarRound {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Vector3;
  mesh: THREE.Group;
  isActive: boolean;
}
```

**Physics Constants:**
```typescript
private readonly GRAVITY = -25;
private readonly INITIAL_VELOCITY = 35;
private readonly MIN_ANGLE_DEG = 20;
private readonly MAX_ANGLE_DEG = 85;
private readonly DAMAGE_RADIUS = 22;
private readonly MAX_DAMAGE = 200;
```

Reference GrenadeSystem for projectile physics loop structure.
Reuse ImpactEffectsPool for explosion visuals.
```

**Dependencies:**
- `ProgrammaticExplosivesFactory.ts`
- `GrenadeSystem.ts` (reference for physics)
- `CombatantSystem.ts` (for damage application)
- `ImpactEffectsPool.ts`

**Integration:**
- `PlayerController.ts`: Reduce movement speed when mortar equipped
- `InventoryManager.ts`: Consume mortar rounds on fire

---

## Task 4: Grenade First-Person View Integration

**File Modifications:**
- `src/systems/weapons/GrenadeSystem.ts` (modify existing)
- `src/systems/player/FirstPersonWeapon.ts` (add grenade view)

**Zoo Task:** `40f624fa` (First-Person Weapon Display)

### Metaprompt:
```
Modify existing GrenadeSystem and FirstPersonWeapon to display grenade in first-person:

**GrenadeSystem.ts Additions:**

1. **Add Grenade Overlay Scene:**
   - Create weaponScene: THREE.Scene (separate from world)
   - Create weaponCamera: THREE.OrthographicCamera (same as FirstPersonWeapon)
   - Add method `createGrenadeView()`
     - Use ProgrammaticExplosivesFactory.createGrenade()
     - Position grenade in hand: { x: 0.4, y: -0.6, z: -0.5 }
     - Visible only when slot 3 active

2. **Hold Animation:**
   - Idle: Slight bob motion (sine wave)
   - Aiming: Grenade raises slightly, hand cocks back
   - Throwing: Quick forward motion then hide grenade
   - Cook timer: Optional pulsing effect on grenade

3. **Throw Power Charge:**
   - When holding aim button, power increases 0.3 → 2.0
   - Visual feedback: Grenade glows brighter as power increases
   - Release button to throw at current power
   - Show power bar in UI

4. **Integration with Arc:**
   - Arc visualization already exists ✓
   - Update arc calculation based on current power
   - Show grenade model at start of arc line

**FirstPersonWeapon.ts Integration:**

Add method to hide gun when grenade equipped:
```typescript
setWeaponVisibility(visible: boolean) {
  if (this.weaponRig) {
    this.weaponRig.visible = visible;
  }
}
```

**Rendering:**
Both grenade view and gun view use same overlay pattern.
Only one visible at a time based on inventory slot.

**Public API Additions to GrenadeSystem:**
- `showGrenadeInHand(show: boolean)`
- `updateHandAnimation(deltaTime: number)`
- `getGrenadeOverlayCamera(): THREE.Camera`
- `getGrenadeOverlayScene(): THREE.Scene`
```

**Dependencies:**
- Existing `GrenadeSystem.ts`
- Existing `FirstPersonWeapon.ts`
- `ProgrammaticExplosivesFactory.ts`

---

## Task 5: Inventory System Expansion

**File:** `src/systems/player/InventoryManager.ts`

**Zoo Task:** `1cb1f358` (Inventory and Hotbar Systems)

### Metaprompt:
```
Expand existing InventoryManager to include sandbags as 4th slot:

**Enum Update:**
```typescript
export enum WeaponSlot {
  PRIMARY = 0,
  MORTAR = 1,
  GRENADE = 2,
  SANDBAG = 3
}
```

**New State Properties:**
```typescript
private sandbags: number = 5;
private maxSandbags: number = 5;
```

**New Methods:**
```typescript
canUseSandbag(): boolean {
  return this.sandbags > 0;
}

useSandbag(): boolean {
  if (!this.canUseSandbag()) return false;
  this.sandbags--;
  this.notifyInventoryChange();
  return true;
}

addSandbags(count: number): void {
  this.sandbags = Math.min(this.sandbags + count, this.maxSandbags);
  this.notifyInventoryChange();
}

getSandbagCount(): number {
  return this.sandbags;
}
```

**UI Update:**
Add 4th hotbar slot to createUI():
```html
<div id="slot-sandbag" class="hotbar-slot" data-slot="3">
  <div class="slot-key">[4]</div>
  <div class="slot-icon">🟫</div>
  <div class="slot-label">SANDBAG</div>
  <div class="slot-count" id="sandbag-count">5</div>
</div>
```

**Interface Update:**
```typescript
export interface InventoryState {
  currentSlot: WeaponSlot;
  grenades: number;
  maxGrenades: number;
  mortarRounds: number;
  maxMortarRounds: number;
  sandbags: number;      // NEW
  maxSandbags: number;   // NEW
}
```

**Key Binding:**
Add Digit4 handler in onKeyDown() method.

Follow existing patterns for grenade/mortar management.
```

**Dependencies:**
- Existing `InventoryManager.ts`

---

## Task 6: Player Controller Integration

**File:** `src/systems/player/PlayerController.ts`

**Zoo Task:** Multiple

### Metaprompt:
```
Modify PlayerController to handle all 4 weapon modes:

**Weapon State Management:**
```typescript
private currentWeaponMode: WeaponSlot = WeaponSlot.PRIMARY;
private isInMortarMode: boolean = false;
```

**Slot Change Handler:**
Connect to InventoryManager callback:
```typescript
this.inventoryManager.onSlotChange((slot: WeaponSlot) => {
  this.handleWeaponSlotChange(slot);
});

private handleWeaponSlotChange(slot: WeaponSlot): void {
  // Hide all weapons
  this.firstPersonWeapon.setWeaponVisibility(false);
  this.grenadeSystem.showGrenadeInHand(false);
  this.mortarSystem.unequipMortar();
  this.sandbagSystem.showPlacementPreview(false);

  // Show active weapon
  switch(slot) {
    case WeaponSlot.PRIMARY:
      this.firstPersonWeapon.setWeaponVisibility(true);
      this.isInMortarMode = false;
      break;
    case WeaponSlot.MORTAR:
      this.mortarSystem.equipMortar();
      this.isInMortarMode = true;
      break;
    case WeaponSlot.GRENADE:
      this.grenadeSystem.showGrenadeInHand(true);
      this.isInMortarMode = false;
      break;
    case WeaponSlot.SANDBAG:
      this.sandbagSystem.showPlacementPreview(true);
      this.isInMortarMode = false;
      break;
  }

  this.currentWeaponMode = slot;
}
```

**Movement Lock for Mortar:**
```typescript
private getMovementSpeedMultiplier(): number {
  if (this.isInMortarMode && this.mortarSystem.isAiming()) {
    return 0.0; // Complete lock
    // OR: return 0.5; // 50% speed reduction
  }
  return 1.0;
}
```

Apply multiplier in movement update loop.

**Input Routing:**
Route mouse/keyboard input based on currentWeaponMode:
- PRIMARY: FirstPersonWeapon handles shooting
- MORTAR: MortarSystem handles aiming/firing
- GRENADE: GrenadeSystem handles aiming/throwing
- SANDBAG: SandbagSystem handles placement

**Update Loop:**
```typescript
update(deltaTime: number): void {
  // Update active weapon system
  if (this.currentWeaponMode === WeaponSlot.SANDBAG) {
    this.sandbagSystem.updatePreviewPosition(this.camera);
  } else if (this.currentWeaponMode === WeaponSlot.GRENADE) {
    this.grenadeSystem.updateArc();
  } else if (this.currentWeaponMode === WeaponSlot.MORTAR && this.mortarSystem.isAiming()) {
    this.mortarSystem.updateArc();
  }

  // Apply movement restrictions
  const speedMultiplier = this.getMovementSpeedMultiplier();
  // ... apply to movement code
}
```
```

**Dependencies:**
- `InventoryManager.ts`
- All weapon systems

---

## Task 7: Combat System Integration

**Files:**
- `src/systems/combat/CombatantCombat.ts`
- `src/systems/combat/CombatantAI.ts`

**Zoo Task:** `cbcc0ea3` (Combat Raycasting and Collision)

### Metaprompt:
```
Integrate sandbag collision into combat and AI systems:

**CombatantCombat.ts - Bullet Collision:**

In `handlePlayerShot()` method, before checking combatant hits:

```typescript
// Check sandbag collision first
if (this.sandbagSystem) {
  const hitSandbag = this.sandbagSystem.checkRayIntersection(ray);
  if (hitSandbag) {
    // Bullet stopped by sandbag
    // Spawn impact effect at intersection point
    const intersectionPoint = this.sandbagSystem.getRayIntersectionPoint(ray);
    if (this.impactEffectsPool && intersectionPoint) {
      this.impactEffectsPool.spawn(intersectionPoint, ray.direction);
    }
    return { hit: true, point: intersectionPoint, killed: false };
  }
}

// Continue with combatant hit detection...
```

**CombatantAI.ts - Vision Blocking:**

In `canSee()` method, add sandbag line-of-sight check:

```typescript
canSee(from: THREE.Vector3, to: THREE.Vector3): boolean {
  // Existing terrain check
  if (this.isLineOfSightBlocked(from, to)) {
    return false;
  }

  // NEW: Sandbag check
  if (this.sandbagSystem) {
    const direction = new THREE.Vector3().subVectors(to, from).normalize();
    const ray = new THREE.Ray(from, direction);
    const distance = from.distanceTo(to);

    const sandbagBounds = this.sandbagSystem.getSandbagBounds();
    for (const bounds of sandbagBounds) {
      const intersection = ray.intersectBox(bounds, new THREE.Vector3());
      if (intersection && from.distanceTo(intersection) < distance) {
        return false; // Sandbag blocks vision
      }
    }
  }

  return true;
}
```

**Dependency Injection:**

Update setters in both classes:
```typescript
setSandbagSystem(sandbagSystem: SandbagSystem): void {
  this.sandbagSystem = sandbagSystem;
}
```

Add to CombatantSystem initialization to wire systems together.
```

**Dependencies:**
- `SandbagSystem.ts`
- Existing combat systems

---

## Task 8: System Registration & Initialization

**File:** `src/core/SandboxSystemManager.ts`

### Metaprompt:
```
Register all new systems in SandboxSystemManager initialization:

**Add System Properties:**
```typescript
private mortarSystem?: MortarSystem;
private sandbagSystem?: SandbagSystem;
```

**Initialize in async init() method:**
```typescript
// After existing system initialization...

// Initialize Sandbag System
this.sandbagSystem = new SandbagSystem(
  this.scene,
  this.camera,
  this.chunkManager
);
await this.sandbagSystem.init();
this.systems.push(this.sandbagSystem);

// Initialize Mortar System
this.mortarSystem = new MortarSystem(
  this.scene,
  this.camera,
  this.chunkManager
);
await this.mortarSystem.init();
this.systems.push(this.mortarSystem);

// Wire up cross-system dependencies
this.mortarSystem.setCombatantSystem(this.combatantSystem);
this.mortarSystem.setImpactEffectsPool(this.impactEffectsPool);

this.sandbagSystem.setInventoryManager(this.inventoryManager);

this.combatantSystem.getModule('CombatantCombat').setSandbagSystem(this.sandbagSystem);
this.combatantSystem.getModule('CombatantAI').setSandbagSystem(this.sandbagSystem);

// Pass systems to PlayerController
this.playerController.setMortarSystem(this.mortarSystem);
this.playerController.setSandbagSystem(this.sandbagSystem);
// grenadeSystem already wired ✓
```

**Update Loop:**
All systems already in this.systems[] array, so update() loop handles them automatically.

**Render Loop:**
Add overlay rendering for grenade/mortar first-person views:
```typescript
render(): void {
  // Main scene render
  this.renderer.render(this.scene, this.camera);

  // Weapon overlays
  const currentSlot = this.inventoryManager.getCurrentSlot();
  if (currentSlot === WeaponSlot.GRENADE && this.grenadeSystem) {
    this.renderer.autoClear = false;
    this.renderer.render(
      this.grenadeSystem.getGrenadeOverlayScene(),
      this.grenadeSystem.getGrenadeOverlayCamera()
    );
    this.renderer.autoClear = true;
  } else if (currentSlot === WeaponSlot.MORTAR && this.mortarSystem) {
    this.renderer.autoClear = false;
    this.renderer.render(
      this.mortarSystem.getMortarOverlayScene(),
      this.mortarSystem.getMortarOverlayCamera()
    );
    this.renderer.autoClear = true;
  }
}
```
```

**Dependencies:**
- All implemented systems

---

## Implementation Order

### Phase 1: Foundation (Do First)
1. ✅ **Task 1:** ProgrammaticExplosivesFactory.ts - Create all geometries
2. ✅ **Task 5:** InventoryManager.ts expansion - Add sandbag slot

### Phase 2: Systems (Core Functionality)
3. ✅ **Task 2:** SandbagSystem.ts - Placement & collision
4. ✅ **Task 3:** MortarSystem.ts - Weapon & projectile
5. ✅ **Task 4:** GrenadeSystem.ts modifications - First-person view

### Phase 3: Integration (Wire Everything)
6. ✅ **Task 6:** PlayerController.ts - Slot switching & movement
7. ✅ **Task 7:** Combat integration - Bullet/vision blocking
8. ✅ **Task 8:** SandboxSystemManager.ts - System registration

### Phase 4: Polish (After Core Working)
- Test all weapon switches
- Balance damage/radius values
- Add sound effects
- Add UI feedback (ammo counts, etc.)
- Performance optimization

---

## Testing Checklist

- [ ] All 4 inventory slots switch correctly
- [ ] Grenade shows in hand with arc visualization
- [ ] Grenade throws and explodes on impact
- [ ] Mortar tube shows in first-person when equipped
- [ ] Mortar aiming adjusts arc properly
- [ ] Mortar rounds fire and explode with larger radius
- [ ] Player movement locks/slows when mortar equipped
- [ ] Sandbag placement preview appears
- [ ] Sandbags place at correct position on terrain
- [ ] Bullets blocked by sandbags
- [ ] NPCs can't see through sandbags
- [ ] All inventory counts decrement properly
- [ ] Visual effects work for all explosions
- [ ] No performance issues with multiple active projectiles

---

## Reference Files

**Existing Systems to Reference:**
- `src/systems/weapons/GrenadeSystem.ts` - Physics & arc visualization
- `src/systems/weapons/ProgrammaticGunFactory.ts` - Geometry patterns
- `src/systems/player/FirstPersonWeapon.ts` - Weapon overlay rendering
- `src/systems/player/InventoryManager.ts` - Slot management
- `src/systems/combat/CombatantCombat.ts` - Raycasting
- `src/systems/combat/CombatantAI.ts` - Line of sight

**Zoo Examples:**
- First-Person Tool Rendering: Examples of holding items
- Projectile Systems: Grenade physics patterns
- Procedural Geometry: Creating models with code

---

## Notes

- **No terrain deformation** - Keeping terrain generation as-is
- **GPU billboarding** - NPCs already use InstancedMesh (optimized ✓)
- **Reuse existing pools** - ImpactEffectsPool, TracerPool, etc.
- **Follow existing patterns** - Match code style of FirstPersonWeapon
- **Sandbags are persistent** - Don't despawn until game restart

---

## Success Criteria

✅ Player can switch between 4 weapons with hotkeys (1/2/3/4)
✅ Grenade held in hand, thrown with arc, explodes
✅ Mortar tube held in hand, aims with arc, fires rounds
✅ Sandbags place in world and block bullets/vision
✅ Inventory counts tracked for all consumables
✅ All systems integrated without breaking existing gameplay
✅ Performance remains stable (60 FPS target)

---

*Generated: 2025-09-27*
*Zoo Reference: terror-in-the-jungle-weapons (3aba8d1e)*