<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Phase II of vegetation-library integration: scatter GLB hero trees by biome density. Authored 2026-06-25. -->

# Vegetation Phase II — GLB Hero Scatter (jungle-tree)

**Goal.** Make the `jungle-tree` canopy hero actually render in the world, scattered by **biome density**, drawn through the existing `StaticImpostorSystem` (real mesh near, baked octahedral impostor far @180m). Owner decision (2026-06-25): **biome-density scatter**, not authored map features.

**Prereqs already done (committed):**
- `jungle-tree` is `status:ready`, lodComplete: near `mesh` + baked far `octaImpostor` (`packages/vegetation-library/catalog/jungle-tree.json`; atlas at `public/assets/vegetation/jungle-tree/impostor/`).
- The adapter `src/config/vegetation/vegetationLibraryAdapter.ts` already emits a valid `StaticImpostorArchetype` for it (`vegetationLibraryStaticArchetypes()['jungle-tree']`), validated by `npm run check:vegetation-adapter`.

This is Phase II of `docs/rearch/VEGETATION_LIBRARY_INTEGRATION_2026-06-25.md`. Honor its §3 AVOID list.

---

## The gap (from the plumbing trace)

Three systems exist; none bridges them for a **scattered** GLB hero:
- `VegetationScatterer` → biome/density positions, but **billboard-only** (emits to `GlobalBillboardSystem`).
- `StaticImpostorSystem.registerInstance({id, modelPath, object})` → registers a **pre-loaded** `THREE.Object3D`, promotes mesh↔impostor by distance. (`unregisterInstance(id)` exists, line 338.)
- `WorldFeatureSystem` → loads + places GLBs and calls `registerInstance`, but only from **authored per-mode features**, not per-chunk scatter.

So: build a small new scatterer that generates hero positions per streaming cell (reusing the veg scatter math) and drives `StaticImpostorSystem` directly.

---

## Design — `GLBHeroScatterer`

A new system on the **same cell-streaming lifecycle** as `VegetationScatterer`, owned by `TerrainVegetationRuntime`. Per in-range cell: classify biome → read hero density from the biome palette → Poisson-place → sample height/slope (reject water/steep) → `modelLoader.loadModel(archetype.modelPath)` (cached clone, shared geometry) → ground at `y = terrainHeight` (pivot is ground-center) → random yaw → add to scene → `staticImpostorSystem.registerInstance(...)`. On cell-out: `unregisterInstance(id)` + `modelLoader.disposeInstance(object)` + `scene.remove`.

```
TerrainSystem
 └─ TerrainVegetationRuntime
     ├─ VegetationScatterer       (billboards — unchanged)
     └─ GLBHeroScatterer  (NEW)   (GLB heroes per cell -> StaticImpostorSystem)
```

### Files to touch
| File | Change | LOC |
|---|---|---|
| `src/systems/terrain/GLBHeroScatterer.ts` | **NEW** system (cell lifecycle, Poisson, load/register, unregister) | ~220 |
| `src/systems/terrain/TerrainVegetationRuntime.ts` | instantiate + `configure` + `updateBudgeted` + `dispose` the hero scatterer alongside `VegetationScatterer` (lines ~27, 35, 49-61, 74, 98) | ~25 |
| `src/systems/terrain/TerrainSystem.ts` | pass `modelLoader` + `staticImpostorSystem` + `scene` into `TerrainVegetationRuntime` ctor (line ~172) | ~5 |
| `src/config/staticImpostorArchetypes.ts` | merge `vegetationLibraryStaticArchetypes()` into `STATIC_IMPOSTOR_ARCHETYPES` (catalog-derived, additive; keyed by `modelPath`). The lookup `getStaticImpostorArchetype(modelPath)` then resolves jungle-tree. | ~6 |
| `src/config/biomes.ts` | add `{ typeId: 'jungle-tree', densityMultiplier: 0.2 }` to denseJungle/riverbank/trailEdge palettes (riverbank a touch higher) | ~3 |

