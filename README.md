# Terror in the Jungle

Browser-based 3D combined-arms FPS. GPU-accelerated billboard rendering of 200k+ procedural vegetation. Faction-based AI combat with squad tactics, influence maps, and spatial acceleration.

**[Play Now](https://matthew-kissinger.github.io/terror-in-the-jungle/)**

## Quick Start

```bash
npm install
npm run dev        # localhost:5173
npm run build      # Production build
npm run test:run   # 3363 tests
```

## Game Modes

| Mode | Map Size | Teams | Duration |
|------|----------|-------|----------|
| Zone Control | 400x400 | 15v15 | 3 min |
| Open Frontier | 3200x3200 | 60v60 | 15 min |
| Team Deathmatch | 400x400 | 15v15 | 5 min |

## Controls

**Desktop** - WASD move, Shift sprint, Space jump, Click fire, Right-click ADS, R reload, 1-6 weapons, G grenade, B mortar deploy, F mortar fire, Z squad menu, TAB scoreboard, F2 perf overlay

**Mobile** - Virtual joystick, touch-drag look, on-screen fire/ADS/reload/grenade/scoreboard, weapon bar, helicopter/mortar/sandbag touch controls, squad menu

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Three.js r182 + postprocessing v6.38 |
| Spatial | three-mesh-bvh v0.9, custom octree + grid |
| Build | Vite 7.3, TypeScript 5.9 |
| Workers | BVH pool, chunk generation workers |
| Tests | Vitest 4.0 - 98 files, 3363 tests |

~61k lines source, ~50k lines tests across 406 files.

## Performance Profiling

**In-game**: F2 overlay (FPS, draw calls, triangles, combat timing, memory)

**Console API**:
```javascript
perf.report()        // Full telemetry
perf.validate()      // System checks
perf.benchmark(1000) // Raycast benchmark
```

**Automated harness** (Playwright CDP):
```bash
npm run perf:capture              # Headed capture (default, trusted)
npm run perf:capture:headless     # Headless (secondary signal)
npm run perf:capture:devtools     # With Chrome DevTools
npm run perf:analyze:latest       # Analyze latest artifacts
```

**AI Sandbox** for stress testing: `?sandbox=true&npcs=80&autostart=true`

See `docs/PROFILING_HARNESS.md` for full harness documentation.

## Documentation

| Doc | Purpose |
|-----|---------|
| `CLAUDE.md` | Development guide, architecture, key files, tech debt |
| `docs/PROFILING_HARNESS.md` | Perf harness commands, artifacts, validation checks |
| `docs/ARCHITECTURE_RECOVERY_PLAN.md` | Optimization workstreams, experiment log, discovery loop |
| `docs/AUDIO_ASSETS_NEEDED.md` | Audio asset specifications |

## CI/CD

- **ci.yml** - Lint, build, test on push/PR
- **deploy.yml** - GitHub Pages deploy on push to master
- **perf-check.yml** - Automated perf regression capture (control + combat profiles)

## License

MIT
