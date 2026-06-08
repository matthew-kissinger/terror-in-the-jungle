# Atmosphere System

This document describes the current sky / sun / fog / cloud / ambient stack and
the remaining atmosphere roadmap. The v1 atmosphere foundation and polish cycles
landed across `cycle-2026-04-20-atmosphere-foundation` and
`cycle-2026-04-21-atmosphere-polish-and-fixes`.

## Current Runtime

- `AtmosphereSystem` owns the sky dome and implements the fenced `ISkyRuntime`
  and `ICloudRuntime` surfaces.
- `HosekWilkieSkyBackend` is the only sky backend on master. The legacy
  `Skybox.ts`, `NullSkyBackend.ts`, and `public/assets/skybox.png` fallback path
  was removed in PR #108.
- `ScenarioAtmospherePresets` provides per-mode time-of-day, fog density,
  cloud coverage, turbidity, and lighting parameters.
- `AtmosphereTodCycle` animates sun direction for live modes. `combat120` stays
  static so the primary perf regression target remains easier to compare.
- `GameRenderer` fog is driven from atmosphere sky color instead of a hardcoded
  constant, removing the old horizon seam.
- `AtmosphereSystem` publishes an `AtmosphereLightingSnapshot` with effective
  direct light, sky fill, ground bounce, ambient fill, fog color, and daylight
  factor. Renderer lights, water, and billboard vegetation use that contract;
  terrain receives the same state through renderer lights and an atmosphere-
  driven night-fill uniform plus a bounded low-sun heightmap/relief response in
  the terrain material.
- `AtmosphereSystem.setShadowFollowTarget` recenters the directional light and
  target on the follow target's X/Y/Z. This preserves the sun angle on elevated
  terrain such as A Shau instead of aiming the shadow frustum through world Y=0.
- The active SOL-1 mitigation keeps daytime behavior largely intact while
  correcting low-sun failures: sub-horizon sun vectors no longer become
  above-ground terrain lights, ambient fill tints cool at dusk/night, and water
  specular/emissive/foam/sparkle response attenuates when the sun is below the
  horizon.
- The TSL dome and CPU LUT share a cool sub-horizon sky floor. Daytime keeps
  the historical Preetham floor, while night avoids near-black/red-extinction
  sky samples that destabilize fog, hemisphere, water, and terrain reads.
- `HosekWilkieSkyBackend` owns the visible sky-dome cloud pass. The active
  visual dome is a TSL node material; the small CPU LUT remains for fog and
  hemisphere readers. Weather/scenario coverage feeds the same backend, avoiding
  the old finite cloud-plane horizon divider.
- The old planar `CloudLayer` prototype has been removed from the active source
  tree. Do not reintroduce a finite cloud plane as WebGPU evidence; future
  cloud work should extend the sky-dome or an explicitly reviewed volume path.
- The active renderer draws straight to the backbuffer. `PostProcessingManager`
  is a compatibility shim, and `GameRenderer` currently defaults to AGX tone
  mapping after the sun-and-atmosphere overhaul.

## Runtime Contract

```ts
export interface ISkyRuntime {
  getSunDirection(): THREE.Vector3;
  getSunColor(out: THREE.Color): THREE.Color;
  getSkyColorAtDirection(dir: THREE.Vector3, out: THREE.Color): THREE.Color;
  getZenithColor(out: THREE.Color): THREE.Color;
  getHorizonColor(out: THREE.Color): THREE.Color;
}

export interface ICloudRuntime {
  getCoverage(): number;
  setCoverage(v: number): void;
}
```

`ISkyRuntime` remains the fenced read-only sky query surface. The concrete
`AtmosphereSystem` additionally exposes `getLightingSnapshot(out)` so renderer,
water, and billboard systems can consume the same effective day/night lighting
without expanding the fenced interface.

The important invariant is that fog, ambient lighting, water, terrain, and
billboards all sample the same atmosphere-derived lighting state. Do not
reintroduce independent hardcoded sky/fog/light colors for local fixes.

## Current Limits

- Clouds are sky texture and lighting only. There is no volumetric scattering,
  collision, fly-through cloud interior, or aircraft-specific cloud lighting.
