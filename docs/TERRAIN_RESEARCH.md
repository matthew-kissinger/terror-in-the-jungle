# Terrain System Research: Architecture, Industry Practices, and Future Options

Last updated: 2026-03-10

This document is the result of a deep end-to-end analysis of our terrain system, comparison against industry standard approaches, and research into what options exist for improving or rearchitecting terrain rendering at scale.

**No code changes are proposed here.** This is a reference for architectural decision-making.

Alignment note (2026-03-10): current official Three.js guidance still treats `WebGLRenderer` as the recommended choice for pure WebGL 2 applications. `WebGPURenderer` and TSL are the migration path when an application needs WebGPU features and is ready to port custom material/post-processing code. Our active terrain runtime stays on `WebGLRenderer` and `onBeforeCompile` for now.

Validation note (2026-03-10): repo tests now verify every shipped game mode resolves real terrain texture assets, builds biome material bindings, and can create live `TerrainMaterial` instances with bound uniforms/textures. Terrain renderer policy is therefore documented and regression-gated, not just aspirational.

---

## Table of Contents

1. [Our Architecture (As-Built)](#1-our-architecture-as-built)
2. [The Bug We Fixed](#2-the-bug-we-fixed)
3. [Industry Terrain LOD Approaches](#3-industry-terrain-lod-approaches)
4. [CPU/GPU Height Consistency](#4-cpugpu-height-consistency)
5. [WebGPU: What Changes](#5-webgpu-what-changes)
6. [Virtual Texturing and Streaming](#6-virtual-texturing-and-streaming)
7. [Scorecard: Our System vs Industry](#7-scorecard-our-system-vs-industry)
8. [Pivot Options](#8-pivot-options)
9. [Recommendations](#9-recommendations)
10. [Sources](#10-sources)

---

## 1. Our Architecture (As-Built)

### Three Independent Pipelines

The terrain system operates three pipelines sharing a common height source:

```
IHeightProvider (Noise or DEM)
        |
        v
HeightmapGPU.bakeFromProvider()
        |
        +---> R32F DataTexture -----> Vertex Shader (GPU rendering pipeline)
        |
        +---> Float32Array ---------> BakedHeightProvider (CPU collision pipeline)
        |                                    |
        |                                    v
        |                             HeightQueryCache (all CPU queries)
        |                                    |
        |                             +------+------+
        |                             |      |      |
        |                             v      v      v
        |                           AI  Movement  Vegetation
        |
        +---> Near-field BVH mesh --> LOSAccelerator (raycast pipeline)
```

### Key Files (15 source + 1 worker, ~2,700 lines)

| File | Role |
|------|------|
| `TerrainSystem.ts` | Top-level facade, GameSystem lifecycle, config orchestration |
| `TerrainSurfaceRuntime.ts` | GPU heightmap baking, material creation/update |
| `TerrainRenderRuntime.ts` | Frustum extraction, quadtree selection, renderer dispatch |
| `CDLODQuadtree.ts` | Quadtree traversal, tile selection, morph factor computation |
| `CDLODRenderer.ts` | Single InstancedMesh, per-instance matrix/LOD/morph attributes |
| `TerrainMaterial.ts` | MeshStandardMaterial with onBeforeCompile shader injection |
| `HeightmapGPU.ts` | Bakes IHeightProvider into R32F + RGBA8 normal DataTextures |
| `BakedHeightProvider.ts` | CPU bilinear interpolation of the baked Float32Array |
| `HeightQueryCache.ts` | Singleton, 0.1m-quantized LRU cache (20k entries) |
| `TerrainRaycastRuntime.ts` | 200m-radius BVH mesh for LOS raycasts |
| `VegetationScatterer.ts` | 128m cell-based vegetation placement |
| `TerrainConfig.ts` | Config types, LOD range computation, `computeMaxLODLevels()` |
| `NoiseHeightProvider.ts` | Multi-layer procedural noise with rivers/lakes |
| `BakedHeightProvider.ts` | CPU-side bilinear interpolation matching GPU LinearFilter |
| `IHeightProvider.ts` | Provider interface abstraction |

### Rendering: 1 Draw Call

CDLODRenderer uses a single `THREE.InstancedMesh` with a shared PlaneGeometry (32x32 quads). Per-instance attributes:
- Instance matrix: scale (tile size) + translate (tile center)
- `lodLevel`: integer LOD for debug visualization
- `morphFactor`: 0-1 blend toward parent LOD grid

The vertex shader:
1. Morphs XZ vertex positions toward parent-LOD grid spacing based on `morphFactor`
2. Computes UV with half-texel correction for GPU/CPU alignment
3. Samples R32F heightmap texture for Y displacement
4. Samples RGBA8 normal map for lighting

### CPU/GPU Synchronization

The critical design: after GPU bake, `syncCpuHeightsToGpu()` creates a `BakedHeightProvider` from the same `Float32Array` and installs it into the `HeightQueryCache`. All CPU consumers (AI, movement, vegetation, BVH) then sample identical data to the GPU vertex shader.

Half-texel UV correction in the vertex shader ensures that the GPU's `texture2D` with `LinearFilter` samples at the same grid positions as the CPU's bilinear interpolation math.

---

## 2. The Bug We Fixed

### Problem

Open Frontier (3200m world) had floating vegetation and NPC collision/rendering misalignment. TDM (400m) and Zone Control (500m) worked correctly.

### Root Cause

`lodLevels: 4` was hardcoded in `SystemInitializer.ts`. This produced:

| Mode | World Size | LOD 0 Tile Size | Vertex Spacing | Heightmap Grid |
|------|-----------|-----------------|----------------|----------------|
| TDM | 400m | 50m | 1.56m | 256 (1.56m/sample) |
| Zone Control | 500m | 62.5m | 1.95m | 256 (1.95m/sample) |
| **Open Frontier** | **3200m** | **225m** | **7.03m** | **512 (6.26m/sample)** |

At 7m vertex spacing on a 6.26m heightmap grid, the GPU mesh's triangle faces linearly interpolate between widely-spaced vertices, while CPU queries bilinear-interpolate the finer heightmap grid. Sharp terrain features (rivers, ridges) that fit within the heightmap resolution but fall between vertices are visible in the CPU height data but not in the rendered mesh.

### Fix (Two Parts)

1. **Auto-scale LOD levels** (`computeMaxLODLevels()` in TerrainConfig.ts): Targets <=4m vertex spacing regardless of world size. Formula: `ceil(log2(quadtreeSize / (targetSpacing * tileQuads)))`, clamped to [4, 8].

2. **Increase heightmap resolution** for mid-size worlds: Changed 1024-4095m worlds from 8m/sample to 4m/sample in `computeTerrainSurfaceGridSize()`.

After fix, Open Frontier at 3200m: LOD 0 tile = 56m, vertex spacing = 1.76m, heightmap grid = 1024 (3.13m/sample). CPU and GPU heights converge.

---

## 3. Industry Terrain LOD Approaches

### 3.1 CDLOD (What We Use)

**Origin:** Filip Strugar, 2009. [Paper](https://aggrobird.com/files/cdlod_latest.pdf), [Reference C++ implementation](https://github.com/fstrugar/CDLOD).

**Algorithm:**
- Uniform quadtree over the terrain. Each level = one LOD level (deeper = finer).
- Per-frame CPU traversal: frustum cull, then range-test against exponential distance bands.
- Nodes spanning two LOD ranges subdivide; leaf/in-range nodes emit as tiles.
- Vertex shader morphing smoothly blends LOD transitions (no popping, no seams).

**Strengths:**
- Adaptive triangle distribution (dense where camera is, sparse far away)
- No stitching meshes between LOD levels
- Morphing is essentially free in the vertex shader
- Predictable LOD function based on true 3D distance

**Limitations:**
- CPU quadtree traversal each frame (~0.3ms typical, not zero)
- Per-node draw calls in naive implementations (solved by instancing)
- Heightmap texture resolution caps detail
- XZ-only morphing can cause subtle slope artifacts on very steep terrain

**Who uses it:** Dominant approach in indie/mid-tier engines, WebGL/WebGPU contexts. Godot addons (HTerrain), Bevy terrain prototypes, numerous Three.js implementations. AAA engines use similar quadtree selection but with GPU-driven pipelines.

### 3.2 Geometry Clipmaps (Geoclipmaps)

**Origin:** Losasso and Hoppe, GPU Gems 2 (2005). Extension of texture clipmaps to geometry.

**Algorithm:**
- Concentric square rings of uniform grids centered on the viewer. Each ring is 2x the area at half the resolution. Typically 6-11 levels.
- Finest level = complete grid. Coarser levels = hollow rings.
- Toroidal update: as camera moves, only small L-shaped regions update per frame.
- Geomorphing at ring boundaries.

**CDLOD vs Geoclipmaps:**

| Aspect | CDLOD | Geoclipmaps |
|--------|-------|-------------|
| Grid structure | Adaptive quadtree | Fixed concentric rings |
| Triangle distribution | Adapts to terrain complexity | Uniform per ring |
| Transition handling | Per-vertex morphing | Ring-boundary blending zones |
| Draw calls | 1 (with instancing) | 6-11 (one per ring) |
| Streaming fit | Requires tiled management | Natural toroidal update |
| Implementation complexity | Moderate | Simpler data structures |

**Who uses it:** Godot's Terrain3D addon, ARM's OpenGL ES SDK, flight simulators. Good for open-world terrain where steady rendering rate and simple streaming are priorities.

**Assessment for us:** Lateral move. CDLOD's adaptive quadtree better suits our variable-complexity maps (flat lowlands in TDM vs mountainous A Shau). Our single-InstancedMesh already gives us the draw-call advantage.

### 3.3 GPU Tessellation (Hardware)

**Traditional approach:** Coarse patches to GPU, hull shader determines tessellation factors, tessellation unit subdivides, domain shader displaces from heightmap.

**Engine usage:**
- CryEngine: Pioneered real-time terrain tessellation (Crysis 2+)
- Unreal Engine pre-5.0: Used hull/domain shaders for terrain detail
- AMD GPUs have historically weak geometry pipeline, undermining performance

**Unreal Engine 5 - Nanite + Virtual Heightfield Mesh:**
- UE5 deprecated traditional tessellation for Nanite virtualized geometry
- **Nanite Tessellation** (UE5.4+, experimental): Runtime GPU subdivision and displacement of Nanite clusters
- **Virtual Heightfield Mesh (VHM):** Runtime Virtual Texture-driven tessellation surface (potentially obsoleted by Nanite tessellation)
- **Critical collision note:** "Tessellation has no collision, while geometry-based Nanite will." Separate `LandscapeHeightfieldCollisionComponent` with configurable mip levels (0-5) independent of rendering

**WebGL/WebGPU status:** Not available. WebGPU has no hardware tessellation shaders ([gpuweb#445](https://github.com/gpuweb/gpuweb/issues/445), open since 2017, no resolution). Metal's tessellation model is fundamentally incompatible with D3D12/Vulkan, blocking a cross-platform API.

**Assessment for us:** Blocked by platform. Our vertex shader displacement is the standard WebGL approach.

### 3.4 Concurrent Binary Trees (CBT) - The Frontier

**Origin:** Jonathan Dupuy, 2020 ([paper](https://onrendering.com/data/papers/cbt/ConcurrentBinaryTrees.pdf)). Extended by Benyoub/Dupuy, 2024 ([arxiv](https://arxiv.org/abs/2407.02215)).

**Approach:** GPU-friendly binary-tree data structure for bisection-based tessellation. The GPU subdivides and merges triangle patches in parallel using atomic operations on a compact bit array.

**Performance:** <0.2ms terrain tessellation on console hardware. The 2024 extension supports arbitrary polygon meshes (not just square domains), enabling planetary-scale rendering with centimeter detail at ~0.1ms.

**Assessment for us:** The most promising future path for GPU-driven terrain tessellation, but requires WebGPU compute shaders and has no Three.js implementation. Major engineering investment.

---

## 4. CPU/GPU Height Consistency

### Industry Consensus: Separate Representations Are Standard

The research reveals a clear industry pattern: **separate collision and rendering data, different resolutions, shared source of truth.**

| Engine | Rendering | Collision | Consistency |
|--------|-----------|-----------|-------------|
| Unreal Engine | Nanite/LOD landscape | `LandscapeHeightfieldCollisionComponent`, configurable mip 0-5 | Same source heightmap, different resolution |
| Unity | Terrain LOD with distance reduction | `TerrainCollider` (HeightmapShape) | Same heightmap, collider uses full res |
| Godot Terrain3D | Geometric clipmaps | `HeightMapShape3D` | Signal-based propagation from shared `Terrain3DData` |
| CryEngine | Quadtree LOD | PhysX heightfield | Same heightmap source, physics at fixed res |

**Key quotes from GameDev.net:**
> "Physics and graphics are entirely different beasts. Keeping physics separated from graphics makes things easier."

> "Tessellation does not change physics representation, as it is already 'accurate enough' for simulation purposes, leaving tessellation as a purely graphical effect."

> "The GPU might use 16-bit floats, gameplay code might use regular floats, and physics may break the image into chunks and organize them in a min/max quadtree for faster ray-tracing/collision queries."

### Our Approach vs Industry

Most commercial engines **accept minor discrepancies** between collision and rendering. Unreal allows collision mip levels 0-5, meaning collision can be 1/4 or even 1/32 the rendering resolution. Rendering varies per frame with camera distance; collision is fixed.

**Our system achieves zero discrepancy by design.** The `BakedHeightProvider` reads the exact same `Float32Array` that the GPU vertex shader samples via its R32F DataTexture. The half-texel UV correction ensures texel centers align. The `HeightQueryCache` quantizes to 0.1m (sub-decimeter, well below perceptible threshold).

This is above the industry standard for CPU/GPU height consistency. The tradeoff is that heightmap resolution directly affects both rendering detail AND collision fidelity, which is why the LOD level auto-scaling fix was critical.

---

## 5. WebGPU: What Changes

### 5.1 Tessellation - Not Available

WebGPU does not support hardware tessellation shaders. No timeline for inclusion. The Metal vs D3D12/Vulkan impedance mismatch makes this architecturally difficult.

**Workarounds:**
- Compute shader pre-tessellation (generate subdivided meshes in compute pass, render with standard pipeline)
- CPU-side adaptive tessellation (what CDLOD already does)
- Vertex shader displacement (what we do now)

### 5.2 Compute Shaders - Available and Production-Viable

The biggest WebGPU advantage for terrain:

- **GPU-driven LOD selection:** Compute pass evaluates quadtree nodes against frustum/distance, writes indirect draw arguments. Zero CPU involvement per-patch.
- **Heightmap baking:** Procedural noise (FBM, domain-warped Perlin) entirely in compute shaders, writing to storage textures.
- **GPU-driven culling:** Vegetation and terrain patches culled on GPU, dispatch via `drawIndirect`.

The [WebGPU-Erosion-Simulation](https://github.com/GPU-Gang/WebGPU-Erosion-Simulation) project demonstrates compute-shader terrain at ~40 FPS on 4.5K resolution heightmaps.

### 5.3 Three.js WebGPU Renderer (TSL)

**Status:** Available and improving, but not the default recommendation for our current stack.

**What works:**
- `import { WebGPURenderer } from 'three/webgpu'` with zero-config fallback
- TSL (Three Shader Language) for JavaScript-based shader authoring
- Compute shaders via `instancedArray()`, `storage()`, `compute()`
- `IndirectStorageBufferAttribute` (r174+): GPU-driven rendering
- Official [procedural terrain example](https://threejs.org/examples/webgpu_tsl_procedural_terrain.html)

**Known issues:**
- **UBO performance regression:** 50K cubes at 40 FPS on WebGL but 3-6 FPS on WebGPU due to per-object UBO overhead. Instancing/batching required.
- TSL maturity gaps (memory leaks, missing features)
- Safari quirks (no timestamp queries, stricter validation)

**Official alignment note:** Three.js currently documents `WebGLRenderer` as the recommended choice for pure WebGL 2 applications. `WebGPURenderer` is the next-generation path, but:
- `onBeforeCompile()` material customizations are not supported there and must be ported to node materials/TSL.
- `EffectComposer`-style post-processing is not a drop-in match and also requires migration.

**Assessment:** Our terrain surface is heavily invested in `MeshStandardMaterial.onBeforeCompile` shader injection, and the broader runtime still uses a WebGL-first post stack. So even though the terrain itself is already well batched, the correct posture is still "experiment later, do not migrate yet."

### 5.4 Mesh Shaders - Not Available

[gpuweb#3015](https://github.com/gpuweb/gpuweb/issues/3015): Assigned to "Milestone 4+" with no timeline. Blocked by mobile GPU limitations and V1 completion priority.

**Equivalent today:** Compute shader + indirect draw pipeline achieves similar results without mesh shader API.

### 5.5 What WebGPU Migration Would Look Like

| Capability | WebGL2 (Current) | WebGPU (Available Now) | WebGPU (Future) |
|------------|-------------------|------------------------|-----------------|
| Terrain LOD | CPU quadtree + InstancedMesh | Compute quadtree + indirect draw | Mesh shaders (no timeline) |
| Heightmap bake | CPU-side, upload DataTexture | Compute shader, storage texture | Same |
| Morphing | Vertex shader | Vertex shader or compute prepass | Same |
| Vegetation culling | CPU frustum cull | Compute cull + indirect draw | Mesh shader culling |
| Tessellation | N/A (pre-subdivided grid) | Compute pre-tessellation | Hardware (no timeline) |
| Near-field BVH | CPU rebuild | Compute rebuild | Same |
| Detail displacement | onBeforeCompile injection | TSL node composition | Same |

### 5.6 Babylon.js Comparison

Babylon.js does not have a built-in advanced LOD terrain system. Their community Dynamic Terrain extension is a basic clipmap, less sophisticated than our CDLOD. A community member built a [CDLOD with geomorphing demo](https://forum.babylonjs.com/t/heightmap-with-cdlod-quadtree-and-geomorphing-demo/56772) in Babylon.js, validating that CDLOD works well in browser engines generally.

Babylon.js v9.0 (experimental) adds large-world rendering with floating-origin, relevant for our 21km A Shau map if we hit 32-bit float precision jitter (at 21km, float32 gives ~1mm precision at edges - borderline but currently fine).

---

## 6. Virtual Texturing and Streaming

### 6.1 Virtual Texturing

**Architecture:** Conceptually massive texture (128K x 128K), page table for virtual-to-physical mapping, fixed-size physical atlas with LRU eviction, feedback pass identifying needed pages.

**Used by:** Unreal Engine (Runtime Virtual Texturing), Far Cry 4 (10 texels/cm across 10km x 10km), PLAYERUNKNOWN Productions.

**Assessment for us:** Our splatmap + triplanar approach in `TerrainMaterial.ts` is simpler and appropriate at our scale. Virtual texturing pays off when unique surface detail (mud paths, blast craters) must span a large world. We don't have that requirement. Engineering cost is substantial: feedback passes, page managers, indirection textures, async streaming.

### 6.2 Heightmap Streaming

**The problem:** 10km+ worlds at 1m resolution = 100M+ samples. Can't fit in a single GPU texture.

**Approaches:**
1. **Toroidal clipmap update:** Ring buffers with 2D wraparound addressing. Only L-shaped regions update per frame.
2. **Chunked streaming:** 64x64m chunks as compact binary packages. Progressive refinement (17x17 base -> 33x33 -> 65x65). Delta encoding + entropy coding: 8.4KB raw -> 1-2KB compressed. Predictive pre-fetching based on player velocity.
3. **Memory budget example (Cinevva guide):** ~256MB total terrain (5-10MB heightmap cache, ~50MB GPU geometry, ~100MB textures, ~50MB vegetation, ~50MB SDF volumes).

**Our situation:** A Shau uses a 21km DEM loaded entirely as one R32F DataTexture in HeightmapGPU. At current resolution (512 grid for 21km = ~41m/sample) this is only ~1MB. Scaling to higher-resolution DEM data (e.g., 1m/sample = 441M samples) would require tiled streaming.

**Assessment:** Not needed at current resolution. If we add high-resolution DEM data for A Shau, tiled streaming matching resolution to LOD distance is the natural evolution. The progressive refinement pattern is well-documented.

---

## 7. Scorecard: Our System vs Industry

| Capability | Our Implementation | Industry Standard | Rating |
|-----------|-------------------|-------------------|--------|
| LOD algorithm | CDLOD quadtree | CDLOD / Geoclipmaps / Nanite | On par |
| Draw calls | 1 (InstancedMesh) | 1-10 typical | Excellent |
| Vertex morphing | Per-instance morph factor | Same pattern | On par |
| Height data format | Baked Float32Array, R32F texture | Same pattern | On par |
| CPU/GPU consistency | Exact match (BakedHeightProvider) | Usually approximate (different mips) | **Above average** |
| Raycast acceleration | Near-field BVH mesh (200m) | BVH / min-max quadtree | On par |
| Texture blending | Splatmap + triplanar + anti-tiling | Virtual texturing / RVT | Simpler, appropriate |
| LOD auto-scaling | `computeMaxLODLevels()` targets <=4m | Similar screen-space-error metrics | On par |
| Heightmap streaming | None (full in memory) | Tiled/clipmap streaming | **Gap for high-res DEM** |
| GPU-driven LOD | CPU quadtree traversal | GPU compute selection | **Evolutionary opportunity** |
| Tessellation | Vertex shader displacement | Hardware tessellation (native) | Platform constraint |
| Vegetation stagger | Skip BVH rebuild on veg frame | Budget-based frame scheduling | On par |

**Overall assessment:** The system is well-designed for its constraints (WebGL2, browser, Three.js). The one-way baking pipeline (noise -> GPU texture -> CPU cache) is cleaner than most engine approaches. CPU/GPU consistency is stronger than industry standard. The main gaps are platform constraints (no compute/tessellation in WebGL2) and streaming (not needed at current scale).

---

## 8. Pivot Options

### Option A: Stay the Course (WebGL2 CDLOD) - Recommended

**What it is:** Keep current architecture. Tune LOD parameters, heightmap resolution tiers, and frame budgets as world sizes grow.

**Pros:**
- Proven, working, well-understood
- 1 draw call, good performance characteristics
- CPU/GPU consistency already above industry standard
- No migration risk

**Cons:**
- CPU quadtree traversal (~0.3ms/frame) doesn't scale to extreme tile counts
- No compute shader offloading
- Heightmap resolution capped at 1024 (current max)

**When to reconsider:** When `frontier30m` soak tails are traced to quadtree traversal or instance buffer uploads.

### Option B: WebGPU Compute-Driven Quadtree

**What it is:** Move quadtree traversal and tile selection into WebGPU compute shaders. Use `drawIndirect` to eliminate CPU-GPU sync for tile rendering.

**Pros:**
- Eliminates CPU quadtree cost entirely
- GPU-side morph factor computation
- Removes per-frame instance buffer upload
- Natural path from current architecture (same conceptual model, GPU execution)

**Cons:**
- Requires WebGPU (no WebGL2 fallback for indirect draws)
- Three.js WebGPU UBO performance issue for non-terrain objects
- Significant engineering effort
- New debugging complexity (GPU compute is harder to inspect)

**Prerequisites:** Three.js WebGPU UBO fix, Safari WebGPU stability, validation of combatant rendering performance under WebGPU.

### Option C: Geometry Clipmaps

**What it is:** Replace CDLOD quadtree with concentric ring buffers. Fixed grid per ring, toroidal update as camera moves.

**Pros:**
- Simpler data structures
- Natural fit for heightmap streaming
- Steady rendering rate (fixed ring count)
- Well-documented (GPU Gems 2, Godot Terrain3D)

**Cons:**
- Lateral move, not a clear upgrade from CDLOD
- Uniform triangle distribution per ring (CDLOD adapts better)
- 6-11 draw calls instead of 1
- Would require rewriting quadtree, renderer, and material

**Assessment:** Only consider if heightmap streaming becomes critical AND we can't add streaming to CDLOD.

### Option D: CBT (Concurrent Binary Trees)

**What it is:** GPU-parallel bisection-based tessellation using atomic operations on a compact bit array. The frontier of terrain rendering research.

**Pros:**
- <0.2ms terrain tessellation
- Scales to planetary rendering at centimeter detail
- Handles arbitrary polygon meshes (not just heightmaps)
- Elegant theoretical foundation

**Cons:**
- No Three.js or WebGL implementation exists
- Requires WebGPU compute shaders
- Major engineering investment (new data structures, shaders, CPU interface)
- Academic - no shipped browser game uses this

**Assessment:** Watch and learn. If someone ships a Three.js CBT terrain, evaluate adoption. Don't build from scratch.

### Option E: Fragment-Level Displacement (Detail Layer)

**What it is:** Add Parallax Occlusion Mapping (POM) to the fragment shader for close-up terrain detail, on top of the existing vertex-displaced mesh.

**Pros:**
- Higher apparent detail without more geometry
- Well-understood technique (GPU Gems 3, LearnOpenGL)
- Can be added incrementally to existing material
- Good for rocky surfaces, trails, craters

**Cons:**
- Silhouette edges remain flat (geometry doesn't change)
- 8-32 extra texture samples per fragment
- Not suitable for large-scale terrain shape (only surface detail)
- Doesn't help with CPU/GPU consistency (purely visual)

**Assessment:** Good incremental enhancement for visual quality. Low risk, medium reward. Could add to close-up LOD 0 tiles only.

### Option F: Heightmap Resolution Tiers

**What it is:** Instead of one global heightmap resolution, use multiple resolution tiers matching LOD levels. LOD 0 gets a high-res heightmap; LOD 3+ uses progressively coarser data.

**Pros:**
- Better vertex/texel alignment at all LOD levels
- Reduces texture memory for distant terrain
- Conceptually similar to mipmap chains

**Cons:**
- Multiple texture uploads or atlas management
- Material shader becomes more complex (select mip per tile)
- BakedHeightProvider would need to handle multiple resolutions

**Assessment:** Natural evolution if we need higher near-field detail. Could be implemented as a heightmap mipmap chain with per-tile mip selection in the vertex shader.

---

## 9. Recommendations

### Short Term (Current Sprint)

**Do nothing to the terrain architecture.** The LOD auto-scaling fix resolved the Open Frontier bug. The system is sound. Focus on:
- Measure `frontier30m` soak tails to determine if terrain is still the bottleneck
- If terrain-led, profile whether CPU quadtree traversal or instance buffer upload dominates

### Medium Term (Next Quarter)

1. **Heightmap resolution tier investigation:** If 1024 grid is insufficient for visual quality at large scales, prototype a 2-level heightmap (high-res near camera, low-res far) using the existing mip infrastructure.

2. **Fragment-level detail (POM):** If close-up terrain looks flat, add Parallax Occlusion Mapping to LOD 0 tiles. Low risk, incremental.

3. **Streaming investigation:** If A Shau needs higher-resolution DEM data, design the tiled heightmap streaming architecture. The chunked progressive refinement pattern (17x17 -> 33x33 -> 65x65) is well-documented and fits the CDLOD model.

### Long Term (WebGPU Era)

4. **WebGPU compute-driven quadtree:** When Three.js WebGPU matures (UBO fix lands, Safari stable), prototype moving quadtree traversal to a compute shader with `drawIndirect`. This is the natural evolution of CDLOD, not a rewrite.

5. **CBT evaluation:** Monitor Dupuy's Concurrent Binary Trees work. If a Three.js-compatible implementation emerges, evaluate it as a CDLOD replacement for planetary-scale scenarios.

---

## 10. Sources

### Papers and Academic
- [CDLOD Paper - Filip Strugar, 2009](https://aggrobird.com/files/cdlod_latest.pdf)
- [Geometry Clipmaps - Hoppe, 2004](https://hhoppe.com/geomclipmap.pdf)
- [GPU Gems 2, Ch.2 - Geometry Clipmaps (Losasso/Hoppe)](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry)
- [GPU Gems 3, Ch.18 - Relaxed Cone Stepping](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-18-relaxed-cone-stepping-relief-mapping)
- [Concurrent Binary Trees - Dupuy, 2020](https://onrendering.com/data/papers/cbt/ConcurrentBinaryTrees.pdf)
- [CBT for Large-Scale Game Components - Benyoub/Dupuy, 2024](https://arxiv.org/abs/2407.02215)
- [Large-Scale Terrain LOD with GPU Tessellation (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S1110016821000326)

### Engine Documentation
- [Unreal Engine: Nanite with Landscapes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-nanite-with-landscapes-in-unreal-engine)
- [Unreal Engine: Landscape Collision Guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/landscape-collision-guide-in-unreal-engine)
- [Unreal Engine: Runtime Virtual Texturing](https://dev.epicgames.com/documentation/en-us/unreal-engine/runtime-virtual-texturing-in-unreal-engine)
- [Babylon.js Dynamic Terrain](https://github.com/BabylonJS/Extensions/blob/master/DynamicTerrain/documentation/dynamicTerrainDocumentation.md)
- [Babylon.js Large World Rendering](https://forum.babylonjs.com/t/new-large-world-rendering/61114)

### WebGPU Specifications and Status
- [WebGPU Tessellation Investigation - gpuweb#445](https://github.com/gpuweb/gpuweb/issues/445)
- [WebGPU Mesh Shaders - gpuweb#3015](https://github.com/gpuweb/gpuweb/issues/3015)
- [WebGPU Indirect Draw Best Practices - Toji.dev](https://toji.dev/webgpu-best-practices/indirect-draws.html)
- [WebGPU Compute with Vertex Data - Toji.dev](https://toji.dev/webgpu-best-practices/compute-vertex-data.html)
- [Multi-draw Indirect - Chrome 131](https://developer.chrome.com/blog/new-in-webgpu-131)

### Three.js WebGPU
- [Three.js WebGPU Procedural Terrain Example](https://threejs.org/examples/webgpu_tsl_procedural_terrain.html)
- [Three.js IndirectStorageBufferAttribute](https://threejs.org/docs/pages/IndirectStorageBufferAttribute.html)
- [Three.js drawIndirect - #28389](https://github.com/mrdoob/three.js/issues/28389)
- [TSL Missing Features - #32969](https://github.com/mrdoob/three.js/issues/32969)
- [WebGPU Performance Issue - Three.js Forum](https://discourse.threejs.org/t/webgpu-performance-issue/87939)
- [What Changed in Three.js 2026](https://www.utsubo.com/blog/threejs-2026-what-changed)
- [WebGPU Migration Guide - Utsubo](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)
- [Field Guide to TSL and WebGPU - Maxime Heckel](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/)

### Open Source Implementations
- [CDLOD Reference - GitHub (fstrugar)](https://github.com/fstrugar/CDLOD)
- [Three.js CDLOD Terrain - GitHub (tschie)](https://github.com/tschie/terrain-cdlod)
- [WebGPU Erosion Simulation - GitHub (GPU-Gang)](https://github.com/GPU-Gang/WebGPU-Erosion-Simulation)
- [Terrain3D - Godot Plugin](https://github.com/TokisanGames/Terrain3D)
- [Bevy Terrain Renderer (UDLOD)](https://github.com/kurtkuehnert/terrain_renderer)
- [Babylon.js CDLOD/Geomorphing Demo](https://forum.babylonjs.com/t/heightmap-with-cdlod-quadtree-and-geomorphing-demo/56772)

### Architecture Guides
- [Landscape Generation for Browser Open Worlds - Cinevva](https://app.cinevva.com/guides/landscape-generation-browser)
- [CDLOD Implementation Walkthrough - svnte.se](https://svnte.se/cdlod-terrain)
- [Virtual Texture Terrain - GameDev.net](https://www.gamedev.net/tutorials/programming/graphics/virtual-texture-terrain-r3278/)
- [How Virtual Textures Really Work - shlom.dev](https://www.shlom.dev/articles/how-virtual-textures-really-work/)
- [Far Cry 4 Adaptive Virtual Texturing - GDC](https://gdcvault.com/play/1021761/Adaptive-Virtual-Texture-Rendering-in)
- [vterrain.org LOD Papers Index](http://vterrain.org/LOD/Papers/)

### GameDev Community
- [Terrain Heightmap CPU vs GPU - GameDev.net](https://www.gamedev.net/forums/topic/685339-terrain-by-heightmap-on-cpu-vs-gpu/5327323/)
- [Terrain Tessellation and Collision - GameDev.net](https://www.gamedev.net/forums/topic/663797-terrain-tesselation-and-collision/5198548/)
- [GPU Terrain Physics - GameDev.net](https://www.gamedev.net/forums/topic/629999-gpu-terrain-physics/)
- [Nanite Tessellation vs VHM - UE Forum](https://forums.unrealengine.com/t/nanite-tessellation-vs-virtual-heightfield-mesh/2150265)
- [Babylon.js Advanced Terrain with LOD](https://forum.babylonjs.com/t/advanced-terrain-with-lod/49385)
