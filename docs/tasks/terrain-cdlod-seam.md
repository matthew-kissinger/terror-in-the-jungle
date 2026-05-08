# terrain-cdlod-seam: kill white seams via min-distance morph + skirt geometry + diagnostic overlay

**Slug:** `terrain-cdlod-seam`
**Cycle:** `cycle-2026-05-08-perception-and-stuck`
**Round:** 1
**Priority:** P0 — user reports white streaks/cracks at chunk boundaries on A Shau (and possibly Open Frontier). Visible at multiple altitudes.
**Playtest required:** YES (visual A/B at A Shau north ridgeline before/after).
**Estimated risk:** medium — touches CDLOD hot path. Stage 1 is a small distance-metric change; Stage 2 (skirts) is geometry-side and adds verts.
**Budget:** ≤400 LOC including tests and the new diagnostic overlay.

## Files touched

- Modify: `src/systems/terrain/CDLODQuadtree.ts` — Stage D1 min-distance morph metric.
- Modify: `src/systems/terrain/CDLODRenderer.ts` — Stage D2 skirted geometry.
- Modify: `src/systems/terrain/TerrainMaterial.ts` — Stage D2 skirt branch in vertex shader.
- Add: `src/ui/debug/worldOverlays/terrainSeamOverlay.ts` — new overlay for `Shift+\` debugger.
- Modify: `src/ui/debug/WorldOverlayRegistry.ts` — register the new overlay.
- Modify: `src/core/GameRenderer.test.ts` (or add if absent) — assertion that `scene.background.getHex()` matches `INITIAL_FOG_COLOR` and is not pure white.
- Add: `src/systems/terrain/CDLODQuadtree.seamMorph.test.ts` (or extend existing `CDLODQuadtree.test.ts`) — shared-edge morph factor test.
- Add: `src/systems/terrain/CDLODRenderer.skirt.test.ts` (or extend existing) — skirt vertex count + attribute test.

## Required reading first

- `docs/TESTING.md`
- `docs/INTERFACE_FENCE.md` — `ITerrainRuntime` is fenced; you don't touch it.
- `src/systems/terrain/CDLODQuadtree.ts` (full file).
- `src/systems/terrain/CDLODRenderer.ts` (full file — small).
- `src/systems/terrain/TerrainMaterial.ts` lines 1-100 (vertex shader portion).
- `src/ui/debug/worldOverlays/terrainChunkOverlay.ts` — model your new overlay on this.
- `src/ui/debug/WorldOverlayRegistry.ts` — registration pattern.
- `src/core/GameRenderer.ts` lines 130-160 — confirm `scene.background` color and `INITIAL_FOG_COLOR` constant.

## Diagnosis

User reports white streaks at chunk borders, dominant on A Shau (real DEM amplifies steep gradients). Three confirmed cooperating defects:

1. **Per-tile morph factor desync at boundaries.** `CDLODQuadtree.ts:131` calls `computeMorphFactor(dist, lodLevel)` with `dist` measured from the camera to the *node center* (computed at line 109-111). Adjacent tiles compute different `dist` values, so their shared edge vertex can sit at different morph factors and sample different heightmap UV cells — height delta of 0.5–3 m → 1–3 px crack → fog color shows through.
2. **No skirt geometry.** `CDLODRenderer.ts:48` uses `THREE.PlaneGeometry(1, 1, N-1, N-1)` with no skirts. Standard CDLOD impls add downward-dropping skirt rings to hide LOD-transition cracks.
3. **DEM edge clamping** (out of scope for this task — Stage D3 is deferred per plan).

The cracks read as bright/white because GameRenderer's background is neutral grey but fog/sky bleeds through tiny rasterized slivers and reads light against shadowed ground.

## Fix

### Stage D1 — min-distance morph metric

In `CDLODQuadtree.selectNode` at lines 108-142, change the distance source from "camera to tile center" to "camera to nearest point of tile's XZ AABB."

Currently:
```ts
const dx = camX - cx;
const dz = camZ - cz;
const dist = Math.sqrt(dx * dx + camY * camY + dz * dz);
```

Replace with:
```ts
const halfSize = size / 2;
const cdx = Math.max(Math.abs(camX - cx) - halfSize, 0);
const cdz = Math.max(Math.abs(camZ - cz) - halfSize, 0);
const dist = Math.sqrt(cdx * cdx + camY * camY + cdz * cdz);
```

Two tiles meeting at a shared edge then return identical XZ-distance contribution at that edge. `morphStart` may need a small tweak (raise from current value by ~5–10%) to avoid earlier high-LOD pop-in. Verify by comparing pre/post tile counts at fixed cam positions in unit tests.

The subdivide condition `lodLevel > 0 && dist < range` remains unchanged structurally — only the metric changes.

### Stage D2 — skirt geometry

Replace `new THREE.PlaneGeometry(1, 1, N-1, N-1)` with a custom `BufferGeometry` that:

1. Builds the same `N×N` grid of vertices as before (positions, indices).
2. Adds one ring of perimeter vertices duplicated, each tagged via a new `isSkirt` Float32 attribute (0 for interior, 1 for skirt).
3. Connects the skirt ring with the perimeter ring via two-triangle strips (4 sides × (N-1) quads each).

In `TerrainMaterial.ts` vertex shader, after the existing height lookup but BEFORE the morph blend (or however the vertex y is finalized): if `isSkirt > 0.5`, subtract `skirtDrop` from local Y. Use a per-LOD skirt drop:

```glsl
float skirtDrop = max(2.0, 4.0 * (lodLevel + 1.0));
worldPos.y -= step(0.5, isSkirt) * skirtDrop;
```

Skirts only ever drop, never rise — guarantees no poke-through into neighbor tiles. They share the same heightmap-driven material so they blend invisibly into the slope below the visible terrain edge.

Add `geo.setAttribute('isSkirt', new THREE.BufferAttribute(isSkirtArray, 1));` alongside existing per-vertex attributes. Update the vertex count assertion in `CDLODRenderer.skirt.test.ts` (new): N×N base + 4×(N-1) skirt verts + 4 corner skirt verts = base + 4×N skirt verts (or your preferred indexing — match the actual geometry you build).

### Stage D3 — defer

Out of scope. If, after D1+D2, A Shau seams persist visibly, file a follow-up task `terrain-dem-edge-pad`. Do not attempt in this task.

### Diagnostic overlay (Shift+\\ debugger)

Add `src/ui/debug/worldOverlays/terrainSeamOverlay.ts`. Pattern: copy structure from `terrainChunkOverlay.ts`. Subscribe to the same tile-list provider (or expose one if not already there). Each tick (4 Hz like the chunk overlay), iterate adjacent tile pairs and emit red `LineSegments` for any shared edge whose neighbor has a different `lodLevel` OR a `morphFactor` delta > 0.05. Only adds vertices when seams are actively at risk — visible regression detector.

Register in `WorldOverlayRegistry.ts` next to `terrainChunkOverlay`. The existing six-overlay debugger can grow to seven; if there's a hard cap on overlay slots, replace one of the less-used ones with this. Confirm slot management by reading the registry.

### Sky/clear-color test

Add an assertion in `GameRenderer.test.ts` (or create the file if absent — keep it minimal):

```ts
expect(renderer.getClearColor(new THREE.Color()).getHex()).not.toBe(0xffffff);
expect(scene.background?.getHex()).toBe(INITIAL_FOG_COLOR);
```

Prevents future regressions that could reintroduce a white clear and amplify any residual cracks.

## Steps

1. Read "Required reading first."
2. Stage D1: change distance metric in `CDLODQuadtree.ts`. Run existing `CDLODQuadtree.test.ts` — fix any breakage that's actually a behavior change you want, leave any unrelated failures alone.
3. Add unit test: shared-edge morph parity. Two adjacent tiles whose centers are on opposite sides of an LOD-range threshold; their morphFactor at the shared edge midpoint matches under the new metric.
4. Stage D2: implement skirted `BufferGeometry`. Add `isSkirt` attribute. Update vertex shader.
5. Add unit test: skirt vertex count + `isSkirt` attribute presence.
6. Add `terrainSeamOverlay.ts` and register.
7. Add the GameRenderer clear-color assertion test.
8. `npm run lint && npm run test:run && npm run build`. Green.
9. Commit. Branch `task/terrain-cdlod-seam`.
10. Push branch. **DO NOT run `gh pr create`.** Orchestrator integrates separately.
11. Report.

## Verification (local)

- `npm run lint`
- `npm run test:run`
- `npm run build`
- Visual: spawn dev mode at A Shau north ridgeline (use `?map=ashau` if URL-routed, otherwise the default A Shau ZC scenario). Toggle the new seam overlay via `Shift+\`. Confirm: (a) seams visibly reduced or absent, (b) seam overlay highlights any remaining at-risk edges in red. F9-capture before/after if practical.

## Non-goals

- Do NOT touch DEM edge handling (`DEMHeightProvider.ts`, `HeightmapGPU.ts`). Stage D3 is deferred.
- Do NOT change `morphStart` more than ~10% from current. If cracks remain after metric change, prefer escalating to skirts than tweaking morph aggressively.
- Do NOT change clear color or fog logic. The new test only locks the existing values.
- Do NOT touch `terrainChunkOverlay.test.ts` mock issue — separate, tracked.
- Do NOT add any per-tile uniform that isn't already plumbed through the InstancedMesh attribute path.

## Hard stops

- Fence change required → STOP.
- Skirt geometry triggers a Three.js InstancedMesh validation error you cannot resolve in <30 minutes → STOP. Report. We may need to drop skirts and ship D1 alone.
- New tile-count regression > 5% at fixed cam positions in tests → STOP. The metric tweak is too aggressive; tune `morphStart` back down.
- Diff > 400 lines → STOP and reassess.

## Report back

```
task_id: terrain-cdlod-seam
branch: task/terrain-cdlod-seam
pr_url: NONE_NO_PR_REQUESTED
files_changed: <N files, +A -D lines>
verification:
  - npm run lint: PASS
  - npm run test:run: PASS (X tests, Y ms)
  - npm run build: PASS
playtest_required: yes
surprises: <one or two lines, or "none">
fence_change: no
stages_landed: D1, D2, overlay  # or D1, overlay if D2 was punted
```
