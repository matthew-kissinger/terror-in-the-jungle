# fog-density-rebalance screenshot evidence

Captured via `npx tsx scripts/capture-fog-density-rebalance-shots.ts` after
moving `fogDensity` into `AtmospherePreset` (see
`src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts`). Camera
framings for the clear-weather shots are byte-for-byte identical to
`capture-hosek-wilkie-shots.ts` so the reviewer can diff against the
`post-tone-mapping-aces` baseline from Round 1 of this cycle.

## What changed

Before: `GameRenderer.setupLighting` set a flat `0.004` exp-fog density
for every mode, with A Shau overriding to `0.001` via `configureForWorldSize`.
That was tuned for the legacy dark grey-green fog color. After
`atmosphere-fog-tinted-by-sky` landed, `fog.color` tracks the sky horizon
every frame — which is bright at noon and warm off-white at dawn/dusk.
The combination of the old density and the bright new color made distant
terrain saturate to flat white.

After: fog density lives alongside the sky preset as
`AtmospherePreset.fogDensity`. Each scenario tunes density against its
own time-of-day horizon:

| scenario      | density   | notes                                              |
|---------------|-----------|----------------------------------------------------|
| combat120     | 0.0022    | noon perf baseline; matches `GameRenderer` bootstrap |
| openfrontier  | 0.0022    | noon, same baseline                                |
| ashau         | 0.00055   | dawn, 4km draw distance, tall mountains            |
| zc            | 0.0024    | golden hour, moderate haze                         |
| tdm           | 0.0028    | dusk, turbidity 7, thicker haze                    |

`AtmosphereSystem.applyScenarioPreset` stamps `preset.fogDensity` onto
`renderer.fog.density` at scenario boot; `WeatherSystem.refreshAtmosphereBaseline()`
then re-reads that density so the weather multiplier (x1.5 rain, x3.5
storm) scales from the correct base instead of the composer-cached
default. The underwater override (hard clamp `0.04`, teal `0x003344`) is
unchanged.

## Compared against `post-tone-mapping-aces/`

- `combat120-noon.png` — post-tone-mapping showed a blue sky + saturated
  white/grey foreground terrain; the horizon line punched through the
  fog. After the density rebalance the foreground trees and terrain are
  clearly visible as trees and terrain; the distant haze reads as haze
  rather than white.
- `ashau-dawn.png` — the extreme 300m-altitude / 5deg-pitch pose is
  intentionally the hardest framing (the Hosek-Wilkie capture was tuned
  to emphasise the sky dome, not gameplay-height terrain). Density at
  `0.00055` is low enough that any terrain within ~1.5km reads through
  the warm haze; at this pose the DEM at world origin is valley floor,
  so most of the ground returns are at 3km+ and still tint warm-grey
  rather than white.
- `openfrontier-noon.png` — framing lands mostly above the horizon line
  so the shot is sky-dominated by design. The lower half reads as soft
  grey haze instead of pure white: the fog is still there, just no
  longer saturating.
- `combat120-storm.png` — fog is visibly thicker than clear (storm's
  `x3.5` multiplier on the new `0.0022` base = ~`0.0077`, roughly
  comparable to the legacy clear-weather density). Trees still visible
  in the foreground; lower frame washes into haze.
- `combat120-underwater.png` — teal underwater override preserved. Fog
  snaps to `0x003344` at density `0.04` regardless of sky state.

## How to reproduce

```
npm run build:perf
npx tsx scripts/capture-fog-density-rebalance-shots.ts
```

PNGs are written into this directory.
