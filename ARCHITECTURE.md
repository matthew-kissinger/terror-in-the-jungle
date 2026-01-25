# Pix3D Architecture Documentation

## Overview

Pix3D is a modular 3D pixel art game engine built on Three.js. Following a recent major refactoring, it now features a highly modular component-based architecture with clear separation of concerns, enabling efficient rendering of large open worlds with thousands of dynamic entities.

## Core Architecture Principles

1. **GameSystem Interface**: All major systems implement a common interface for lifecycle management
2. **Modular Design**: Large systems are split into focused, single-responsibility modules
3. **Orchestrator Pattern**: Main system files act as orchestrators, delegating to specialized modules
4. **Centralized Asset Management**: Single source of truth for all game assets
5. **GPU-First Rendering**: Heavy use of instanced meshes and GPU computations
6. **Chunk-Based World**: Dynamic loading/unloading based on player position

## Refactored Architecture (2024)

The codebase has been extensively refactored to improve maintainability. All major systems are now split into modules under 400 lines each:

### Module Organization Pattern
```
SystemName/
├── SystemName.ts          (Orchestrator, <400 lines)
├── SystemNameModule1.ts   (Specialized logic, <400 lines)
├── SystemNameModule2.ts   (Specialized logic, <400 lines)
└── types.ts               (Shared types/interfaces)
```

## System Hierarchy

```
main.ts (Entry Point)
├── PixelArtSandbox (Main Game Orchestrator)
│   ├── SandboxSystemManager (System Initialization)
│   ├── SandboxRenderer (Rendering Pipeline)
│   └── LoadingScreen (UI Flow)
│       ├── LoadingProgress (Progress Tracking)
│       ├── LoadingPanels (Settings/Help UI)
│       └── LoadingStyles (CSS Styling)
├── AssetLoader (Asset Discovery & Management)
├── GlobalBillboardSystem (Centralized Billboard Rendering)
│   ├── BillboardVegetationTypes (Mesh Definitions)
│   ├── BillboardInstanceManager (Instance Allocation)
│   └── BillboardRenderer (Camera-Facing Logic)
├── ImprovedChunkManager (World Chunking System)
│   └── ImprovedChunk (Individual Chunk Generation)
├── CombatantSystem (Unified Combat AI)
│   ├── CombatantFactory (Entity Creation)
│   ├── CombatantAI (AI Behavior)
│   ├── CombatantCombat (Combat Mechanics)
│   ├── CombatantMovement (Movement Logic)
│   ├── CombatantRenderer (Billboard Rendering)
│   ├── CombatantHitDetection (Hit Detection)
│   ├── SquadManager (Squad Coordination)
│   └── types.ts (Combat Types)
├── PlayerHealthSystem (Player Health Management)
│   ├── PlayerHealthUI (UI Display)
│   ├── PlayerHealthEffects (Damage Effects)
│   └── PlayerRespawnManager (Death/Respawn)
├── ZoneManager (Territory Control)
│   ├── ZoneRenderer (Visual Components)
│   ├── ZoneCaptureLogic (Capture Mechanics)
│   └── ZoneTerrainAdapter (Terrain Integration)
├── HUDSystem (Heads-Up Display)
│   ├── HUDStyles (CSS Styling)
│   ├── HUDElements (UI Elements)
│   └── HUDUpdater (Display Updates)
├── TicketSystem (Score Management)
├── PlayerController (First-Person Controls)
├── FirstPersonWeapon (Weapon System)
├── WaterSystem (Water Rendering)
├── AudioManager (Sound Management)
├── MinimapSystem (Tactical Overview)
└── Skybox (Environment Rendering)
```

## Key Refactored Systems

### CombatantSystem (Refactored: 1,764 → 438 lines)
**Modules**:
- `CombatantSystem.ts`: Main orchestrator
- `CombatantFactory.ts`: Entity creation and initialization
- `CombatantAI.ts`: AI state machines and decision making
- `CombatantCombat.ts`: Combat mechanics and damage
- `CombatantMovement.ts`: Movement and pathfinding
- `CombatantRenderer.ts`: Billboard sprite rendering
- `CombatantHitDetection.ts`: Collision and hit detection
- `SquadManager.ts`: Squad formation and coordination

