# Terrain Render/Collision Fix - 5 Solutions

**Date**: 2026-03-07
**Context**: GPU renders terrain via triangle interpolation between mesh vertices. CPU positions player/NPCs via bilinear interpolation of the heightmap grid. These disagree by 0.3-4m on large maps. Three previous fixes reduced but did not eliminate this.

---

## Solution 1: Dual-Resolution InstancedMesh (65x65 near, 33x33 far)

**The idea:** Use two InstancedMesh objects with different tile resolutions. LOD 0-1 tiles (near the player) get 65x65 vertex geometry. LOD 2+ tiles (distant) keep 33x33. This halves LOD 0 vertex spacing from 3.52m to 1.76m on Open Frontier, cutting the interpolation error ~4x to ~0.06m - imperceptible.

**Implementation:**
- CDLODRenderer holds 2 InstancedMesh objects, both added to the scene
- Each frame, `selectTiles()` partitions tiles by LOD level into two buckets
- Each InstancedMesh gets its own `updateInstances()` call
- Clone the TerrainMaterial (both reference same textures, different `tileGridResolution` uniform)
- The vertex shader morph logic already uses `tileGridResolution` - no shader changes needed

**Draw calls:** 1 -> 2-3. Cost: ~15-40 microseconds extra CPU. Effectively free.

**Triangle budget:**
| Component | Tiles | Tris/tile | Total |
|-----------|-------|-----------|-------|
| LOD 0-1 (65x65) | ~20-60 | 8,192 | 164K-492K |
| LOD 2+ (33x33) | ~100-150 | 2,048 | 205K-307K |
| **Total** | | | **~370K-800K** |

Desktop (RTX 3070): comfortable. Mobile (iPhone 14): within budget. Low-end Android: tight but feasible since LOD 0-1 tile count is small.

**What it fixes:** Near-player terrain (LOD 0-1) has vertex spacing close to heightmap resolution. The bilinear-vs-triangle interpolation error drops below perception threshold. Distant terrain still has the mismatch but nobody notices at LOD 2+ distance.

**What it doesn't fix:** The CPU still does bilinear interpolation. The error is reduced, not eliminated. On extremely steep A Shau ridgelines at LOD 0, there could be ~0.06m residual error.

**Effort:** Small. CDLODRenderer changes only. ~100-150 lines of new code. No architectural changes.

**Risk:** Low. Falls back to current behavior if the second InstancedMesh causes issues.

---

## Solution 2: CPU Triangle Interpolation (Match CPU to GPU math)

**The idea:** Replace the bilinear interpolation in `BakedHeightProvider.getHeightAt()` with triangle interpolation that exactly matches what the GPU rasterizer does. The CPU determines which triangle of the LOD 0 mesh grid covers the query point, then barycentric-interpolates the 3 vertex heights. This makes CPU height queries return the exact same value as the rendered surface at LOD 0.

**Three.js PlaneGeometry triangle topology (verified):**
Every quad uses a consistent "/" diagonal (bottom-left to top-right):
```
For quad (col, row):
  TL = row * cols + col          TR = row * cols + col + 1
  BL = (row+1) * cols + col      BR = (row+1) * cols + col + 1

  Triangle A: TL, BL, TR         (upper-left, "/" diagonal)
  Triangle B: BL, BR, TR         (lower-right)
```

**CPU interpolation rule** for fractional position (fx, fz) in [0,1] within a quad:
```typescript
if (fx + fz <= 1.0) {
  // Upper-left triangle
  height = hTL * (1 - fx - fz) + hBL * fz + hTR * fx;
} else {
  // Lower-right triangle
  height = hBL * (1 - fx) + hBR * (fx + fz - 1) + hTR * (1 - fz);
}
```

**Implementation:**
- BakedHeightProvider gets a new mode: triangle interpolation at a fixed mesh grid
- At bake time, compute the LOD 0 mesh vertex spacing: `meshStep = worldSize / (2^maxLODLevels * (tileResolution - 1))`
- For each height query, map world XZ to the mesh grid (not the heightmap grid)
- At each mesh vertex, sample the heightmap via bilinear (same as GPU texture2D at that vertex)
- Then triangle-interpolate between the 3 vertex samples
- This is stable and view-independent because it uses the LOD 0 grid, not the current frame's LOD

**What it fixes:** Eliminates the divergence at LOD 0 completely. Player and NPCs stand exactly where the GPU renders the surface (at LOD 0 resolution). At LOD 1+, there is still a mismatch, but those tiles are distant from the player.

**What it doesn't fix:** LOD 1+ divergence remains. If you stand on a LOD 1 tile boundary during a morph transition, you might see a brief mismatch. In practice this is rare and the error at LOD 1 is small.

