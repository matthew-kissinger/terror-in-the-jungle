# Visual evidence — `atmosphere-hosek-wilkie-sky`

Screenshots for the orchestrator's visual review of the
`task/atmosphere-hosek-wilkie-sky` PR. The shots replace the legacy
flat-PNG `Skybox` with the analytic Hosek-Wilkie (Preetham fallback —
see `hosekWilkie.glsl.ts` long note) sky-dome backend that ships with
`AtmosphereSystem` this round.

## Files

| Filename | Capture | Scenario | Description |
|----------|---------|----------|-------------|
| `combat120-noon.png` | post | `ai_sandbox` | combat120 perf-harness preset (noon, perf-neutral) — analytic dome with deep zenith gradient + foreground vegetation pop. |
| `ashau-dawn.png` | post | `a_shau_valley` | A Shau Valley dawn-patrol preset (low warm sun, moderate haze). DEM may not have streamed in this run; the sky dome itself is the artifact under review. |
| `openfrontier-noon.png` | post | `open_frontier` | Open Frontier high-noon preset (~76deg sun, low turbidity) — deep saturated zenith blue + smooth horizon transition. |
| `tdm-dusk.png` | post | `tdm` | TDM dusk preset (~6deg sun, heavy haze). Aimed at the sun azimuth so the horizon halo + wet-screen reflection both land in frame. |
| `zc-golden-hour.png` | post | `zone_control` | Zone Control golden-hour preset (~22deg sun, moderate turbidity) — oblique warm light over coastline. |

The matching pre-cycle baselines (legacy flat-PNG skybox) live in
`../_master/<scenario>-master.png`. Only `combat120` had an existing
historical perf-harness reference (`_master/combat120-2026-04-19.png`);
the executor captured fresh master baselines for `ashau`, `openfrontier`,
`tdm`, and `zc` as part of this PR.

## Camera framings

All shots captured at 1920x1080 with HUD/UI hidden via injected CSS.
Render path is the live engine pipeline:
`PostProcessingManager.beginFrame` → `renderer.render(scene, camera)`
→ `PostProcessingManager.endFrame`. Engine RAF is paused before
re-posing so the per-frame system loop does not overwrite the
override; the legacy `Skybox.updatePosition` and
`AtmosphereSystem.syncDomePosition` are both called manually so the
dome stays glued to the camera for the snap.

Each shot's yaw is derived by `poseTowardSun(azimuth, ...)` — i.e.
the camera looks at the sun direction the matching scenario preset
chose, so the warm horizon halo (and, when not clipped by
post-processing, the sun disc itself) lands centred in the frame.

| Slug | Mode | Position (x, y, z) | Sun azimuth (preset) | Pitch (deg) |
|------|------|--------------------|----------------------|-------------|
| `combat120-noon` | `ai_sandbox` | `(0, 80, 0)` | `pi * 0.25 = 45deg` | `+20` |
| `ashau-dawn` | `a_shau_valley` | `(0, 300, 0)` | `pi * 0.15 = 27deg` | `+5` |
| `openfrontier-noon` | `open_frontier` | `(0, 120, 0)` | `pi * 0.25 = 45deg` | `+25` |
| `tdm-dusk` | `tdm` | `(0, 80, 0)` | `pi * 1.1 = 198deg` | `+8` |
| `zc-golden-hour` | `zone_control` | `(0, 100, 0)` | `pi * 0.78 = 140deg` | `+12` |

Rotation order is `YXZ` (yaw around Y, then pitch around X) — matches
`PlayerCamera`'s convention. Pitch positive = look up. Azimuth
azimuthRad → engine yaw is computed as `atan2(cos(az), -sin(az))`
because the Three.js camera's forward at yaw=0 is `-Z` while the
preset places the sun at world-space `(cos(az), _, sin(az))`.

## Repro

The capture script lives at `scripts/capture-hosek-wilkie-shots.ts`.
It expects a current `dist-perf/` build (`npm run build:perf`), then:

```sh
npx tsx scripts/capture-hosek-wilkie-shots.ts --label master  # pre-change baselines
npx tsx scripts/capture-hosek-wilkie-shots.ts --label post    # after the dome change
```

The script boots `vite preview --outDir dist-perf` on port 9102,
launches headless Chromium at 1920x1080, starts each scenario via
`engine.startGameWithMode(...)`, hides the HUD via injected CSS,
pauses the engine loop, reposes the camera toward the preset sun
direction, runs a single `PostProcessingManager`-bracketed render,
and screenshots the viewport.

To re-shoot a single scenario, edit `shotPlans()` in the script and
rerun.

## What to look for

In the post-change images vs the master baselines:

1. **Real zenith→horizon gradient** instead of the static dark
   stormy-cloud equirectangular PNG. Each scenario shows a smooth
   transition from a deep zenith blue down to a brighter, paler
   horizon halo — analytic radiance, not a sampled texture.
2. **Sun direction is implied** by the brightest patch on the horizon
   line (where in-scattering peaks).
3. **Per-scenario differentiation** — noon shots (combat120,
   openfrontier) show deeper, more saturated zenith blue; lower-sun
   shots (ashau dawn, zc golden hour, tdm dusk) push the horizon
   halo wider and brighter.
4. **Expected artifact: hard horizon seam.** Where the analytic sky
   meets the constant-color `FogExp2`, there's a visible discontinuity
   (most obvious in `openfrontier-noon` and `combat120-noon`). This is
   the seam `atmosphere-fog-tinted-by-sky` fixes next round. Not a
   regression; documented in the task brief.
5. **Expected artifact: warm hues compressed.** The post-process
   pipeline (24-level color quantize + Bayer dither, no tone-mapping)
   clips bright sun-direction in-scattering toward white, so dusk /
   golden hour read more "bright" than "warm". Sun-color differentiation
   is still observable in `getSunColor` consumers (verified by
   `HosekWilkieSkyBackend.test.ts`); it just doesn't shine through the
   post-process clamp in these dome-only shots.
