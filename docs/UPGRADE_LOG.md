# Pix3D Upgrade Log

## Weapon System Overhaul (2025-01-25)

### What Changed

#### 1. Multi-Weapon System with Proper Switching
- Fixed weapon switching animation timing bug (narrow 0.49-0.5 window was being skipped)
- Switch now triggers reliably when crossing 50% progress threshold
- Fixed visibility bug in PlayerController - SHOTGUN and SMG slots now properly show weapon
- InventoryManager now supports multiple callbacks for slot changes

#### 2. Per-Weapon Ammo Tracking
- Each weapon now has independent ammo state:
  - **Rifle**: 30 round magazine, 90 reserve
  - **Shotgun**: 8 shell tube, 24 reserve
  - **SMG**: 32 round magazine, 128 reserve
- HUD updates to show correct ammo when switching weapons
- All ammo managers share zone resupply functionality

#### 3. Shotgun Model Redesign
- Completely redesigned to look like proper pump-action shotgun
- Tube magazine under barrel (removed box magazine)
- Wooden stock and pump grip with brown wood colors (0x3d2817)
- Small brass front bead sight
- Trigger guard and proper forend

#### 4. SMG Model Improvements
- Brightened colors to match rifle visibility
- Compact design with folding stock
- Extended magazine for high-capacity look

#### 5. HUD Layout Fixes
- Removed duplicate timer display
- Moved kill feed below objectives panel (top: 220px)
- Moved compass to top: 120px (below tickets)
- Moved squad indicator to top: 120px, left: 20px
- Timer repositioned to top-left
- Fixed TimeIndicator visibility bug (was showing by default)

#### 6. Technical Fixes
- BVH worker pool (4 workers) for parallel chunk generation
- Rain frustumCulled = false to fix visibility in all directions
- Post-processing using built-in PixelationEffect instead of broken custom pass

### Weapon Keybinds
| Key | Weapon | Ammo |
|-----|--------|------|
| 1 | Shotgun | 8/24 |
| 2 | Grenade | - |
| 3 | Rifle | 30/90 |
| 4 | Sandbag | - |
| 5 | SMG | 32/128 |

### Files Modified
- `src/systems/player/FirstPersonWeapon.ts` - Per-weapon ammo managers
- `src/systems/player/PlayerController.ts` - Fixed weapon slot visibility
- `src/systems/player/InventoryManager.ts` - Multiple callback support
- `src/systems/player/ProgrammaticGunFactory.ts` - Shotgun/SMG models
- `src/systems/player/weapon/WeaponRigManager.ts` - Fixed switch timing
- `src/ui/hud/*` - HUD layout fixes
- `src/ui/compass/CompassSystem.ts` - Repositioned
- `src/systems/combat/PlayerSquadController.ts` - Repositioned

---

## Step 2: AI Gunplay - AI Fights Under Same Rules as Player (2025-01-13)

### What Changed

#### 1. Faction System Implementation
- Created `CombatantSystem` to replace `EnemySystem`
- Added faction support: US (player + allies) vs OPFOR (enemies)
- Player always spawns on US side with AI allies
- All combatants managed uniformly regardless of faction

#### 2. Asset Management
- Renamed enemy soldier sprites for clarity:
  - `SoliderWalking.png` → `EnemySoldierWalking.png`
  - `SoldierAlert.png` → `EnemySoldierAlert.png`
  - `SoliderFiring.png` → `EnemySoldierFiring.png`
- US soldiers use `ASoldier*` prefix sprites
- OPFOR uses `EnemySoldier*` prefix sprites
- Updated AssetLoader to properly load both faction sprites

#### 3. AI Combat Mechanics
- All AI uses same `GunplayCore` as player for consistent damage model
- Faction-specific weapon specs:
  - US: M16A4 (750rpm, 34/24 damage, faster fire rate)
  - OPFOR: AK-74 (600rpm, 38/26 damage, higher damage)
- Skill-based modifiers implemented:
  - Reaction delay: 200-400ms based on role (leaders faster)
  - Aim jitter: 1.0-1.5 degrees amplitude
  - Burst control: 3-5 round bursts with 600-800ms pauses
  - Imperfect target leading: 0.75-0.85 accuracy factor
  - Suppression resistance: 0.5-0.7 based on role

#### 4. Combat Behaviors
- Enhanced state machine:
  - PATROLLING: Wander or follow squad leader
  - ALERT: Reaction delay before engagement
  - ENGAGING: Active combat with burst fire
  - SUPPRESSING: Fire at last known position
- Squad mechanics:
  - Leaders and followers with formation movement
  - Squad cohesion maintained during patrol
  - Coordinated engagement patterns
- Friendly fire prevention:
  - Faction checking before damage application
  - No damage between same-faction units

#### 5. Performance Optimization
- LOD system for AI updates:
  - High (0-50m): Full AI logic at 60fps
  - Medium (50-100m): Basic behavior at 15fps
  - Low (100-150m): Movement only at 5fps
  - Culled (150m+): Position sync only
- Instanced rendering:
  - Separate mesh per faction-state combination
  - Efficient billboard updates grouped by state
- Effect pooling:
  - Shared pools for tracers, muzzle flashes, impacts
  - 256 tracers, 128 muzzle flashes, 128 impacts

