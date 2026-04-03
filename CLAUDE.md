# Project Notes

Last updated: 2026-04-02

## Project

Terror in the Jungle is a browser-based 3D combat game focused on:
- large-scale AI combat (up to 3,000 agents)
- stable frame-time tails under load
- realistic/testable large-map scenarios (A Shau Valley 21km DEM)

Tech: Three.js 0.183, TypeScript 5.9, Vite 8, Vitest 4, Node 22.

## Daily Commands

```bash
npm run dev
npm run build
npm run test:run
npm run test:quick           # all tests with dot reporter (fast output)
npm run test:integration     # integration scenario tests only
npm run validate             # lint + test:run + build + smoke:prod
npm run validate:full        # test:run + build + combat120 capture + perf:compare
```

## Perf Commands

```bash
npm run perf:capture:combat120
npm run perf:capture:openfrontier:short
npm run perf:capture:ashau:short
npm run perf:capture:frontier30m
npm run perf:quick            # quick smoke capture only (not a committed baseline)
npm run perf:compare          # compare latest capture against baselines
npm run perf:update-baseline  # update baseline from latest capture
```

## Runtime Landmarks

- Entry: `src/main.ts`, `src/core/bootstrap.ts`
- Engine: `src/core/GameEngine.ts`, `src/core/GameEngineInit.ts`, `src/core/SystemUpdater.ts`, `src/core/GameEventBus.ts`
- Modes: `src/config/gameModeTypes.ts`, `src/config/*Config.ts`, `src/config/MapSeedRegistry.ts`
- Combat: `src/systems/combat/*`
- Navigation: `src/systems/navigation/*` (navmesh, crowd, movement adapter)
- Strategy (A Shau): `src/systems/strategy/*`
- Terrain: `src/systems/terrain/*`
- Vehicles: `src/systems/vehicle/*` (FixedWingModel, FixedWingPhysics, VehicleManager), `src/systems/helicopter/*`
- World features: `src/systems/world/*` (WorldFeatureSystem, FirebaseLayoutGenerator, AirfieldLayoutGenerator)
- Harness: `scripts/perf-capture.ts`, `scripts/perf-analyze-latest.ts`, `scripts/perf-compare.ts`
- UI: `src/ui/hud/`, `src/ui/controls/`, `src/ui/icons/`, `src/ui/screens/`, `src/ui/loading/`, `src/ui/engine/`
- Tests: `src/integration/`, `src/test-utils/`

## Current Focus

- combat120 at WARN: p95 ~32ms, p99 ~34ms; cover search budget-capped (6/frame), max spike 50ms (was 59ms), heap growth negative
- Deployed to Cloudflare Pages, CI-gated (lint + test + build + smoke)
- 5 game modes live, 3 flyable helicopters, 3 flyable fixed-wing aircraft, 6 weapon slots (rifle/shotgun/smg/pistol/lmg/launcher), 4 factions
- 75 GLB assets shipped, 6 aircraft rebuilt with rigged rotors via PixelForge Kiln
- Mobile touch controls hardened (virtual joystick, vehicle action bar, fullscreen workarounds)
- Async startup eliminates Open Frontier hang; map seed rotation (5 OF, 3 ZC, 3 TDM variants)
- Terrain CDLOD rewrite live with auto-scaled LOD levels per world size
- See `docs/BACKLOG.md` for open work items

## Documentation Contract

- Update `docs/ARCHITECTURE.md` after architecture decisions.
- Update `docs/PERFORMANCE.md` when capture flags/semantics change.
- Update `docs/ASSET_MANIFEST.md` when new asset needs are identified.
- Keep docs concise; remove stale status logs.
