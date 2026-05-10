# cdlod-edge-morph: kill LOD-transition seam cracks via per-edge force-morph + corrected snap math

**Slug:** `cdlod-edge-morph`
**Cycle:** `cycle-2026-05-09-cdlod-edge-morph` (single-task hot-fix cycle, inserted as 2.4 ahead of Phase 2.5)
**Round:** 1
**Priority:** P1 — user-reported visible white seam cracks at chunk borders from helicopter altitude on A Shau (screenshot 2026-05-09). The Stage D1+D2 fix from `terrain-cdlod-seam` (cycle-2026-05-08) closed same-LOD parity but not LOD-transition seams.
**Playtest required:** YES (visual A/B at A Shau north ridgeline at helicopter altitude, before/after screenshots).
**Estimated risk:** medium-high — touches CDLOD vertex shader, the per-instance attribute stride, and the quadtree neighbor-pass. All three are hot-path. Each stage is independently revertable.
**Budget:** ≤500 LOC source + ≤300 LOC tests.
**Predecessor:** `terrain-cdlod-seam` (Stage D1 same-LOD AABB-distance + Stage D2 skirts + Shift+\ → Y overlay), all landed.

## Files touched

- Modify: `src/systems/terrain/CDLODQuadtree.ts` — extend `CDLODTile` with `edgeMorphMask: number`; add a post-recursion neighbor-pass that fills it.
- Modify: `src/systems/terrain/CDLODRenderer.ts` — add `edgeMorphMask` per-instance attribute alongside `lodLevel` and `morphFactor`.
- Modify: `src/systems/terrain/TerrainMaterial.ts` — vertex shader: fix `parentStep` math; consume `edgeMorphMask` to force `morphFactor = 1.0` on edges abutting a coarser neighbor.
- Modify: `src/systems/terrain/CDLODQuadtree.test.ts` — add LOD-transition mask tests; reuse the existing same-LOD parity test as a non-regression guard.
- Add: `src/systems/terrain/TerrainMaterial.morph.test.ts` — pure-JS port of the snap+morph formula (current and new) with parity assertions across coincident world XYs at LOD transitions.
- Add or extend: `src/systems/terrain/CDLODRenderer.test.ts` — assert the new instanced attribute is wired and updates per frame.

## Required reading first

- `docs/TESTING.md`
- `docs/INTERFACE_FENCE.md` — `ITerrainRuntime` is fenced; not touched.
- `src/systems/terrain/CDLODQuadtree.ts` (full file — 188 lines).
- `src/systems/terrain/CDLODRenderer.ts` (full file — 196 lines).
- `src/systems/terrain/TerrainMaterial.ts` lines 14-81 (vertex shader portion only).
- `src/ui/debug/worldOverlays/terrainSeamOverlay.ts` — predecessor diagnostic, used in Stage 0 validation.
- `docs/tasks/archive/cycle-2026-05-08-perception-and-stuck/terrain-cdlod-seam.md` — predecessor task; understand what D1+D2 did and explicitly didn't.

## Diagnosis

User screenshot (`C:\Users\Mattm\Downloads\terrain artifacting.png`) shows thin white slivers between terrain tiles at helicopter altitude, A Shau. Analysis of the codebase identifies **three converging defects** that explain why LOD-transition seams escaped the predecessor fix:

1. **Morph factor cannot agree across LOD levels.** `CDLODQuadtree.computeMorphFactor` (lines 142-148) is `(dist - lodRanges[L]·morphStart) / (lodRanges[L]·(1−morphStart))` — a function of LOD-N's range only. A fine and a coarse tile sharing an edge normalize against different ranges and produce different morph factors at that edge, even though Stage D1's AABB metric makes them see the same `dist`.
2. **Shader snap grid is off-by-one from the actual parent vertex grid.** `TerrainMaterial.ts:35` uses `parentStep = 2.0 / tileGridResolution`, but the geometry's interior vertex spacing in normalized tile space is `1.0 / (tileGridResolution − 1)` (`CDLODRenderer.ts:27`). The snap grid spacing is `2/N` while the true parent grid spacing is `2/(N−1)` — a `(N−1)/N` mismatch (≈3% for N=33). At full morph, fine edge vertices snap to "near-parent," not the coarse neighbor's actual vertex positions.
3. **Skirt drop is too small for the steep DEM gradients.** `TerrainMaterial.ts:66` sets skirt drop to `4·(lodLevel+1)` m. On the A Shau north ridgeline a coarse texel can span 10–30 m of relief, exceeding the 4–8 m skirt. (Out of scope here — addressed only as a follow-up if needed.)

