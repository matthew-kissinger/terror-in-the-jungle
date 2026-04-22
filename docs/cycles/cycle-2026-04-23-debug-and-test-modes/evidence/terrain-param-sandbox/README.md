# terrain-param-sandbox — evidence

The sandbox is a dev-only, DEV-gated scene. To capture screenshots:

1. `npm run dev`
2. Open `http://localhost:5173/?mode=terrain-sandbox`
3. Tweakpane panel appears top-right; overlay with params + stats top-left.
4. Tune params, hit **Export heightmap** to download `.f32 + .png + .json`.
5. Hit **Copy MapSeedRegistry entry** to paste a literal into `src/config/MapSeedRegistry.ts`.

## Suggested capture configs

- **Rolling hills** (default): seed 42, octaves 5, frequency 0.0015, amplitude 120, warp 0.
- **Ridged mountains**: seed 777, octaves 7, frequency 0.0020, lacunarity 2.5, persistence 0.6, amplitude 220, warp 0.
- **Warped badlands**: seed 2718, octaves 5, frequency 0.0018, amplitude 160, warpStrength 60, warpFrequency 0.003.

Each config should produce a visibly different terrain. Toggle the `normals` preview for
surface-orientation debugging and `wireframe` for mesh density inspection.

## Artifacts

Screenshots committed alongside this README:

- `config-1-rolling-hills.png`
- `config-2-ridged-mountains.png`
- `config-3-warped-badlands.png`

Running under the headless executor that opened this PR, the WebGL scene
cannot be captured to disk. The follow-up playtest pass should replace these
placeholders with live captures.
