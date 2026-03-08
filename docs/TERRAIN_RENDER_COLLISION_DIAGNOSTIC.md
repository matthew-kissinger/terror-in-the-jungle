# Terrain Render vs Collision Misalignment - Diagnostic

**Date**: 2026-03-06
**Affected modes**: Open Frontier (3200m), A Shau Valley (21136m)
**Unaffected modes**: TDM (400m), Zone Control (768m)
**Symptom**: Vegetation (trees) sits at correct collision height but floats above or sinks into the rendered terrain surface.

---

## Root Cause: Two Independent Bugs

### Bug 1 (PRIMARY) - LOD Mesh vs Heightmap Interpolation Mismatch -- ACCEPTED (industry standard)

**Status**: Accepted trade-off. CPU uses bilinear heightmap interpolation (industry standard - Unity, Unreal, Godot all do this). The residual error from GPU triangle interpolation at LOD 0 is bounded to ~0.3m on steep terrain at 3.5m vertex spacing, which is imperceptible. Every major game engine treats the heightmap as the single source of truth for collision/physics, not the LOD mesh.

**Original problem**: The GPU terrain surface and the CPU height queries used **different interpolation methods** between sample points, producing different heights at the same world position.

**CPU path** (vegetation, collision, BVH, AI):
- `BakedHeightProvider.getHeightAt(x, z)` bilinearly interpolates the heightmap grid
- Resolution: 1024x1024 for Open Frontier (3.125m/texel), 512x512 for A Shau (41.36m/texel)
- Returns smooth, continuous height at any world coordinate

**GPU path** (rendered terrain surface):
- Vertex shader samples `texture2D(terrainHeightmap, uv)` at each mesh vertex - this matches the CPU exactly **at vertex positions**
- Between vertices, the GPU rasterizer **linearly interpolates within triangles**
- Triangle interpolation != bilinear heightmap interpolation
- The mesh has only 32 quads per tile edge (33 vertices), so at higher LOD levels the vertex spacing is much coarser than the heightmap

**The error** at a point between vertices:
```
error = (h00 + h11 - h10 - h01) * fx * fz    (quad diagonal "twist")
```
Where fx, fz are fractional positions within the quad and h values are the four corner heights.

**Error magnitude by LOD level (Open Frontier, 3200m, 5 LOD levels):**

| LOD | Tile Size | Vertex Spacing | Heightmap Texels/Quad | Max Error (steep terrain) |
|-----|-----------|----------------|----------------------|---------------------------|
| 0   | 100m      | 3.125m         | ~1                   | <0.3m (imperceptible)     |
| 1   | 200m      | 6.25m          | ~2                   | ~1.0m (noticeable)        |
| 2   | 400m      | 12.5m          | ~4                   | ~2-4m (visible)           |
| 3   | 800m      | 25m            | ~8                   | ~4-8m (severe)            |
| 4   | 1600m     | 50m            | ~16                  | ~8-15m (extreme)          |

**Error magnitude by LOD level (A Shau Valley, 21136m, 8 LOD levels):**

| LOD | Tile Size | Vertex Spacing | Heightmap Texels/Quad | Max Error (mountainous) |
|-----|-----------|----------------|----------------------|-------------------------|
| 0   | 82.5m     | 2.58m          | <1 (oversampled)     | <0.1m                   |
| 1   | 165m      | 5.16m          | <1                   | ~0.3m                   |
| 2   | 330m      | 10.3m          | <1                   | ~1.0m                   |
| 3   | 660m      | 20.6m          | <1                   | ~2.0m                   |
| 4   | 1321m     | 41.3m          | ~1                   | ~3.0m                   |
| 5   | 2642m     | 82.6m          | ~2                   | ~5-10m (severe)         |
| 6   | 5284m     | 165m           | ~4                   | ~10-20m (extreme)       |
| 7   | 10568m    | 330m           | ~8                   | ~20-50m (extreme)       |

**Why TDM/ZC are unaffected**: With worldSize 400-768m and 4 LOD levels, the entire playable area is LOD 0-1 where vertex spacing closely matches heightmap resolution. The interpolation error stays below ~0.5m - invisible at game scale.

