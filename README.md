# Terror in the Jungle

3D pixel art battlefield with GPU-accelerated billboard rendering. Procedurally generated jungle with 200k+ vegetation instances.

**[Play Now](https://matthew-kissinger.github.io/terror-in-the-jungle/)**

## Quick Start

```bash
npm install
npm run dev        # localhost:5173
npm run build      # Production
npm run test:run   # 3388 tests
```

## Controls

**Desktop**

| Action | Key |
|--------|-----|
| Move | WASD |
| Sprint | Shift |
| Jump | Space |
| Fire | Left Click |
| ADS | Right Click |
| Reload | R |
| Weapons | 1-6 |
| Grenade | G |
| Squad Menu | Z |
| Scoreboard | TAB |
| Deploy Mortar | B |
| Fire Mortar | F |
| Aim Mortar | Arrow Keys / Mouse Wheel |
| Mortar Camera | M |
| **Perf Overlay** | **F2** |
| Console Stats | F1 |

**Mobile/Touch** - Virtual joystick (move), touch-drag (look), fire/ADS/reload/grenade/scoreboard buttons, weapon bar, helicopter controls, mortar controls, sandbag placement, squad menu

## Performance Tools

Press **F2** for real-time performance overlay showing:
- FPS, frame time, draw calls
- Combat system timing
- LOD breakdown
- Octree stats
- Frame budget visualization

Console API:
```javascript
perf.report()    // Full telemetry
perf.validate()  // System checks
```

## Game Modes

- **Zone Control** - 400x400, 15v15, 3 min
- **Open Frontier** - 3200x3200, 60v60, 15 min
- **Team Deathmatch** - 400x400, 15v15, 5 min

## Tech

- Three.js r182 + postprocessing v6.37
- three-mesh-bvh v0.9 for spatial queries
- Web workers (BVH pool, chunk generation)
- TypeScript 5.9, Vite 7.1, Vitest 4.0
- ~60k lines, 308 source files, 98 test files (3388 tests)
- Design token system for consistent UI theming

## Documentation

- `CLAUDE.md` - Development guide, architecture, controls, tech debt

## License

MIT
