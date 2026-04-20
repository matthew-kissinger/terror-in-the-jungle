# Visual evidence — `atmosphere-fog-tinted-by-sky`

Screenshots for the orchestrator's visual review of the
`task/atmosphere-fog-tinted-by-sky` PR. Each frame documents one of the
exit criteria from `docs/tasks/atmosphere-fog-tinted-by-sky.md`:

1. Seam-gone diff against `atmosphere-hosek-wilkie-sky/`
   (combat120-noon, ashau-dawn, tdm-dusk).
2. Storm weather visibly darkens the fog while the sky still tracks the
   analytic dome (combat120-storm).
3. Underwater override hard-pins fog to teal `0x003344` regardless of
   the sky (combat120-underwater).

## Files

| Filename | Scenario | Override | What the reviewer should see |
|----------|----------|----------|------------------------------|
| `combat120-noon.png` | `ai_sandbox` | none | Same framing as `atmosphere-hosek-wilkie-sky/combat120-noon.png`. The hard seam the previous PR exposed between the analytic dome and the constant-color `FogExp2` is gone — fog blends smoothly into the horizon. |
| `ashau-dawn.png` | `a_shau_valley` | none | Same framing as `atmosphere-hosek-wilkie-sky/ashau-dawn.png`. Warm horizon (preset sun at ~27° azimuth, low elevation) bleeds continuously into fog. DEM may still be streaming; the sky/fog seam is the artifact under review, not the terrain. |
| `tdm-dusk.png` | `tdm` | none | Hardest color match: TDM dusk preset (sun at ~198° azimuth, low elevation, heavy haze). Post-processing (24-level color quantize + Bayer dither) pushes bright horizon in-scatter toward white — but the fog still matches. The combat silhouettes in frame are expected (TDM starts a live match immediately). |
| `combat120-storm.png` | `ai_sandbox` | `WeatherState.STORM` forced via `weatherSystem.setWeatherState('storm', true)` | Fog is visibly darker than `combat120-noon.png` while still color-matched to a darkened sky horizon. The sky dome itself does not change — atmosphere owns only the horizon sample; the storm multiplier (~0.45) lives on the atmosphere's `fogDarkenFactor`. |
| `combat120-underwater.png` | `ai_sandbox` | `weatherSystem.setUnderwater(true)` | Fog snaps to `0x003344` (teal) at density `0.04`. Terrain below the horizon is nearly black because of the density jump. Sky dome above the horizon is still the analytic dome — the underwater override only pins the fog, not the sky, which matches the brief's "takes priority over sky-sampled color" requirement. |

## Camera framings

All shots captured at 1920x1080 via `scripts/capture-fog-tinted-by-sky-shots.ts`.

Framings for `combat120-noon`, `ashau-dawn`, and `tdm-dusk` are
byte-for-byte identical to the Hosek-Wilkie PR's shots (same
`poseTowardSun(...)` azimuths, positions, pitches) so the reviewer can
diff the two PNGs directly to see "seam present" → "seam gone".

| Slug | Mode | Position (x, y, z) | Sun azimuth | Pitch (deg) |
|------|------|--------------------|-------------|-------------|
| `combat120-noon` | `ai_sandbox` | `(0, 80, 0)` | `pi * 0.25 = 45°` | `+20` |
| `ashau-dawn` | `a_shau_valley` | `(0, 300, 0)` | `pi * 0.15 = 27°` | `+5` |
| `tdm-dusk` | `tdm` | `(0, 80, 0)` | `pi * 1.1 = 198°` | `+8` |
| `combat120-storm` | `ai_sandbox` | `(0, 80, 0)` | `pi * 0.25 = 45°` | `+20` |
| `combat120-underwater` | `ai_sandbox` | `(0, 80, 0)` | `pi * 0.25 = 45°` | `+20` |

Rotation order `YXZ` (yaw around Y, then pitch around X), matching
`PlayerCamera`'s convention; yaw is derived from the preset sun azimuth
via `atan2(cos(az), -sin(az))`.

## Repro

```sh
npm run build:perf
npx tsx scripts/capture-fog-tinted-by-sky-shots.ts
```

The script boots `vite preview --outDir dist-perf` on port 9103, launches
headless Chromium at 1920x1080, starts each scenario via
`engine.startGameWithMode(...)`, dismisses the mission briefing if
present, and then applies per-shot overrides before posing the camera and
snapping. Overrides:

- `storm` → `weatherSystem.setWeatherState('storm', true)` (instant
  transition so the fog-darken intent lands immediately).
- `underwater` → `weatherSystem.setUnderwater(true)`.

## What to look for

In the post-change images vs the master baselines in
`../atmosphere-hosek-wilkie-sky/`:

1. **Seam-gone** (combat120-noon, ashau-dawn, tdm-dusk): the terrain
   edge no longer punches a hard line through the dome gradient. The
   `HosekWilkieSkyBackend`'s horizon-ring average is now the fog color,
   so any view direction with `view.y ≈ 0` reads the same color from
   both surfaces.
2. **Weather modulation** (combat120-storm): fog is visibly darker than
   the clear shot. The sky dome is intentionally unchanged — the storm
   multiplier acts only on fog; any future "storm darkens the sky"
   effect belongs with the atmosphere backend, not fog.
3. **Underwater override** (combat120-underwater): fog is hard-pinned
   to teal `0x003344` with density `0.04`. This is a priority override
   over the sky sample (per the brief's "takes priority over
   sky-sampled color" contract) — the sky dome itself is irrelevant to
   the underwater effect.

## Known artifacts (not regressions)

- The 24-level color quantize + Bayer dither in `PostProcessingManager`
  compresses bright horizon in-scatter toward white, so dusk / golden
  hour fog reads more "bright" than "warm". This is inherited from the
  previous PR (`atmosphere-hosek-wilkie-sky`) and out of scope here.
- The A Shau Valley shot may show no terrain if the DEM has not
  streamed in during the 8-second settle. The sky/fog seam — the
  artifact under review — is visible regardless.
- TDM shows active combatants/tracers. The scenario boots straight into
  a live match; the fog/sky diff is still readable around them.