**Effort:** Medium. Changes to BakedHeightProvider only. ~50-80 lines. Need to verify the mesh grid math matches the GPU exactly.

**Risk:** Medium. If the mesh grid calculation is off by half a step, the fix makes things worse. Needs careful unit testing against known vertex positions.

**Can combine with Solution 1:** Yes. Solution 1 reduces the error magnitude, Solution 2 eliminates the residual. Together they produce sub-millimeter accuracy.

---

## Solution 3: Pre-Displaced Merged BufferGeometry (Eliminate GPU heightmap sampling)

**The idea:** Instead of the GPU vertex shader sampling the heightmap texture to displace vertices, pre-compute all vertex Y positions on CPU and upload actual displaced geometry. Both CPU collision and GPU rendering read from the same displaced vertex data. The divergence vanishes because there is only one source of truth.

**Implementation:**
- Replace CDLODRenderer's InstancedMesh with a single large BufferGeometry
- After `selectTiles()` returns ~200 tiles, loop on CPU:
  - For each tile, compute 33x33 vertex world positions (XZ from tile transform, Y from BakedHeightProvider)
  - Write into a pre-allocated position attribute buffer
- Upload via `positionAttribute.needsUpdate = true` (one draw call)
- Vertex shader no longer samples the heightmap - just passes through pre-displaced positions
- LOD morphing moves to CPU (compute morphed XZ, sample height at morphed position)

**CPU cost per frame:**
- 200 tiles x 1,089 verts = ~218K vertices
- Each vertex: bilinear height lookup + position write = ~6 float ops
- ~1.3M float operations per frame
- Estimated: 0.5-2ms on Ryzen 3700X (depends on cache behavior of height lookups)

**GPU upload:**
- 218K verts x 3 floats x 4 bytes = ~2.6 MB/frame via bufferSubData
- Well within WebGL2 bandwidth. Typical: <0.5ms

**What it fixes:** Eliminates the divergence ENTIRELY. No interpolation mismatch possible. CPU and GPU use identical vertex positions.

**What it doesn't fix:** Nothing - this is a complete fix. But it changes the rendering architecture.

