<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Vegetation-library -> engine integration design + legacy-avoidance analysis. Authored 2026-06-25. -->

# Vegetation Library Integration Design (2026-06-25)

**Purpose.** Wire `packages/vegetation-library` (engine-agnostic descriptors) into the running
game through the *correct modern paths*, with an explicit list of legacy/poorly-implemented
parts we must NOT extend. The library is the single source of truth for *what vegetation
exists and how it can render*; the engine reaches into it through one thin, engine-owned
adapter and nothing else reaches the renderer.

Companion docs: `docs/rearch/STRATEGY_A_VEGETATION_IMPLEMENTATION_2026-06-25.md` (the sourcing
plan + phased cycle), `packages/vegetation-library/README.md` (the contract), and
`docs/rearch/UNIFIED_INSTANCING_BATCHING_DESIGN_2026-06-25.md` (batching trajectory).

---

## 0. The two layers the library separates (and why the adapter exists)

A `VegetationAsset` (`packages/vegetation-library/src/schema.ts:234`) is deliberately split:

- `representations[]` — the *inventory* of authored render forms, each a pure descriptor with
  a stable id: `mesh` / `billboardAtlas` / `octaImpostor` / `groundCard`
  (`schema.ts:131-183`, kinds at `schema.ts:114`).
- `lod` — the chosen *strategy*: a near→far chain of distance `bands`, each pointing at a
  representation id (or `representationId:null` + `plannedKind` when not yet baked)
  (`schema.ts:192-218`).

The library imports no `three`, no DOM, no engine types (`schema.ts:6-10`). The engine's only
coupling is **one adapter** that resolves logical paths and translates descriptors into calls
on the *existing* runtime systems. Today the engine has two such runtimes; both already exist
and are sound. The adapter must feed them, not replace them.

---

## 1. Adapter boundary — `src/config/vegetation/vegetationLibraryAdapter.ts` (SPEC, do not write yet)

Create one new, disjoint file: `src/config/vegetation/vegetationLibraryAdapter.ts`. It is the
*only* file that imports both `@game-field-kits/vegetation-library` and engine config types. It
is **pure config/data transformation** — it builds plain config objects and returns them; it
does not import `three`, does not new up any system, does not touch combat/terrain/engine
runtime. Existing consumers keep reading `VEGETATION_TYPES` / `STATIC_IMPOSTOR_ARCHETYPES`; the
adapter's job is to *produce those arrays from the catalog* so the catalog becomes the source
of truth and the hand-maintained literals shrink to tuning overrides.

### 1a. Inputs

```
import { readyVegetation, resolveAsset, type VegetationAsset } from '@game-field-kits/vegetation-library';
const ASSET_ROOT = '/assets/vegetation';   // Vite serves public/assets/vegetation/*
```

`resolveAsset(ASSET_ROOT, asset)` joins each representation's root-relative logical path
(`<id>/<file>.glb`, `textures/<x>.webp`) into a served URL. The adapter calls it once per asset
and reads from the resolved copy.

### 1b. Field-by-field mapping (descriptor field -> engine call/field)

The adapter selects, per asset, which engine path to target by inspecting the LOD chain's
nearest backed representation kind (see the table in §2). It then emits one of two engine
config records.

**When the near representation is `billboardAtlas` (Path A — GPU billboard):**

| Library field | Engine target |
|---|---|
| `asset.id` | `PixelForgeVegetationAsset.id` / `VegetationTypeConfig.id` (kebab→engine id; keep stable) |
| representation `billboardAtlas.path` (resolved) | `PixelForgeVegetationAsset.colorFile` (`pixelForgeAssets.ts:14`) |
| representation `billboardAtlas.normalPath` | `PixelForgeVegetationAsset.normalFile` |
| `billboardAtlas.tilesX/tilesY/tileSize` | `VegetationImposterAtlasConfig.tilesX/tilesY/tileSize` (`vegetationTypes.ts:31`) |
| `billboardAtlas.worldSize[0]` | `PixelForgeVegetationAsset.worldSize` → `VegetationTypeConfig.size` (`vegetationTypes.ts:172`) |
| `billboardAtlas.yOffset` | `PixelForgeVegetationAsset.yOffset` → grounding base (`vegetationTypes.ts:174`) |
| `ecology.tier` | `PixelForgeVegetationAsset.tier` / `VegetationTypeConfig.tier` |
| `ecology.density` | seeds `VEGETATION_TUNING.baseDensity` (scaled by engine budget; tuning override stays engine-side) |
| `ecology.slopeRangeDeg[1]` | `VEGETATION_TUNING.maxSlopeDeg` |
| `ecology.cluster` | `VegetationClusterConfig` hint |
| `ecology.preferredBiomes` | `BiomeVegetationEntry` membership in `biomes.ts` palettes |
| `lod.bands[n].maxDistanceMeters` | `VegetationTypeConfig.maxDistance` / `fadeDistance` (`vegetationTypes.ts`) |
| `provenance` (`attributionRequired`) | drives `AttributionNotice.ts` credit emission |

