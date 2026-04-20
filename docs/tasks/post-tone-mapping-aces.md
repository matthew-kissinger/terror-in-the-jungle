# post-tone-mapping-aces: ACES tone-map before the 24-level quantize

**Slug:** `post-tone-mapping-aces`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P0 — blocks the per-preset TOD warmth from reading visually (cycle-2026-04-20 ship-gate captures showed all warm hues clipped to white).
**Playtest required:** YES (visual observable).
**Estimated risk:** low — single shader patch in `PostProcessingManager.ts`.
**Budget:** ≤ 80 LOC (shader + small uniform + one test).
**Files touched:**

- Modified: `src/systems/effects/PostProcessingManager.ts` (the quantize fragment shader at lines 63-85; insert ACES filmic tone-mapping before the Bayer dither + `floor(rgb * colorLevels)`).

Do NOT touch: any other post-process, the `pixelScale`, `colorLevels` constant, or the Bayer matrix.

## Why this task exists

Confirmed by reading `src/systems/effects/PostProcessingManager.ts` end-to-end: the post-process is `pixelation → 24-level quantize + Bayer dither` with NO tone-mapping. The Hosek/Preetham analytic sky from `cycle-2026-04-20` produces in-scattered light values brighter than 1.0 around the sun direction. With no tone-mapping, anything > 1.0 saturates to white before quantize.

Result (documented in `docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/_orchestrator/after-round-3/README.md`):
- Dawn / dusk / golden-hour shots read as noon — warm sun-direction hues clip to white.
- Distant terrain (under fog sampling sky horizon) reads as bright white.
- Vegetation may show different brightness than terrain because of differing material light response (separate task `vegetation-fog-parity` covers that).

ACES filmic curve compresses the [0, ∞) range into [0, 1] with a soft shoulder that preserves warm tints. Cheap (~5 ALU), no perf concern.

## Required reading first

- `src/systems/effects/PostProcessingManager.ts` end-to-end (~138 LOC, small file).
- `src/core/GameRenderer.ts` — confirm `renderer.toneMapping` is `THREE.NoToneMapping` (the post-process path runs after the renderer's own tone-map; we need to add it inside the blit shader, not via `renderer.toneMapping`).
- `docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/_orchestrator/after-round-3/README.md` — the ship-gate visual evidence that motivates this task.

## Target state

1. Inside the blit fragment shader (`PostProcessingManager.blitMaterial.fragmentShader`), add an ACES filmic tone-map function before the Bayer-dither + `floor(...)` step. Standard form:
   ```glsl
   vec3 acesFilm(vec3 x) {
     float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
     return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
   }
   ```
2. Apply: `color.rgb = acesFilm(color.rgb);` immediately after the `texture2D` read, BEFORE the dither offset and quantize.
3. Optional uniform: `uExposure` (default 1.0) multiplied into color before the tone-map, so future scenarios can dim/boost without touching the shader. Keep simple — don't add a SettingsManager toggle for v1.

## Steps

1. Read `PostProcessingManager.ts` end-to-end.
2. Add the `acesFilm` GLSL function and the call. ~10 lines of shader change + 1 uniform if you wire `uExposure`.
3. Boot `npm run dev`; verify warm dawn / dusk / golden-hour scenarios visibly read warm now (not white). Verify combat120 noon still reads as noon (not crushed dark).
4. Capture before/after PNGs at the same camera framings as the cycle-2026-04-20 ship-gate (use `scripts/capture-hosek-wilkie-shots.ts`).
5. `npm run validate:fast` green.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/post-tone-mapping-aces/`:

- `combat120-noon.png` — should still read as bright noon, not crushed.
- `ashau-dawn.png` — should now visibly read as a dawn (warm orange sky-side).
- `tdm-dusk.png` — should now visibly read as a dusk (warm orange).
- `zc-golden-hour.png` — golden-hour warm light should be visible, not clipped to white.

## Exit criteria

- ACES tone-map applied in `PostProcessingManager` blit fragment shader.
- Per-preset TOD warmth visibly reads in the screenshot evidence (dawn warmer than noon, dusk warmer than noon, golden-hour shows oblique warm light).
- No `npm run test:run` regression. `combat120` perf smoke within WARN bound.
- Bayer dither + 24-level quantize aesthetic preserved (still reads as PS1/Genesis-era retro).

## Non-goals

- Do not raise `colorLevels` above 24.
- Do not add a SettingsManager exposure slider.
- Do not switch to Reinhard / Hable — ACES is the simplest reliable choice.
- Do not touch `renderer.toneMapping` on the WebGLRenderer instance — the post-process pipeline owns the final color step.
- Do not address the "fog too white at distance" symptom directly here — that's `fog-density-rebalance`.

## Hard stops

- Fence change → STOP.
- Tone-mapping makes the retro look softer / more modern → STOP, reconsider exposure or curve. The retro stipple aesthetic is non-negotiable.
- Any test regresses → STOP.