Defects 1 and 2 produce a true geometric gap between fine and coarse tiles at LOD transitions. Defect 3 means the skirts can't cover for it. White pixels are sky/horizon fog showing through (clear color is `0x7a8f88`, `GameRenderer.ts:19` — not white).

## Fix

### Stage 0 — Diagnosis pre-check (human, OPTIONAL — recommended pre-dispatch)

This step does not block the executor. The diagnosis confidence is high (root causes traced to specific lines in `TerrainMaterial.ts` and `CDLODQuadtree.ts`), and the post-impl visual A/B (Stage 5) is the real signal. But if the human has 60 seconds before running `/orchestrate`, capturing before-screenshots makes the post-impl confirmation unambiguous.

Procedure (human, ≤2 min):

1. Spawn locally, fly helicopter to the A Shau north ridgeline coordinate from the original screenshot.
2. Press `Shift+\` then `Y` to enable the Terrain Seams overlay (`src/ui/debug/worldOverlays/terrainSeamOverlay.ts`).
3. Capture screenshot. **Expected:** red overlay lines coincide with white cracks. If they do NOT coincide, **abort the task before dispatch** — the diagnosis is wrong (alternate culprits: clear-color regression, transparent material, MSAA edge resolve at depth discontinuity), and the executor would change code without fixing the bug.
4. Toggle wireframe via `debugWireframe` uniform (`TerrainMaterial.ts:497-509`). **Expected:** white cracks track LOD-color boundaries (LOD0 green ↔ LOD1 blue, etc.).
5. Save both screenshots into `artifacts/cdlod-edge-morph/before/`.

If the human skips this step, the executor proceeds to Stage 1 directly. Stage 5 visual A/B will surface whether the fix worked.

### Stage 1 — Fix the snap-grid math

`src/systems/terrain/TerrainMaterial.ts:35`. Change:

```glsl
float parentStep = 2.0 / tileGridResolution;
```

to:

```glsl
float parentStep = 2.0 / (tileGridResolution - 1.0);
```

Effect: the snap grid now coincides with the actual parent vertex grid (in tile-local space). At `morphFactor = 1.0`, fine edge vertices land exactly on a parent grid position. World-space coincidence with the abutting coarse tile additionally requires Stage 2.

Self-check: a fine vertex at index `i` (so `position.x = i/(N-1) - 0.5`, `gridPos.x = i/(N-1)`) divided by the new `parentStep = 2/(N-1)` equals `i/2`. Adding 0.5 and flooring rounds even `i` to `i/2` and odd `i` to `(i+1)/2` — exactly "snap to nearest parent vertex" with parent vertex spacing `2/(N-1)`. The old version snapped to a slightly-too-coarse grid that drifted away from the true parent.

### Stage 2 — Per-edge "neighbor coarser" mask

#### 2a. Quadtree: emit the mask

`src/systems/terrain/CDLODQuadtree.ts`. Extend `CDLODTile`:

```ts
export interface CDLODTile {
  x: number;
  z: number;
  size: number;
  lodLevel: number;
  morphFactor: number;
  /** Bitmask: 1 = +Z (north) coarser, 2 = +X (east) coarser, 4 = -Z (south) coarser, 8 = -X (west) coarser */
  edgeMorphMask: number;
}
```

After `selectTiles` finishes filling `tileBuffer[0..tileCount]`, run a single neighbor-resolution pass:

1. Build a Map keyed by a stable string `${cx}|${cz}|${size}` → tile index. (Tile centers and sizes come from a strict binary subdivision so equality on these is exact within float precision; no epsilon needed.)
2. For each emitted tile, for each of 4 cardinal directions, compute the position of the same-size and the next-size-up neighbor center. Look them up. The neighbor at the same XZ location with `size > this.size` (coarser) sets the corresponding bit. If no such neighbor exists (world edge, or the neighbor is at the same or finer LOD), the bit stays 0.

Concretely for the +X edge of tile `T` at `(x, z, size)`: a same-size neighbor would be at `(x + size, z, size)`. A coarser neighbor (parent-level) would be at `(x + 0.75·size, z + ±0.25·size, 2·size)` — actually simpler: the coarser neighbor's center XZ is the unique tile whose AABB contains `(x + size + ε, z, ε)` for some small ε at any size larger than `size`. Iterate `s = size·2, size·4, ..., worldSize` and look up `(roundToGrid(x + size + halfStep, s), roundToGrid(z, s), s)`. First hit wins; if any hit has size > tile.size, set the bit.

Performance note: typical tile count is < 256. The neighbor-pass is O(tiles × 4 × maxLOD) lookups against a Map of size `tiles`. Budget: ≤ 0.05 ms additional in `selectTiles` (current selection is < 0.3 ms). Add a perf assertion in tests.

Initialize `edgeMorphMask = 0` at tile-pool init alongside the other fields, and reset to 0 in `emitTile` (line 150-159) before the post-pass overwrites it.

#### 2b. Renderer: pipe the attribute through

`src/systems/terrain/CDLODRenderer.ts:106-150`. Add a third InstancedBufferAttribute:

```ts
private edgeMorphMaskAttr: THREE.InstancedBufferAttribute;
// in constructor:
const edgeMaskData = new Float32Array(maxInstances);
this.edgeMorphMaskAttr = new THREE.InstancedBufferAttribute(edgeMaskData, 1);
geo.setAttribute('edgeMorphMask', this.edgeMorphMaskAttr);
```

In `updateInstances` (line 162-181):

```ts
this.edgeMorphMaskAttr.array[i] = tile.edgeMorphMask;
// ... after loop:
this.edgeMorphMaskAttr.needsUpdate = true;
```

Use `Float32Array` (not `Uint8Array`). InstancedBufferAttribute on Three.js r184 accepts integer types but float is the safe interop with the GLSL `attribute float`. The shader does the int conversion.

#### 2c. Vertex shader: force-morph on flagged edges

`src/systems/terrain/TerrainMaterial.ts:14-31` — declare the new attribute:

```glsl
attribute float edgeMorphMask;
```

`TerrainMaterial.ts:33-42` — apply edge force-morph BEFORE the existing snap. The geometry's `gridPos = position.xz + 0.5` is in `[0, 1]`, with `0` and `1` exactly hit by perimeter vertices.

```glsl
float effectiveMorph = morphFactor;
const float EDGE_EPS = 1.0e-4;
int mask = int(edgeMorphMask + 0.5);

