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
```

Artifacts are written to `artifacts/perf/<timestamp>/`.

## Documentation

Start at `docs/README.md`.

Primary docs:
- `docs/PERFORMANCE_FRONTIER_MISSION.md`
- `docs/PROFILING_HARNESS.md`
- `docs/ARCHITECTURE_RECOVERY_PLAN.md`
- `docs/ASHAU_VALLEY_IMPLEMENTATION_PLAN.md`
- `data/vietnam/DATA_PIPELINE.md`

## License

MIT
