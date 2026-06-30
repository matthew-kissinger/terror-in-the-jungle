<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-29-cinematic-field-pass.md (Phase 0). Plan: scratchpad cinematic-field-pass-PLAN.md -->
# cycle-2026-06-29-cinematic-foundations

Phase 0 of the Cinematic Field Pass. Nothing the player sees yet — this lays the
two load-bearing prerequisites every later phase depends on: a restored
`combat120` perf baseline (the gate that lets visual/map work go default-on
without flying blind) and a shared TSL node-material library that the post-stack
(P6) and the orbital topo map (P5) both consume. Also adds the non-fenced
terrain accessor the topo map reads, so we never touch the fenced `ITerrainRuntime`.

## Files touched

- `perf-baselines.json` (recreate — was removed)
- `src/core/tsl/NodeMaterialLibrary.ts` (new — relief shade, hypsometric tint, contour, height displacement nodes)
- `src/core/tsl/PostGradeNodes.ts` (new — grade/curve/vignette nodes for P6)
- `src/systems/terrain/TerrainSystem.ts` (add `getBakedHeightmap()`)
- `src/core/tsl/*.test.ts` (new)

## Scope

1. Restore a multi-capture `combat120` baseline from the MAIN worktree (agent worktrees fail on Windows MAX_PATH); record p99 with its ±6ms noise band.
2. Build `src/core/tsl/` as small composable node-builder helpers; must compile on WebGPU AND the WebGPU-renderer's internal WebGL2 fallback (true no-op on pure `?renderer=webgl`).
3. Add `TerrainSystem.getBakedHeightmap(): {data:Float32Array; gridSize:number; worldSize:number} | null` delegating to the private `surfaceRuntime` (grid is 1024², not the 2304² source DEM).

## Non-goals

- NO change to `ITerrainRuntime` or any fenced export (the accessor is a concrete-class facade only).
- NO new TSL on the CDLOD vertex path (r185 WebGPU-CDLOD regression — terrain invisible in prod).
- NO visible/default-on rendering change; this phase ships infrastructure only.

## Acceptance

- [ ] `perf-baselines.json` restored; baseline capture reproducible from MAIN worktree.
- [ ] `src/core/tsl/` compiles + unit-tests pass on WebGPU and WebGL2 fallback.
- [ ] `getBakedHeightmap()` returns a 1024² grid for A Shau and a seeded map; null when terrain not ready.
- [ ] `npm run lint && npm run test:run && npm run build` green; fence-safe.
- [ ] PR against `master` linking this brief.

## Dependencies

- Blocks: `cycle-2026-06-29-orbital-topo-map`, `cycle-2026-06-29-visual-post-stack`.
