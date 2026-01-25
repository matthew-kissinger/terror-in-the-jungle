# Terror in the Jungle - 3D Pixel Art Battlefield

> A high-performance 3D pixel art game built with Three.js. Team-based combat
> in a procedurally generated tropical jungle with GPU-accelerated rendering.

**Status**: v0.1 Alpha - Playable but needs significant improvements

## Development Philosophy

This repo is actively developed by AI agents. When working here:
- **Make real improvements** - Don't just analyze, write code
- **Test in browser** - `npm run dev` and verify changes work
- **Commit working code** - Small, focused commits with clear messages
- **Push the game forward** - Every task should make the game better

## Quick Start

```bash
npm install
npm run dev                    # Dev server at http://localhost:5173
npm run build                  # Production build
```

## Game Modes

| Mode | Scope | Tickets | Duration | Zones | Combatants |
|------|-------|---------|----------|-------|------------|
| Zone Control | Small (400x400) | 300 | 3 min | 3 + 2 bases | 15v15 |
| Open Frontier | Large (3200x3200) | 1000 | 15 min | 10 + 6 bases | 60v60 |

## Controls

**Movement**: WASD, Shift (sprint), Space (jump)
**Combat**: Click (fire), RClick (ADS), R (reload)
**Weapons**: 1 (shotgun 8/24), 2 (grenade), 3 (rifle 30/90), 4 (sandbag), 5 (SMG 32/128), Q (cycle)
**Squad**: Z (toggle UI), Shift+1-5 (commands)
**Debug**: F1 (stats), F2 (overlay), F3 (logs), P (post-proc), K (respawn)

## Architecture

**38 focused modules** (avg 177 lines) across 9 system categories:
- Combat (9): CombatantSystem, AI, movement, hit detection, squads
- Player (7): Controls, weapons, health, respawn, inventory
- Terrain (6): Chunks, vegetation, water, terrain, biomes
- Rendering (10+): Billboards, effects, post-processing, water, skybox
- Weapons (5): Grenades, mortar (disabled), sandbags, ammo
- World (6): Zones, capture logic, tickets, game modes
- Special (6): Helicopters, squads, audio, radio
- UI (11+): Loading, HUD, minimap, map, compass
- Utilities (5): Assets, logging, noise, math, pixel-perfect

**Core files**:
- `src/main.ts` - Entry point (3 lines, calls bootstrap)
- `src/core/PixelArtSandbox.ts` - Main orchestrator (247 lines)
- `src/core/SandboxSystemManager.ts` - System init/lifecycle (190 lines)
- `src/core/SandboxRenderer.ts` - Three.js rendering (198 lines)

## Stack

| Layer | Technology |
|-------|-----------|
| Graphics | Three.js r180 + postprocessing |
| Physics | Custom hitscan, rigidbody-less AI |
| Build | Vite 7.1.5, TypeScript 5.9.2 |
| Rendering | GPU instanced meshes, billboards, custom shaders |
| Assets | Auto-discovery PNG in /public/assets/ |

## Performance

- **200,000+ vegetation instances** with single draw call per type
- **60+ combatants** with full AI (100ms decision cycles)
- GPU-accelerated billboard rotation
- Chunk-based frustum culling + LOD system
- Throttled updates: Combat (100ms), Chunks (250ms)

Monitor with F1 (console) or F2 (overlay).

---

## Priority Work Areas

### CRITICAL: Combat & NPC System (Top Priority)

The combat system is the core of the game and needs major improvements:

1. **NPC Performance Crisis** - Enemies tank FPS, especially in Zone Control with 15v15:
   - AI update loop is too expensive (100ms throttle not enough)
   - Need aggressive distance-based culling
   - Spatial partitioning for hit detection is missing
   - Billboard updates need batching
   - Consider ECS migration (bitecs) for data-oriented performance
   - **Target**: 60+ NPCs at 60fps

2. **Combat AI Behavior** - NPCs feel dumb and predictable:
   - Squad coordination is basic (no flanking, suppression)
   - No cover-seeking behavior
   - Pathfinding gets stuck on terrain
   - Need influence maps for smarter positioning
   - Defensive behavior at zones needs work
   - **Goal**: Enemies that feel dangerous and tactical

3. **Combat Feel & Feedback** - Gunplay lacks punch:
   - Hit feedback is weak (need hit markers, damage numbers)
   - Death animations are just sprite swaps
   - Muzzle flash/tracers need visibility boost
   - Weapon audio needs more punch and variety
   - Screen shake and impact effects underwhelming

### Weapons (High Priority)

4. **Grenade System Overhaul** - Currently poorly implemented:
   - Throwing arc/preview is unclear - add trajectory line
   - Physics feel floaty - tighten up
   - Explosion effect is weak - bigger, louder
   - Damage radius inconsistent - fix hitbox
   - No cooking mechanic - add hold-to-cook
   - Throw power UX confusing - visual power meter

5. **Mortar System** - Disabled, needs reimplementation:
   - Proper ballistic arc physics
   - Trajectory preview with landing indicator
   - Satisfying impact effects
   - Usable camera during aiming

6. **NEW WEAPON: Shotgun** - Add close-range option:
   - Spread pattern (8-12 pellets)
   - High damage at close range, weak at distance
   - Pump action with satisfying animation
   - Distinct audio profile
   - Good for jungle close-quarters

