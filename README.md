# Terror in the Jungle

A browser-based 3D first-person shooter and combined-arms sandbox set in the Vietnam War. Command squads, fly helicopters, and fight across procedural jungles and real-world terrain in a browser-first engine with active performance governance.

**[Play Now](https://terror-in-the-jungle.pages.dev)**

## Features

- **5 game modes** from 20-player skirmishes to a 3,000-unit strategic war simulation on a 21km historical map
- **3 flyable helicopters** - UH-1 Huey, UH-1C Gunship, AH-1 Cobra with weapons, door gunners, and tactical insertion
- **3 flyable fixed-wing aircraft** - A-1 Skyraider, AC-47 Spooky, and F-4 Phantom with airfield spawns and per-aircraft flight tuning
- **7 weapon types** - M16A1, AK-47, Ithaca 37, M3 Grease Gun, M1911, M60 LMG, M79 grenade launcher
- **4 factions** - US Army, ARVN, NVA, Viet Cong with faction-specific loadouts
- **Real terrain** - A Shau Valley built from USGS DEM elevation data
- **Procedural worlds** - noise-driven terrain with biome-aware vegetation, firebases, and airfields
- **AI combat** - state-machine-first combat AI with squad tactics, suppression, flanking, cover search, and faction-doctrine expansion in progress
- **Mobile + desktop** - touch controls with virtual joystick, or keyboard and mouse

## Game Modes

| Mode | Scale | Duration | Description |
|------|------:|--------:|-------------|
| Zone Control | 20 | 3 min | Capture and hold strategic zones. Control the majority to drain enemy tickets. |
| Team Deathmatch | 30 | 5 min | First team to the kill target wins. Pure tactical combat. |
| Open Frontier | 120 | 15 min | Large-scale warfare with helicopters, airfields, and armored staging areas. |
| A Shau Valley | 3,000 strategic / 60 materialized | 60 min | Historical campaign on real DEM terrain with a war simulator and selective materialization. |
| AI Sandbox | configurable | 60 min | Automated AI combat for testing and observation. |

## Quick Start

```bash
npm install
npm run doctor     # Verify Node, dependencies, and Playwright browser setup
npm run dev        # Development server
npm run validate:fast
npm run build      # Production build
npm run validate   # Lint + tests + build + smoke test
npm run check:mobile-ui
```

Requires Node 24 (pinned in `.nvmrc`) and a browser with WebGL2.

For the current verified state of the repo, see [docs/STATE_OF_REPO.md](docs/STATE_OF_REPO.md).

## Tech Stack

[Three.js](https://threejs.org/) 0.184 | TypeScript 6.0 | Vite 8 | Vitest 4 | Playwright 1.59 | [Recast Navigation](https://github.com/isaac-mason/recast-navigation-js) (WASM navmesh)

44 game systems, 75 GLB models, 38 pixel-art UI icons, CDLOD terrain with real-time LOD.

Deployed on [Cloudflare Pages](https://terror-in-the-jungle.pages.dev), CI-gated (lint + test + build + smoke).

## Documentation

| Doc | Purpose |
|-----|---------|
| [Architecture](docs/ARCHITECTURE.md) | System overview, tick graph, coupling heatmap, key patterns |
| [State Of Repo](docs/STATE_OF_REPO.md) | Current verified repo state, known drift, and immediate priorities |
| [Roadmap](docs/ROADMAP.md) | Vision, phase plan, resolved decisions |
| [Performance](docs/PERFORMANCE.md) | Profiling commands, scenarios, bottleneck status |
| [Development](docs/DEVELOPMENT.md) | Testing, CI, deployment, pre-push checklist |
| [Cloudflare Stack](docs/CLOUDFLARE_STACK.md) | Pages, R2 asset delivery, Workers, and live interaction target architecture |
| [Backlog](docs/BACKLOG.md) | Open work, known bugs, architecture debt |
| [Asset Manifest](docs/ASSET_MANIFEST.md) | 75 GLBs, integration status, art direction |

## Contributing

```bash
npm run validate:fast
npm run validate   # Must pass before PR
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full testing and deployment guide.

## License

MIT - see [LICENSE](LICENSE).
