# Terror in the Jungle - v0.1 Alpha

A high-performance 3D pixel art battlefield game built with Three.js. Experience intense team-based combat in a procedurally generated tropical jungle environment with GPU-accelerated rendering of 200,000+ vegetation instances.

**[Play Now on GitHub Pages](https://matthew-kissinger.github.io/terror-in-the-jungle/)**

---

## Current Development Priorities

**This repo is actively developed.** Key areas needing improvement:

### Combat & NPC (Critical)
- **NPC Performance**: Enemies tank FPS when clustered - need ECS migration, spatial culling
- **Combat AI**: NPCs are too predictable - add flanking, cover-seeking, suppression
- **Combat Feel**: Gunplay lacks punch - better hit feedback, death animations, audio

### Weapons
- **Grenade Overhaul**: Floaty physics, weak explosions, unclear arc preview
- **Mortar Reimplementation**: Currently disabled - needs ballistic physics
- **New Weapons Needed**: Shotgun (close-range), SMG (spray option)

### Game Loop
- **Match Flow**: Abrupt endings, no stats screen, missing kill feed
- **Squad UX**: Commands confusing, can't identify your units

### Performance
- **Loading Time**: Too slow - needs asset optimization
- **Frame Budget**: Need better profiling tools

See `CLAUDE.md` for full priority list with implementation details.

---

## Features

### Core Engine
- **Modular Architecture**: Clean orchestrator pattern with all modules under 400 lines
- **Dynamic Chunk System**: Infinite world generation with seamless chunk loading/unloading
- **GPU-Accelerated Billboards**: Render 200,000+ vegetation instances efficiently
- **Pixel-Perfect Rendering**: Crisp pixel art aesthetics in 3D space
- **Performance Optimized**: Single draw call per vegetation type, instanced rendering

### Combat & Gameplay
- **Advanced Combat AI**: Squad-based tactical AI with multiple behavior states
- **Territory Control**: Zone capture system with dynamic frontlines
- **Team-Based Warfare**: US vs OPFOR factions with ticket system
- **First-Person Combat**: Weapon system with ADS, recoil, and hit detection
- **Player Health System**: Damage effects, death/respawn mechanics

### World Systems
- **Procedural Generation**: Noise-based terrain with tropical jungle biome
- **Global Billboard System**: Centralized management for all sprite rendering
- **Water System**: Animated water planes with realistic shaders
- **Dynamic Vegetation**: 7 types of instanced vegetation (ferns, palms, trees)
- **Skybox System**: Equirectangular panoramic backgrounds
- **Minimap**: Real-time tactical overview with zone status

### Technical Excellence
- **Asset Auto-Discovery**: Drop PNG files in `public/assets/` for automatic loading
- **TypeScript**: Full type safety with strict mode
- **Vite Build System**: Fast HMR and optimized production builds
- **Audio Management**: 3D positional audio and ambient soundscapes
- **Modular Design**: 38 focused modules following single responsibility principle

## Getting Started

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Open http://localhost:5173 in your browser

### Build
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## Controls

- **WASD**: Move around
- **Shift**: Run
- **Space**: Jump
- **Mouse**: Look around (click to enable pointer lock)
- **Left Click**: Fire weapon
- **Right Click**: Aim down sights (ADS)
- **R**: Reload weapon
- **Escape**: Release pointer lock
- **F1**: Toggle performance stats

## Project Structure

```
pix3d/
├── public/
│   └── assets/              # Game assets (auto-discovered)
│       ├── *.png           # Textures and sprites
│       └── archived/       # Unused assets
├── src/
│   ├── main.ts             # Entry point
│   ├── core/               # Core orchestrators
│   │   ├── PixelArtSandbox.ts      # Main game orchestrator (247 lines)
│   │   ├── SandboxSystemManager.ts  # System initialization (190 lines)
│   │   └── SandboxRenderer.ts       # Three.js setup (198 lines)
│   ├── systems/
│   │   ├── assets/         # Asset management
│   │   ├── audio/          # Sound system
│   │   ├── combat/         # Combat system (9 modules)
│   │   │   ├── CombatantSystem.ts     # Main orchestrator
│   │   │   ├── CombatantFactory.ts    # Entity creation
│   │   │   ├── CombatantAI.ts         # AI behavior
│   │   │   └── ...
│   │   ├── environment/    # Environment systems
│   │   ├── player/         # Player systems (4 modules each)
│   │   │   ├── PlayerController.ts
│   │   │   ├── PlayerHealthSystem.ts
│   │   │   └── FirstPersonWeapon.ts
│   │   ├── terrain/        # Chunk system (6 modules)
│   │   │   ├── ImprovedChunkManager.ts
│   │   │   ├── Chunk.ts              # Refactored (7 modules)
│   │   │   └── ...
│   │   └── world/          # World systems
│   │       ├── billboard/  # Billboard system (4 modules)
│   │       ├── ZoneManager.ts        # Territory control (4 modules)
│   │       └── TicketSystem.ts
│   ├── ui/
│   │   ├── hud/           # HUD system (4 modules)
│   │   ├── loading/       # Loading screen (4 modules)
│   │   └── minimap/       # Minimap system
│   ├── types/             # TypeScript interfaces
│   ├── utils/             # Utility functions
│   └── materials/         # Custom shaders
├── ARCHITECTURE.md        # Detailed system documentation
├── package.json
└── tsconfig.json
```

## Asset Pipeline

### Adding New Assets
1. Drop PNG files into `public/assets/`
2. AssetLoader automatically categorizes them:
   - Ground textures: `*floor*`, `*ground*`
   - Foliage: `*grass*`, `*tree*`, `*palm*`, `*fern*`, etc.
   - Enemies: `*zombie*`, `*soldier*`, `*enemy*`, etc.
   - Skybox: `*sky*`, `*skybox*`
3. Assets are available immediately on next run

### Texture Compression (Optional)
```bash
npm run compress-textures
```

## Performance

The engine is optimized for rendering large open worlds:
- **200,000+ billboard instances** with minimal draw calls
- **Single draw call per vegetation type** using instanced meshes
- **Dynamic LOD system** for distant chunks
- **Frustum culling** for off-screen objects
- **GPU-based billboard rotation** for camera-facing sprites
- **Chunk-based occlusion** to limit active entities
- **Update throttling**: Combat AI (100ms), Chunks (250ms), Zones (real-time)

### Performance Metrics
- Average module size: **177 lines** (down from 800+)
- Total modules: **38 focused modules**
- Max instances supported:
  - Ferns: 80,000
  - Trees: 3,000-15,000 per type
  - Combatants: 200+ with full AI

### Performance Tips
- Adjust render distance in `ImprovedChunkManager` config
- Modify max instances in `BillboardVegetationTypes`
- Enable/disable shadows for performance vs quality
- Use texture atlases for similar sprites
- Monitor with F1 key for real-time stats

## Development

### Modular Architecture

The codebase follows a strict modular architecture pattern:
- **Orchestrator Pattern**: Main system files delegate to specialized modules
- **Module Size Limit**: All files under 400 lines for maintainability
- **Single Responsibility**: Each module handles one specific aspect
- **Dependency Injection**: Clean interfaces between modules

### Adding a New Modular System

1. Create main orchestrator implementing `GameSystem`:
```typescript
export class MySystem implements GameSystem {
  private module1: Module1;
  private module2: Module2;

  constructor() {
    this.module1 = new Module1();
    this.module2 = new Module2(this.module1);
  }

  async init(): Promise<void> {
    await this.module1.init();
    await this.module2.init();
  }

  update(deltaTime: number): void {
    this.module1.update(deltaTime);
    this.module2.update(deltaTime);
  }

  dispose(): void {
    this.module1.dispose();
    this.module2.dispose();
  }
}
```

2. Split complex logic into focused modules (<400 lines each)
3. Add to `SandboxSystemManager` for initialization
4. Connect to related systems via dependency injection

### Module Guidelines
- **File Organization**: Group modules in subdirectories by system
- **Naming Convention**: `SystemNameModule.ts` for modules
- **Type Safety**: Use TypeScript interfaces in separate `types.ts`
- **Proper Cleanup**: Always implement disposal chains
- **Clear APIs**: Well-defined public methods

### Modifying World Generation
Edit the terrain modules:
- `ChunkTerrain.ts`: Height generation algorithms
- `ChunkVegetation.ts`: Vegetation placement logic
- `ChunkWater.ts`: Water body generation
- `ChunkBiome.ts`: Biome-specific features

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation including:
- Complete system hierarchy with all 38 modules
- Module organization patterns and guidelines
- Refactoring history (before/after line counts)
- Performance optimization details
- Debugging tips and common issues

## Recent Refactoring (2025)

The codebase underwent a major refactoring to improve maintainability:

### Before vs After
| System | Before | After | Modules Created |
|--------|--------|-------|-----------------|
| CombatantSystem | 1,764 lines | 438 lines | 9 modules |
| GlobalBillboardSystem | 733 lines | 112 lines | 4 modules |
| PlayerHealthSystem | 682 lines | 224 lines | 4 modules |
| HUDSystem | 621 lines | 100 lines | 4 modules |
| PixelArtSandbox | 573 lines | 247 lines | 3 modules |
| ZoneManager | 824 lines | 332 lines | 4 modules |
| Chunk | 2,118 lines | 396 lines | 7 modules |
| LoadingScreen | 575 lines | 122 lines | 4 modules |

**Total**: 8 monolithic files → 38 focused modules

## License

MIT

## Credits

Built with:
- [Three.js](https://threejs.org/) - 3D graphics library
- [Vite](https://vitejs.dev/) - Build tool
- TypeScript - Type safety
- Modular architecture design patterns