**What it loses:**
- No longer using InstancedMesh (can't instance unique geometry)
- LOD morphing must be computed on CPU instead of GPU
- The morph animation quality may degrade slightly if CPU can't do it every frame (could stagger)
- The terrain material vertex shader needs simplification (remove heightmap sampling)
- Vegetation GPU snapping (BillboardShaders.ts) still works since the heightmap texture is unchanged

**Effort:** Large. Rewrite of CDLODRenderer. New CPU morph computation. Vertex shader changes. ~300-500 lines of new code, significant testing.

**Risk:** Medium-high. The CPU morph computation is the tricky part. If it doesn't perfectly match the old GPU morph, LOD transitions will pop. Also, the 0.5-2ms CPU cost per frame could impact the p99 tail budget.

---

## Solution 4: GPU Snapping for Player Camera + NPCs (Visual-only fix)

**The idea:** Instead of making the CPU match the GPU, make everything rendered match the GPU. Vegetation already does this (commit 7c495fa). Extend the same approach to NPC sprites and the player camera.

**For NPCs:**
- NPC sprites are already billboards rendered by the GPU billboard system
- Add the same `terrainSnappingEnabled` logic from BillboardShaders.ts to NPC billboard rendering
- NPC visual Y = GPU heightmap sample + offset
- NPC collision Y stays at CPU bilinear height (for AI pathfinding, hit detection)
- The small collision/visual disagreement is invisible because NPCs are viewed from a distance

**For the player camera:**
- Render the terrain to a tiny 1x1 R32F render target at the player's XZ position using an orthographic camera looking straight down
- Read back the single pixel synchronously (1 float, ~0.05ms stall)
- Use this as the "true" terrain height under the player
- Set camera Y = GPU height + eye offset
- Keep CPU collision at bilinear height for physics (jumping, landing detection)

Alternatively, skip the readback entirely:
- In the main render pass, before rendering the scene, do a single texelFetch from the heightmap in a tiny GPGPU pass
- Use GPUComputationRenderer to compute the height at the player position, write to a 1x1 texture
- Read back async (1 frame latency for the first frame, then stable)

**What it fixes:** Everything LOOKS correct. Player camera is at the right height relative to the visible surface. NPCs are at the right height. Vegetation is at the right height. The visual problem is solved.

**What it doesn't fix:** CPU collision and GPU visual are still at different heights. This means:
- Bullet raycasts might miss by 0.3m vertically (barely noticeable at combat ranges)
- Physics (jumping off edges) uses a slightly different ground plane
- The 1-frame latency on spawn/teleport means the player briefly sees the wrong height

**Effort:** Medium. NPC billboard changes are straightforward (copy vegetation approach). Player camera readback is the complex part - either the sync readback stall or the GPGPU approach.

**Risk:** Medium. The sync readback (0.05ms for 1 pixel) is acceptable but adds to frame time tail. The GPGPU approach has 1-frame latency which could cause a visible bob on spawn. Two-truth-source bugs are subtle and hard to debug.

---

## Solution 5: Heightmap-Resolution Terrain Mesh (No LOD for near-field)

**The idea:** For the near-field terrain (within ~200m of the player), render a dedicated mesh where every vertex corresponds to one heightmap texel. This mesh has NO interpolation gap because mesh vertices and heightmap texels are 1:1. LOD terrain covers everything beyond 200m.

**Implementation:**
- Create a dedicated BufferGeometry covering a 400x400m patch centered on the player
- Vertex spacing = heightmap texel spacing (~3.1m for Open Frontier 1024 grid)
- Vertices: (400/3.1)^2 = ~16,600 vertices, ~33K triangles
- Y values set directly from BakedHeightProvider (exact texel values, no interpolation)
- This mesh renders ON TOP of (or replaces) the LOD 0-1 CDLOD tiles in the near field
- As the player moves, slide the mesh and update edge vertices
- CPU height queries within this patch use the same texel-exact values

**The critical property:** When the mesh vertex spacing equals the heightmap texel spacing, the GPU's texture2D bilinear sample at each vertex returns the exact texel value (no interpolation at texel centers). Between vertices, the GPU triangle interpolation and the CPU bilinear interpolation still disagree, BUT the mesh is so fine (3.1m spacing, matching the heightmap) that the error is <0.1m.

**What it fixes:** Near-player terrain is pixel-perfect to the heightmap. The 1:1 vertex-to-texel mapping eliminates the sampling mismatch at vertices. Between-vertex error is minimized by fine spacing.

**What it loses:**
- Extra mesh + draw call for the near field
- Must update the mesh as player moves (slide + edge update, ~200 verts/frame at walking speed)
- The CDLOD tiles underneath must be masked or clipped to avoid z-fighting
- Adds ~33K triangles to the scene (modest)

**Effort:** Medium. New dedicated mesh class. Integration with the CDLOD system for masking. ~200-300 lines.

**Risk:** Medium. Z-fighting between the near-field mesh and CDLOD LOD 0 is the main concern. Could use a small polygon offset or render the near-field mesh slightly above (+0.01m) and depth-clamp. Also need to handle the boundary between the near-field mesh and the CDLOD mesh smoothly.

---

## Comparison Matrix

| | Divergence Fix | Perf Cost | Code Effort | Risk | Mobile Safe |
|---|---|---|---|---|---|
| **1. Dual InstancedMesh** | ~95% (0.06m residual) | +1 draw call, +400K tris | Small (~150 LOC) | Low | Yes |
| **2. CPU Triangle Interp** | 100% at LOD 0 | Zero (CPU math only) | Medium (~80 LOC) | Medium | Yes |
| **3. Pre-Displaced Mesh** | 100% everywhere | +0.5-2ms CPU/frame | Large (~400 LOC) | High | Marginal |
| **4. GPU Snap Everything** | Visual 100% | +0.05ms readback | Medium (~200 LOC) | Medium | Yes |
| **5. Near-Field 1:1 Mesh** | ~99% near player | +33K tris, +1 draw | Medium (~250 LOC) | Medium | Yes |

---

## Recommended Approach

**Start with Solution 2 (CPU triangle interpolation).** It is the most surgical fix - change one file (BakedHeightProvider.ts), ~80 lines, zero performance cost, eliminates the root cause at LOD 0. The PlaneGeometry triangle topology is deterministic and verified. If this alone reduces the error to imperceptible levels, ship it and move on.

**If Solution 2 alone isn't enough** (steep A Shau ridgelines still show ~0.1m error at LOD 0), layer Solution 1 on top. The dual InstancedMesh halves vertex spacing to 1.76m, and combined with triangle interpolation, the residual error drops to ~0.01m.

**The combination of Solution 2 + Solution 1** gives you sub-centimeter accuracy near the player, zero GPU readback latency, no architectural changes, 2 draw calls instead of 1, and full mobile compatibility. Total effort: ~200 lines across 2-3 files.

Solution 3 (pre-displaced mesh) is the "correct" architectural answer but is a large rewrite with performance risk. Worth considering if you plan a major terrain overhaul, but overkill as a targeted fix.

Solution 4 (GPU snap everything) is a pragmatic visual fix but introduces two-truth-source complexity that will cause subtle bugs.

Solution 5 (near-field 1:1 mesh) is clever but the z-fighting management adds ongoing maintenance cost.
