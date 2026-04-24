# Development Guide

Last updated: 2026-04-24

## Prerequisites

- Node 24 (pinned in `.nvmrc`)
- Modern browser with WebGL2 support

## Quick Start

```bash
npm install
npm run doctor           # Verify Node, dependencies, and Playwright browser setup
npm run dev              # Vite dev server
```

If `npm ls` reports invalid dependency versions after a dependency bump landed,
reset the workspace with `npm ci`. Do not assume an existing `node_modules/`
directory matches `package-lock.json`.

Keep temporary agent worktrees and caches outside this repo root when possible. Nested clones under the main tree add avoidable indexing and search overhead for humans and agents.

## Validation

### Quick (< 30 seconds)

```bash
npm run typecheck        # Source TypeScript check
npm run test:quick       # All tests, dot reporter
npm run lint             # ESLint on src/
npm run validate:fast    # typecheck + lint + test:quick
```

### Full (~2-5 minutes)

```bash
npm run validate:fast    # fast local gate
npm run validate         # lint + test:run + build + smoke:prod
npm run deadcode         # knip dead code scan (advisory hygiene gate)
```

`validate` runs ESLint, the full Vitest suite, TypeScript + Vite production build, then `scripts/prod-smoke.ts` against the built app.

### Integration Tests

```bash
npm run test:integration   # src/integration/ tests only
npm run check:mobile-ui    # Built-app phone viewport flow gate
```

`check:mobile-ui` drives the real title -> mode select -> deploy -> gameplay flow and fails when controls are offscreen on the phone viewport matrix.

### Runtime Probes

```bash
npm run probe:fixed-wing                                      # default: preview mode (builds perf target, serves via vite preview)
npx tsx scripts/fixed-wing-runtime-probe.ts --server-mode dev # debug against dev server with source maps
```

`fixed-wing-runtime-probe.ts` boots Open Frontier in Playwright, forces desktop input semantics, steps the live game deterministically through `window.advanceTime(ms)`, and validates runway takeoff, climb, AC-47 orbit hold, player/NPC handoff, and short-final approach setup for the A-1, F-4, and AC-47. Artifacts land in `artifacts/fixed-wing-runtime-probe/`.

Post-C1 (2026-04-17), the probe defaults to the `perf` build target served via `vite preview` rather than sharing a dev server. See PERFORMANCE.md "Build targets" for the why.

`cycle-2026-04-21-stabilization-reset` restored this probe as a maintained
gate. Treat it as required evidence for fixed-wing/airfield changes.

For Cycle 2 fixed-wing feel work, the probe is necessary but not sufficient.
It validates takeoff/climb/orbit/handoff/approach correctness; it does not sign
off high-speed stiffness, altitude porpoise, visual shake, camera smoothing, or
render interpolation quality. Use [PLAYTEST_CHECKLIST.md](PLAYTEST_CHECKLIST.md)
for the human feel gate.
The first Cycle 2 interpolation/camera smoothing patch passes the probe, but it
still needs that human fixed-wing checklist before more vehicle types are added.

### Performance Validation

```bash
npm run build:perf               # Build perf-harness bundle (dist-perf/)
npm run preview:perf             # Preview dist-perf/ (harness-ready)
npm run perf:capture:combat120   # Primary regression capture
npm run perf:capture:openfrontier:short
npm run perf:compare             # Compare against baselines
npm run perf:compare -- --scenario openfrontier:short
npm run perf:compare:strict      # Treat warnings as failures too
npm run validate:full            # test + build + combat120 + compare
```

See [PERFORMANCE.md](PERFORMANCE.md) for full profiling docs.

For world-size, staged-prop, aircraft, vehicle, terrain-query, or hit-detection changes, `combat120` is not enough. Run `npm run perf:capture:openfrontier:short` and compare that scenario explicitly before you push.

For architecture-recovery releases, also run the mode-specific evidence script
when atmosphere, terrain visibility, A Shau, or fallback behavior changed:

```bash
npm run evidence:atmosphere
```

That script captures A Shau, Open Frontier, TDM, Zone Control, and AI Sandbox
from ground, sky, and aircraft views, and records terrain/water/nav diagnostics
so local visual evidence cannot silently narrow to one mode.

## Deployment

### CI Pipeline

