# Vegetation download checklist — cycle C4 (owner-facing)

Manual acquisition for the Strategy A Vietnam vegetation layer. **All sources
are CC0 / CC-BY / MIT — total cost $0.**

> **Status 2026-06-25:** the 8 CC0 items with public endpoints were fetched
> automatically (Poly Haven model API + ambientCG direct download) into
> `public/assets/vegetation/source/` with provenance recorded — checked off
> below. The remainder are **Sketchfab (login-gated)**, **EZ-Tree (interactive
> generator)**, and **Quaternius (Google-Drive folder)** — those need the
> browser. Sketchfab authors + licenses are already confirmed via the public
> API and pre-filled in the `.provenance.json` files, so just download and drop
> each archive in the listed folder.

For every item: **verify the license badge at the page matches the license noted
here**, then extract the archive's contents into the listed destination folder
under `public/assets/vegetation/source/` (git-ignored). After each download,
update the matching `<slug>.provenance.json` (`status` → `downloaded`, verified
tri count, exact author handle + URL + license version).

Order follows the manifest's "Acquisition order" (matches implementation phases).

---

## Step 1 — M02P (Phase 1 cohesion re-bake; biggest win)

- [x] **Tropical Plants Pack M02P** (DONE + NORMALIZED 2026-06-25) — `CC-BY`
  - URL: https://sketchfab.com/3d-models/tropical-plants-pack-m02p-2f093afb792742438f0f7ba7eaab90f0
  - Dest: `public/assets/vegetation/source/m02p-tropical-plants/`
  - Note: CC-BY → credit required when shipped (see `ATTRIBUTION_PENDING.md`).
    Split into 4 catalog-`ready` species: `fan-palm`, `banana-plant`,
    `understory-fern`, `taro-elephant-ear`. Areca palm not in pack (only the
    B08 fan-palm family) → 4 species, not 5.

## Step 2 — ambientCG cards (Phase 3 billboard species)

- [x] **ambientCG Grass004** (DONE 2K-JPG) (elephant grass) — `CC0`
  - URL: https://ambientcg.com/list?q=grass
  - Dest: `public/assets/vegetation/source/ambientcg-grass004/`
- [x] **ambientCG LeafSet013** (DONE 2K-PNG+alpha) (fern cards) — `CC0`
  - URL: https://ambientcg.com/list?q=leaf
  - Dest: `public/assets/vegetation/source/ambientcg-leafset013/`
- [x] **ambientCG LeafSet017** (DONE 2K-PNG+alpha) (liana/vine cards) — `CC0`
  - URL: https://ambientcg.com/list?q=leaf
  - Dest: `public/assets/vegetation/source/ambientcg-leafset017/`

## Step 3 — EZ-Tree (Phase 4 hardwoods)

- [x] **EZ-Tree generator** (DONE + NORMALIZED 2026-06-25) — `MIT`
  - URL: https://eztree.dev  (repo: https://github.com/dgreenheck/ez-tree)
  - Dest: `public/assets/vegetation/source/ez-tree/`
  - Note: generated 2 teak + 2 rubber GLBs (`teak-a`, `teak-b`, `rubber-a`,
    `rubber-b`, all catalog-`ready`) on EZ-Tree's own MIT bundled bark/leaf
    textures (no FAL). No runtime dep added. Banyans intentionally NOT
    generated — jungle-tree is the canopy hero.

## Step 4 — Banyan + mangrove + deadfall (Phase 5 heroes)

- [~] **CC0 Malayan Banyan (Ficus microcarpa)** — `CC0` — **NOT NEEDED**
  - URL: https://sketchfab.com/3d-models/cc0-malayan-banyan-ficus-microcarpa-038bae6f4bfe4a4f804b63efa2155481
  - Dest: `public/assets/vegetation/source/cc0-malayan-banyan/`
  - Note: NOT NEEDED — `jungle-tree` (baked octa-impostor LOD) is the canopy
    hero; the two `banyan-*` catalog descriptors cover the banyan silhouette.
- [~] **mangrove tree roots** (3,926 tris) — `CC-BY` — **NOT NEEDED**
  - URL: https://sketchfab.com/3d-models/mangrove-tree-roots-c32d977c14e04e5ebc1fbef9b6111957
  - Dest: `public/assets/vegetation/source/mangrove-tree-roots/`
  - Note: NOT NEEDED this cycle — no water/mangrove biome in scope (hydrology
    scorched). Defer to a future terrain/world-gen cycle.
