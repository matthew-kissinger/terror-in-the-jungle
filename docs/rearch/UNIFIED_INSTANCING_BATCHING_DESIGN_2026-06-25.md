<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Unified instancing/batching/merge design. Authored 2026-06-25. Synthesizes Kiln city/scenes
     rendering research + a current-TIJ batching audit. Serves the war-asset import cycle AND the
     Strategy A vegetation cycle. -->

# Unified Instancing / Batching / Merge — Design

**Why now:** two cycles are landing fresh static art (war assets, Strategy A vegetation) and the
North Star is "redo assets first so perf reflects final art." Today TIJ runs **five separate,
ad-hoc draw-call strategies** with no shared model. This doc takes the proven Kiln city/scenes
rendering approach and adapts it to TIJ so war props/structures **and** vegetation/ground-cover
flow through one coherent instancing+merge+LOD layer.

Sources: Kiln rendering study (`frontend/src/city/batching.ts`, `merge.ts`, `palette.ts`,
`CityStaticBatch.tsx`) + TIJ batching audit (the 5 systems below). File:line refs preserved.

---

## 1. What Kiln does (the proven reference)

Kiln renders a whole composed city/scene in **~tens of draws regardless of asset count**, via:

1. **Geometry MERGE into per-material buckets — NOT InstancedMesh/BatchedMesh.** `buildStaticMerged()`
   clones each placement's per-material parts, world-bakes them by the placement matrix, and fuses
   same-bucket geometry with `mergeBufferGeometries` into ONE `Mesh` per (material, attribute-layout).
   **Critical reason:** on WebGPURenderer r0.184, `BatchedMesh` issues one `drawIndexed` *per visible
   instance* (no multi-draw-indirect) — so batching does NOT cut draw COUNT; only vertex/index merge does.
2. **OKLab palette snap → a shared ~30-slot material library.** `snapMaterialToCity()` quantizes each
   placed flat material to the nearest palette slot in perceptual OKLab space and returns ONE shared
   canonical material instance per slot. Identical material instance → identical merge signature → the
   whole flat-colored population collapses to **~#palette-slots draws**. Hero textured/vertex-colored
   materials are EXEMPT (keep their own draws).
3. **Ingestion normalization that makes merge legal:** de-interleave every attribute to plain Float32
   (`toPlainGeometry` — interleaved/normalized inputs make `mergeBufferGeometries` emit silent NaN),
   uniform indexing (`ensureIndexed`), transform-bake, NaN guard (abort-on-corrupt), and duck-typing
   across the two module realms.
4. **Distance-gated ANIMATION, not mesh LOD:** far animated assets are merged frozen at rest pose;
   only the nearest ≤12 (`MAX_AWAKE`) wake into live mixers (hysteresis 85m/115m).
5. **No texture atlasing, no mesh LOD, no impostors** — Kiln is draw/CPU-bound, not fill-bound.

Measured: Atomic scene **34→106-120 FPS, 5,330→~358 meshes**; steady-state **~20 draws/frame**.

---

## 2. What TIJ does today (5 ad-hoc layers)

| System | Technique | Bucket key | File |
|---|---|---|---|
| Veg billboards | hand-rolled `InstancedBufferGeometry` plane, 1 mesh/type | veg-type id | `billboard/BillboardBufferManager.ts` |
| Static impostors | hand-rolled `InstancedBufferGeometry` plane, 1 mesh/archetype | archetype slug | `staticImpostors/StaticImpostorSystem.ts` |
| World features | runtime **merge OR `BatchedMesh`** via shared optimizer | `materialKey::geomLayoutKey` | `WorldFeatureSystem.ts` + `packages/three-model-optimizer` |
| Wildlife | same optimizer (merge, minBucket=1) on cached template, then `.clone()` | same | `wildlife/WildlifeSystem.ts` |
| Combatants | `InstancedMesh` per faction×clip impostor + per-NPC `mergeGeometries` weapon | `faction:clip` | `combat/CombatantRenderer.ts` |

**The one shared primitive** is `packages/three-model-optimizer` (merge/batch, bucket =
`materialKey::geometryLayoutKey`), used only by world-features + wildlife. Billboards, static
impostors, and combatant impostors each **reinvent** the same instanced-plane slot allocator
(high-water mark + free-slot Set + dirty-range flush).

**The normalization contract already exists and is proven:** `scripts/import-war-catalog.ts`
`synthesizeIndices` (all-or-none indexing) + `canonicalizeBuffers` (tight, de-interleaved BIN),
plus a runtime de-interleave pass in `ModelDrawCallOptimizer.ts`. This is identical in spirit to
Kiln's `toPlainGeometry`/`ensureIndexed` — TIJ already solved the hard part offline.

### Gaps
- **A — N duplicate instancing allocators** (veg / static-impostor / combatant-impostor).
- **B — merge-vs-instance is decided by accident of system, not by asset.** The same prop is a
  `BatchedMesh` near (world-features) and a separate impostor far (static-impostors); vegetation of
  the same visual class uses a third path entirely.
- **C — vegetation and props don't share the octahedral-impostor pipeline** despite both baking
  atlases and drawing instanced planes (different formats, different registries). The veg roadmap
  (`VietnamVegetationSpecies.ts`) already NAMES the missing unifier: `farOctahedralImpostor` band +
  `futureForestAggregate` owner — exactly the static-impostor format, no owner spanning both.
- **D — bucket explosion on material diversity.** The optimizer keys buckets on full material
  identity incl. 12 texture-map uuids → per-prop-textured assets never co-batch.

---

## 3. The design — one layer, three primitives

The goal is NOT a rewrite. It is to (a) make cross-asset merge actually collapse our **already
palette-locked** war + vegetation art, and (b) collapse the duplicate instanced-plane code into one
primitive shared by veg + props + combatants. Four moves, in priority order.

