# Terrain Height Core

Height providers and stamp math for browser terrain projects.

## Provenance

Generalized from TIJ `IHeightProvider`, `DEMHeightProvider`,
`BakedHeightProvider`, `StampedHeightProvider`, and `TerrainStampGridBaker`.
The package intentionally excludes TIJ `TerrainSystem`, CDLOD, vegetation, A
Shau policy, and global height-query cache behavior.

Wave 2 backports are blocked until the golden samples in
`src/tij-golden.test.ts` stay green against any package changes.

## API

- `createHeightProvider(config)`
- `ConstantHeightProvider`
- `DemHeightProvider`
- `BakedHeightProvider`
- `StampedHeightProvider`
- `resolveTerrainStamps`
- `applyResolvedStamp`
- `bakeStampedHeightmapGrid`

## Non-Goals

- No renderer.
- No global terrain query authority.
- No navmesh or world-feature compiler.