`.github/workflows/ci.yml` runs quality gates on push to `master`. Production
deploy is manual through `.github/workflows/deploy.yml` or `npm run deploy:prod`.

Required gates before deploy:
1. `lint`
2. `test`
3. `build` (includes `prebuild` which skips if pre-baked assets exist)
4. `smoke`
5. `mobile-ui`

`perf` still runs on every push and uploads artifacts, but the hosted GitHub runner result is advisory again. The recovered harness is stable locally, while the hosted Linux/Xvfb environment still shows browser scheduling and GPU readback behavior that is not representative enough to block deploy. Use `npm run validate:full` on a real local/self-run environment for an authoritative perf gate.

Live at: https://terror-in-the-jungle.pages.dev/

See [DEPLOY_WORKFLOW.md](DEPLOY_WORKFLOW.md) for the full build-to-prod path,
Cloudflare Pages cache-control strategy, service-worker behavior, and prod
header spot-check recipes. See [CLOUDFLARE_STACK.md](CLOUDFLARE_STACK.md) for
the target Pages + R2 + Workers architecture for large game assets and future
user interaction. For GLB/model, public asset, `index.html`, `_headers`, or
`sw.js` changes, run the live header spot-check after deploy.

### Local prod-like preview

```bash
npm run build
npm run preview          # Vite preview server over dist/
npm run smoke:prod       # headless Playwright smoke over dist/ (what CI runs)
```