### GlobalBillboardSystem (Refactored: 733 → 112 lines)
**Modules**:
- `GlobalBillboardSystem.ts`: Main orchestrator
- `BillboardVegetationTypes.ts`: Vegetation mesh definitions
- `BillboardInstanceManager.ts`: Instance allocation/deallocation
- `BillboardRenderer.ts`: Camera-facing billboard updates

**Instance Types**:
- `fern`: Dense ground cover (80,000 max)
- `elephantEar`: Ground plants (15,000 max)
- `fanPalm`: Mid-level vegetation (10,000 max)
- `coconut`: Water-edge palms (8,000 max)
- `areca`: Common mid-size plants (15,000 max)
- `dipterocarp`: Giant canopy trees (3,000 max)
- `banyan`: Giant twisted trees (3,000 max)

### ZoneManager (Refactored: 824 → 332 lines)
**Modules**:
- `ZoneManager.ts`: Main orchestrator
- `ZoneRenderer.ts`: Visual representation
- `ZoneCaptureLogic.ts`: Capture mechanics
- `ZoneTerrainAdapter.ts`: Height adjustment

### PlayerHealthSystem (Refactored: 682 → 224 lines)
**Modules**:
- `PlayerHealthSystem.ts`: Main orchestrator
- `PlayerHealthUI.ts`: Health display and death screen
- `PlayerHealthEffects.ts`: Damage indicators and screen effects
- `PlayerRespawnManager.ts`: Respawn logic and zone selection

### HUDSystem (Refactored: 621 → 100 lines)
**Modules**:
- `HUDSystem.ts`: Main orchestrator
- `HUDStyles.ts`: All CSS styling
- `HUDElements.ts`: UI element creation
- `HUDUpdater.ts`: Real-time updates

### PixelArtSandbox (Refactored: 573 → 247 lines)
**Modules**:
- `PixelArtSandbox.ts`: Main game orchestrator
- `SandboxSystemManager.ts`: System initialization and lifecycle
- `SandboxRenderer.ts`: Three.js rendering setup

## Data Flow

### Initialization Pipeline
1. **PixelArtSandbox** creates renderer and system manager
2. **SandboxSystemManager** initializes all game systems
3. **AssetLoader** discovers and loads textures
4. **Systems** connect via dependency injection
5. **Chunks** pre-generate around spawn areas
6. **LoadingScreen** shows main menu

### Frame Update Cycle
1. **Input Processing**: PlayerController handles keyboard/mouse
2. **Chunk Management**: Load/unload based on player position
3. **Combat Updates**: AI decisions, movement, combat
4. **Zone Updates**: Capture progress, ownership changes
5. **Billboard Updates**: Face camera, update positions
6. **HUD Updates**: Score, objectives, health
7. **Rendering**: Main scene, then weapon overlay

### Module Communication Patterns
```typescript
// Orchestrator pattern
class MainSystem {
  private module1: Module1;
  private module2: Module2;

  constructor() {
    this.module1 = new Module1();
    this.module2 = new Module2(this.module1);
  }

  update(deltaTime: number) {
    this.module1.process();
    this.module2.update(deltaTime);
  }
}
```

## Performance Optimizations

### Instanced Rendering
- All vegetation uses `THREE.InstancedMesh`
- Single draw call per vegetation type
- GPU-based billboard rotation
- Support for 200,000+ instances

### Memory Management
- Instance pooling in GlobalBillboardSystem
- Chunk recycling and cleanup
- Texture reuse across systems
- Proper disposal chains

### Update Throttling
- Chunk updates: 250ms intervals
- Combat AI: 100ms decision cycles
- Zone captures: Real-time
- Billboard rotation: Every frame

## File Structure