**When the near representation is `mesh` (Path B — static-impostor GLB):**

| Library field | Engine target |
|---|---|
| representation `mesh.path` (resolved) | `StaticImpostorArchetype.modelPath` (`staticImpostorArchetypes.ts:20`) — and the GLB the world placer loads |
| `mesh.bounds.center/size/radius` | `StaticImpostorAtlasBounds` (`staticImpostorArchetypes.ts:14`) |
| LOD band where a far `octaImpostor`/`billboardAtlas` begins (`maxDistanceMeters` of the mesh band) | `StaticImpostorArchetype.promotionDistanceMeters` (impostor in) |
| one band-width below that boundary | `StaticImpostorArchetype.demotionDistanceMeters` (mesh back) |
| `octaImpostor.columns/rows` | `StaticImpostorArchetype.columns/rows/azimuthFrames/elevationFrames` |
| `octaImpostor.baseColorPath/normalPath/depthPath` (resolved) | `StaticImpostorAtlasMapSet.baseColor/normal/depth` (`staticImpostorArchetypes.ts:8`) |
| `ecology.*` | biome scatter placement record (see §3 open risk: scatter of GLB heroes) |
| `provenance` | `AttributionNotice.ts` |

### 1c. Outputs (exported by the adapter, consumed unchanged downstream)

- `vegetationLibraryBillboardAssets(): PixelForgeVegetationAsset[]` — the catalog-derived
  billboard inventory that `pixelForgeAssets.ts` can spread into / replace
  `PIXEL_FORGE_VEGETATION_ASSETS`. `vegetationTypes.ts` then maps these to `VEGETATION_TYPES`
  exactly as today (`vegetationTypes.ts:198`).
- `vegetationLibraryStaticArchetypes(): Record<string, StaticImpostorArchetype>` — catalog-derived
  archetypes that `staticImpostorArchetypes.ts` can merge into `STATIC_IMPOSTOR_ARCHETYPES`.
- `vegetationLibraryAttributions(): AttributionCredit[]` — CC-BY credits to surface in
  `AttributionNotice.ts`.

### 1d. What the adapter must NOT do

