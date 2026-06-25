<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Vegetation cycle C4 status snapshot (Strategy A content production). Authored 2026-06-25. -->

# Vegetation Cycle C4 — Status (2026-06-25)

Content-production status for the engine-agnostic vegetation library
(`packages/vegetation-library`). This cycle sourced, normalized, and registered
real Strategy A assets (cohesion-first, $0 licenses) as catalog descriptors. The
engine integration design lives in
[VEGETATION_LIBRARY_INTEGRATION_2026-06-25.md](./VEGETATION_LIBRARY_INTEGRATION_2026-06-25.md);
the sourcing plan in
[STRATEGY_A_VEGETATION_IMPLEMENTATION_2026-06-25.md](./STRATEGY_A_VEGETATION_IMPLEMENTATION_2026-06-25.md).

All descriptors validate at catalog load via `assertVegetationAsset`. Verified:
`npx vitest run packages/vegetation-library` → 1 file, 14 tests PASS, "Type
Errors no errors". The catalog now holds **16 descriptors, 13 `ready`.**

---

## `ready` — backed by a normalized GLB (near band real)

| id | tier | LOD0 tris | LOD chain (near → far) | license |
|---|---|---|---|---|
| jungle-tree | canopy | 30,720 | mesh 0-180m → **octaImpostor (baked)** unbounded | CC-BY-4.0 (kobaltsecond) |
| banyan-large | canopy | 13,304 | mesh near → octaImpostor *(planned)* | CC-BY-SA-4.0 (first-party) |
| banyan-standard | canopy | 5,868 | mesh near → billboardAtlas *(planned)* | CC-BY-SA-4.0 (first-party) |
| teak-a | canopy | 9,522 | mesh near → octaImpostor *(planned)* | MIT (EZ-Tree) |
| teak-b | canopy | 9,522 | mesh near → octaImpostor *(planned)* | MIT (EZ-Tree) |
| rubber-a | canopy | 9,522 | mesh near → octaImpostor *(planned)* | MIT (EZ-Tree) |
| rubber-b | canopy | 8,962 | mesh near → octaImpostor *(planned)* | MIT (EZ-Tree) |
| bamboo-grove | midLevel | 9,162 | mesh 0-120m → billboardAtlas *(planned)* | CC-BY-4.0 (verify handle) |
| fan-palm | midLevel | 4,080 | mesh 0-120m → billboardAtlas *(planned)* | CC-BY-4.0 (mozzarellaARC) |
| banana-plant | midLevel | 1,144 | mesh near → groundCard *(planned)* | CC-BY-4.0 (mozzarellaARC) |
| taro-elephant-ear | midLevel | 2,516 | mesh near → groundCard *(planned)* | CC-BY-4.0 (mozzarellaARC) |
| understory-fern | groundCover | 1,152 | mesh near → groundCard *(planned)* | CC-BY-4.0 (mozzarellaARC) |
| rice-paddy | groundCover | 3,876 | mesh 0-25m → groundCard *(planned)* | CC-BY-4.0 (verify handle) |

Only **jungle-tree** is `lodComplete` (both bands baked, no planned bands). The
other 12 `ready` assets have a real near mesh and a single **planned** far band
(impostor/card) awaiting the bake step below.

## `sourceStaged` — raw source present, no normalized representation yet

| id | tier | planned LOD | license |
|---|---|---|---|
| elephant-grass | groundCover | groundCard | CC0-1.0 (ambientCG) |
| fern | groundCover | mesh → groundCard | CC0-1.0 (Poly Haven) |
| jungle-deadfall | midLevel | mesh | CC0-1.0 (Poly Haven) |

---

## Done this cycle (steps 1-4)

- **Step 1 — M02P split:** extracted 4 species from `tropical_plants_pack_m02p.glb`
  (fan-palm, banana-plant, understory-fern, taro-elephant-ear). Per-node world
  transform baked into geometry, pruned, ground-centered, webp q80. Areca palm
  **not present** in the pack → 4 species shipped, not 5.
- **Step 2 — bamboo + rice:** `bamboo-grove` (3-culm clump, 0.34 unit-normalize
  scale, webp 5.1→2.0MB) and `rice-paddy` (vertex-colored, webp skipped per
  recipe). Both `ready`.
- **Step 3 — jungle-tree octahedral impostor BAKED:** standalone
  `scripts/bake-vegetation-impostor.mjs` (reuses the static baker's capture math
  against the http-served GLB; no fenced engine registry touched). 8×3 / 24-tile
  / 2048×768 base-color + normal + depth atlas. Far band promoted to
  `representationId:'octa-jungle'`, `plannedKind` removed → jungle-tree is
  `lodComplete`.
- **Step 4 — EZ-Tree hardwoods:** generated teak-a/teak-b + rubber-a/rubber-b
  from EZ-Tree presets, textured with EZ-Tree's own **MIT bundled bark/leaf**
  (owner constraint: no FAL textures), normalized to 19-22m, ground-centered.
  All 4 `ready`, tier canopy.

## Left / in-flight (next session)

1. **Bake the 12 planned far bands.** Every `ready` asset except jungle-tree has
   a `representationId:null` far band: octaImpostor for teak-a/b + rubber-a/b +
   banyan-large; billboardAtlas for fan-palm + bamboo-grove + banyan-standard;
   groundCard for banana-plant + taro-elephant-ear + understory-fern + rice-paddy.
   Use `scripts/bake-vegetation-impostor.mjs` (octa) and extend it with the
   Path-A atlas / groundCard layout (do NOT fork a second baker).
2. **Promote the 3 `sourceStaged` ids** (elephant-grass, fern, jungle-deadfall)
   by normalizing their staged CC0 sources into mesh/card representations.
3. **M02P remaining species** are intentionally dropped: only dup variants of the
   4 shipped kinds remained (Palm_B08 ×3, Banana_B09 ×2, Fern_B05 variants,
   Monstera_B07 ×4) plus a discarded ground-plane Circle. No new species to mine.
4. **EZ-Tree native textures** are embedded AND staged at
   `public/assets/vegetation/textures/eztree-*` for the shared-bucket batching
   path — wired only when the integration adapter lands.
5. **Provenance follow-up:** confirm real Sketchfab author handles for
   `bamboo-grove` and `rice-paddy` (currently `verify` — handles not recoverable
   from the staged GLB metadata) before any public release.
6. **Engine integration NOT started.** No engine/runtime code touched this cycle.
   The adapter seam (`src/config/vegetation/vegetationLibraryAdapter.ts`) and the
   5-phase wire-in are specified in
   [VEGETATION_LIBRARY_INTEGRATION_2026-06-25.md](./VEGETATION_LIBRARY_INTEGRATION_2026-06-25.md)
   §1 and §5; the catalog-as-truth migration retires the
   `PIXEL_FORGE_BLOCKED_VEGETATION_IDS` stoplist.
