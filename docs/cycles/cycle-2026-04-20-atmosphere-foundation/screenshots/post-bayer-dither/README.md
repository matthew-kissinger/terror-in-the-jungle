# Visual evidence — `post-bayer-dither`

Screenshots for the orchestrator's visual review of the
`task/post-bayer-dither` PR. The Bayer 4x4 ordered-dither offset is added
inside `PostProcessingManager`'s 24-level color quantize fragment shader
(`src/systems/effects/PostProcessingManager.ts`). Smooth gradients (sky
dome, fog falloff, dark night sky) that previously showed visible banding
should now show a retro ordered-stipple pattern instead.

## Files

| Filename | Capture | Scenario | Description |
|----------|---------|----------|-------------|
| `combat120-sky-gradient-master.png` | master baseline (pre-dither) | `ai_sandbox` | Camera lifted into the sky dome of the combat120 sandbox; raw 24-level quantize, gradient banding visible on the dark sky/water field |
| `combat120-sky-gradient.png` | post-dither | `ai_sandbox` | Same camera; Bayer offset breaks the banding into a 4x4 stipple |
| `ashau-distant-fog-master.png` | master baseline (pre-dither) | `a_shau_valley` | Looking ~horizontal, fog falloff is the dominant smooth gradient |
| `ashau-distant-fog.png` | post-dither | `a_shau_valley` | Same camera; ordered-dither stipple on the fog falloff and sky dome |

## Camera framings

Both shots were captured at 1920x1080 with HUD/UI hidden (CSS injection
in the capture script). The render path is the live engine path:
`PostProcessingManager.beginFrame` -> `renderer.render(scene, camera)` ->
`PostProcessingManager.endFrame`. The engine's RAF loop is paused before
the camera is reposed so the player camera system does not overwrite the
override.

| Slug | Mode | Position (x, y, z) | Yaw (deg) | Pitch (deg) | Notes |
|------|------|--------------------|-----------|-------------|-------|
| `combat120-sky-gradient` | `ai_sandbox` | `(0, 80, 0)` | `0` | `+65` | Looking up the sky dome; horizon low in frame so the zenith->horizon gradient is the dominant smooth surface. Per-run terrain seed is random, so foreground vegetation in the corner will vary; the sky dome itself is consistent. |
| `ashau-distant-fog` | `a_shau_valley` | `(0, 300, 0)` | `+90` | `-3` | Lifted to a generous ridgeline elevation, looking nearly horizontal toward the distant treeline. Fog falloff (sky -> mountain silhouette -> ground plane) is the dominant gradient. |

Rotation order is `YXZ` (yaw around Y, then pitch around X) — matches
`PlayerCamera`'s convention. Pitch positive = look up.

## Repro

The capture script lives at `scripts/capture-bayer-dither-shots.ts`. It
expects a current `dist-perf/` build (`npm run build:perf`), then:

```sh
npx tsx scripts/capture-bayer-dither-shots.ts --label master       # pre-dither baselines
npx tsx scripts/capture-bayer-dither-shots.ts --label post-dither  # after the dither change
```

The script boots `vite preview --outDir dist-perf` on port 9101, launches
headless Chromium at 1920x1080, starts each scenario via
`engine.startGameWithMode(...)`, hides the HUD via injected CSS, pauses
the engine loop, reposes the camera, runs a single
`PostProcessingManager`-bracketed render, and screenshots the viewport.

To re-capture a single shot, edit `shotPlans()` in the script and rerun.

## What to look for

In the post-dither images vs the master baselines:

1. The smooth dark field that was solid bands of color now shows the
   characteristic 4x4 Bayer stipple — a regular cross-hatched dot pattern
   that visually averages to the same color but breaks the eye's edge
   detection along quantization steps.
2. The PNG file size jumps significantly (e.g. ashau 28 KB -> 117 KB)
   because the dithered output is high-frequency noise that PNG cannot
   compress as aggressively. This is expected.
3. The retro pixelation is preserved — the dither sits at 1/24 of full
   intensity, so the 24-level palette and the 1/3-resolution chunky
   pixels are unchanged.