- Not import `three` or any `src/systems/**` runtime (keeps it a pure config seam; preserves the
  library's no-renderer invariant on the engine side).
- Not bypass the registries: it produces the same record *shapes* the engine already consumes,
  so `GlobalBillboardSystem`, `VegetationScatterer`, and `StaticImpostorSystem` need zero change.
- Not assert tuning constants — placement/density tuning stays as engine-side overrides keyed by
  id, because `ecology.density` is an engine-neutral 0..1 hint (`schema.ts:226`), not a final
  instance budget.
- Not touch fenced interfaces. None of the integration files are in
  `src/types/SystemInterfaces.ts`; see §4.

---

## 2. Per-representation-kind mapping table

| Library `RepresentationKind` | Engine runtime | Registry record | Loader / system |
|---|---|---|---|
| `mesh` (role `hero`) | **Path B**: GLB drawn near, promoted to impostor far | `StaticImpostorArchetype` in `STATIC_IMPOSTOR_ARCHETYPES` (`staticImpostorArchetypes.ts:95`) | GLB instanced as a world placement, `StaticImpostorSystem.registerInstance(...)` (`StaticImpostorSystem.ts:298`) via `WorldFeatureSystem` (`WorldFeatureSystem.ts:430`) |
| `mesh` (role `instanced`, small ground plant) | **Path B-lite or A**: small mesh near, card far. If the far band is `groundCard`/`billboardAtlas`, the *near* card may still route through Path A for density; a true near mesh needs the unified instanced-mesh path (see §3 risk). | `StaticImpostorArchetype` (near-mesh + promotion to card) | `StaticImpostorSystem` |
| `billboardAtlas` (`projection:'lat-lon'`) | **Path A**: lat/lon impostor billboard, instanced + scattered | `PixelForgeVegetationAsset` → `VegetationTypeConfig` (`vegetationTypes.ts:159`) | `VegetationScatterer.configure(...)` → `GlobalBillboardSystem.addChunkInstances` (`VegetationScatterer.ts:348`) |
| `billboardAtlas` (`projection:'single'`) | **Path A**: single flat card variant of the above (1×1 grid) | same as lat/lon, `tilesX/Y=1` | same |
| `octaImpostor` | **Path B far band only**: the baked azimuth×elevation atlas the static system promotes to | the `maps.{baseColor,normal,depth}` of a `StaticImpostorArchetype` | `StaticImpostorSystem` batch (`StaticImpostorSystem.ts:425`) |
| `groundCard` | **Path A** (preferred): one alpha card, `instanced-card-only` LOD, faded by distance. Engine currently has no dedicated ground-card mesh layer, so it lands as a `single`-projection billboard atlas entry until the unified instanced path exists. | `PixelForgeVegetationAsset` (single tile) → `VegetationTypeConfig` | `VegetationScatterer` / `GlobalBillboardSystem` |

Note on `octaImpostor` vs the static baker: the existing baker
(`scripts/bake-static-impostor-atlases.ts:143-188`) already renders an azimuth×elevation
(8×3) atlas from the upper hemisphere — i.e. it *is* an octahedral-ish impostor baker. The
library's `octaImpostor` representation should be **produced by that baker**, with the adapter
mapping `columns/rows` ↔ the baker's `azimuthFrames/elevationFrames`. Do not write a second
impostor baker.

---

## 3. AVOID / DO-NOT-EXTEND list (legacy or poorly-implemented parts)

Each entry: the thing, why it is legacy/bad, the modern replacement.

1. **`PixelForgeVegetationAsset` hand-authored literals as the source of truth**
   (`pixelForgeAssets.ts:50-153`). *Why:* the id, atlas paths, tiles, worldSize, yOffset are
   typed out per species by hand; the file name is already a misnomer (Strategy A §8) and these
   literals drift from the actual baked binaries. *Replacement:* keep `PixelForgeVegetationAsset`
   as the *shape*, but generate the array from the catalog via the adapter
   (`vegetationLibraryBillboardAssets()`); hand-edits collapse to id-keyed tuning overrides.

2. **`PIXEL_FORGE_BLOCKED_VEGETATION_IDS` / `sourceStatus` string ledger as the gating mechanism**
   (`pixelForgeAssets.ts:159`, `VietnamVegetationSpecies.ts:28`, `:201-337`). *Why:* a parallel,
   hand-maintained truth table of what is "blocked/accepted" that must be kept in sync with the
   actual assets by humans; it duplicates the library's `status` field. *Replacement:* the
   library's `AssetStatus` (`schema.ts:45`) + `isLodComplete()` (`validate.ts:172`) is the single
   readiness gate. The adapter only emits `readyVegetation()`; "blocked" becomes "not `ready` in
   the catalog," not a separate stoplist. Keep `VietnamVegetationSpecies.ts` only as a
   biome-role/ecology design note, not a runtime gate, or retire it.

3. **`VietnamVegetationSpecies.ts` `VegetationAggregateLodSpec` band registry**
   (`VietnamVegetationSpecies.ts:58-112`). *Why:* a second, prose-y LOD model
   (`closeHeroHybrid` / `midClusterCard` / `farOctahedralImpostor` / `horizonCanopyCoverage`)
   that overlaps the library's machine-readable `LodStrategy.bands`. Two LOD truths invite
   drift. *Replacement:* the library `lod.bands` (`schema.ts:192`) are the authoritative distance
   model; the adapter derives promotion/demotion + fade distances from them. The Vietnam band
   enum can stay as documentation but must not be a runtime input.

4. **`JungleGroundRing`** — already dormant by owner rejection
   (`TerrainVegetationRuntime.ts:50-61`). *Why:* a camera-following dense ground-cover ring the
   owner rejected; it is dead-but-wired. *Replacement:* do not route any new `groundCard` species
   through it. Ground cover goes through `VegetationScatterer` (Path A) with proper biome
   placement. Leave `JungleGroundRing` dormant; do not extend it.

5. **`PixelForgeStaticPropModels` GRASS/TREE/PATCH GLBs as "vegetation hero trees"**
   (`staticImpostorArchetypes.ts:46-52`, `:176-215`). *Why:* these are Pixel-Forge era prop
   GLBs with enormous bounds (e.g. TREE radius 80m, `:203`) wired into the static impostor system
   as a stopgap canopy; they are not the Strategy-A art family and read inconsistently.
   *Replacement:* Strategy-A hero meshes (jungle-tree, banyan) come through the library as `mesh`
   representations → catalog-derived `StaticImpostorArchetype`s. Do not add more
   `PixelForgeStaticPropModels` entries for vegetation.

6. **Per-id magic-number grounding fudges** `VEGETATION_GROUNDING_SINK` / `LIFT` /
   `RUNTIME_SCALE` / `STABLE_AZIMUTH_COLUMN` / `MAX_ELEVATION_ROW`
   (`vegetationTypes.ts:131-157`). *Why:* hand-tuned per-asset corrections that patch over bad
   atlas bakes (e.g. coconut's duplicated-silhouette row, `:150-153`). *Replacement:* fix at the
   bake/normalization step — the library's fixed normalization (`ground-center`, `+Y`, `-Z`,
   `schema.ts:68`) plus a correct atlas bake removes the need for runtime sink/lift. Keep these
   maps only as a *temporary* override surface for not-yet-rebaked assets; new library assets must
   land with zero entries here (the normalization recipe guarantees min.y→0).

7. **A duplicate/new impostor or billboard baker.** *Why:* `scripts/bake-static-impostor-atlases.ts`
   already bakes azimuth×elevation atlases. *Replacement:* extend it with a thin output-layout
   adapter (Strategy A Phase 2) that emits the Path-A veg-atlas file layout
   (`imposter.png`/`imposter.normal.png`/`imposter.json`) when a `billboardAtlas` is the target;
   reuse the same capture loop. Do not fork the baker.

8. **Procedural/generated vegetation scaffolds** — already burned down 2026-06-14
   (CURRENT.md "procedural vegetation controlled burn"). *Why:* the generated
   banyan/rubber/teak/etc. were visually rejected and removed. *Replacement:* accepted source
   assets through the library only. Do not reintroduce a generator, preview factory, or generated
   candidate path.

9. **Editing `packages/vegetation-library/src/catalog.ts` from a content task.** *Why:* the
   Register phase owns that one import+array edit to avoid merge conflicts (task hard rule).
   *Replacement:* author `catalog/<id>.json` descriptors only; registration is a separate,
   single-writer step.

---

## 4. INTERFACE_FENCE constraints

Per `docs/INTERFACE_FENCE.md`, only the exported interfaces in `src/types/SystemInterfaces.ts`
are fenced (`IHUDSystem`, `IPlayerController`, `IHelicopterModel`, `IFirstPersonWeapon`,
`ITerrainRuntime`/`ITerrainRuntimeController`, `IAudioManager`, `IAmmoManager`,
`IFlashbangScreenEffect`, `ISkyRuntime`, `ICloudRuntime`, `IZoneQuery`, `IGameRenderer`).

**None of the integration files are fenced.** `pixelForgeAssets.ts`, `vegetationTypes.ts`,
`biomes.ts`, `VietnamVegetationSpecies.ts`, `staticImpostorArchetypes.ts`,
`StaticImpostorSystem.ts`, `VegetationScatterer.ts`, `TerrainVegetationRuntime.ts`, the bake
script, and the proposed `vegetationLibraryAdapter.ts` are all free to refactor without a
`[interface-change]` PR. The adapter and its config records are config objects/derived types
(explicitly out-of-fence, `INTERFACE_FENCE.md:41-43`).

Constraint to respect: the adapter must keep producing the *existing* record shapes
(`PixelForgeVegetationAsset`, `StaticImpostorArchetype`, `VegetationTypeConfig`). If a future
change wanted to push a `VegetationAsset` directly across a system boundary (e.g. into a fenced
runtime interface), *that* would be a fence change and needs the `[interface-change]` flow — but
the design here deliberately avoids it by keeping the seam at config-build time. Run
`npm run check:fence` before any push regardless.

---

## 5. Phased integration sequence with gates

Each phase is PR-sized, branch `task/<slug>`, gated by standing `check:*` scripts. Gates are the
existing ones in `package.json`; no new gate is required for the seam itself.

**Phase I — Adapter seam (no visible change).**
Add `src/config/vegetation/vegetationLibraryAdapter.ts`. Wire `pixelForgeAssets.ts` /
`staticImpostorArchetypes.ts` to *merge* catalog-derived records with the existing literals for
the already-accepted ids (fern, elephantEar, fanPalm, coconut, bambooGrove, bananaPlant), keeping
ids and binaries identical so the runtime output is byte-stable.
Gates: `npm run typecheck`, `npm run lint`, `npm run test:run` (includes
`vegetationTypes.test.ts`, `VietnamSpeciesSourceSpecs.test.ts`), `npm run validate:fast`,
`npm run check:fence`.

**Phase II — jungle-tree hero through Path B.**
`jungle-tree` is `status:ready` with a near `mesh` (`catalog/jungle-tree.json`). Adapter emits a
`StaticImpostorArchetype`; bake its planned far octa band via
`npm run assets:bake-static-impostors -- --only jungle-tree`; add to a biome scatter slot.
Gates: `npm run assets:bake-static-impostors`, `npm run check:static-impostors`,
`npm run check:asset-gallery`, `npm run check:culling-baseline`, `npm run check:tod-coherence`.

**Phase III — Veg-atlas bake adapter + first card species (Strategy A Phase 2/3).**
Extend the static baker to emit the Path-A atlas layout; bring `elephant-grass` / `fern` cards to
`ready` and route through `VegetationScatterer`.
Gates: `npm run check:vegetation-horizon`, `npm run check:vegetation-grounding`,
`npm run check:asset-material`, `npm run check:culling-baseline`.

**Phase IV — Catalog becomes source of truth; retire the stoplist.**
Flip `pixelForgeAssets.ts` so the billboard array is fully adapter-generated; replace the
`PIXEL_FORGE_BLOCKED_VEGETATION_IDS` / `sourceStatus` gate with `readyVegetation()`. Update or
retire `VietnamVegetationSpecies.ts` to documentation-only.
Gates: full `npm run validate`, `npm run check:vegetation-horizon`,
`npm run check:vegetation-grounding`, `npm run check:asset-gallery`,
`npm run check:pixel-forge-cutover`.

**Phase V — Perf + owner acceptance.**
Density/biome tuning; confirm the ≈4-6 material-bucket target; combat120 + A Shau capture.
Gates: `npm run perf:compare` (non-gating raw metrics — no baseline currently tracked, see
CURRENT.md), draw-call delta in scene attribution, then `npm run check:live-release` post-deploy,
and the owner game-feel walk per `docs/PLAYTEST_CHECKLIST.md` (vegetation density/readability is
a game-feel change → human playtest required, AGENTS.md §"Game-feel requires human playtest").

---

## 6. Open risks / decisions for the owner

1. **Near `mesh` ground plants have no first-class engine home.** Path A is billboard-only; Path B
   is hero-GLB-with-impostor (one object per placement, registered through `WorldFeatureSystem`,
   not the dense scatterer). A small instanced near-mesh fern (fern.json's `mesh-near+card-far`)
   wants a *dense instanced-mesh* layer that does not exist yet. Decision: ship fern's near band
   as a card through Path A for now, OR build the unified instanced-mesh path from
   `UNIFIED_INSTANCING_BATCHING_DESIGN_2026-06-25.md` first. Recommend card-first; revisit if a
   feel-walk demands true 3D near fronds.

2. **Scattering Path-B GLB heroes.** `StaticImpostorSystem.registerInstance` is driven by
   `WorldFeatureSystem` world *placements* (`WorldFeatureSystem.ts:430`), not by the density
   `VegetationScatterer`. Hero trees (jungle-tree, banyan) therefore need a placement source —
   either biome-scatter-emitted placements or authored map features. Decision: where do hero-tree
   positions come from, and at what density, per biome?

3. **`ecology.density` (0..1 hint) vs engine instance budgets.** The library intentionally does
   not own final instance counts (`schema.ts:226`). The adapter seeds `baseDensity`, but the real
   `maxInstances`/`baseDensity`/cluster tuning stays engine-side. Decision: confirm tuning lives
   as id-keyed overrides in the adapter/engine (recommended) rather than in the descriptors.

4. **`jungle-tree` is CC-BY-4.0** (`catalog/jungle-tree.json:12`). Making it `ready` and shipping
   it obliges a visible credit in `AttributionNotice.ts` + `THIRD-PARTY-ASSETS.md`. Confirm the
   owner accepts kobaltsecond's jungle-tree as the canopy hero (it currently stands in for banyan).

5. **Retiring `VietnamVegetationSpecies.ts` / the blocked-id stoplist** removes a layer several
   tests assert against (`VietnamSpeciesSourceSpecs.test.ts`, `vegetationTypes.test.ts`). Those
   behavior tests must be re-pointed at the catalog readiness model, not deleted silently.
   Decision: schedule the test migration inside Phase IV, not as an afterthought.

6. **No perf baseline is currently tracked** (`perf-baselines.json` removed; CURRENT.md). The veg
   layer's draw-call/material-bucket claim (≈4-6) will be raw-metrics-only until a baseline is
   re-established (STABILIZAT-1). Decision: accept raw-metric proof for this cycle or block on a
   re-established baseline.
