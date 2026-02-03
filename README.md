# Terror in the Jungle

3D pixel art battlefield with GPU-accelerated billboard rendering. Procedurally generated jungle with 200k+ vegetation instances.

**[Play Now](https://matthew-kissinger.github.io/terror-in-the-jungle/)**

## Quick Start

```bash
npm install
npm run dev     # localhost:5173
npm run build   # Production
```

## Controls

| Action | Key |
|--------|-----|
| Move | WASD |
| Sprint | Shift |
| Jump | Space |
| Fire | Left Click |
| ADS | Right Click |
| Reload | R |
| Weapons | 1-5 |
| Grenade | G |
| **Perf Overlay** | **F2** |
| Console Stats | F1 |

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

## Tech

- Three.js r182 + postprocessing
- three-mesh-bvh for spatial queries
- Web workers (BVH pool, chunk generation)
- TypeScript, Vite 7
- ~45k lines, ~100 files

## Documentation

- `CLAUDE.md` - Development guide, what exists, what needs work
- `ARCHITECTURE.md` - System hierarchy
- `docs/UPGRADE_ROADMAP.md` - Technical upgrade plan

## License

MIT
