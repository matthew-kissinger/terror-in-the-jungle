# Mode Startup Terrain Bake Spike

Last verified: 2026-05-13

Branch: `task/mode-startup-terrain-spike`

## Summary

The mode-selection stall reported on 2026-05-13 was not a Recast WASM or
Cloudflare cache regression. Live cache headers for content-hashed build assets,
Recast WASM, and prebaked navmesh were already correct. The startup probe showed
the mode-click path was blocked by synchronous terrain surface baking after mode
selection.

This spike moves that terrain surface work out of the mode-click main-thread
path using existing browser primitives:

- Vite-bundled module Web Workers.
- Transferable `ArrayBuffer` payloads for height and normal grids.
- Serializable terrain provider configs.
- One batched `TerrainSystem.configureModeSurface(...)` call instead of a chain
  of terrain setters that rebake and repropagate state during startup.
- Worker-returned normal data so `HeightmapGPU` uploads prebaked buffers instead
  of recomputing normals on the main thread.

This is a standards-aligned optimization, not a cache superstition patch. Cache
remains important for immutable build/WASM/navmesh assets, but the measured
blocker was CPU work running in the wrong startup phase.

## Baseline

Measured before code changes:

| Mode | Evidence | Result |
| --- | --- | --- |
| Zone Control | `artifacts/perf/2026-05-13T03-49-44-385Z/startup-ui-zone-control` | `modeClickToDeployVisible=27765ms`, `modeClickToPlayable=32473ms`, max long task `26733ms` |
| Open Frontier | startup probe, same baseline pass | Timed out past 120s waiting for deploy UI |

Startup marks showed two `terrain.heightmap.from-provider` bakes during
`terrain-config`; navmesh was not the blocker.

## Spike Result

Measured after the worker split and production build:

| Mode | Evidence | Deploy UI | Playable | Worker terrain bake |
| --- | --- | ---: | ---: | ---: |
| Zone Control | `artifacts/perf/2026-05-13T04-30-36-660Z/startup-ui-zone-control` | 1156ms | 6796ms | 523.4ms |
| Open Frontier | `artifacts/perf/2026-05-13T04-31-26-223Z/startup-ui-open-frontier` | 3387ms | 6432ms | 2374.7ms |
| Team Deathmatch | `artifacts/perf/2026-05-13T04-34-04-814Z/startup-ui-tdm` | 1185ms | 6530ms | 236.8ms |

Remaining startup cost after deploy click is now mostly texture upload and
close-model warmup. That is a separate render/upload scheduling problem, not
the mode-select stall diagnosed here.

## Design Posture

Accepted as durable:

- Off-main-thread terrain surface baking.
- Transferables instead of cloned large numeric buffers.
- Batched terrain mode configuration.
- Keeping cache policy focused on immutable delivered artifacts rather than
  pretending every runtime computation is a delivery issue.

Spike-level and not final yet:

- The prepared visual-margin path uses a coarse source-delta cache for the
  render-only apron. This is a terrain LOD approximation, not a random hack, but
  it needs Open Frontier and A Shau visual review before production acceptance.
- If that visual review fails, the next proper move is persistent/prebaked
  visual-surface artifacts or an IndexedDB/OPFS runtime bake cache. Do not
  return to synchronous full-resolution visual-margin baking on mode click.

## Acceptance Before Merge

- `npm run typecheck`
- `npm run lint`
- `npm run lint:budget`
- focused terrain tests:
  `npx vitest run src/systems/terrain/TerrainSystem.test.ts src/systems/terrain/VisualExtentHeightProvider.test.ts src/systems/terrain/HeightmapGPU.test.ts`
- `npm run test:quick`
- `npm run build`
- `npx tsx scripts/perf-startup-ui.ts --mode zone_control --runs 1`
- `npx tsx scripts/perf-startup-ui.ts --mode open_frontier --runs 1`
- `npx tsx scripts/perf-startup-ui.ts --mode tdm --runs 1`
- Visual review for source-backed visual margin in Open Frontier and A Shau,
  especially finite-map edge views and low-altitude flight.

Known validation caveat from this spike: `npm run validate:fast` can fail on
the existing `CDLODQuadtree` micro-timing assertion
(`selectTiles` mean slightly above the 1.0ms budget) even when the isolated
CDLOD suite and standalone full `test:quick` pass. The startup branch did not
modify `CDLODQuadtree` or its test.

