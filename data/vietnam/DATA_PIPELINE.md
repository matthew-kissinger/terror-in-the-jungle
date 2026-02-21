# Vietnam Terrain Data Pipeline

Last updated: 2026-02-21

## Objective

Support historical large-scale Vietnam maps (starting with A Shau Valley) using real elevation data and scalable runtime integration.

## Current Assets (In Repo)

- Primary A Shau DEM:
  - `data/vietnam/big-map/a-shau-z14-9x9.f32`
  - `2304 x 2304`, ~`9m/px`, ~`21km x 21km`
- Secondary wider coverage DEM:
  - `data/vietnam/big-map/a-shau-z13-7x7.f32`
  - `1792 x 1792`, ~`18m/px`, ~`33km x 33km`
- Metadata and preview heightmaps are present alongside DEM files.

## Runtime Integration (Current)

- A Shau mode uses DEM-driven height source in `src/config/AShauValleyConfig.ts`.
- Terrain provider path includes DEM support (`src/systems/terrain/DEMHeightProvider.ts`).
- War simulation and mode tuning are handled in A Shau game config and strategy systems.

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
- Commit only compact runtime-ready artifacts and metadata.
- Document source, license, and conversion method for each new dataset added.
