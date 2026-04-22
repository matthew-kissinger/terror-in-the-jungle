# Vietnam Terrain Data Pipeline

Last updated: 2026-04-21

## Objective

Support historical large-scale Vietnam maps (starting with A Shau Valley) using real elevation data and scalable runtime integration.

## Current Assets

- Primary A Shau DEM (local source/runtime copy, gitignored):
  - `data/vietnam/big-map/a-shau-z14-9x9.f32`
  - `public/data/vietnam/big-map/a-shau-z14-9x9.f32`
  - `2304 x 2304`, ~`9m/px`, ~`21km x 21km`
- Primary A Shau river overlay:
  - source: `data/vietnam/reference/a-shau-rivers.json`
  - local runtime copy: `public/data/vietnam/a-shau-rivers.json`
- Secondary wider coverage DEM (local data pipeline, gitignored):
  - `data/vietnam/big-map/a-shau-z13-7x7.f32`
  - `1792 x 1792`, ~`18m/px`, ~`33km x 33km`
- Production delivery target:
  - Cloudflare R2 bucket with content-addressed object keys
  - custom domain attached to the bucket so Cloudflare Cache can serve terrain
    and model data globally
  - generated manifest in the Pages app shell that maps logical asset IDs to
    immutable R2 URLs
  - see `docs/CLOUDFLARE_STACK.md`
- Metadata and preview heightmaps are present alongside source DEM files.

## Runtime Integration (Current)

- A Shau mode uses DEM-driven height source in `src/config/AShauValleyConfig.ts`.
- Terrain provider path includes DEM support (`src/systems/terrain/DEMHeightProvider.ts`).
- War simulation and mode tuning are handled in A Shau game config and strategy systems.
- Local development serves the runtime copies from `public/data/vietnam/`.
- Production should not rely on those gitignored public files being present in a
  fresh GitHub Actions checkout. The deploy path should upload large runtime
  assets to R2 and build the app against the generated R2 manifest.

## Known Data Limitations

- Current DEM source behaves like DSM in dense jungle in places (canopy bias risk).
- No finalized vegetation-class, hydrology, or historical infrastructure overlays yet.

## Next Data Steps

1. Validate bare-earth replacement candidate (FABDEM or equivalent) for ground-truth improvement.
2. Add lightweight derived layers from DEM (slope/relief classes) for vegetation zoning.
3. Integrate river network mask (HydroRIVERS/Hydroviet) for terrain carving and water placement.
4. Add curated historical POI set (LZ/firebases/objectives) for scenario flow.

## Processing Contract

- Keep raw downloads outside runtime-critical paths where possible.
- Commit only compact metadata and reproducible manifests. Large terrain/model
  payloads belong in R2 or another object store, with content-addressed keys
  and explicit upload validation before Pages deploy.
- Document source, license, and conversion method for each new dataset added.
