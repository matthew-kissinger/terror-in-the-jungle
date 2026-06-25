<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Strategy A vegetation implementation plan. Authored 2026-06-25. Source research: docs/rearch/vegetation-asset-report.html + VEGETATION_ASSET_MATRIX_2026-06-25.md. -->

# Strategy A — Vietnam Vegetation Implementation Plan

**Goal:** ship the full 15-species Vietnam vegetation layer (plus net-new ground cover) by sourcing the **bulk from ~3 coherent families** instead of 50 one-off assets, so the layer stays performant (few material/draw buckets) and visually consistent.

**Budget:** $0 today (≤ $20 cap honored; no purchase required).

**Spine:**
- **MozzarellaARC Tropical Plants Pack M02P** (CC-BY, GLB, 46.5k tris, 18 textures) → palms, banana, ferns, taro, understory.
- **EZ-Tree** (MIT, native Three.js → GLB) → teak, rubber, saplings/shrubs (branching hardwoods).
- **ambientCG CC0 leaf/grass atlases** → elephant grass, vines, rice fill, fern-card fill (mid + ground billboard cards).
- **Hybrid heroes** (decimate one clean CC0/CC-BY source + bake one impostor) → banyan, mangrove, deadfall logs.

Companion docs:
- `docs/rearch/strategy-a-source-manifest.md` — exact download list + licenses + attribution obligations.
- `docs/rearch/vegetation-asset-report.html` — interactive matrix (166 candidates, per-species tables).
- `docs/rearch/VEGETATION_ASSET_MATRIX_2026-06-25.md` — same in markdown.

---

## 1. Why this shape (cohesion rationale)

Mixing 15 species from ~50 authors is a perf + art trap:
- **Draw-call / material sprawl** — each author ships its own textures/materials; the renderer can't batch them. Our standard is *instanced/bucketed vegetation only* (`ASSET_ACCEPTANCE_STANDARD.md` §Triangle And Draw-Call Budgets). Strategy A collapses ~6 species into the single M02P material family and another ~3 into EZ-Tree's single trunk/leaf material.
- **Scale + texel-density mismatch** — one shared pack = one consistent texel budget and silhouette language.
- **Topology variance** — sourcing clean meshes (not photoscans) keeps LOD/impostor baking deterministic.

Target after implementation: the whole vegetation layer resolves to **≈4–6 material buckets** (M02P-atlas, EZ-Tree-bark, EZ-Tree-leaf, ambientCG-cards, hero-tree atlas, ground-cards), all instanced.

---

## 2. Engine ingestion paths (what already exists)

There are **two** runtime representations. Every species lands in one of them.

### Path A — Billboard impostor atlas (ground + mid + palms)
`src/config/pixelForgeAssets.ts` (`PIXEL_FORGE_VEGETATION_ASSETS`) → `src/config/vegetationTypes.ts` (`VEGETATION_TUNING` + grounding maps → `VEGETATION_TYPES`) → `VegetationScatterer.configure(...)` → `GlobalBillboardSystem.addChunkInstances`. Each type is a **lat/lon impostor atlas** (`tilesX × tilesY`, color + normal, `tileSize` 256/512). Biome placement comes from `src/config/biomes.ts` palettes.

To add a billboard species you:
1. Bake a lat/lon impostor atlas (color + normal) from the source GLB.
2. Register it in the veg-asset registry (id, atlas files, tier, atlasProfile, tilesX/Y, tileSize, worldSize, yOffset).
3. Add a `VEGETATION_TUNING` entry (maxInstances, density, placement, slope, cluster) + any grounding sink/lift.
4. Add it to the relevant biome palettes.
5. Flip its `VietnamVegetationSpecies.ts` `sourceStatus` from `blockedPendingSource` → `acceptedRuntimeAtlas`.

### Path B — Static GLB + octahedral impostor (hero canopy trees)
`scripts/import-war-catalog.ts` (`assets:import-war-catalog`) imports + normalizes GLBs into `warAssetCatalog` → register the model in `src/config/staticImpostorArchetypes.ts` → `scripts/bake-static-impostor-atlases.ts` (`assets:bake-static-impostors`) renders baseColor+normal+depth atlases into `public/assets/static-impostors/<slug>/` → `StaticImpostorSystem` promotes/demotes GLB↔impostor by distance (the 4-band LOD).