### Move 1 — Material signature canonicalization in the optimizer ✅ (measured + locked 2026-06-25)
**The research premise was REFUTED by measurement — corrected here.** TIJ's optimizer already buckets
on material *value*, not identity: `getMaterialMergeKey` keys on color hexstring | emissive | roughness
| metalness | side | vertexColors | texture-uuid, and `optimizeStaticFeatureGroup` pools the whole
feature group, so cross-asset materials sharing a palette color **already co-batch**.

Measured on the Kiln batch (`scripts` scratch probe, 2026-06-25): **264 materials → 113 flat-color +
151 textured. The 113 flat materials collapse to just 19 distinct value-signatures** (metalness ∈
{0, 0.85}, roughness from a 7-value set), and 2-decimal quantization yields **0 further collapse** —
the generation already palette-snaps perfectly. So the "assets won't co-batch" premise was wrong;
flat-material batching is already optimal.

What shipped (principled hardening, not a speculative perf change):
- `MERGE_KEY_SCALAR_STEP = 1e-3` quantization on the continuous PBR scalars (roughness/metalness/
  opacity/alphaTest/emissiveIntensity) so a future generator emitting `0.8999` vs `0.9` can't fragment
  a palette bucket into two draws. No visual change (sub-perceptual), no-op on today's exact-snapped art.
- A regression test suite locking the value-based collapse (5 distinct instances → 1 bucket; sub-step
  scalars merge; distinct colors stay separate; **differently-textured stay separate**) so a refactor
  can't silently regress to identity/uuid keying and explode draws.

**The real draw lever is the 151 textured materials**, not the flat ones. A single draw binds one
texture, so differently-textured meshes **cannot** merge without a **texture atlas** — that is the
remaining win, and it is **Move 2/3 (atlas unification)**, not a bucket-key change. Folded into the
vegetation atlas pipeline (veg cards + prop impostors + textured war props share one atlas baker).
- Keep the hero exemption: textured/vertex-colored materials bypass merge until atlased.

### Move 2 — One instanced atlas-plane primitive
Extract the thrice-duplicated allocator (`BillboardBufferManager`, `StaticImpostorBatch`, the
`CombatantRenderer` instanced-matrix bookkeeping) into a single `InstancedAtlasPlaneBatch`
(slot allocator + dirty-range flush + free-slot reuse), parameterized by atlas format
(latlon NxM **or** octahedral 8×3) and per-instance attribute set (pos/scale/rotation[/yaw]).
Vegetation cards, prop impostors, and combatant impostors all become configs of this one batch.
Closes Gap A and unifies the veg `farOctahedralImpostor` band with the existing static-impostor baker.

### Move 3 — One per-asset LOD policy + promotion state machine
A single policy table keyed by asset/species:
`close → merged/batched GLB mesh · mid → card cluster · far → octahedral impostor · horizon → terrain tint`.
Drive it with ONE promotion/demotion machine (hysteresis), generalizing `StaticImpostorSystem`'s
distance gate to also own vegetation bands and (optionally) the combatant materialization tiers.
The vegetation spec already defines these exact bands (`VietnamVegetationSpecies.ts:34-38, 79-112`),
so veg becomes the first consumer; war props (already impostor archetypes) the second.

### Move 4 — Renderer-aware merge-vs-batch decision
Kiln's "merge, never BatchedMesh" is pinned to **WebGPU r0.184 lacking multi-draw-indirect**. TIJ ships
BOTH backends (`VITE_WEBGPU` / `VITE_FORCE_WEBGL`). So the optimizer's strategy must be renderer-aware:
- **WebGPU (no indirect):** prefer `merge` (one draw/bucket) — match Kiln.
- **WebGL2 / future WebGPU w/ indirect:** `BatchedMesh`/`InstancedMesh` keep per-instance frustum
  culling AND cut draws — prefer them for triangle-bound sectors.
Measure both per backend in the perf capture; don't hard-code Kiln's WebGPU-specific conclusion.

---

## 4. Normalization contract (hard precondition — already built)
Every new static GLB family (war assets, EZ-Tree hardwoods, M02P-derived hero meshes, deadfall) MUST
pass `assets:import-war-catalog` (or a veg variant) so merge is legal at runtime:
all-or-none indexing (`synthesizeIndices`), tight non-interleaved BIN (`canonicalizeBuffers`),
uniform attribute set. This is the most reusable existing piece — the unified layer **requires** it
rather than re-solving it. Pure card/atlas vegetation (Path A billboards) skips this (engine-built planes).

---

## 5. Sequencing against the two cycles
- **Move 1** is a `packages/three-model-optimizer` change — do it in the **war-asset cycle Phase 2**
  (consumer cutover): it directly lowers the war draw-bucket count the intermediate perf gates on.
- **Moves 2-3** land in the **vegetation cycle** (Phase 2 veg-atlas adapter + Phase 3/5 LOD), since
  vegetation is the system that most needs the unified instanced-plane + LOD machine.
- **Move 4** is measured in the **final (post-vegetation) perf capture** — the single "final art" truth.
- Shared surface: `packages/three-model-optimizer` + `staticImpostorArchetypes.ts` are touched by both
  cycles — coordinate per the war/veg shared-surface guard already in the cycle plan.

## 6. Definition of done
- War-feature sectors collapse to ≈#palette-slots material buckets (Move 1) — scene-attribution proof.
- One `InstancedAtlasPlaneBatch` replaces the 3 hand-rolled allocators (Move 2).
- Vegetation + war props share one LOD promotion machine + impostor baker (Move 3).
- Merge-vs-batch chosen per renderer backend with measured justification (Move 4).
- combat120 + A Shau draw-call counts at/under the pre-cycle baseline on the final art.
