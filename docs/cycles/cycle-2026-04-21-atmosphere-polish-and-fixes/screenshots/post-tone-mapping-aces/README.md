# post-tone-mapping-aces screenshot evidence

Captured via `npx tsx scripts/capture-hosek-wilkie-shots.ts --label post` at
the framings inherited from `cycle-2026-04-20-atmosphere-foundation`, with
the ACES tone-map patch applied to
`src/systems/effects/PostProcessingManager.ts`.

Compared against the pre-change baseline in
`docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/_orchestrator/after-round-3/`:

- `combat120-noon.png` — still reads as bright noon (no crushing), terrain +
  vegetation contrast preserved. The PS1/Genesis dither aesthetic is
  unchanged.
- `ashau-dawn.png` — previously clipped to pure white at ground + horizon
  (the baseline had blown-out white filling most of the frame). With ACES
  applied the horizon now holds a warm-side gradient and the ground
  returns a haze-grey instead of saturating to 1.0.
- `tdm-dusk.png` — previously clipped to a bright blue-white horizon with
  white-saturated water. Post-ACES the sky horizon holds a softer teal
  gradient and the water reads as haze rather than pure white.
- `zc-golden-hour.png` — previously clipped to pure white above the
  horizon line. Post-ACES the sky gradient is visible from zenith teal
  down to a soft grey-pink haze. Residual fog desaturation at the horizon
  is tracked by `fog-density-rebalance` (Round 2) — ACES unclips the HDR
  input; fog density controls how far that tint propagates along the
  view ray.

## What is fixed

The 24-level color quantize floor no longer uniformly rounds near-1.0
warm hues to white. ACES compresses the HDR Hosek-Wilkie in-scattering
around the sun direction into [0, 1] with a soft shoulder before the
Bayer dither + quantize pass.

## What is not fixed here (by design)

- "Fog looks too white at distance" — that is the
  `fog-density-rebalance` task. ACES does not control fog density along
  the view ray; it only prevents the post-process from crushing
  in-scattered sun light.
- Vegetation vs terrain brightness parity — that is
  `vegetation-fog-and-lighting-parity`.

## How to reproduce

```
npm run build:perf
npx tsx scripts/capture-hosek-wilkie-shots.ts --label post
```

The capture script writes into
`docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/atmosphere-hosek-wilkie-sky/`.
The four shots required by this task were copied from there into this
directory (the previous-cycle directory was restored via
`git checkout --` so its historical evidence is preserved).