To add a hero tree you:
1. Get a clean LOD0 GLB (≤ ~15k tris) with ground at Y=0.
2. Import + normalize (axis, scale, pivot) via the war-catalog importer (or a veg variant).
3. Register a `StaticImpostorArchetype` (bounds, promotion/demotion distances, parallax).
4. Run `assets:bake-static-impostors --only <slug>`.
5. Add it to biome scatter; flip species `sourceStatus`.

> **Reuse, don't reinvent:** the existing static-impostor baker *is* a lat/lon impostor baker (azimuth columns × elevation rows → baseColor/normal/depth). The only new code likely needed is a thin adapter to emit the **veg-atlas file layout** (`imposter.png`/`imposter.normal.png` + `imposter.json`) that Path A's registry expects, vs the static-impostor `atlas.*.png` layout. That adapter is a defined task (Phase 2 below), not a new pipeline.

---

## 3. Species → source → engine-path map

| Species | Tier | Source (Strategy A) | Engine path | Notes |
|---|---|---|---|---|
| **fanPalm** | canopy | M02P | A (atlas) — already accepted, **re-bake from M02P** | upgrade existing weak atlas |
| **coconut** | canopy | M02P (or evolveduk TreeIt) | B (GLB+octa) for hero, A for distant | replaces weak palm impostor |
| **areca** | canopy | M02P | A (atlas) | flip blocked→accepted |
| **bananaPlant** | midLevel | M02P | A — already accepted, **re-bake from M02P** | coherent with palms |
| **fern** | groundCover | M02P + ambientCG card fill | A — already accepted, **re-bake** | M02P fern + LeafSet013 cards |
| **elephantEar** | groundCover | M02P (taro/alocasia) | A — already accepted, **re-bake** | |
| **bambooGrove** | midLevel | LordSamueliSolo bamboo (alpha PNG) | A — already accepted, **re-bake** | M02P bamboo as alt |
| **teakBroadleaf** | canopy | **EZ-Tree** (broadleaf preset) | B (GLB+octa) | generate 4–6 variants |
| **rubberTree** | canopy | **EZ-Tree** (slender bole preset) | B (GLB+octa) | re-seed per plantation row |
| **elephantGrass** | midLevel | **ambientCG** Grass004 atlas | A (card) | route-edge concealment |
| **lianaVines** | midLevel | **ambientCG** LeafSet017 + procedural ribbon | A (card, attached) | draped, not free-floating |
| **ricePaddyPlants** | groundCover | dario-scaramuzza rice GLB (CC-BY) + ambientCG fill | A (atlas/card) | paddy/riverbank |
| **banyan** (HERO) | canopy | decimate **CC0 Malayan Banyan** trunk + EZ-Tree canopy + hand-modeled roots | B (GLB+octa) | see §5; impostor-bake from heavy source |
| **mangrove** | canopy | Nice2meetU2 / nigromancer (CC-BY) + mangrove-roots 3.9k | B (GLB+octa) | prop roots are the silhouette |
| **jungleDeadfall** | midLevel | Poly Haven CC0 dead trunks/stumps (decimate) | B (GLB, near-only) | needs collision footprint |
| **net-new ground cover** | new | M02P understory + EZ-Tree saplings + ambientCG litter | A | taro/philodendron/low-palm/shrubs |

Accepted-today species (fern, elephantEar, fanPalm, coconut, bambooGrove, bananaPlant) currently run **Pixel-Forge atlases**; Strategy A **re-bakes them from M02P** so the whole tropical set shares one art family. That re-bake is the single biggest cohesion win.

---

## 4. Tooling

Install the gltf pipeline once:
```bash
npm i -g @gltf-transform/cli
```

### 4a. M02P → per-plant instanced GLBs + atlas-merged textures
M02P is one GLB with 18 textures. Split per plant and collapse textures to cut draw buckets:
```bash
gltf-transform inspect m02p_source.glb                 # confirm 46.5k tris, 18 textures
# Merge/atlas textures, dedup, compress — collapses 18 maps toward 1-2 buckets:
gltf-transform optimize m02p_source.glb m02p_opt.glb \
  --texture-compress webp --compress meshopt --weld 0.0001
# Then split per plant in Blender (or by mesh name) into one GLB per species id.
```
Acceptance: re-run `gltf-transform inspect` per split; each plant should land 1–4k tris, ≤ 2 material buckets.

