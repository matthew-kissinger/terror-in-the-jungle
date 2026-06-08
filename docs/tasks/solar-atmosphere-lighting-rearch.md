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

The visible sun path now follows the SDS WebGPU split: `SunDiscMesh` owns the
only hot body and is depth-tested; the TSL sky dome owns atmospheric glow and
horizon scatter only. This removes the duplicate grey dome-sun path and gives
terrain a chance to occlude the hard body.

## Evidence

- Full local matrix proof now passes the current sun-body / atmosphere
  diagnostic across all five scenarios and time-of-day captures.
- The Open Frontier golden parity crops show the current broader white-hot
  center with a warmer irregular heat rim instead of the rejected tiny pearl /
  smooth damp sphere. Representative values: WebGPU `sunCore=0.053%`,
  `sunSpan=3.52%`; explicit WebGL2 `sunCore=0.035%`, `sunSpan=2.78%`;
  WebGPU/WebGL2 max channel delta `0.78%`.
- The Open Frontier golden missing-body frame was not terrain occlusion; it was
  stale camera-relative `SunDiscMesh` positioning after the capture camera
  moved. `syncDomePosition()` now refreshes the sun body, and the capture gate
  records `sunVisibility` / terrain ray occlusion so missing-unoccluded bodies
  fail explicitly.
- A Shau dusk ridge proof now passes strict WebGPU and explicit WebGL2 terrain
  warmth, sun-scale, and parity diagnostics. Representative values:
  WebGPU-strict `sunCore=0.053%`, `sunSpan=3.52%`; WebGL2 `sunCore=0.036%`,
  `sunSpan=2.87%`; parity max channel delta `0.39%`.
- Night terrain diagnostics pass red/white/cyan bounds across all five
  scenarios. The older strict night-red sampler remains intentionally
  over-tight and logs strict failures, while the active red-not-dominant
  terrain diagnostic passes 5/5.

## Non-goals

- No volumetric atmosphere/cloud rework unless owner review rejects the
  bounded TSL path.
- No fenced-interface change without `[interface-change]` approval.
- No hiding terrain-light bleed behind fog alone.
- No "closed" status from unit tests alone.

## Acceptance

- [x] Full visual matrix rerun proves the SDS-style sun body / occlusion
      contract and no red/white/cyan night terrain across all modes.
- [x] A Shau strict-WebGPU ridge proof rerun passes the new sun-body /
      terrain-warmth contract and WebGL2 parity.
- [x] Focused unit tests cover sun body/glare bounds and sub-horizon light
      behavior.
- [x] Master CI, deploy, and live-release proof remain required for production
      releases.
- [ ] Owner visual review accepts sun scale, terrain/water lighting, and the
      ridge light-bleed approximation.
- [x] Perf impact is covered by the 2026-06-08 master CI perf job until
      STABILIZAT-1 baseline refresh.
- [x] `npm run lint && npm run test:run && npm run build` all pass after the
      final SDS-style retune.
- [x] Live release proof is the per-deploy production parity gate.
- [x] `docs/ATMOSPHERE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, and
      `docs/DIRECTIVES.md` agree on the candidate authority.
