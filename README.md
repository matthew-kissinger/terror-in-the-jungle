# Terror in the Jungle

Browser-based 3D FPS focused on large-scale jungle combat, stable frame pacing, and testable AI behavior.

Live build:
- https://matthew-kissinger.github.io/terror-in-the-jungle/

## Quick Start

```bash
npm install
npm run dev
```

Core commands:

```bash
npm run build
npm run test:run
npm run perf:capture
npm run perf:analyze:latest
```

## Game Modes

| Mode | World Size | Max Materialized Combatants | Match Length |
|---|---:|---:|---:|
| Zone Control | 500 | 20 | 3 min |
| Open Frontier | 3200 | 120 | 15 min |
| Team Deathmatch | 400 | 30 | 5 min |
| AI Sandbox | 200 (default) | configurable | 60 min |
| A Shau Valley | 21136 | 60 (materialized), 3000 strategic | 60 min |

## Profiling

Main loop:

```bash
npm run perf:capture
npm run perf:capture:combat120
npm run perf:capture:openfrontier:short
npm run perf:capture:ashau:short
npm run perf:capture:frontier30m
npm run perf:analyze:latest
npm run perf:compare -- --scenario combat120
npm run perf:update-baseline -- --scenario combat120
```

Artifacts are written to `artifacts/perf/<timestamp>/`.

Current perf posture:
- Close measured CPU tail hotspots and keep warm baselines honest before reaching for WebGPU, WASM, worker-offload, navmesh, or ECS-scale rewrites.
- Treat frontier-tech work as follow-on to `docs/PERF_FRONTIER.md`, not as the current unblocker.

## Documentation

Start at `docs/README.md`.

Primary docs:
- `docs/README.md`
- `docs/GAME_MODES_EXECUTION_PLAN.md`
- `docs/PERF_FRONTIER.md`
- `docs/ARCHITECTURE_RECOVERY_PLAN.md`
- `docs/PROFILING_HARNESS.md`
- `docs/TERRAIN_REWRITE_MASTER_PLAN.md`
- `docs/ASHAU_VALLEY_IMPLEMENTATION_PLAN.md`
- `data/vietnam/DATA_PIPELINE.md`

## License

MIT
