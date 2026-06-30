# Orbital topo map — baked coarse DEMs (provenance)

The 3D orbital topographic map (`cycle-2026-06-29-orbital-topo-map`,
campaign Phase 5) CPU-displaces a coarse relief grid from a baked `.f32`.

These coarse DEMs are produced by `scripts/bake-topo-dem.ts`, which
**downsamples** the `.f32` DEMs already committed to the repo — no fresh
OpenTopography clip, no network, no credentials. Generated `.f32`/`.json`
carry **no SPDX header** (they are data, not source); their provenance is
recorded here and in [`THIRD-PARTY-ASSETS.md`](../../../THIRD-PARTY-ASSETS.md).

## Outputs

`public/data/heightmaps/<name>-topo-<size>.f32` (+ `.json` sidecar with
`gridSize` / `worldSize` / `minHeight` / `maxHeight` / `provenance`).

| Output base | Source DEM | Source license | Notes |
|-------------|------------|----------------|-------|
| `a-shau-topo-96` | `public/data/vietnam/big-map/a-shau-z14-9x9.f32` (2304², NASADEM) | **Public domain / CC0** (NASADEM, US-gov) | Source DEM git-ignored (large binary); baked topo may be absent in CI — the live runtime heightmap covers A Shau there. |
| `open_frontier-42-topo-96` | `public/data/heightmaps/open_frontier-42.f32` (1024²) | Original project work (procedural seed) | — |
| `zone_control-42-topo-96` | `public/data/heightmaps/zone_control-42.f32` (256²) | Original project work (procedural seed) | — |
| `tdm-42-topo-96` | `public/data/heightmaps/tdm-42.f32` (256²) | Original project work (procedural seed) | — |

## NASADEM license note

NASADEM (NASA SRTM-derived global DEM) is distributed without restriction as a
US-government work — treated here as **public domain / CC0**. No attribution is
required; no relicensing is applied or asserted. The downsampled A Shau topo is
a derived product of that public-domain source.

## Reproduce

```
npx tsx scripts/bake-topo-dem.ts            # bakes all present sources at 96²
npx tsx scripts/bake-topo-dem.ts --size 128 # finer relief grid
```

Sources whose `.f32` is absent on disk are skipped with a log line (A Shau in
CI). The seeded DEMs are committed, so CI always bakes those three.