### Core Systems (`/src/core/`)
- `PixelArtSandbox.ts`: Main game orchestrator
- `SandboxSystemManager.ts`: System management
- `SandboxRenderer.ts`: Rendering setup

### Combat Systems (`/src/systems/combat/`)
- `CombatantSystem.ts`: Main combat orchestrator
- Supporting modules for AI, movement, combat, etc.

### World Systems (`/src/systems/world/`)
- `ZoneManager.ts`: Territory control
- `TicketSystem.ts`: Score management
- `billboard/`: Billboard rendering system

### Player Systems (`/src/systems/player/`)
- `PlayerController.ts`: Movement and input
- `PlayerHealthSystem.ts`: Health management
- `FirstPersonWeapon.ts`: Weapon mechanics

### UI Systems (`/src/ui/`)
- `hud/`: HUD system modules
- `loading/`: Loading screen modules
- `minimap/`: Minimap system

### Terrain Systems (`/src/systems/terrain/`)
- `ImprovedChunkManager.ts`: Chunk management
- `ImprovedChunk.ts`: Chunk generation
- `Chunk.ts`: Legacy chunk system (refactored)
- `ChunkTerrain.ts`: Terrain generation
- `ChunkVegetation.ts`: Vegetation placement

## Adding New Features

### Creating a New Modular System
1. Create main orchestrator class implementing `GameSystem`
2. Split complex logic into focused modules (<400 lines each)
3. Use dependency injection for module communication
4. Add to `SandboxSystemManager`
5. Connect to related systems
6. Implement proper disposal

### Module Guidelines
- **Single Responsibility**: Each module handles one aspect
- **Clear Interfaces**: Well-defined public APIs
- **Dependency Injection**: Pass dependencies via constructor
- **Type Safety**: Use TypeScript interfaces
- **Proper Cleanup**: Implement disposal methods

## Debugging

### Performance Monitoring
- Press F1 for performance stats
- Check module sizes: `wc -l src/**/*.ts`
- Monitor instance counts via debug info
- Use Chrome DevTools Performance tab

### Common Issues
- **Module not found**: Check import paths
- **System not updating**: Verify system manager registration
- **Memory leaks**: Ensure proper disposal chains
- **Type errors**: Run `npx tsc --noEmit`

## Architecture Benefits

### Maintainability
- Average module size: ~177 lines
- Clear separation of concerns
- Easy to locate functionality
- Simplified debugging

### Scalability
- Easy to add new modules
- Systems can grow independently
- Clear extension points
- Minimal coupling

### Team Development
- Multiple developers can work on different modules
- Clear boundaries reduce conflicts
- Consistent patterns across systems
- Self-documenting structure

## Current Development Priorities

### CRITICAL: Combat & NPC Performance
The combat system is the #1 priority. Current issues:
- **NPC Performance Crisis**: 15v15 combat tanks FPS - need ECS migration (bitecs), spatial culling
- **AI Behavior**: NPCs too predictable - need flanking, cover-seeking, suppression mechanics
- **Combat Feel**: Weak hit feedback, sprite-swap deaths, underwhelming audio

### Weapons Priority
- **Grenade Overhaul**: Floaty physics, weak explosions, no arc preview
- **Mortar Reimplementation**: Currently disabled - needs ballistic physics from scratch
- **New Weapons**: Add shotgun (close-range) and SMG (spray option)

### Game Loop
- Match endings feel abrupt - need end-game sequence
- Missing kill feed and post-match stats
- Squad UX is confusing - simplify commands

### Performance Goals
- Loading time optimization (asset strategy, lazy loading)
- Per-system frame budget tracking
- ECS for NPC data (struct-of-arrays, cache-friendly)
- Spatial partitioning for hit detection
- Web Workers for AI calculations
- Distance-based update throttling

### Future Enhancements
- Module lazy loading
- Event bus for loose coupling
- Multiplayer networking foundation
- New game modes (TDM, Survival)
- Weather/time-of-day effects