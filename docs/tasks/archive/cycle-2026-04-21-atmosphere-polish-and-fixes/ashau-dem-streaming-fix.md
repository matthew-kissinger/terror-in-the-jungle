# ashau-dem-streaming-fix: A Shau Valley DEM not streaming; terrain renders flat

**Slug:** `ashau-dem-streaming-fix`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P0 — `ashau:short` is a baseline-refresh scenario AND a flagship "real terrain" content piece. Without working DEM, the mode is unplayable for its intended purpose.
**Playtest required:** YES (eyeball confirmation that A Shau Valley terrain has elevation).
**Estimated risk:** medium — terrain streaming pipeline.
**Budget:** ≤ 300 LOC.
**Files touched:**

- Investigate: `src/config/AShauValleyConfig.ts` (heightmapAsset path); `src/workers/terrain.worker.ts`; `src/systems/terrain/TerrainSystem.ts`; `src/systems/terrain/HeightmapGPU.ts`; the loader path between config → worker → GPU upload.
- Modify: whichever step in the loader pipeline silently fails / falls back to procedural noise.

## Symptoms (orchestrator playtest + executor reports 2026-04-20)

1. User playtest: "ashau mode... does not seem to actually have any terrain data rendered properly as it all seems to be just flat."
2. Three separate cycle-2026-04-20 executors flagged this independently:
   - `atmosphere-hosek-wilkie-sky` capture script: `Failed to load DEM terrain: RangeError: byte length of Float32Array should be a multiple of 4`.
   - `atmosphere-fog-tinted-by-sky` README: "DEM may still be streaming; the sky/fog seam is the artifact under review, not the terrain."
   - `atmosphere-sun-hemisphere-coupling` README: "a_shau_valley DEM heightmap is not shipped in `public/data/heightmaps/` on master."
3. `perf-baseline-refresh` executor: `ashau:short` capture had `movementTransitions=0`, `waypointReplanFailures=200`, `harness_min_shots_fired=0` over 180 s — bot dormant on flat geometry without navmesh elevation cues.

## Confirmed facts

- The DEM file IS present at `public/data/vietnam/big-map/a-shau-z14-9x9.f32` (verified 2026-04-20 via `ls`).
- `src/config/AShauValleyConfig.ts:84` references `path: 'data/vietnam/big-map/a-shau-z14-9x9.f32'`.
- DEM metadata: 2304×2304, 9 m/pixel, ~21 km coverage (per `AShauValleyConfig.ts:8-11`).
- Other scenarios (open_frontier / zone_control / tdm) use `public/data/heightmaps/<mode>-<seed>.f32` — different path pattern. Ashau uses the big-map path.

## Required reading first

- `src/config/AShauValleyConfig.ts` (full file).
- `src/config/gameModeTypes.ts:278-345` — heightmap config shape (note: ashau uses a different field than the seeded modes).
- `src/workers/terrain.worker.ts:384` area — heightmap loading.
- `src/systems/terrain/TerrainSystem.ts` and `src/systems/terrain/HeightmapGPU.ts` (`uploadDEM` at line 42).
- The error message hint: "byte length of Float32Array should be a multiple of 4" — Float32 is 4 bytes per element, so a non-multiple-of-4 byte length means the file fetch returned a partial / wrong-sized buffer. Common causes: HTTP returned an error page (HTML) instead of binary; or `arrayBuffer().byteOffset` was non-zero.

## Hypothesis (verify before fix)

Cheapest first:
1. Vite dev server doesn't serve `public/data/vietnam/big-map/*.f32` correctly (mime type or large-file handling). Test with `curl http://localhost:5173/data/vietnam/big-map/a-shau-z14-9x9.f32 | wc -c` — should be 2304 × 2304 × 4 = 21,233,664 bytes.
2. The fetch in the worker returns HTML 404 instead of the binary; the `Float32Array(buffer)` constructor then errors on the not-multiple-of-4 byte length.
3. The path resolution differs between dev (`vite preview`) and the perf harness (`vite preview --outDir dist-perf`); check whether the file is copied into the build output.
4. The DEM path config field differs from where the loader looks (e.g. config says `data/vietnam/...` but loader prepends `/data/heightmaps/`).

## Steps

1. Reproduce: `npm run dev`, select A Shau Valley. Confirm flat terrain. Open browser console, look for the RangeError.
2. Test the fetch directly via the Network tab. Confirm whether the file arrives as 21,233,664 bytes.
3. Trace the loader pipeline from config → worker request → arrayBuffer → Float32Array → uploadDEM.
4. Fix the broken step. Most likely: ensure the `public/data/vietnam/big-map/` directory is served by Vite + included in dist-perf builds.
5. Verify in dev + verify in `dist-perf` (the build the perf harness uses).
6. Re-run `npm run perf:capture:ashau:short` and confirm the bot moves (movementTransitions > 0, shots > 0).

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/ashau-dem-streaming-fix/`:

- `ashau-dawn-elevation.png` — A Shau Valley terrain showing visible ridgelines (not flat).
- `ashau-dawn-distance.png` — distant terrain showing valley walls.

## Exit criteria

- A Shau Valley terrain renders with real elevation in `npm run dev`.
- `npm run perf:capture:ashau:short` produces a capture where the bot reaches at least one objective (movementTransitions > 0).
- No "Failed to load DEM terrain" error in console.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not regenerate or downsize the DEM.
- Do not change the navmesh bake for ashau (separate task if it's broken on real elevation).
- Do not change the loading API contract — fix the broken step inside the existing pipeline.

## Hard stops

- Fence change → STOP.
- Fix requires changing the binary DEM file → STOP and surface (likely an asset issue, not code).
- Fix requires changing the world worker contract (terrain.worker.ts message types) → STOP and surface.