Neither Tier exercises `_headers` (that's a Cloudflare Pages layer), but both confirm the bundled app boots and assets resolve. See DEPLOY_WORKFLOW.md section 5.

Current cache contract:

- Vite content-hashed build output is emitted under `/build-assets/` and cached immutable.
- Stable-path public assets under `/assets/` and GLB models under `/models/` revalidate.
- The service worker must not cache-first non-versioned assets.
- A Shau terrain runtime data is local-only under `public/data/vietnam/` for dev,
  but production now resolves the DEM through `asset-manifest.json` and
  content-addressed R2 URLs. The deploy workflow runs
  `npm run cloudflare:assets:upload` after `npm run build` and before Pages
  upload. `npm run build` and `npm run build:perf` also emit a local preview
  `asset-manifest.json` into `dist/` and `dist-perf/` so prod-shaped local
  probes do not hit the SPA HTML fallback. If a local preview returns HTML for
  `asset-manifest.json` or the DEM, do not treat A Shau screenshots/probes as
  valid terrain evidence; this is a required-asset failure.
- A Shau asset delivery passing does not sign off navigation. The current
  recovery pass removed the old TileCache fallback path; large worlds use
  explicit static-tiled nav generation, and A Shau startup stops if no generated
  or pre-baked navmesh exists. Representative-base connectivity can pass while
  route/NPC movement still needs play-path validation.
- Before pushing/deploying a cycle that spent most of its time in A Shau, rerun
  an all-mode gate such as `npm run evidence:atmosphere` plus the usual
  validation stack. Open Frontier, TDM, Zone Control, and combat120 must still
  enter live mode without browser errors.
- Local preview evidence is not live-site evidence. After deploy, confirm the
  production Pages URL serves the expected `asset-manifest.json`, R2 DEM URL,
  `/sw.js`, and content-hashed `recast-navigation.wasm` / build assets. See
  [DEPLOY_WORKFLOW.md](DEPLOY_WORKFLOW.md) for the live header spot-check.

### Pre-Push Checklist

```bash
npm run validate:fast    # typecheck + lint + test:quick
npm run validate         # lint + test + build + smoke
npm run deadcode         # review output; advisory hygiene gate
```

For performance-sensitive changes, also run:
```bash
npm run validate:full    # adds combat120 capture + baseline comparison
```

For world/vehicle/aircraft/terrain work, also run:
```bash
npm run perf:capture:openfrontier:short
npm run perf:compare -- --scenario openfrontier:short
```

For deploy/cache-sensitive work, also run after deployment:
```bash
# See docs/DEPLOY_WORKFLOW.md section 7 for the full command set.
curl -I https://terror-in-the-jungle.pages.dev/sw.js
curl -I https://terror-in-the-jungle.pages.dev/models/vehicles/aircraft/a1-skyraider.glb
npm run cloudflare:assets:validate
```

CI still captures perf artifacts on every push, but the hosted-run perf outcome is advisory. If the harness cannot produce a `summary.json`, or if `perf:compare` reports a `FAIL`, the workflow now keeps the artifacts and proceeds with deploy instead of blocking on a runner environment we have already validated as noisy. Treat `validate:full` as the authoritative pre-push perf gate.

### Build Output

Current large chunks:
- `index`: ~851kB raw / ~221kB gzip
- `three`: ~734kB raw / ~187kB gzip
- `ui`: ~449kB raw / ~106kB gzip
- `recast-navigation.wasm`: ~339kB WASM + ~275kB JS loader per main/worker graph

`npm run build` intentionally does not emit `.gz` or `.br` sidecar files.
Cloudflare handles visitor-facing compression for the deployed Pages assets, so
local output stays focused on canonical hashed files.

### Manual Smoke Checks

After changes to `src/ui/controls/`, `src/ui/hud/`, or `src/systems/player/`:
1. Menu -> play -> deploy works
2. Initial deploy enters live gameplay
3. Deploy cancel returns to menu
4. Respawn works
5. No fatal console errors

After changes to `src/systems/world/`, `src/systems/terrain/`, `src/systems/vehicle/`, or `src/systems/combat/`, also confirm:
1. Open Frontier capture records player shots and hits
2. Nearby enemies are returned by combat spatial queries in the active mode bounds
3. Entering a plane does not produce vertical self-launch on the first update ticks
4. If the change touches fixed-wing, airfields, player input, or browser diagnostics hooks, run `npm run probe:fixed-wing` or document why the probe could not be used.

## Project Structure

```
src/
  core/           GameEngine, bootstrap, SystemUpdater, GameEventBus
  config/         Game mode configs, MapSeedRegistry, CombatantConfig
  systems/
    combat/       CombatantSystem, AI states, spatial grid, squads, LOD
    terrain/      TerrainSystem, CDLOD, height queries, biome classifier
    navigation/   NavmeshSystem, crowd, movement adapter
    strategy/     WarSimulator, MaterializationPipeline (A Shau scale)
    player/       PlayerController, FirstPersonWeapon, weapon subsystem
    weapons/      GrenadeSystem, MortarSystem, SandbagSystem, AmmoSupply
    helicopter/   HelicopterModel, HelicopterPhysics, HelicopterAnimation
    vehicle/      VehicleManager, NPCVehicleController
    world/        ZoneManager, TicketSystem, GameModeManager, WorldFeatures
    airsupport/   AirSupportManager, AAEmplacement
    assets/       AssetLoader, ModelLoader
    audio/        AudioManager, FootstepAudio, WeaponSounds
    effects/      TracerPool, MuzzleFlash, PostProcessing, CameraShake
    environment/  AtmosphereSystem, CloudLayer, WeatherSystem, WaterSystem
    input/        InputContextManager
    debug/        PerformanceTelemetry, PerformanceBenchmark
  ui/
    hud/          HUDSystem, KillFeed, HitMarker, ScorePopup, HelicopterHUD
    controls/     TouchControls, TouchLook, TouchADSButton, GamepadManager
    screens/      TitleScreen, ModeSelectScreen, DeployScreen, GameUI
    layout/       HUDLayout, VisibilityManager, GameplayPresentationController
    loading/      LoadingScreen, SettingsModal
    engine/       UIComponent base class
    icons/        IconRegistry
    minimap/      MinimapSystem, MinimapRenderer
    compass/      CompassSystem
  types/          SystemInterfaces, shared type definitions
  utils/          ObjectPoolManager, Logger
  integration/    Integration test scenarios
  test-utils/     Test helpers and mocks
scripts/          Perf capture, analysis, comparison, prebake
public/
  models/         75 GLB files (weapons, vehicles, structures, etc.)
  assets/         Textures, sprites, audio, icons
```

## Exit Codes

| Command | 0 | 1 | 2 |
|---------|---|---|---|
| `test:run` / `test:quick` | All pass | Failures | - |
| `build` | Success | TS/build error | - |
| `validate` | All pass | First failure | - |
| `perf:compare` | All PASS, or WARN unless `--fail-on-warn` is set | WARN with `--fail-on-warn` | Any FAIL |