**Why Open Frontier / A Shau are affected**: Large worlds push most terrain to LOD 2+ where the mesh is significantly coarser than the heightmap. Trees placed at accurate heightmap positions visibly float above or sink into the coarse triangle mesh.

### Bug 2 (SECONDARY) - Stale `transformed` Variable in worldpos_vertex

The custom vertex shader computes correct world positions in `worldPos4` but **never updates** the Three.js `transformed` variable. This causes downstream shader chunks to use wrong positions.

**Verified against Three.js r182 source** (`node_modules/three/src/renderers/shaders/`):

The MeshStandardMaterial vertex shader (`meshphysical.glsl.js`) executes chunks in this order:

```
line 40: #include <begin_vertex>        -> vec3 transformed = vec3(position);  // Y=0 flat plane
line 41: #include <morphtarget_vertex>
line 42: #include <skinning_vertex>
line 43: #include <displacementmap_vertex>
line 44: #include <project_vertex>       -> REPLACED: uses worldPos4 (correct height) for gl_Position
line 45: #include <logdepthbuf_vertex>
line 46: #include <clipping_planes_vertex> -> uses mvPosition (correct, from our replacement)
line 48: vViewPosition = -mvPosition.xyz;  // correct
line 50: #include <worldpos_vertex>      -> NOT REPLACED: worldPosition = vec4(transformed, 1.0) // Y=0!
line 51: #include <shadowmap_vertex>     -> uses worldPosition (WRONG - Y=0)
line 52: #include <fog_vertex>           -> uses mvPosition.z (correct)
```

**What `worldpos_vertex` does** (`worldpos_vertex.glsl.js`):
```glsl
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined( USE_SHADOWMAP ) || ...
    vec4 worldPosition = vec4( transformed, 1.0 );   // <-- transformed.y = 0!
    #ifdef USE_INSTANCING
        worldPosition = instanceMatrix * worldPosition;
    #endif
    worldPosition = modelMatrix * worldPosition;
#endif
```

**What `shadowmap_vertex` does** (`shadowmap_vertex.glsl.js`):
```glsl
shadowWorldPosition = worldPosition + vec4(shadowWorldNormal * shadowNormalBias, 0);
vDirectionalShadowCoord[i] = directionalShadowMatrix[i] * shadowWorldPosition;
```

**Result**: Shadow coordinates are computed from `worldPosition` at Y=0 instead of at the actual terrain height. This means:
- Shadow **receiving** on the terrain is broken (shadow lookups use Y=0 position)
- Shadow **casting** from the terrain is broken (shadow map renders from wrong positions)
- Environment map reflections are wrong (if envmap is enabled)
- This does NOT directly cause geometric misalignment but produces incorrect shadows/lighting that may exacerbate the visual perception of terrain being "off"

---

## Additional Findings

### DEM Coverage Mismatch (A Shau only)

`AShauValleyConfig.ts` sets `DEM_COVERAGE_METERS = 21136` but the actual DEM data covers only `2304 * 9 = 20736m`. The 400m discrepancy (200m per side) means:
- The bake loop queries the DEMHeightProvider 200m beyond its data range on each side
- DEMHeightProvider clamps to edge values, creating flat 200m borders
- Both GPU and CPU see the same clamped data, so this doesn't cause render/collision divergence
- But it does mean 200m of flat terrain at world edges where there should be mountains

Verified from `data/vietnam/big-map/a-shau-z14-9x9.f32.meta.json`:
```json
"width": 2304,
"pixelResolutionMeters": 9,
"coverageMeters": 21136     // geographic span, NOT pixel coverage
```
Geographic coverage (from lat/lon bounds) = 21136m. Pixel coverage = 20736m. The metadata `coverageMeters` is the geographic span, not the raster extent.

### Helipads are NOT a factor

Helipads are present in Open Frontier and A Shau but absent in TDM/ZC. This is a **correlation, not causation**. Helipads only read terrain height for placement; they do not modify the terrain heightmap or collision data. The actual distinguishing factor is world size.

### Half-Texel UV Correction is Correct

The GPU UV mapping in `TerrainMaterial.ts` applies a half-texel correction:
```glsl
float texelHalf = 0.5 / heightmapGridSize;
float uvScale = (heightmapGridSize - 1.0) / heightmapGridSize;
vWorldUV = clamp(normalizedPos * uvScale + texelHalf, 0.0, 1.0);
```

