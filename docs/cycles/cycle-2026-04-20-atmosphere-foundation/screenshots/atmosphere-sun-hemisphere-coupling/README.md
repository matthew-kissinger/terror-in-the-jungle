# atmosphere-sun-hemisphere-coupling — screenshot evidence

Cycle: `cycle-2026-04-20-atmosphere-foundation`
Task brief: [`docs/tasks/atmosphere-sun-hemisphere-coupling.md`](../../../../tasks/atmosphere-sun-hemisphere-coupling.md)

## What this PR changes

`AtmosphereSystem` now owns the directional "moon" light direction + color
and the hemisphere sky/ground tint. Each frame, `AtmosphereSystem.update()`
pushes its backend-driven state onto `renderer.moonLight` and
`renderer.hemisphereLight`. `WaterSystem` consults the same
`ISkyRuntime.getSunDirection()` for its sun reflection vector. Weather
intensity multipliers still layer on top: the lighting order each frame is
`atmosphere base color + direction` → `weather intensity multiplier` →
`lightning flash / underwater override`.

`freezeTransform(moonLight)` and `freezeTransform(hemisphereLight)` have
been removed from `GameRenderer.setupLighting()`.

## What these shots are (and aren't)

The Round 2 task `atmosphere-hosek-wilkie-sky` (which produces actual
per-scenario sun directions via the Hosek-Wilkie analytic model) has
**not** yet landed on master. On master, the default `NullSkyBackend`
returns a single static sun direction + color regardless of scenario.

To verify the coupling wiring this PR introduces, the capture script
([`scripts/capture-sun-hemisphere-coupling-shots.ts`](../../../../../scripts/capture-sun-hemisphere-coupling-shots.ts))
injects a **test `ISkyBackend`** per shot with a distinct sun direction,
sun color, and hemisphere zenith/horizon. If the wiring is correct,
`moonLight.position + .color` and `hemisphereLight.color + .groundColor`
track the injected values each frame. If the wiring is broken, the shots
would all look identical (stuck on whatever `NullSkyBackend` returned).

Once `atmosphere-hosek-wilkie-sky` merges, the same wiring produces the
same per-scenario visual distinction without any injection — the real
backend provides the distinct direction/color values that my injected
test backend is standing in for here.

The scenes are intentionally dark / low-contrast because:

1. The scene background and fog color on master are still the legacy
   `0x5a7a6a` (muted green-grey). `atmosphere-fog-tinted-by-sky`
   (Round 3, parallel task) replaces the constant fog color with a
   sky-sampled tint.
2. Without the Hosek-Wilkie sky dome, the skybox sphere still uses its
   legacy equirect PNG. The game generally reads low-light until that
   dome lands.
3. The 24-level color quantize in `PostProcessingManager` collapses
   gradient steps aggressively in dim scenes.

## Shots

All shots are 1920×1080, captured from the `vite preview --outDir dist-perf`
harness with the HUD hidden and the engine loop stopped after the camera
is posed.

### `ashau-dawn-shadow.png`

- Scenario: `a_shau_valley`
- Camera pose: position `(40, 12, 10)`, yaw `-10°`, pitch `-6°`
- Injected sun: azimuth east-southeast (+X), elevation ~10°, warm amber
  color `0xffb074`, hemisphere zenith `0x5e7fae` (pre-dawn blue),
  horizon `0xd89a6a` (peach).
- Framed subject: the valley-floor terrain + silhouetted ridgeline in the
  mid-distance. Because `a_shau_valley`'s DEM heightmap is not shipped in
  `public/data/heightmaps/` on master (see capture console log:
  `Failed to load DEM terrain`), the scene uses its fallback terrain —
  still usable for reviewing the atmosphere direction.
- Reviewer checks: directional light is coming from the RIGHT (+X side)
  of the frame; any shadow-casting geometry on the ridgeline projects
  shadow toward the LEFT (-X) side. Horizon band is warmer than the sky
  above it (peach-ish vs blue-grey), confirming the hemisphere palette
  comes from the injected zenith/horizon pair.

