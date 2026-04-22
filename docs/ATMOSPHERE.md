# Atmosphere System

Last updated: 2026-04-21

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
- `CloudLayer` provides a high-altitude procedural cloud band with weather-
  driven coverage changes. It is a flat layer with shader detail, not a
  fly-through volumetric cloud volume.
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

- Clouds are an overhead layer. Pilots can fly near/through the altitude band,
  but there is no volumetric scattering, collision, or cloud interior lighting.
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