### Reuse (do NOT reinvent)
- Slope: `ChunkVegetationGenerator.slopeDeg()` (`:18-27`, SLOPE_SAMPLE_DIST 2m). Reject `slope > ~20°` (jungle-tree ecology slopeRangeDeg `[0,20]`) and `h < 0` (water).
- Height sampler: the `getHeight(x,z)` callback pattern (`VegetationScatterer:333`).
- Biome classify: `BiomeClassifier.classifyBiome()` (used at `TerrainVegetationRuntime:56-61`).
- Density patchiness: `densityNoise()` (`ChunkVegetationGenerator:31-36`).
- Cell residency/streaming budget: mirror `VegetationScatterer.updateBudgeted` add/remove-per-frame budgeting.
- GLB load: `modelLoader.loadModel(path)` — cached, returns a clone sharing geometry/material; `disposeInstance()` on teardown.
- Register/unregister: `StaticImpostorSystem.registerInstance` / `unregisterInstance`.

### Add (genuinely new)
- Per-cell hero Poisson placement keyed by `archetype` + biome density (canopy spacing — heroes are sparse; use a large minDist, e.g. derived so density 0.2 ≈ 1 per ~60 m²).
- Async load + ground + yaw + scene-add, tracked per cell for teardown.
- A per-biome **hero palette** read: reuse the existing `BiomeVegetationEntry` (`typeId` + `densityMultiplier`); the hero scatterer simply filters palette entries whose `typeId` matches a registered hero archetype slug.

### AVOID (per integration doc §3)
- Do **not** extend `WorldFeatureSystem` (keep it authored-feature-only).
- Do **not** make `VegetationScatterer` load GLBs (keep it billboard-only — separate concerns).
- Do **not** add `PixelForgeStaticPropModels` TREE/TREE_TALL entries; the legacy prop-tree archetypes (`staticImpostorArchetypes.ts:200-215`, radius 80m) are NOT our hero — do not scatter them. If they were being scattered anywhere, leave that untouched (out of scope).
- Keep `JungleGroundRing` dormant.
- The archetype comes from the **adapter** (`vegetationLibraryStaticArchetypes()`), not a hand-authored literal.

---

## Perf considerations
- Near-field clones are real 30,720-tri meshes (shared geometry, but one draw each until the impostor promotes at 180m). At density 0.2 canopy with a large Poisson minDist, the near-field hero count is bounded; verify the **count within demotion radius** stays small (target ≲ a few dozen visible meshes). Most resolve to the 2-tri impostor batch beyond 180m.
- Budget the load pipeline (async `loadModel` per instance) via the same per-frame add/remove caps as `VegetationScatterer` so chunk-in does not spike.
- If near-field mesh count proves too heavy in A Shau, the follow-up is GPU instancing of the near mesh (out of scope here; note it).

## Open follow-ups (not blocking Phase II)
- Bake the **billboard/groundCard** far bands for the M02P + bamboo/rice species so `vegetationLibraryBillboardAssets()` starts emitting (Strategy A Phase 3) — that's the Path-A half.
- Teak/rubber/banyan impostors not yet baked → they stay placement-only until baked.

---

## Validation / gates (run all before commit)
1. `npm run typecheck` · `npm run lint` · `npm run check:fence`
2. `npm run check:vegetation-adapter` (archetype still maps + files exist)
3. `npm run check:static-impostors` (jungle-tree archetype + atlas valid in the registry)
4. `npm run test:run` (or at least the terrain + vegetation suites; add a unit test for `GLBHeroScatterer` cell add/remove + slope/water rejection with a stub height field)
5. `npm run knip:ci`
6. **Visual:** load a scene (dev server / a scenario) in A Shau denseJungle, confirm jungle-trees appear grounded, at sane density, promote to impostor at distance, and unregister on walk-away (no leak — instance count returns to baseline). Screenshot near + far.
7. **Perf (raw, non-gating):** a combat120 / A Shau capture vs the pre-change run; report frame-time delta + near-field mesh count. No tracked baseline exists (CURRENT.md) — raw metrics only.
8. **Game-feel:** vegetation density/readability is a game-feel change → per AGENTS.md, an owner human playtest is required before deploy. Leave a PLAYTEST_PENDING row; do not deploy.

## Done when
- jungle-tree scatters by biome density in A Shau, grounded, mesh↔impostor LOD works, clean chunk teardown (no instance leak), all gates green, perf delta reported, owner playtest row queued. Branch `task/veg-glb-hero-scatter`; do not deploy (await owner walk).
