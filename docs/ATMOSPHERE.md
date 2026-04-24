# Atmosphere System

Last updated: 2026-04-24

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
- Hemisphere, directional, water, terrain, and vegetation lighting now read from
  the same atmosphere snapshot.
- `HosekWilkieSkyBackend` owns the visible sky-dome cloud pass. It receives
  weather/scenario coverage from `AtmosphereSystem` and avoids the old finite
  cloud-plane horizon divider.
- `CloudLayer` still exists as legacy/prototype code, but `AtmosphereSystem`
  keeps its mesh invisible in the active runtime. Do not use the old plane as
  evidence that player-visible clouds are correct.
- `PostProcessingManager` applies ACES tone mapping before the 24-level quantize
  and Bayer dither pass so warm dawn/dusk colors survive the retro post chain.

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

The important invariant is that fog, ambient lighting, water, terrain, and
billboards all sample the same atmosphere state. Do not reintroduce independent
hardcoded sky/fog/light colors for local fixes.

## Current Limits

- Clouds are sky texture and lighting only. There is no volumetric scattering,
  collision, fly-through cloud interior, or aircraft-specific cloud lighting.
- Clouds are wired in all five current game modes through the sky dome. The old
  "one tile" report was valid for the former visible `CloudLayer` plane; that
  plane is now hidden. The visible sky shader now uses a seamless cloud-deck
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
- The current backend uses a CPU LUT and simplified Hosek-Wilkie/Preetham-style
  math. It is designed for stable low cost, not physically exhaustive sky
  rendering.
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
- Hosek & Wilkie, "An Analytic Model for Full Spectral Sky-Dome Radiance"
  (2012).
- Hillaire 2020, "A Scalable and Production Ready Sky and Atmosphere Rendering
  Technique."
- Schneider 2015, "The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn."