### 4b. EZ-Tree → teak / rubber GLBs
EZ-Tree (https://eztree.dev, repo `dgreenheck/ez-tree`, MIT) exports GLB natively. Generate 4–6 teak variants (tall straight bole, high broad crown) and 4–6 rubber variants (slender bole, small crown). Keep all variants on **one shared bark + one shared leaf material** for cohesion. Target LOD0 ≤ ~10k tris.

### 4c. Bake lat/lon veg atlases (Path A) and octahedral impostors (Path B)
```bash
# Hero trees (Path B): register archetype in staticImpostorArchetypes.ts, then:
npm run assets:bake-static-impostors -- --only banyan,mangrove,teak-broadleaf,rubber-tree
# Billboard species (Path A): bake lat/lon color+normal atlas via the veg-atlas adapter (Phase 2),
# then register in the veg-asset registry.
```

### 4d. Decimation rules (from the pipeline analysis)
- **Bake the far impostor from the HEAVY source directly** — tri count is free offline; never decimate for the impostor band.
- **Decimate trunks, never alpha-card canopies** — `gltf-transform weld` then `simplify --ratio 0.05 --error 0.001` on the *trunk primitive only*.
- **Banyan buttress roots decimate to mush** — author/keep them as clean low-poly, or bake the heavy scan's detail into a **normal map** on a clean cage (the scan's real value is texture, not geometry).

---

## 5. The banyan (hero) — the one hard asset

Verified: **no free, game-ready, sub-15k-tri true banyan with aerial roots exists.** Decision tree:

1. **$0 path (default):** take **CC0 Malayan Banyan (Ficus microcarpa)** as the clean source — decimate trunk to ~10–12k, author/stylize the prop-root curtain (its roots are understated), build the LOD chain, bake the octahedral impostor from the same mesh. ~1–2h mesh work.
2. **$0 alt:** compose **mangrove-tree-roots (3.9k, CC-BY)** as the root system + an EZ-Tree/M02P canopy on top for a sub-5k hero that reads as strangler-fig.
3. **$0 alt:** ship **Jungle Tree (30.7k, CC-BY)** as-is for the full aerial-root look, decimate one pass to ~15k.
4. **$19 path (only if hero fidelity is paramount):** SpeedTree Indie one month → Strangler Fig species → FBX→Blender→GLB, rebuild LODs in `THREE.LOD`, cancel. Recurring + conversion friction; **not recommended under the cap.**

Recommendation: **option 1 or 2**, $0. Track the banyan as its own task — it's the only species needing real mesh authoring.

---

## 6. Phased task breakdown (cycle C4)

PR-sized, each with its acceptance gate. Branch `task/<slug>`, descriptive slugs.

**Phase 0 — Acquire + license (no engine change)**
- Download the Strategy A source set per `strategy-a-source-manifest.md`; stage under `public/assets/vegetation/source/` (git-ignored raw) + record provenance in `docs/asset-provenance/vegetation-2026-06/`.
- Add every CC-BY credit to `src/ui/AttributionNotice.ts`.
- Gate: manifest complete, all licenses CC0/CC-BY/MIT, attribution committed.

**Phase 1 — M02P cohesion re-bake (biggest win first)**
- Optimize + split M02P; re-bake atlases for the 6 already-accepted species (fern, elephantEar, fanPalm, coconut, bambooGrove, bananaPlant) from the M02P family.
- Swap the registry entries in `pixelForgeAssets.ts` (or a new `vietnamVegetationAtlasAssets.ts`) to the M02P atlases; keep ids stable.
- Gate: `check:vegetation-horizon`, `check:vegetation-grounding`, `check:asset-gallery`; visual parity screenshot in Open Frontier + A Shau.

**Phase 2 — Veg-atlas bake adapter**
- Thin adapter so `bake-static-impostors` (or a `bake-vegetation-atlases` variant) emits the Path-A veg-atlas layout (`imposter.png` + `imposter.normal.png` + `imposter.json`).
- Gate: re-bake one existing species through the adapter, byte-compatible registry load; `check:asset-material`.

