# Terror in the Jungle

Browser-based 3D FPS set in Vietnam. Large-scale AI combat, stable frame pacing, testable scenarios.

**Play:** https://matthew-kissinger.github.io/terror-in-the-jungle/

## Prerequisites

- Node 22 (pinned in `.nvmrc`)
- Modern browser with WebGL2

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## Game Modes

| Mode | World Size | Combatants | Match Length | Description |
|------|---:|---:|---:|---|
| Zone Control | 500m | 20 | 3 min | Combat over 3 strategic zones. Control the majority to drain enemy tickets. |
| Team Deathmatch | 400m | 30 | 5 min | Pure tactical combat. First team to the kill target wins. |
| Open Frontier | 3200m | 120 | 15 min | Large-scale warfare across 10 zones with helicopters, a rear-area airfield, and a staged armored yard. |
| A Shau Valley | 21km | 60 materialized / 3000 strategic | 60 min | Historical campaign on real DEM terrain with war simulator, upgraded Ta Bat airfield, and a staged armored yard. |
| AI Sandbox | 200m | 40 (configurable) | 60 min | Automated AI combat for performance testing. |

Three flyable helicopters: UH-1 Huey (transport), UH-1C Gunship, AH-1 Cobra (attack). Open Frontier and A Shau also stage parked fixed-wing aircraft plus jeeps/APCs/tanks as static world content.

## Development

```bash
npm run dev                # Vite dev server
npm run build              # Type-check + production build
npm run smoke:prod         # Built-app Playwright smoke against the deployed base path
npm run test:run           # All tests
npm run test:quick         # Unit tests only (dot reporter)
npm run test:integration   # Integration scenario tests
npm run validate           # Lint + tests + build + production smoke
npm run validate:full      # validate + combat120 perf capture + baseline comparison
npm run lint               # ESLint
npm run lint:fix           # ESLint with auto-fix
```

`smoke:prod` serves `dist/` under `/terror-in-the-jungle`, loads the built app in Chromium, fails on page/runtime errors, and verifies the real menu -> deploy transition.

## Profiling

```bash
npm run perf:capture                # Default headed capture
npm run perf:capture:combat120      # 120 NPC combat stress test
npm run perf:compare                # Compare latest capture against baselines
npm run perf:update-baseline        # Update baseline from latest capture
npm run perf:analyze:latest         # Analyze most recent capture artifacts
```

Artifacts are written to `artifacts/perf/<timestamp>/`.

## Tech Stack

Three.js r182, TypeScript 5.9, Vite 7.3, Vitest 4.0, Playwright 1.58.

## Documentation

See [docs/README.md](docs/README.md) for the full docs index and block map.

Before commit/push or deploy, use [docs/DEPLOYMENT_VALIDATION.md](docs/DEPLOYMENT_VALIDATION.md) for the current release-readiness checklist.