- [~] **Chinese Banyan (Ficus microcarpa)** (111,392 tris) — `CC-BY` — **NOT NEEDED**
  - URL: https://sketchfab.com/3d-models/chinese-banyan-ficus-microcarpa-2a0dbcdf8f5d48f5ad79987c7a8170ce
  - Dest: `public/assets/vegetation/source/chinese-banyan/`
  - Note: NOT NEEDED — jungle-tree is the canopy hero; 111k tris is impostor-only
    weight we no longer need to acquire.
- [x] **Jungle Tree** (30,720 tris, DONE + NORMALIZED + IMPOSTOR-BAKED 2026-06-25) — `CC-BY`
  - URL: https://sketchfab.com/3d-models/jungle-tree-46f83ec5f6c04abf9d509c1070f67d1e
  - Dest: `public/assets/vegetation/source/jungle-tree/`
  - Note: catalog `jungle-tree` — the canopy hero, `lodComplete` (mesh near +
    baked 8×3 octaImpostor far). CC-BY kobaltsecond credited in
    `THIRD-PARTY-ASSETS.md`.
- [~] **Mangrove hero (Nice2meetU2 / nigromancer)** — `CC-BY` — **NOT NEEDED**
  - URL: https://sketchfab.com/search?q=mangrove&type=models  (pick 2-3 CC-BY)
  - Dest: `public/assets/vegetation/source/mangrove-hero/`
  - Note: NOT NEEDED this cycle — no mangrove/water biome in scope.
- [x] **Poly Haven Dead Tree Trunk + Trunk 02** (DONE 1k gltf x2, 2026-06-25) — `CC0`
  - URL: https://polyhaven.com/a/dead_tree_trunk · https://polyhaven.com/a/dead_tree_trunk_02
  - Dest: `public/assets/vegetation/source/polyhaven-dead-tree-trunk{,-02}/`
  - Catalog: `jungle-deadfall` (sourceStaged). Stumps 01-02 not yet pulled (optional).

## Step 5 — Rice / bamboo / fern fill (Phase 3/5 as needed)

- [x] **dario-scaramuzza Rice Plant** (DONE + NORMALIZED 2026-06-25) — `CC-BY`
  - URL: https://sketchfab.com/search?q=rice+plant&type=models  (pick CC-BY)
  - Dest: `public/assets/vegetation/source/rice-plant/`
  - Note: catalog `rice-paddy` (`ready`, vertex-colored, webp skipped). CC-BY,
    author handle still `verify` (not recoverable from staged GLB metadata).
- [x] **LordSamueliSolo Bamboo** (alpha leaf PNGs, DONE + NORMALIZED 2026-06-25) — `CC-BY`
  - URL: https://sketchfab.com/search?q=bamboo&type=models  (pick CC-BY)
  - Dest: `public/assets/vegetation/source/lordsamueli-bamboo/`
  - Note: catalog `bamboo-grove` (`ready`, 3-culm clump, webp 5.1→2.0MB). CC-BY,
    author handle still `verify`.
- [ ] **Quaternius Ultimate Stylized Nature** — `CC0`
  - URL: https://quaternius.com
  - Dest: `public/assets/vegetation/source/quaternius-nature/`
  - Note: fallback/Strategy-B backbone only.
- [x] **Poly Haven Fern 02** (DONE 2k gltf) (GLB + Alpha) — `CC0`
  - URL: https://polyhaven.com/models?search=fern
  - Dest: `public/assets/vegetation/source/polyhaven-fern-02/`

---

## Do NOT download (over cap / license-fatal — from the manifest)

- NatureManufacture SE-Asia pack ($55, over cap)
- SpeedTree Indie ($19/mo, recurring; only on owner call if banyan fidelity escalates)
- xfrog paid Banyan Collection (~$26, over cap)
- **xfrog AS06 Ficus benghalensis (free)** — CC BY-NC-ND, license-fatal for AGPL ship + decimation. Do NOT use.
- Quixel Megascans (no banyan; Nanite, WebGL-incompatible)
- The Grove 3D (license forbids distributing grown models)