**Phase 3 — New billboard species (areca, elephantGrass, lianaVines, ricePaddy + net-new)**
- Bake atlases (M02P areca; ambientCG grass/leaf cards; rice GLB), register + tune, add to biome palettes, flip `sourceStatus`.
- Gate: `check:vegetation-horizon`, `check:vegetation-grounding`, `check:culling-baseline`.

**Phase 4 — EZ-Tree hardwoods (teak, rubber, saplings)**
- Vendor EZ-Tree usage (generate offline, commit GLBs — do **not** add a runtime dep). Import via war-catalog importer; register static-impostor archetypes; bake octahedral atlases.
- Gate: `assets:import-war-catalog`, `check:static-impostors`, `check:asset-gallery`, `check:culling-baseline`.

**Phase 5 — Hero banyan + mangrove + deadfall**
- Banyan per §5 option 1/2; mangrove from CC-BY + roots; deadfall from Poly Haven (decimate, add collision footprint).
- Gate: full `NEW_TREE_FAMILY_GATES` (`assets:import-war-catalog`, `check:asset-gallery`, `check:vegetation-horizon`, `check:vegetation-grounding`, `check:culling-baseline`); owner hero-shot playtest.

**Phase 6 — Tune + perf proof**
- Density/placement tuning per biome; confirm draw-bucket count ≈4–6; combat120 + A Shau perf capture vs pre-cycle baseline.
- Gate: `perf:compare` (non-gating raw metrics), draw-call delta in scene attribution, owner walk.

---

## 7. Files this cycle touches

| File | Change |
|---|---|
| `src/config/pixelForgeAssets.ts` (or new `vietnamVegetationAtlasAssets.ts`) | swap/extend `PIXEL_FORGE_VEGETATION_ASSETS` with M02P + new atlases |
| `src/config/vegetationTypes.ts` | `VEGETATION_TUNING`, grounding sink/lift, stable-azimuth per new id |
| `src/config/VietnamVegetationSpecies.ts` | flip `sourceStatus` blocked→accepted as each lands; update `existingRuntimeTypeId` |
| `src/config/staticImpostorArchetypes.ts` | register banyan/mangrove/teak/rubber/coconut/deadfall GLBs |
| `src/config/biomes.ts` | biome palettes: which species scatter where |
| `src/ui/AttributionNotice.ts` | CC-BY credits |
| `scripts/bake-vegetation-atlases.ts` (new, Phase 2) | veg-atlas-layout adapter over the static baker |
| `docs/asset-provenance/vegetation-2026-06/` | per-asset provenance (provider, prompt/source, tris, license) |

---

## 8. Risks / open decisions

- **M02P 18 textures** — must atlas-merge to hit the draw-bucket target; if merge degrades quality, fall back to 2–3 buckets grouped by material kind (bark / leaf / ground). Measure in Phase 1.
- **Banyan authoring** — the only species needing real Blender work; if option 1/2 don't read well, escalate the $19 SpeedTree decision (owner call).
- **EZ-Tree as a build-time tool vs runtime** — commit generated GLBs; do **not** add EZ-Tree as a runtime dependency (keeps bundle lean).
- **Atlas registry naming** — `pixelForgeAssets.ts` is a misnomer once M02P lands; decide whether to rename to `vietnamVegetationAtlasAssets.ts` (touches `vegetationTypes.ts` + `VietnamVegetationSpecies.ts` imports) or extend in place. Recommend rename in Phase 1.
- **Coconut/fanPalm hero vs atlas** — palms can stay atlas-only (cheaper) unless the player gets close enough to need a GLB; default atlas-only, promote to Path B only if a feel-walk demands it.

---

## 9. Definition of done

- All 15 species + net-new ground cover render in Open Frontier + A Shau with correct grounding and horizon behavior.
- Vegetation layer resolves to ≈4–6 instanced material buckets (scene attribution proof).
- All standing veg gates green; combat120 + A Shau perf within budget of the pre-cycle baseline.
- Every CC-BY asset credited in `AttributionNotice.ts`; provenance recorded.
- Total spend ≤ $20 (target $0).
- Owner hero-shot + biome feel-walk accepted.