// gridPos.y maps from position.z (the second axis of the XZ plane). +Z (north) at gridPos.y == 1.
if (gridPos.y >= 1.0 - EDGE_EPS && (mask & 1) != 0) effectiveMorph = 1.0; // N
if (gridPos.x >= 1.0 - EDGE_EPS && (mask & 2) != 0) effectiveMorph = 1.0; // E
if (gridPos.y <= EDGE_EPS         && (mask & 4) != 0) effectiveMorph = 1.0; // S
if (gridPos.x <= EDGE_EPS         && (mask & 8) != 0) effectiveMorph = 1.0; // W

vec2 snapped = floor(gridPos / parentStep + 0.5) * parentStep;
vec3 morphedPos = vec3(
  mix(gridPos.x, snapped.x, effectiveMorph) - 0.5,
  position.y,
  mix(gridPos.y, snapped.y, effectiveMorph) - 0.5
);
```

WebGL2 is the build target (verify in `vite.config.*` before coding); bitwise int ops are spec-supported. If WebGL1 fallback is in scope anywhere, swap to four float attributes (`edgeMorphN/E/S/W`, each 0 or 1) instead of a packed mask. Confirm before coding.

The skirt vertices duplicate perimeter interior vertices and inherit their `gridPos`, so they pick up `effectiveMorph` identically — skirts under a flagged edge also fully morph, and their drop math at line 66 stays unchanged.

### Stage 3 — Skirts unchanged

Keep `skirtDrop = max(2.0, 4.0 * (lodLevel + 1.0))` at `TerrainMaterial.ts:66`. After Stages 1+2 the geometry should meet exactly at LOD transitions. Skirts become a sub-texel float-precision safety net only. If post-Stage-2 visual A/B still shows residual cracks on extreme DEM gradients, file a `cdlod-skirt-tighten` follow-up with per-tile worst-case-range attribute computed during the bake — out of scope here.

## Steps

1. Stage 0 (human, optional): if the human captured before-screenshots, they are at `artifacts/cdlod-edge-morph/before/`. Skip this step if not present and rely on Stage 5 visual A/B as the gate.
2. Read "Required reading first."
3. Confirm WebGL target (WebGL2 expected). Verify by reading `vite.config.*` and `index.html` for any WebGL1 fallback. If WebGL1 is in scope, swap the packed `edgeMorphMask` int attribute for 4 separate float attributes (`edgeMorphN/E/S/W`) throughout Stage 2.
4. Stage 1: change one line in `TerrainMaterial.ts:35`. Run existing tests; same-LOD parity test at `CDLODQuadtree.test.ts:130` must stay green.
5. Add `TerrainMaterial.morph.test.ts`: pure-JS port of the snap+morph formula. Test:
   - At full morph (factor=1) and `tileGridResolution = 33`, every fine vertex `i` snaps to `(i + i%2)/2 * (2/(N-1)) - 0.5` in tile-local space.
   - At full morph, two adjacent tiles at same LOD compute the same morphed XZ for vertices on their shared edge. (Same-LOD non-regression.)
6. Stage 2a: extend `CDLODTile`, add the neighbor-pass to `CDLODQuadtree.selectTiles`. Reset `edgeMorphMask = 0` in `emitTile`. Add unit test scene: small world (256m, 3 LODs), camera at fixed offset that produces exactly one LOD0/LOD1 boundary, assert correct mask bits on the LOD0 tiles abutting the LOD1, mask=0 elsewhere.
7. Stage 2b: wire the per-instance attribute in `CDLODRenderer`. Extend `CDLODRenderer.test.ts` (or add it) — assert the attribute exists on the geometry, has the right size, and `updateInstances` writes the tile's mask.
8. Stage 2c: add the shader edge-force-morph branch. Add a JS-port test: at `morphFactor = 0`, an edge vertex on a flagged side returns the same `effectiveMorph = 1` result as a non-edge vertex at `morphFactor = 1`.
9. Stage 2d (LOD-transition parity test): in `TerrainMaterial.morph.test.ts`, simulate two abutting tiles (LOD0 with edge bit set, LOD1 without). Assert their world-space XZ at coincident points along the shared edge match within 1e-5. This is the test that *would have* caught the original bug.
10. Run `npm run lint && npm run test:run && npm run build`.
11. `/perf-capture` against the latest baseline. Hard stop on > 5% combat120 frame-time regression. (Expected delta: zero — the shader adds 4 cheap branches per vertex; the quadtree adds a small post-pass.)
12. Commit each stage as its own commit on `task/cdlod-edge-morph`. Three commits: snap-math, quadtree+attribute, shader+tests.
13. Push branch. **DO NOT run `gh pr create`.** Orchestrator integrates separately.
14. Save after-screenshots into `artifacts/cdlod-edge-morph/after/` matching the before-set.
15. Report.

## Verification (local)

- `npm run lint` — pass.
- `npm run test:run` — pass; new tests for snap math, edge mask, LOD-transition parity all green; existing `CDLODQuadtree.test.ts` and `TerrainMaterial.test.ts` stay green.
- `npm run build` — pass.
- `/perf-capture` — combat120 within ±2% of latest baseline.
- Visual A/B at A Shau north ridgeline (helicopter altitude, screenshot coordinates from Stage 0): white cracks gone or near-zero. Seam overlay (`Shift+\` → `Y`) red-line count reduced ≥ 80% at the same camera position.
- `/playtest` golden path through Open Frontier, Zone Control, A Shau scenarios. No new visible artifacts (e.g. visible "snap" pop on flat ground when crossing a morph zone).

## Non-goals

- Do NOT change the AABB-distance metric from Stage D1; it's still required for same-LOD parity.
- Do NOT change `morphStart`, `lodRanges`, or `tileGridResolution` defaults.
- Do NOT touch `DEMHeightProvider` / `HeightmapGPU` / `BakedHeightProvider`. The fix is geometric, not heightmap-driven.
- Do NOT modify the seam overlay (`terrainSeamOverlay.ts`); it stays as the regression detector.
- Do NOT modify the `farCanopyTint` / fog logic at `TerrainMaterial.ts:389-426` even though it's the visual source of the "white" — the goal is to close the gap, not change what's visible behind it.
- Do NOT add a per-tile heightmap-range attribute for tighter skirts; that's a deferred follow-up if Stage 2 alone is insufficient.

## Hard stops

- Stage 0 prediction fails → ABORT and re-investigate. Diagnosis is wrong.
- Same-LOD parity test (`CDLODQuadtree.test.ts:130`) breaks after Stage 1 → revert immediately. The snap-math change has an unexpected interaction; investigate before reattempting.
- `THREE.InstancedMesh` validation error you can't resolve in <30 min on the new attribute → switch to four float attributes (`edgeMorphN/E/S/W`) and update the shader `if`s. Report.
- Selection-time regression > 0.1 ms in `CDLODQuadtree.selectTiles` perf test (currently < 0.3 ms) → the neighbor-pass is too slow; defer Stage 2 entirely and ship Stage 1 alone (will partially mitigate but not fix LOD-transition seams). Report.
- Diff > 500 LOC source (excluding tests) → STOP and reassess. This is a small surgical change.
- combat120 perf regression > 5% → revert and reassess. Likely the shader branch path is not constant-folded — try splitting to four explicit attributes.

## Report back

```
task_id: cdlod-edge-morph
branch: task/cdlod-edge-morph
pr_url: NONE_NO_PR_REQUESTED
files_changed: <N files, +A -D lines>
verification:
  - npm run lint: PASS
  - npm run test:run: PASS (X tests, Y ms)
  - npm run build: PASS
  - perf-capture combat120 delta: <+/-X%>
  - artifacts/cdlod-edge-morph/before/ + /after/ saved: yes
playtest_required: yes
surprises: <one or two lines, or "none">
fence_change: no
stages_landed: 1, 2  # or "1 only" if Stage 2 was hard-stopped
webgl_target: WebGL2  # confirm
```

## Rollback plan

Three independent commits on `task/cdlod-edge-morph`. Each is revertable without affecting the others:

1. `feat(terrain): correct CDLOD parent-step snap math` — single-line shader change. Revert in seconds.
2. `feat(terrain): emit edge-morph mask from CDLODQuadtree` — additive on the quadtree side; no shader read yet. Safe to revert independently.
3. `feat(terrain): force-morph at coarser-neighbor edges in vertex shader` — consumes the attribute from #2. Reverting this without #2 leaves an unused attribute on the geometry; harmless. Reverting #2 without this leaves the shader reading a missing attribute → revert in correct order if both go.

If post-merge a hot-path issue appears, revert order is reverse: #3, then #2, then #1 if needed. Stage 1 is the lowest-risk piece and should rarely need reverting.
