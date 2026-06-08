<!-- 80 LOC cap. Source audit: 2026-06-07 owner feedback + repo trace. -->
# solar-atmosphere-lighting-rearch

Re-evaluate and re-architect the solar/atmosphere/lighting chain after owner
feedback rejected the prior sun scale and terrain lighting. The fix must keep
sun scale, night color, terrain/water highlights, shadow direction, and
hill/ridge light-bleed coherent in all shipping modes.

## Files touched

- `src/systems/environment/AtmosphereSystem.ts`
- `src/systems/environment/atmosphere/HosekWilkieTslNode.ts`
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`
- `src/systems/environment/WaterSystem.ts`
- `src/systems/terrain/TerrainMaterial.ts`
- `src/systems/environment/water/WaterSurfaceBinding.ts`
- `src/systems/environment/water/WaterBodySurface.ts`
- `src/systems/environment/water/HydrologyRiverSurface.ts`
- `scripts/capture-sun-and-atmosphere-shots.ts`
- `docs/ATMOSPHERE.md`

## Current State

The active worktree is the candidate SOL-1 authority. `AtmosphereSystem`
publishes `AtmosphereLightingSnapshot`; renderer lights, water, billboard
vegetation, and terrain night fill consume that effective lighting state. The
TSL dome and CPU LUT share a cool sub-horizon sky floor. Water is night-aware.
Shadows preserve A Shau camera altitude. Terrain has a bounded low-sun
heightmap/relief approximation for ridge-light cases.

The visible sun path now has three bounded parts: small HDR disc, low-gain
aureole, and an elevation-colored base-glare cap. This removes the giant
white sun body while preserving a blue high-sun halo and warm low-sun haze.

## Evidence

- `summary.json` (2026-06-08): 33/33 captures succeeded; 29 true `webgpu`,
  4 explicit `webgl`; WebGPU/WebGL2 parity max delta 0%.
- Sun-scale passes in all visual/parity captures: noon `sunSpan=2.41%`;
  golden/dusk `sunSpan=1.48%`.
- Twilight/midnight terrain red/white/cyan metrics pass in all modes.
- `ridge-summary.json`: A Shau dusk strict-WebGPU ridge proof resolves true
  `webgpu`, passes ridge warmth and sun-scale, and explicit-WebGL2 parity is
  0.39%.

## Non-goals

- No volumetric atmosphere/cloud rework unless owner review rejects the
  bounded TSL path.
- No fenced-interface change without `[interface-change]` approval.
- No hiding terrain-light bleed behind fog alone.
- No "closed" status from unit tests alone.

## Acceptance

- [x] Automated visual matrix proves no giant sun body and no red/white/cyan
      night terrain across all modes.
- [x] A Shau strict-WebGPU ridge proof passes sun-scale, terrain warmth, and
      WebGL2 parity.
- [x] Focused unit tests cover sun body/glare bounds and sub-horizon light
      behavior.
- [x] Master CI, deploy, and live-release proof pass for shipped commit
      `2db02400`.
- [ ] Owner visual review accepts sun scale, terrain/water lighting, and the
      ridge light-bleed approximation.
- [x] Perf impact is covered by the 2026-06-08 master CI perf job until
      STABILIZAT-1 baseline refresh.
- [x] `npm run lint && npm run test:run && npm run build` all pass.
- [x] Live release proof passes if this ships to production.
- [x] `docs/ATMOSPHERE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, and
      `docs/DIRECTIVES.md` agree on the candidate authority.