### `openfrontier-noon-water.png`

- Scenario: `open_frontier`
- Camera pose: position `(10, 1.5, 0)`, yaw `90°`, pitch `-22°`
- Injected sun: near-zenith (elevation ~72°), bright neutral
  `0xfff5d8`, hemisphere zenith `0x4a7bbd` (saturated midday blue),
  horizon `0xa4b8c6` (hazy pale).
- Framed subject: the water plane (open frontier ships a water body at
  y=0) viewed from just above the waterline.
- Reviewer checks: sun specular highlight on the water tracks the injected
  high-noon sun direction (visible near-center of frame rather than at a
  low angle). `WaterSystem.sun` is now hooked to
  `AtmosphereSystem.getSunDirection()`; if the wiring were broken, the
  specular would stick at the original stub position `(0, 0, 0)` and
  never appear at all.

### `tdm-dusk-shadow.png`

- Scenario: `tdm`
- Camera pose: position `(-15, 8, 0)`, yaw `90°`, pitch `-10°`
- Injected sun: low-west (-X, elevation ~6°), deep orange `0xff7a3a`,
  hemisphere zenith `0x2e3f6b` (deep evening blue), horizon `0xd67743`
  (burnt orange).
- Framed subject: compact arena terrain with ridgeline silhouette.
- Reviewer checks: directional light is coming from the LEFT (-X side)
  of the frame; shadow-casting terrain projects shadow toward the RIGHT
  (+X). Horizon band is a distinct warm orange. Compare against
  `ashau-dawn-shadow.png`: that shot has a warmer LEFT side (dawn sun
  from +X casts light on the east face), this one has a warmer RIGHT side
  (dusk sun from -X casts light on the west face) — they are
  directionally inverted, which is the coupling-is-working signal.

### `combat120-storm.png`

- Scenario: `ai_sandbox`
- Camera pose: position `(0, 4, 0)`, yaw `0°`, pitch `-2°`
- Injected sun: high-noon, overcast grey `0xbcc0c4`, hemisphere zenith
  `0x3a4450` (stormcloud), horizon `0x4a5660`.
- Weather: `storm` forced via
  `weatherSystem.setWeatherConfig({enabled: true, initialState: 'storm', …})`
  then `setWeatherState('storm', instant=true)`.
- Reviewer checks:
  - The scene is visibly dimmer than the three clear-weather shots,
    confirming the weather intensity multiplier (moon×0.3,
    hemisphere×0.4, ambient×0.4) still applies AFTER the
    atmosphere-driven base color.
  - Shadows, while subtle, are still present — the storm multiplier
    dimming sun INTENSITY does not zero it out. If the ordering were
    reversed (weather applied FIRST, atmosphere overwriting it), the
    storm multiplier would not be visible in the final output.
  - Fog color in this shot is still the legacy `0x5a7a6a` green-grey
    (the parallel task `atmosphere-fog-tinted-by-sky` owns fog color
    and lands in the same round — any fog tint improvements will show
    up in that PR's shots, not this one).

## Known limitations in these shots

- **Dark scenes**: as described above. Not a regression.
- **`a_shau_valley` DEM failure**: `public/data/heightmaps/a_shau_valley-*.f32`
  is not committed in master. The ashau shot falls back to the
  procedural heightmap. The atmosphere-direction signal is still visible
  in the scene silhouette.
- **No per-scenario TOD without hosek-wilkie**: this PR's gate is the
  WIRING (direction/color flow atmosphere → renderer/water), not the
  physical sky model. The hosek-wilkie PR's shots and this PR's shots
  taken together validate the full chain.

## How to recapture

```
# From the repo root, after `npm run build:perf` has produced dist-perf/
npx tsx scripts/capture-sun-hemisphere-coupling-shots.ts
```

The script auto-builds `dist-perf` if missing. Total run time on the dev
PC is ~90s (four mode boots + 1.5s settle each + 2× render per shot).