This maps world edges to texel centers [0.5/N, (N-0.5)/N], which aligns with the CPU's `gx = normalizedPos * (gridSize - 1)` mapping. Verified mathematically: both map the same world position to the same grid coordinate.

### DataTexture flipY is Consistent

Three.js `DataTexture` defaults `flipY = false`. The bake loop stores row z=0 at `worldZ = -halfWorld`, which maps to the bottom of the texture (UV v=0). The vertex shader maps `worldZ = -halfWorld` to `normalizedPos.y = 0`. Consistent.

### Uniform Update Flow is Correct

When world size changes, `applyTerrainMaterialOptions` updates uniform values in-place (preserving compiled shader references). The `terrainWorldSize`, `heightmapGridSize`, and `terrainHeightmap` uniforms all get correct values. Verified by tracing `reconfigureWorld() -> surfaceRuntime.rebake() -> updateMaterial() -> updateTerrainMaterialTextures() -> applyTerrainMaterialOptions()`.

---

## Data Flow Trace

```
GameEngineInit.startGameWithMode()
  |
  +-- Set provider on HeightQueryCache (NoiseHeightProvider or DEMHeightProvider)
  +-- terrainSystem.setWorldSize(config.worldSize)
  |     |
  |     +-- reconfigureWorld()
  |           +-- Recompute maxLODLevels, lodRanges
  |           +-- renderRuntime.reconfigure() -> rebuild CDLODQuadtree at worldSize + 400m
  |           +-- surfaceRuntime.rebake(provider, worldSize)
  |           |     +-- HeightmapGPU.bakeFromProvider() -> R32F DataTexture (GPU) + Float32Array (CPU)
  |           |     +-- updateMaterial() -> update uniforms (worldSize, gridSize, texture)
  |           +-- syncCpuHeightsToGpu()
  |                 +-- Replace HeightQueryCache provider with BakedHeightProvider
  |                     (wraps same Float32Array from bake)
  |
  +-- setBiomeConfig() -> vegetation regeneration
        +-- VegetationScatterer queries BakedHeightProvider for tree Y positions
        +-- Trees placed at bilinear-interpolated heightmap values

Per frame:
  CDLODQuadtree.selectTiles() -> CDLODRenderer.updateInstances()
  -> GPU vertex shader samples heightmap at 33x33 mesh vertices
  -> GPU rasterizer triangle-interpolates between vertices
  -> Rendered surface diverges from CPU bilinear heightmap at higher LOD levels
```

---

## Fix Strategies

### Bug 1 (interpolation mismatch) -- ACCEPTED

Reverted to bilinear heightmap interpolation (industry standard). Triangle interpolation was attempted but abandoned - the CPU mesh grid maps to `worldSize` while the GPU quadtree covers `worldSize + 2*visualMargin`, causing misaligned triangle grids and worse slope errors. Bilinear is the correct approach used by Unity, Unreal, and Godot.

**Additional fixes applied to reduce real sources of divergence:**
1. Heightmap now baked at visual world size (`worldSize + 2*visualMargin`) instead of just `worldSize` - eliminates flat shelf at terrain edges
2. LOD ranges computed from quadtree size (`worldSize + 2*visualMargin`) instead of `worldSize` - eliminates 10-12% range underestimate
3. Vegetation height queries no longer clamped to playable bounds - heightmap covers full visual extent

### For Bug 2 (stale `transformed`) -- not implemented:

**Option A - Update `transformed` after height assignment** (recommended):
Add to TERRAIN_VERTEX_MAIN:
```glsl
transformed = worldPos4.xyz;
```
This propagates the correct terrain height to `worldpos_vertex` and all downstream chunks. Simple one-line fix.

**Option B - Replace `worldpos_vertex`**:
Replace `#include <worldpos_vertex>` with custom code that uses `worldPos4` instead of `transformed`.

**Option C - Replace `shadowmap_vertex`**:
Replace `#include <shadowmap_vertex>` with custom shadow coordinate computation using `worldPos4`.

### For DEM coverage mismatch:

Change `DEM_COVERAGE_METERS` in `AShauValleyConfig.ts` from `21136` to `20736` (actual pixel extent). Or keep 21136 but accept the 200m flat borders as intentional visual margin.
