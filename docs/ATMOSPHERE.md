# Atmosphere System — Design & Roadmap

Last updated: 2026-04-19

Design reference for the sky / sun / fog / cloud / ambient stack. Task briefs in `docs/tasks/atmosphere-*.md` implement the v1 foundation described here.

## Why this exists

The current atmosphere is a grab-bag:

- `Skybox.ts` — 500-unit camera-following sphere with a **static equirectangular texture**.
- `GameRenderer.setupLighting()` — three `freezeTransform`-locked lights (ambient, directional "moon", hemisphere). Never animated.
- `GameRenderer` fog — `FogExp2` with a single hardcoded color (`0x5a7a6a`). Horizon seam hides *today* only because the skybox tint and fog color happen to match; any sky animation breaks that invariant.
- `WeatherAtmosphere.ts` — mutates the above via **scalar multipliers on intensity**. Weather is doing tuning-knob work on a static scene rather than driving a real atmosphere model.
- `WaterSystem` — has a stub `sun` vector that is initialized to the origin and never updated.
- `PostProcessingManager.ts` — 1/3-res pixelation + 24-level color quantize in one custom pass. Visible color banding on sky gradients is the main artifact.
- `SystemInterfaces.ts` — no `ISkyRuntime` / `ICloudRuntime` fence. `Skybox` is unfenced.

Fixed-wing aircraft shipped (B1 airframe, 2026-04-18). Pilots climb toward the 500-unit skybox dome. The existing setup cannot credibly support more flying, more jungle-mood work (dawn patrols, golden-hour objectives), or the P2-roadmap "day/night cycle".

## Shape: Combo G architecture, Combo A first backend

- **Fence addition, not modification.** Add `ISkyRuntime` and `ICloudRuntime` to `src/types/SystemInterfaces.ts`. This is an INTERFACE ADDITION — no existing fenced interface changes, so no `[interface-change]` PR title is required (see `docs/INTERFACE_FENCE.md`).
- **New `AtmosphereSystem`** at `src/systems/environment/AtmosphereSystem.ts` implements `ISkyRuntime` + hooks `IGameRenderer` ambient/directional/hemisphere lights and fog. Pluggable `ISkyBackend` internally.
- **First backend (v1): Combo A.** Hosek-Wilkie analytic sky dome + sun color from transmittance + hemisphere from sky zenith/horizon samples + sky-tinted fog color + per-scenario time-of-day preset table.
- **WeatherSystem keeps its role** but shifts from mutating `GameRenderer.fog/ambientLight/moonLight` directly to mutating `AtmosphereSystem` state (coverage, turbidity, sun-occlusion). One source of truth.
- **`Skybox.ts` deprecates** — kept for one release with a deprecation log; `AtmosphereSystem` owns the dome.

## Immediate wins (ship alongside v1)

1. **Bayer 4×4 dither before 24-level color quantize.** 3 shader ops in `PostProcessingManager.ts`. Kills gradient banding; makes the retro look *more* retro, not less. Highest visible-quality ROI in the project. Own task: `post-bayer-dither`.
2. **Fog color = sky color at view direction.** ~20 lines. Eliminates the hard horizon wall permanently. Covered by `atmosphere-fog-tinted-by-sky`.
3. **Hemisphere color from sky zenith/horizon samples.** ~10 lines of uniform update per frame. Ambient finally belongs to the sky. Covered by `atmosphere-sun-hemisphere-coupling`.
4. **Sun color from atmospheric transmittance.** Free once Hosek-Wilkie is in — sun color samples the sky model at the sun direction. Dawn/sunset "for free."
5. **Dynamic sun direction via per-scenario TOD preset table.** `MapSeedRegistry`-style static table — `ashau = dawn`, `openfrontier = noon`, `tdm = dusk`, `zc = golden hour`. No live cycle in v1.

## Future backends (not v1)

- **Combo E (prebaked hybrid, v2):** Hillaire-atmosphere-baked-to-cubemap every 30s of sim time + PMREM IBL for weapons/vehicles + low ground mist (y<30m volumetric raymarch, jungle-visibility gameplay). Swap by `AtmosphereSystem` backend; `ISkyRuntime` does not change.
- **Combo F (fly-through only, v3):** gate volumetric cloud raymarch on aircraft proximity to the cloud layer using `VehicleAdapter`. Ground combat pays zero; pilots get real 3D clouds.
- **Combo C (full Nubis, far horizon):** considered out of scope until the ECS rearch track closes and combat120 lands inside 16ms p99 on mid-tier.

## Perf budget

- `AtmosphereSystem` sits in the existing `World` tracked group (1.0ms total including `WeatherSystem`).
- v1 Combo A is analytic + texture lookups — budget impact target ≤ 0.3ms on mid tier.
- Any future backend that exceeds this gets its own tracked group and a budget-aware step count via `SystemUpdater`'s EMA hook.

## Interface sketch (informational — final API in the fence brief)

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

The `*ColorAtDirection` sampler is the seam the fog shader reads each frame — the single trick that makes the horizon disappear.

## References

- Agent design-space report captured in conversation 2026-04-19 (Combo A / E / F / G axes, free-trick ROI).
- Hosek & Wilkie, "An Analytic Model for Full Spectral Sky-Dome Radiance" (2012).
- Hillaire 2020, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique."
- Schneider 2015, "The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn" (for v2/v3 planning).
