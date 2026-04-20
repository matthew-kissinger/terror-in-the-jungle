# post-bayer-dither: 4×4 Bayer dither before 24-level color quantize

**Slug:** `post-bayer-dither`
**Cycle:** `cycle-2026-04-20-atmosphere-foundation` *(placeholder — confirm at cycle start)*
**Depends on:** nothing — independent of every other atmosphere task
**Blocks:** nothing
**Playtest required:** yes (game-feel observable: sky gradient, skin tones, fog falloff)
**Estimated risk:** low — single shader file, single uniform
**Budget:** ≤ 60 LOC
**Files touched:**

Modified: `src/systems/effects/PostProcessingManager.ts` (the quantize shader — single fragment-shader patch + a Bayer threshold matrix as a `const mat4` or texture lookup)

Do NOT touch: any other post-process pass, resolution scale, `scene.background` color, lighting, fog.

## Why this task exists

`PostProcessingManager.ts` currently quantizes to 24 levels per channel with a raw `floor(rgb * 24 + 0.5) / 24`. At 1/3-res pixelation that produces **visible banding** on any smooth gradient (sky, fog falloff, skin on NPCs). Adding a tiny ordered-dither offset before quantize breaks the banding into a retro-authentic stipple — makes the look MORE retro, not less. This is the highest visible-quality-per-line-of-code win available in the project right now.

Independent of the rest of the atmosphere work because it doesn't touch `AtmosphereSystem`, fog, or lighting — it just changes the final quantize math. Land it in parallel.

## Required reading first

- `src/systems/effects/PostProcessingManager.ts` — the full file is ~120 LOC; read it end to end. Focus on the quantize fragment shader (~line 69 area) and how `beginFrame` / `endFrame` bracket the low-res render target.
- `src/core/GameEngineLoop.ts` — where `beginFrame` / `endFrame` are invoked; confirm no other pass reads the pre-quantize low-res RT that would need a matching change.

## Target state

1. A 4×4 Bayer threshold matrix is embedded in the quantize fragment shader (either as a `const mat4` or a small lookup). Typical values scaled to `[0, 1)`:
   ```
   0/16, 8/16, 2/16, 10/16
   12/16, 4/16, 14/16, 6/16
   3/16, 11/16, 1/16,  9/16
   15/16, 7/16, 13/16, 5/16
   ```
2. Pre-quantize color is offset by `(bayer[frag.xy % 4] - 0.5) / 24` (one quantization step wide), then fed into the existing `floor(rgb * 24 + 0.5) / 24`.
3. Banding on gradients (sky dome, fog falloff, skin shadowing) is visibly broken up without losing the 24-level retro look.
4. No perf regression on the `World` or render budget. Dither is 3–5 shader ops — within noise.

## Steps

1. Read `PostProcessingManager.ts` end to end.
2. Add the Bayer matrix as a `const mat4` (or `const float[16]`) in the fragment shader source.
3. Add the pre-quantize offset. Keep the existing quantization math — the only change is what comes IN to `floor(...)`.
4. Spot-test: `npm run dev`, look at the skybox gradient (especially the horizon), look at distant fog falloff in `ashau`, look at NPC sprite shadowing. Banding should be visibly softened.
5. `npm run validate:fast` green.
6. Optional: capture a before/after screenshot pair for the cycle memo.

## Exit criteria

- The fragment shader contains a Bayer 4×4 matrix and a `(bayer - 0.5) / 24` pre-quantize offset.
- Gradient banding is visibly reduced in `combat120` and `ashau:short`.
- No `npm run test:run` regression; no knip or lint complaints.
- Playtest sanity: the retro pixelated look is preserved (the screenshots should still read as PS1/Genesis-era, not modern); dither softens without smoothing.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/post-bayer-dither/` in the same PR. Orchestrator gates merge on visual review.

Required shots (1080p or native res, no UI overlay if avoidable):

- `combat120-sky-gradient.png` — looking up at the sky dome from `combat120`. Frame should include the banding-prone zenith→horizon gradient.
- `ashau-distant-fog.png` — `ashau:short`, looking toward a distant treeline so fog falloff is the dominant gradient.

Capture mechanism is your call (Playwright MCP, manual browser, or extending `scripts/perf-capture.ts`). Use the same camera framing as the master baseline shots in `docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/_master/` if those exist; otherwise pick reasonable framing and document the camera coords in a tiny `README.md` next to the shots so the next reviewer can re-frame.

## Non-goals

- Do not swap to blue-noise dither (softer, modern look — doesn't match aesthetic).
- Do not add Floyd–Steinberg error diffusion (per-frame cost too high).
- Do not raise the quantization level from 24 to 32/48/64 — keep the constraint.
- Do not touch any other post-process pass or the 1/3-res pixelation scale.
- Do not add a SettingsManager toggle — dither is part of the committed look.

## Hard stops

- If the dither makes the output look smoother/modern rather than more retro, STOP and reconsider the Bayer pattern orientation or intensity. The goal is MORE retro authenticity, not less.
- If any test regresses, STOP.
