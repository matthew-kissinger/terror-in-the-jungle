<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-29-cinematic-field-pass.md (Phase 5). DEM recipe in plan. -->
# cycle-2026-06-29-orbital-topo-map

Phase 5 — a net-new 3D orbital topographic map: an orbitable relief mesh showing
terrain with HQ/outpost capture points colored by current owner and spawn points.
One reusable component, three mounts: deploy screen + pause overlay (rich 3D) and
hold-M in combat (opt-in toggle, default stays the fast 2D map). PC + mobile.

## Files touched

- `src/ui/map/orbital/OrbitalTopoMeshBuilder.ts`, `OrbitalTopoMaterial.ts`, `OrbitalTopoRenderer.ts`, `OrbitalTopoMap.ts`, `OrbitalTopoControls.ts`, `OrbitalTopoMarkers.ts`, `OrbitalTopoMapHost.ts` (+ tests, new)
- `scripts/bake-topo-dem.ts` (new) + `public/data/heightmaps/*-topo-*.f32` (+ sidecar json)
- `src/ui/map/OpenFrontierRespawnMap*.ts` (deploy), `SettingsModal.ts` (pause), `FullMapSystem.ts`, `FullMapInput.ts` (hold-M toggle)

## Scope

1. Mesh: CPU-displace a 64-128² `PlaneGeometry` from a `Float32Array` + `computeVertexNormals()`; color via TSL `MeshStandardNodeMaterial` (hypsometric ramp × slope, from the P0 lib) with a first-class Lambert fallback on WebGL2.
2. Data: hold-M reads the live 1024² grid via `TerrainSystem.getBakedHeightmap()`; deploy/pause load a dedicated baked `.f32`. Bake A Shau from NASADEM (OpenTopography clip API → GDAL, public-domain/CC0); seeded maps downsample their existing `.f32`.
3. Render through the EXISTING WebGPU renderer (separate Scene+camera+viewport, render-on-demand) — no second device. Markers: InstancedMesh, ownership via `instanceColor`, Y from full-res `getHeightAt`, zoom-gated labels, picking → `onZoneSelected`. `OrbitalTopoControls` for PC drag/wheel + touch one-finger-orbit/pinch; host adapter keeps call-sites 1-3 lines.

## Non-goals

- NO `ITerrainRuntime` change (use the concrete `getBakedHeightmap` facade from P0).
- Hold-M default STAYS 2D — 3D is an opt-in toggle there (owner decision).
- NO second WebGPU device; NO GPU TSL displacement (CPU `.f32` path chosen).

## Acceptance

- [ ] Orbitable relief on deploy + pause + hold-M-toggle, PC + touch; ownership colors update live.
- [ ] Works for A Shau + ≥1 seeded map; Lambert fallback renders on WebGL2.
- [ ] First-open spike measured during LIVE combat (not idle); per-file budgets verified.
- [ ] `npm run lint && npm run test:run && npm run build` green; fence-safe.

## Dependencies

- Depends on: `cycle-2026-06-29-cinematic-foundations` (TSL lib + `getBakedHeightmap`).
- Deploy/pause land first; hold-M toggle lands last behind the perf gate.
