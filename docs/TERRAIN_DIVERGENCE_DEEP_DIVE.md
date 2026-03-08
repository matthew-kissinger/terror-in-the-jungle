# Terrain Render/Collision Divergence - Deep Dive Report

**Date**: 2026-03-07
**Status**: Unsolved despite three fix attempts
**Affected modes**: Open Frontier (3200m), A Shau Valley (21136m)
**Unaffected modes**: TDM (400m), Zone Control (500m)

---

## Table of Contents

1. [The Problem](#the-problem)
2. [Architecture Overview](#architecture-overview)
3. [The Fundamental Divergence](#the-fundamental-divergence)
4. [What Has Been Tried (and Why It Failed)](#what-has-been-tried)
5. [Why Small Maps Work and Large Maps Don't](#why-small-maps-work)
6. [Industry Research - How Others Handle This](#industry-research)
7. [Candidate Fix Strategies](#candidate-fix-strategies)
8. [Recommendation](#recommendation)

---

## 1. The Problem <a id="the-problem"></a>

On Open Frontier and A Shau Valley, the player character is consistently placed at the wrong Y position relative to the visible terrain surface. The player appears sunk slightly into the ground or floating above it. NPCs exhibit the same behavior. Vegetation, paradoxically, renders at the correct position on the visible terrain surface (since commit 7c495fa added GPU snapping), but the CPU collision height used for player/NPC positioning disagrees with that surface.

**Observable symptoms:**
- Player sinks 0.5-4m into rendered terrain (most common)
- Player floats above rendered terrain in some areas
- NPCs follow the same wrong height as the player
- Vegetation renders correctly on the visible terrain surface
- The error varies by location - worse on steep or undulating terrain
- TDM and Zone Control are completely unaffected

---

## 2. Architecture Overview <a id="architecture-overview"></a>

The terrain system has two parallel height-query paths that are supposed to agree but don't:

### GPU Rendering Path (what you SEE)
```
NoiseHeightProvider or DEMHeightProvider
  -> HeightmapGPU.bakeFromProvider()
    -> R32F DataTexture (1024x1024 grid)
      -> Vertex shader samples texture2D(heightmap, uv)
        -> GPU rasterizer TRIANGLE-interpolates between vertices
          -> THE VISIBLE TERRAIN SURFACE
```

### CPU Collision Path (where you STAND)
```
Same R32F Float32Array (identical data)
  -> BakedHeightProvider.getHeightAt(x, z)
    -> BILINEAR interpolation of 4 nearest grid samples
      -> HeightQueryCache (0.1m quantization, 20k entries)
        -> Player Y, NPC Y, BVH raycasts, vegetation placement
```

### Key files:
| File | Role |
|------|------|
| `src/systems/terrain/TerrainMaterial.ts:25-64` | GPU vertex shader - positions terrain mesh |
| `src/systems/terrain/BakedHeightProvider.ts:35-57` | CPU height queries - bilinear interpolation |
| `src/systems/terrain/HeightmapGPU.ts:54-73` | Bakes provider into Float32Array + R32F texture |
| `src/systems/terrain/TerrainQueries.ts:25-27` | CPU height query entry point |
| `src/systems/terrain/CDLODRenderer.ts:62-81` | Instance transforms for terrain tiles |
| `src/systems/terrain/TerrainConfig.ts:59-68` | LOD level auto-scaling |
| `src/systems/player/PlayerMovement.ts:192-196` | Player Y = `terrainSystem.getEffectiveHeightAt()` + 2 |
| `src/systems/combat/CombatantMovement.ts:83-84` | NPC Y = `getTerrainHeightForCombatant()` + 3 |
| `src/systems/world/billboard/BillboardShaders.ts:44-57` | Vegetation GPU terrain snapping |

---

## 3. The Fundamental Divergence <a id="the-fundamental-divergence"></a>

Both paths read from the SAME baked heightmap data. The divergence is in HOW they interpolate between sample points.

### GPU: Triangle interpolation
The CDLOD mesh tiles are 33x33 vertex grids (32 quads per edge). Each quad is split into 2 triangles by the GPU. Between the 3 vertices of a triangle, the rasterizer does **planar (barycentric) interpolation** - the surface within each triangle is a flat plane.

### CPU: Bilinear interpolation
`BakedHeightProvider.getHeightAt()` takes 4 grid samples around the query point and blends them:
```
h = h00*(1-fx)*(1-fz) + h10*fx*(1-fz) + h01*(1-fx)*fz + h11*fx*fz
```
This produces a **smoothly curved surface** over each quad - NOT a flat plane.

### The error formula
For any point within a quad, the height difference between these two methods is:
```
error = (h00 + h11 - h10 - h01) * fx * fz
```
This is the "diagonal twist" of the quad. On flat terrain the error is zero. On terrain with twist (one diagonal higher than the other), the error scales with how much twist exists.

### Why this matters on large maps

The CDLOD system uses different mesh densities at different distances (LOD levels). Close terrain has fine mesh (LOD 0), distant terrain has coarse mesh (LOD 4+). But the CPU **always** uses the full-resolution heightmap grid.

At LOD 0 (near the player), the mesh vertex spacing roughly matches the heightmap texel spacing, so the interpolation difference is tiny (<0.3m). But at LOD 2+, each mesh quad spans many heightmap texels, and the CPU is interpolating at much finer resolution than the GPU is rendering - producing visible disagreement.

**The player is always at LOD 0, yet still sinks.** This is the critical observation. Even at LOD 0 with 3.125m vertex spacing (Open Frontier), the GPU and CPU use different interpolation methods. On steep terrain with significant quad twist, the error at LOD 0 can reach 0.3m, and this is perceptible because the camera is at ground level.

On TDM (400m world), LOD 0 vertex spacing is ~0.78m - 4x finer. The same interpolation mismatch produces ~0.075m error, which is invisible.

---

## 4. What Has Been Tried (and Why It Failed) <a id="what-has-been-tried"></a>

### Attempt 1: Half-Texel UV Correction (commit cf30aa2, 2026-03-06)

**Hypothesis:** The GPU `texture2D()` sampling and CPU bilinear interpolation were addressing different grid positions due to a UV mapping discrepancy.

**What changed:**
- Added `texelHalf = 0.5 / heightmapGridSize` offset in vertex shader UV calc
- Added matching `uvScale = (heightmapGridSize - 1.0) / heightmapGridSize` correction
- Purpose: align GPU texel centers with CPU grid coordinate formula

**Why it didn't fix the problem:** This correction was mathematically correct and eliminated a real sub-texel drift at world edges (~3m for 3200m maps). But the PRIMARY divergence is the interpolation method difference (triangle vs bilinear), not a UV mapping offset. Fixing the UV alignment is necessary but insufficient.

**What it DID fix:** Edge-of-world height drift is gone. CPU and GPU now sample the same grid points. But between grid points, they still interpolate differently.

---

### Attempt 2: LOD Auto-Scaling (commit f328391, 2026-03-06)

**Hypothesis:** Open Frontier had only 4 LOD levels, giving 7.03m vertex spacing at LOD 0 - too coarse relative to the 1024-texel heightmap (3.125m/texel). Making the mesh finer would reduce the interpolation error.

**What changed:**
- Added `computeMaxLODLevels()` in `TerrainConfig.ts:59-68`
- Open Frontier: 4 -> 5 LOD levels (3.52m spacing, was 7.03m)
- Heightmap grid: 512 -> 1024 for worlds 1024-4095m
- A Shau: auto-computed to 8 LOD levels (2.58m spacing)

**Why it didn't fix the problem:** This significantly reduced the error magnitude (~80% reduction) but did not eliminate it. The triangle-vs-bilinear interpolation mismatch still exists at every LOD level. On steep terrain at LOD 0, 3.52m vertex spacing still produces noticeable errors. The fix made the situation better but not solved.

**Math: Open Frontier LOD 0 after fix:**
- Vertex spacing: 3.52m
- Max diagonal twist on 30-degree slope: ~0.3m
- Perceptible at eye level: Yes, especially when moving across slopes

---

### Attempt 3: GPU Billboard Terrain Snapping (commit 7c495fa, 2026-03-06)

**Hypothesis:** Vegetation was placed at CPU heights but rendered against the GPU terrain surface, causing trees to visibly float or sink.

**What changed:**
- Billboard vertex shader now samples `texture2D(terrainHeightmap, uv)` directly
- UV calculation uses identical half-texel correction as terrain shader
- `instancePosition.y` (config yOffset) added on top of GPU terrain height
- Also fixed stale `transformed` variable for shadow/envmap calculations

**Why it didn't fix the player/NPC problem:** This fix was specifically for billboard vegetation, which now correctly renders on the visible terrain surface. But players and NPCs still use CPU `BakedHeightProvider` queries for their Y position. The vegetation fix actually makes the problem MORE visible: vegetation is correctly on the surface, but the player next to it is sunk into or floating above that same surface.

**What it DID fix:** Vegetation no longer floats above or sinks into the terrain. Billboard shadows are now computed correctly. The visual quality of vegetation placement is correct.

---

### Summary of fix attempts

| Fix | Target | Error Reduced | Player/NPC Fixed? | Vegetation Fixed? |
|-----|--------|--------------|--------------------|--------------------|
| Half-texel UV | Edge drift | ~3m -> 0m at edges | No | No |
| LOD auto-scale | Vertex coarseness | ~80% reduction | No (reduced) | No (reduced) |
| GPU billboard snap | Vegetation only | N/A | No | **Yes** |

**The core problem remains:** Player and NPC Y positions are determined by CPU bilinear interpolation, but the visible terrain surface is determined by GPU triangle interpolation. These are mathematically different operations on the same data.

---

## 5. Why Small Maps Work and Large Maps Don't <a id="why-small-maps"></a>

| Mode | World Size | LOD 0 Spacing | Max Error at LOD 0 | Perceptible? |
|------|-----------|--------------|--------------------|----|
| TDM | 400m | 0.78m | ~0.01m | No |
| Zone Control | 500m | 0.98m | ~0.02m | No |
| Open Frontier | 3200m | 3.52m | ~0.3m | Yes |
| A Shau Valley | 21136m | 2.58m | ~0.2m | Yes |

The error scales with the SQUARE of vertex spacing (because `fx * fz` in the error formula both scale with spacing). TDM has 4.5x finer spacing than Open Frontier, so ~20x less error.

Additionally:
- Small maps have gentle procedural terrain with less quad twist
- A Shau Valley has real mountainous DEM data with extreme elevation changes
- Open Frontier has larger noise amplitude to fill the bigger world
- More twist per quad = larger interpolation divergence

---

## 6. Industry Research - How Others Handle This <a id="industry-research"></a>

### The universal answer: nobody matches GPU rendering for collision

Every major engine uses the heightmap directly for collision, NOT the rendered mesh:

- **Unity:** `TerrainCollider` uses heightmap data with bilinear interpolation. Rendering LOD is independent. They accept the mismatch at distant LODs.
- **Unreal:** Landscape system uses PhysX heightfield for collision, separate from render LOD. Their Virtual Heightfield Mesh component explicitly has NO collision support - "displacement is handled on the GPU whereas collision is handled on the CPU; they cannot meet."
- **Godot:** `HeightMapShape3D` reads heightmap data directly for physics.
- **Flax Engine:** PhysX heightfield per terrain patch with configurable collision LOD.

**Key insight:** These engines get away with the mismatch because their LOD 0 mesh is typically very fine (sub-meter vertex spacing), making the interpolation error invisible near the player. Our LOD 0 at 3.52m spacing is much coarser than typical AAA terrain.

### GPU readback
- `gl.readPixels()` blocks the pipeline and is extremely expensive in WebGL2
- Async readback via `PIXEL_PACK_BUFFER` has 1-2 frame latency (unacceptable for collision)
- Transform feedback could capture morphed vertex positions but Three.js support is experimental
- **Verdict:** Not viable for real-time collision queries

### GPU hardware bilinear precision
- GPU `texture2D()` with LinearFilter uses 8-bit (1/256 step) fractional weights
- This means GPU bilinear != CPU bilinear at full float32 precision
- However, since the terrain vertex shader samples at vertex positions (not between them), this hardware precision issue is secondary to the triangle-vs-bilinear problem

---

## 7. Candidate Fix Strategies <a id="candidate-fix-strategies"></a>

### Strategy A: Match CPU interpolation to GPU (triangle interpolation on CPU)

**Concept:** Replace `BakedHeightProvider.getHeightAt()` with code that replicates what the GPU does: determine which triangle within the CDLOD mesh covers the query point, then barycentric-interpolate the 3 vertex heights.

**Pros:**
- Eliminates the divergence completely at every LOD level
- Player/NPC would stand exactly on the visible surface

**Cons:**
- LOD is view-dependent - the mesh changes every frame as the camera moves
- Height at a given world point would change as you look at it from different angles (different LOD selections)
- Requires knowing the current quadtree tile layout, which is recomputed per frame
- Objects near LOD boundaries would pop between heights as tiles change LOD
- Expensive: need to determine tile + triangle for every height query

**Verdict:** Architecturally unsound. View-dependent collision causes instability.

### Strategy B: Increase tile resolution to minimize the gap

**Concept:** Increase `tileResolution` from 33 to 65 or 129 vertices per tile edge. This makes the mesh finer, reducing the gap between triangle and bilinear interpolation.

**Current:** 33 vertices/tile = 32 quads/edge
**Option 1:** 65 vertices/tile = 64 quads/edge (4x more triangles)
**Option 2:** 129 vertices/tile = 128 quads/edge (16x more triangles)

**LOD 0 vertex spacing with 65 verts/tile:**
- Open Frontier: 3.52m -> 1.76m (error drops ~4x to ~0.08m - likely imperceptible)
- A Shau: 2.58m -> 1.29m (error drops ~4x to ~0.05m)

**Pros:**
- Simple change (one config value)
- Reduces error quadratically
- No architectural changes needed
- CPU and GPU paths remain independent

**Cons:**
- 4x more vertices per tile = 4x more triangles drawn
- At 65 verts/tile with ~200 visible tiles: ~200 * 64 * 64 * 2 = ~1.6M triangles (currently ~400K)
- May impact frame time, especially on mobile/low-end
- Doesn't eliminate the error, only reduces it

**Verdict:** Most practical option if performance allows. Needs benchmarking.

### Strategy C: CPU bilinear -> CPU triangle interpolation at a FIXED resolution

**Concept:** Instead of bilinear-interpolating the heightmap grid, pre-triangulate the grid at bake time and do CPU triangle interpolation that matches what the GPU would do at LOD 0 resolution. The key difference from Strategy A: use a FIXED triangulation (not view-dependent LOD), so the collision surface is stable.

**Implementation:**
1. At bake time, determine the LOD 0 vertex grid positions
2. Pre-compute which diagonal each quad uses (the GPU always uses the same diagonal - determined by the PlaneGeometry triangle index buffer)
3. For CPU height queries, find which LOD-0-resolution triangle covers the query point
4. Barycentric-interpolate the 3 vertex heights

**Pros:**
- Collision matches the GPU surface exactly at LOD 0 (where the player is)
- View-independent - collision surface doesn't change with camera
- At LOD 1+, there's still a mismatch, but those are distant from the player
- Relatively simple to implement

**Cons:**
- Only matches LOD 0 mesh, not higher LODs
- Need to know the LOD 0 grid spacing at bake time (already known from config)
- Slightly more expensive than bilinear: need to determine triangle half + barycentric coords
- PlaneGeometry triangle topology must be determined and replicated exactly

**Verdict:** Strong option. Fixes the near-player problem without view dependency.

### Strategy D: GPU snapping for ALL positioned objects (not just vegetation)

**Concept:** Extend the GPU terrain snapping approach (commit 7c495fa for vegetation) to player and NPC rendering. The CPU still uses bilinear for game logic, but the VISUAL position is corrected by the GPU.

**Implementation:**
- Player mesh/camera: after computing CPU position, apply a GPU-side correction in the vertex shader or a post-process step
- NPC sprites: already billboards - could add the same terrain snapping as vegetation
- Keep CPU collision at bilinear height for game logic (AI, physics, spawning)
- Only override the Y for rendering

**Pros:**
- Everything LOOKS correct - no visible floating/sinking
- CPU game logic remains stable and view-independent
- NPC sprites already use the billboard system - easy to add snapping
- Player correction could be done by sampling the heightmap GPU-side and adjusting camera Y

**Cons:**
- Player camera Y and collision Y would disagree - might cause visual jitter
- First-person camera makes this tricky: the camera position IS the rendering position
- For NPCs, their collision (bullet hits) would be at a different Y than their visual position
- Adds complexity: two truth sources (CPU for logic, GPU for visuals)

**Verdict:** Works for NPCs. Problematic for first-person player camera.

### Strategy E: Ditch CDLOD vertex shader heightmap sampling - use a pre-displaced mesh

**Concept:** Instead of displacing a flat mesh in the vertex shader, bake the heightmap into the mesh geometry itself (pre-displaced vertices). Both CPU and GPU would read from the same displaced vertex positions.

**Implementation:**
1. After baking the heightmap, generate the terrain mesh with Y values already set to terrain height
2. Each LOD tile gets its own geometry with correct Y positions
3. No vertex shader displacement needed (or only morphing, no height sampling)
4. CPU height queries sample from the same vertex data

**Pros:**
- Eliminates the divergence entirely - one source of truth
- CPU can do triangle interpolation on the actual mesh geometry
- Simpler vertex shader

**Cons:**
- Each tile needs unique geometry (can't share a single instanced PlaneGeometry)
- Can't use InstancedMesh anymore - need separate meshes or geometry buffer tricks
- LOD transitions need geometry updates (can't just morph vertices smoothly)
- Significant architectural rewrite of CDLODRenderer
- May lose the 1-draw-call advantage

**Verdict:** Clean solution but major rewrite. Loses instancing benefits.

### Strategy F: Hybrid - pre-displaced mesh at LOD 0, shader displacement at LOD 1+

**Concept:** Use pre-displaced geometry for the near-field tiles (LOD 0-1 where player/NPCs are) and keep shader displacement for distant tiles (LOD 2+ where the mismatch doesn't matter).

**Implementation:**
1. For LOD 0-1 tiles near the player, generate actual displaced geometry
2. CPU height queries use triangle interpolation on these geometries
3. For LOD 2+ tiles, keep the current instanced shader-displaced approach
4. Blend at the LOD 1-2 boundary

**Pros:**
- Near-player terrain is pixel-perfect (CPU matches GPU exactly)
- Distant terrain keeps the instancing performance benefit
- Limited geometry generation (only ~20-40 LOD 0-1 tiles near player)

**Cons:**
- Two rendering paths to maintain
- LOD 1-2 boundary handling is complex
- Need to regenerate LOD 0-1 geometry when player moves significantly
- More complex than current single-path system

**Verdict:** Elegant compromise but adds significant complexity.

### Strategy G: Sample the heightmap in a render-to-texture pass for CPU readback

**Concept:** Render a small overhead view of the terrain near the player to an offscreen R32F texture, then async-readback the result. This gives the actual GPU-rendered heights.

**Pros:**
- Gets the true GPU-rendered surface heights

**Cons:**
- 1-2 frame latency (player falls through terrain briefly on teleport/spawn)
- Extra render pass per frame
- WebGL2 async readback is complex and not well-supported in Three.js
- Defeats the purpose of having fast CPU height queries

**Verdict:** Not viable for real-time collision.

---

## 8. Recommendation <a id="recommendation"></a>

After analyzing the architecture, the three failed fixes, industry practices, and all candidate strategies, here is the recommended path forward, in priority order:

### Primary: Strategy B + C combined

**Step 1: Increase tile resolution to 65 vertices/tile**

This is the lowest-risk, highest-impact change. It cuts the interpolation error by ~4x, bringing LOD 0 spacing to 1.76m (Open Frontier) and 1.29m (A Shau). At these spacings, the triangle-vs-bilinear error drops to ~0.05-0.08m - likely imperceptible.

- Change: `tileResolution` from 33 to 65 in terrain config
- Risk: ~4x triangle count increase per tile. Benchmark this.
- If perf is acceptable: done. If not, proceed to Strategy C.

**Step 2: CPU triangle interpolation at LOD 0 grid resolution**

Replace `BakedHeightProvider.getHeightAt()` with triangle interpolation that uses the LOD 0 vertex grid as the triangle mesh. This makes the CPU return the exact same height as the GPU at LOD 0.

- Determine Three.js `PlaneGeometry` triangle topology (which diagonal each quad uses)
- For a query point, find which LOD-0-grid triangle it falls in
- Barycentric-interpolate the 3 vertex heights
- This is view-independent and stable

### Secondary: Strategy D for NPCs

NPC sprites are already billboards. Add terrain heightmap snapping to the NPC billboard shader (same as vegetation). This makes NPCs visually correct even if the CPU height is slightly off. Since NPCs are viewed from a distance, the small collision/visual disagreement won't matter.

### Do NOT pursue:
- Strategy A (view-dependent CPU interpolation) - unstable
- Strategy E (pre-displaced mesh) - too large a rewrite for the payoff
- Strategy G (GPU readback) - latency makes it unworkable

### Benchmark plan:
1. Increase `tileResolution` to 65, run `perf:capture:openfrontier:short` and `perf:capture:ashau:short`
2. If p99 frame time stays under budget: ship it
3. If not: try `tileResolution` 49 (compromise between 33 and 65)
4. If still over budget: implement Strategy C (CPU triangle interpolation at fixed LOD 0 resolution)

---

## Appendix: Data Flow Trace

```
GameEngineInit.startGameWithMode()
  |
  +-- HeightQueryCache.setProvider(NoiseHeightProvider or DEMHeightProvider)
  +-- terrainSystem.setWorldSize(config.worldSize)
  |     |
  |     +-- reconfigureWorld()
  |           +-- computeMaxLODLevels() -> LOD levels from world size
  |           +-- renderRuntime.reconfigure() -> rebuild CDLODQuadtree
  |           +-- surfaceRuntime.rebake(provider, worldSize)
  |           |     +-- HeightmapGPU.bakeFromProvider()
  |           |     |     +-- Float32Array[gridSize^2] (CPU data)
  |           |     |     +-- R32F DataTexture (GPU texture, same data)
  |           |     +-- updateMaterial() -> uniforms: worldSize, gridSize, texture
  |           +-- syncCpuHeightsToGpu()
  |                 +-- BakedHeightProvider(Float32Array, gridSize, worldSize)
  |                 +-- HeightQueryCache.setProvider(bakedProvider)
  |                 +-- pushHeightmapToBillboards() -> vegetation GPU snapping

Per frame (GPU path - WHAT YOU SEE):
  CDLODQuadtree.selectTiles(camera) -> tiles with lodLevel + morphFactor
  CDLODRenderer.updateInstances(tiles) -> instance matrices
  Vertex shader:
    1. CDLOD morph: snap fine vertices toward parent grid (morphFactor blend)
    2. Instance matrix: scale + position to tile's world location
    3. UV calc: half-texel corrected world-to-UV mapping
    4. Height: texture2D(terrainHeightmap, uv).r
    5. worldPos4.y = terrainH
  GPU rasterizer: TRIANGLE interpolation between vertices

Per frame (CPU path - WHERE YOU STAND):
  PlayerMovement.updateMovement():
    terrainSystem.getEffectiveHeightAt(x, z)
      -> TerrainQueries.getHeightAt(x, z)
        -> HeightQueryCache.getHeightAt(x, z)
          -> BakedHeightProvider.getHeightAt(x, z)
            -> BILINEAR interpolation of Float32Array
    player.y = height + 2.0  (eye height)

  CombatantMovement.updateMovement():
    getTerrainHeightForCombatant(combatant)
      -> terrainSystem.getHeightAt(x, z) [staggered, 80-320ms cache]
        -> HeightQueryCache -> BakedHeightProvider -> BILINEAR
    combatant.y = height + 3.0

  Vegetation (CPU placement, GPU rendering):
    VegetationScatterer: CPU height for cell generation
    BillboardShaders: GPU terrainHeightmap sample for Y (MATCHES terrain surface)
```

## Appendix: Heightmap Grid Sizes

| Mode | World Size | Grid Size | Texels/m | LOD Levels | LOD 0 Spacing |
|------|-----------|----------|----------|------------|---------------|
| TDM | 400m | 256 | 0.64 | 4 | 0.78m |
| Zone Control | 500m | 256 | 0.51 | 4 | 0.98m |
| Open Frontier | 3200m | 1024 | 0.32 | 5 | 3.52m |
| A Shau Valley | 21136m | 1024 | 0.048 | 8 | 2.58m |

## Appendix: Error Estimate at LOD 0

For a 30-degree slope with quad twist:
```
error ~= (slope_height_change * twist_factor) * (spacing/2)^2 / spacing^2
       ~= slope_gradient * twist_ratio * spacing / 4
```

| Mode | LOD 0 Spacing | Est. Error (30-deg slope) | Perceptible? |
|------|--------------|---------------------------|--------------|
| TDM | 0.78m | ~0.01m | No |
| Zone Control | 0.98m | ~0.02m | No |
| Open Frontier | 3.52m | ~0.25m | Yes (borderline) |
| A Shau Valley | 2.58m | ~0.19m | Yes (mountainous DEM) |
| **Open Frontier @ 65 verts** | **1.76m** | **~0.06m** | **No** |
| **A Shau @ 65 verts** | **1.29m** | **~0.03m** | **No** |
