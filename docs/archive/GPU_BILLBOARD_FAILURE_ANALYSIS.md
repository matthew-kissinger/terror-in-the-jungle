# GPU Billboard System Failure Analysis (ARCHIVED)

> **Status**: RESOLVED - GPU billboard approach was abandoned in favor of CPU-based billboard system which works well.
> **Date**: 2025 (original analysis)
> **Current system**: `src/systems/world/billboard/` - CPU-based matrix updates with centralized instance management

---

## Summary

The GPU billboard system (custom vertex shader for billboard rotation) failed due to:

1. **Incorrect matrix extraction** in GLSL - `vec3(instanceMatrix[3])` only got first element
2. **Matrix multiplication order** - billboard rotation was overridden by instance matrix
3. **Three.js compatibility** - raw GLSL attributes conflicted with Three.js r160+ conventions
4. **InstancedMesh limitations** - custom shaders conflicted with built-in transformation pipeline

## Current Solution

CPU-based `GlobalBillboardSystem` with:
- Centralized instance pools for grass (100K) and trees (10K)
- Updates only when camera moves > threshold
- Chunk-based vegetation management via `ImprovedChunkManager`
- Web workers for chunk generation to avoid main thread blocking

## Performance Issues Resolved Since Analysis

| Issue | Status |
|-------|--------|
| 5.1MB terrain texture | Compressed |
| 71MB WAV audio files | Converted to OGG |
| Synchronous chunk generation | Web workers |
| No frustum culling for billboards | Implemented |
| All billboard instances updated every frame | Threshold-based updates |
