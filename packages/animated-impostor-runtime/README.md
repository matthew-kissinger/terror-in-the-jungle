# Animated Impostor Runtime

Schema and sampling helpers for animated impostor atlases.

## Provenance

Generalized from the Pixel Forge NPC review bundle shape. The package keeps
the runtime sidecar idea but removes TIJ factions, weapons, and asset paths.

## API

- `parseAnimatedImpostorMeta(json)`
- `sampleAnimatedImpostorFrame(meta, clipId, elapsedMs, options)`
- `createAnimatedImpostorPlayer(meta, options)`

## Non-Goals

- No GLB loading.
- No renderer ownership.
- No production asset packaging.

