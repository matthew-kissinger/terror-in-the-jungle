# Development Guide

Last updated: 2026-04-08

## Prerequisites

- Node 22 (pinned in `.nvmrc`)
- Modern browser with WebGL2 support

## Quick Start

```bash
npm install
npm run dev              # Vite dev server
```

## Validation

### Quick (< 30 seconds)

```bash
npm run test:quick       # All tests, dot reporter
npm run lint             # ESLint on src/
```

### Full (~2-5 minutes)

```bash
npm run validate         # lint + test:run + build + smoke:prod
npm run deadcode         # knip dead code scan (advisory)
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
npx tsx scripts/fixed-wing-runtime-probe.ts --port 4173 --reuse-dev-server true
```

`fixed-wing-runtime-probe.ts` boots Open Frontier in Playwright, forces desktop input semantics, steps the live game deterministically through `window.advanceTime(ms)`, and validates runway takeoff/climb for the A-1, F-4, and AC-47. Artifacts land in `artifacts/fixed-wing-runtime-probe/`.

### Performance Validation

```bash
npm run perf:capture:combat120   # Primary regression capture
npm run perf:capture:openfrontier:short
npm run perf:compare             # Compare against baselines
npm run perf:compare -- --scenario openfrontier:short
npm run perf:compare:strict      # Treat warnings as failures too
npm run validate:full            # test + build + combat120 + compare
```

See [PERFORMANCE.md](PERFORMANCE.md) for full profiling docs.

For world-size, staged-prop, aircraft, vehicle, terrain-query, or hit-detection changes, `combat120` is not enough. Run `npm run perf:capture:openfrontier:short` and compare that scenario explicitly before you push.

## Deployment

### CI Pipeline

`.github/workflows/ci.yml` deploys to Cloudflare Pages on push to `master`.

Required gates before deploy:
1. `lint`
2. `test`
3. `build` (includes `prebuild` which skips if pre-baked assets exist)
4. `smoke`
5. `mobile-ui`

`perf` still runs on every push and uploads artifacts, but the hosted GitHub runner result is advisory again. The recovered harness is stable locally, while the hosted Linux/Xvfb environment still shows browser scheduling and GPU readback behavior that is not representative enough to block deploy. Use `npm run validate:full` on a real local/self-run environment for an authoritative perf gate.

Live at: https://terror-in-the-jungle.pages.dev/

See [DEPLOY_WORKFLOW.md](DEPLOY_WORKFLOW.md) for the full build-to-prod path, Cloudflare Pages cache-control strategy, service-worker behavior, and prod header spot-check recipes.

### Local prod-like preview

```bash
npm run build
npm run preview          # Vite preview server over dist/
npm run smoke:prod       # headless Playwright smoke over dist/ (what CI runs)
```

Neither Tier exercises `_headers` (that's a Cloudflare Pages layer), but both confirm the bundled app boots and assets resolve. See DEPLOY_WORKFLOW.md section 5.

### Pre-Push Checklist

```bash
npm run validate         # lint + test + build + smoke
npm run deadcode         # should stay green
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

CI still captures perf artifacts on every push, but the hosted-run perf outcome is advisory. If the harness cannot produce a `summary.json`, or if `perf:compare` reports a `FAIL`, the workflow now keeps the artifacts and proceeds with deploy instead of blocking on a runner environment we have already validated as noisy. Treat `validate:full` as the authoritative pre-push perf gate.

### Build Output

Current large chunks:
- `three`: ~691kB
- `index`: ~758kB
- `recast-navigation.wasm-compat`: ~710kB
- `ui`: ~425kB

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
4. `scripts/fixed-wing-runtime-probe.ts` still produces successful A-1 / F-4 / AC-47 takeoff probes when the change touches fixed-wing, airfields, player input, or browser diagnostics hooks

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
    environment/  WeatherSystem, WaterSystem, Skybox
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