#### 6. Integration Changes
- Updated `main.ts` to use CombatantSystem
- Modified FirstPersonWeapon to interact with CombatantSystem
- Added `handlePlayerShot()` API for player damage to AI
- Combat statistics API for UI display

### What Was Verified
- ✅ Faction-based spawning works correctly
- ✅ US allies fight alongside player
- ✅ AI fires in realistic bursts with pauses
- ✅ Reaction times feel human (200-400ms delays)
- ✅ No friendly fire between same faction units
- ✅ Different weapon characteristics per faction
- ✅ Squad formations maintained during movement
- ✅ Performance stable with 20+ active combatants
- ✅ LOD transitions smooth and unnoticeable

### Notes/Tuning Values
```javascript
// Core parameters
MAX_COMBATANTS: 60
SPAWN_RADIUS: 30-80m
DESPAWN_DISTANCE: 150m
MAX_ENGAGEMENT_RANGE: 100m
SPAWN_CHECK_INTERVAL: 3000ms

// Skill profiles (tunable)
reactionDelayMs: 200-400
aimJitterAmplitude: 1.0-1.5
burstLength: 3-5
burstPauseMs: 600-800
leadingErrorFactor: 0.75-0.85
```

### Known Issues
- Line of sight checks are basic (no BVH terrain occlusion yet)
- AI doesn't actively seek cover
- No zone capture mechanics implemented
- AI can't damage player yet (needs player health system)
- Vegetation concealment not implemented

### Next Steps (Step 3+)
1. Implement BVH-based line of sight for terrain occlusion
2. Add vegetation density checks for concealment
3. Implement zone capture and objective system
4. Add player health and damage reception
5. Implement cover-seeking behavior
6. Add squad communication for coordinated tactics

---

## Step 0 — Deep Analysis

### System Map
- Core loop: `src/main.ts` constructs systems and updates them each frame via `systems: GameSystem[]`.
- `GameSystem` interface (`src/types/index.ts`): `init()`, `update(dt)`, `dispose()`.
- Systems instantiated and order in `main.ts`:
  1. `AssetLoader`
  2. `GlobalBillboardSystem`
  3. `ImprovedChunkManager`
  4. `WaterSystem`
  5. `PlayerController`
  6. `FirstPersonWeapon`
  7. ~~`EnemySystem`~~ → `CombatantSystem` (Step 2)
  8. `Skybox`
- Other legacy/aux:
  - `BillboardSystem` (legacy, GPU billboard shader path still available)
  - `ChunkManager` (earlier version of chunking)
  - `WorldGenerator` (legacy static gen)
  - `Terrain`, `Skybox`, `WaterSystem`

### Update/Dispose Map & Dependencies
- Updates are called from `main.ts` each frame in the order above.
- Dispose fan-out from `PixelArtSandbox.dispose()` iterates all systems then disposes renderer.
- Notable update() responsibilities:
  - `AssetLoader`: no-op per-frame.
  - `GlobalBillboardSystem`: updates billboard rotations only when camera moved beyond threshold; manages global instanced meshes and per-chunk allocations.
  - `ImprovedChunkManager`: interval-driven (250ms) queue-based async loading, visibility/LOD, unload buffer; calls `GlobalBillboardSystem.removeChunkInstances` on unload.
  - `PlayerController`: movement, gravity, pointer lock, informs chunk manager of player position.
  - `FirstPersonWeapon`: overlay sprite idle bob/swing; separate ortho scene; renders after main scene.
  - ~~`EnemySystem`~~ → `CombatantSystem`: manages all AI combatants with faction support, LOD-based updates, squad coordination
  - `WaterSystem`, `Skybox`, `Terrain`, `WorldGenerator`: lightweight or static.
- Dispose highlights:
  - `GlobalBillboardSystem`: disposes instanced meshes and clears allocation tracking.
  - `ImprovedChunkManager`/`ChunkManager`: dispose chunks; `ImprovedChunk`/`Chunk` dispose geometry/materials and remove instances.
  - ~~`EnemySystem`~~ → `CombatantSystem`: disposes per-faction-state instanced meshes/materials, effect pools.
  - `FirstPersonWeapon`: disposes sprite geometry/material and removes listeners.

### Asset Handling
- `AssetLoader` auto-discovers a fixed list of known assets (PNG/JPG) under `/assets/` and categorizes into `GROUND`, `FOLIAGE`, `ENEMY`, `SKYBOX`, `UNKNOWN`.
- Textures loaded via `THREE.TextureLoader` with pixel-perfect defaults; `PixelPerfectUtils.configureTexture` ensures `NearestFilter`, `RepeatWrapping`, `flipY`, no mipmaps.
- Accessors: `getTexture(name)`, `getAssetsByCategory(category)`, `getAllAssets()`.
- Naming: logical names are filename without extension; e.g., `CoconutPalm` maps to `/assets/CoconutPalm.png`.

### Enemy Logic → Combat Logic (Step 2)
- Factions: `US` (player + allies) and `OPFOR` (enemies)
- States: `IDLE`, `PATROLLING`, `ALERT`, `ENGAGING`, `SUPPRESSING`, `ADVANCING`, `RETREATING`, `DEAD`
- Spawning: squads of 4-5 per faction; US near player, OPFOR at distance
- Squad mechanics: leaders and followers with formation movement
- Combat: burst fire patterns, reaction delays, aim jitter, suppressive fire
- Performance: LOD-based update frequencies, instanced rendering per faction-state