7. **NEW WEAPON: SMG/PDW** - Add spray-and-pray option:
   - High rate of fire, lower damage per shot
   - Good hip-fire accuracy
   - Fast reload
   - Suppression effect on enemies

### Game Loop & Progression

8. **Match Flow Improvements**:
   - Victory/defeat feels abrupt - add end-game sequence
   - No post-match stats screen
   - Kill feed missing
   - Score popups for captures and kills
   - Round timer visibility

9. **Player Agency**:
   - Squad commands are confusing - simplify UX
   - Can't tell which units are yours - add markers
   - No rally point system
   - Respawn location choice is clunky

### Performance & Polish

10. **Loading Time** - Initial load is slow:
    - Asset preloading strategy
    - Chunk pre-generation optimization
    - Texture compression
    - Lazy loading for non-critical systems

11. **Performance Tooling**:
    - Per-system timing breakdown (F1 shows this but needs improvement)
    - GPU vs CPU bottleneck identification
    - Frame budget visualization
    - Automated perf regression tests

12. **Helicopter Physics**:
    - Flight model feels arcade-y
    - Landing/takeoff needs polish
    - Collision response is janky

13. **Water System**:
    - Current water is basic placeholder
    - Could add reflections, waves, underwater effects

### Content Expansion

14. **New Game Modes**:
    - Team Deathmatch (simpler than zones)
    - Survival/Horde mode (waves of enemies)
    - Night operations (flashlights, flares)

15. **Visual Variety**:
    - More vegetation types
    - Additional enemy factions
    - Environment props (ruins, bunkers)
    - Weather effects

### Future: Multiplayer Foundation

16. **Network Architecture**:
    - State synchronization design
    - Client-side prediction
    - Lobby/matchmaking concepts
    - Start with co-op before PvP

---

## File Structure

```
src/
├── core/                   # PixelArtSandbox, renderer, system manager
├── systems/
│   ├── combat/            # AI, squads, hit detection
│   ├── player/            # Controls, weapons, health
│   ├── terrain/           # Chunks, vegetation, terrain generation
│   ├── environment/       # Water, skybox
│   ├── world/             # Zones, tickets, game modes, billboards
│   ├── weapons/           # Grenades, mortars, sandbags
│   ├── helicopter/        # Dropship, physics
│   ├── audio/             # 3D sound, radio effects
│   └── effects/           # Post-processing, visual effects
├── ui/
│   ├── loading/           # Game mode selection, progress
│   ├── hud/               # Health, ammo, objectives
│   ├── minimap/           # Tactical overview
│   ├── map/               # Full map view
│   └── compass/           # Direction indicator
├── types/                 # TypeScript interfaces
├── utils/                 # Math, noise, logging, pixel-perfect
├── materials/             # Custom shaders
└── config/                # Game modes, audio, loading phases
```

## Development Guidelines

**Modular Design**:
- Implement `GameSystem` interface for lifecycle management
- Keep modules under 400 lines (split if larger)
- Use orchestrator pattern: main file delegates to focused modules
- Group related modules in subdirectories by system

**Adding Systems**:
1. Create main orchestrator (< 400 lines)
2. Split complex logic into 2-3 focused modules
3. Define types in `types.ts`
4. Add to SandboxSystemManager initialization
5. Connect dependencies in `connectSystems()`

**Assets**:
- Drop PNGs in `public/assets/`
- Auto-categorized by filename (grass*, tree*, enemy*, sky*)
- Available on next dev reload

**Performance**:
- Use instanced rendering for repeated entities
- Throttle expensive updates (100-250ms)
- GPU-side rotation for billboards
- Instance pooling for effects

## Conventions

- TypeScript strict mode enabled
- No semicolons (Vite + ESLint default)
- Conventional commits
- Test in browser before committing (no test suite)
- Keep modules focused and small

## Detailed Documentation

**Start here for context**, then dive into specialized docs:

| Doc | Purpose |
|-----|---------|
| docs/UPGRADE_ROADMAP.md | Detailed alpha upgrade plan with metaprompts for each task |
| ARCHITECTURE.md | System hierarchy, module organization, refactoring history |
| AI_SYSTEM_ANALYSIS.md | Combat AI deep-dive: state machines, squad behavior |
| HELICOPTER_METAPROMPT.md | Helicopter system specification and implementation guide |
| WEAPON_SYSTEM_IMPLEMENTATION_PLAN.md | Grenades, mortars, sandbags, inventory |
| NPC_SHADER_EFFECTS.md | Billboard sprite effects and shaders |
| GAME_MODE_REQUIREMENTS.md | Open Frontier mode specifications |

## Key Optimization Roadmap Items (from UPGRADE_ROADMAP.md)

1. **Rendering Modernization** - Adaptive render path, WebGPU prep, post-chain modularization
2. **NPC ECS Migration** - bitecs for combatants, job scheduling, memory pooling
3. **Combat AI Optimization** - LOS acceleration, influence maps, animation caching
4. **Audio Spatialization** - 3D panning, occlusion, distance attenuation
5. **Terrain LOD** - Multi-resolution chunks, vegetation culling
6. **Networking Foundation** - State sync, prediction, lobbies

Each section has detailed metaprompts ready for agent execution.

---

Built with Three.js, Vite, TypeScript.