- Clouds are wired in all five current game modes through the sky dome. The old
  "one tile" report was valid for the former visible `CloudLayer` plane; that
  plane is now retired. The visible sky shader now uses a seamless cloud-deck
  projection instead of azimuth-wrapped sky UVs. A Shau, TDM, and Zone Control
  read as heavier broken cloud layers; Open Frontier and combat120 intentionally
  read as lighter scattered-cloud presets but still need art review.
- `npm run evidence:atmosphere` captures ground, sky-coverage, and aircraft
  views for all modes. The 2026-04-24 post-fix artifact is
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T13-08-25-253Z/`.
  That run proved cloud wiring in all five modes after `build` and `build:perf`
  began emitting `asset-manifest.json`. A Shau terrain/readability evidence is
  DEM-backed, A Shau water is disabled without underwater fog, and the browser
  run has `0` errors. The old TileCache fallback path has been removed; large
  worlds use explicit static-tiled nav generation and A Shau startup stops if no
  navmesh is generated or pre-baked. The same run records A Shau representative
  nav connectivity as passing, but route/NPC movement quality and airfield use
  still need play-path validation. The run also proves the A Shau work did not
  prevent Open Frontier, TDM, Zone Control, or combat120 from entering live mode.
- SOL-1 remains open for owner visual acceptance and live proof after deploy.
  The current mitigation removes cyan/white night-water and sub-horizon light
  defaults, keeps renderer, water, billboard lighting, and terrain night fill on
  one effective lighting snapshot, and applies a bounded low-sun terrain
  heightmap/relief response. The shadow recenter path preserves A Shau altitude,
  and renderer-facing low-sun directional light is bounded separately from the
  analytic sky color. The visible sun path now follows the SDS WebGPU split:
  `SunDiscMesh` is ON by default and owns the depth-tested hot body, while the
  TSL dome owns atmospheric glow / horizon scatter only. Full local matrix
  proof now passes across all five scenarios and time-of-day captures after
  fixing stale camera-relative sun-body sync. Representative Open Frontier
  golden proof records WebGPU `sunCore=0.053%`, `sunSpan=3.52%` and explicit
  WebGL2 `sunCore=0.035%`, `sunSpan=2.78%`, with parity max channel delta
  `0.78%`. A Shau dusk ridge proof passes terrain warmth, sun-scale, and
  renderer parity. Production parity must be proven with
  `npm run check:live-release` after each deploy.
- The current backend uses TSL Preetham-style sky math plus a small CPU LUT for
  readers. It is designed for stable low cost and WebGPU/WebGL2 compatibility,
  not physically exhaustive sky rendering or horizon-scale terrain occlusion.
- Time-of-day is scenario-driven, not a gameplay system with mission scheduling,
  darkness adaptation, or AI visibility effects.
- Human screenshot/playtest review is still required for visible atmosphere
  changes. Automated gates catch correctness and perf, not taste.

## Future Backends

- **Prebaked hybrid:** Hillaire-atmosphere-baked-to-cubemap every coarse time
  step plus PMREM IBL for weapons/vehicles and ground mist for jungle mood.
- **Fly-through cloud upgrade:** gate volumetric cloud raymarch on aircraft
  proximity to the cloud layer so ground combat pays no cost.
- **Full volumetric atmosphere:** deferred until combat120 frame-time tails and
  rendering scale work are in a better place.

## Perf Budget

- `AtmosphereSystem` sits in the existing `World` tracked group with
  `WeatherSystem` and `WaterSystem`.
- v1 target remains below roughly 0.3ms on mid-tier hardware for sky/fog/cloud
  updates.
- Any future backend that exceeds this needs its own tracked group or an
  explicit cadence/budget contract.

## References

- Cycle evidence: `docs/cycles/cycle-2026-04-20-atmosphere-foundation/` and
  `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/`.
- Current rearch directive: [SOL-1](directives/sol-1.md).
- Hosek & Wilkie, "An Analytic Model for Full Spectral Sky-Dome Radiance"
  (2012).
- Hillaire 2020, "A Scalable and Production Ready Sky and Atmosphere Rendering
  Technique."
- Schneider 2015, "The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn."
