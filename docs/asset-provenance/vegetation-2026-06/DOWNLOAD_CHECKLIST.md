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

- [ ] **Tropical Plants Pack M02P** — `CC-BY`
  - URL: https://sketchfab.com/3d-models/tropical-plants-pack-m02p-2f093afb792742438f0f7ba7eaab90f0
  - Dest: `public/assets/vegetation/source/m02p-tropical-plants/`
  - Note: CC-BY → credit required when shipped (see `ATTRIBUTION_PENDING.md`).

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

- [ ] **EZ-Tree generator** — `MIT`
  - URL: https://eztree.dev  (repo: https://github.com/dgreenheck/ez-tree)
  - Dest: `public/assets/vegetation/source/ez-tree/`
  - Note: generate 4-6 teak + 4-6 rubber GLB variants offline on shared
    bark/leaf materials; commit generated GLBs, do NOT add a runtime dep.

## Step 4 — Banyan + mangrove + deadfall (Phase 5 heroes)

- [ ] **CC0 Malayan Banyan (Ficus microcarpa)** — `CC0`
  - URL: https://sketchfab.com/3d-models/cc0-malayan-banyan-ficus-microcarpa-038bae6f4bfe4a4f804b63efa2155481
  - Dest: `public/assets/vegetation/source/cc0-malayan-banyan/`
  - Note: default $0 banyan hero source.
- [ ] **mangrove tree roots** (3,926 tris) — `CC-BY`
  - URL: https://sketchfab.com/3d-models/mangrove-tree-roots-c32d977c14e04e5ebc1fbef9b6111957
  - Dest: `public/assets/vegetation/source/mangrove-tree-roots/`
  - Note: CC-BY → credit required when shipped.
- [ ] **Chinese Banyan (Ficus microcarpa)** (111,392 tris) — `CC-BY`
  - URL: https://sketchfab.com/3d-models/chinese-banyan-ficus-microcarpa-2a0dbcdf8f5d48f5ad79987c7a8170ce
  - Dest: `public/assets/vegetation/source/chinese-banyan/`
  - Note: impostor-bake source ONLY (too heavy for LOD0). CC-BY → credit if shipped.
- [ ] **Jungle Tree** (30,720 tris) — `CC-BY`
  - URL: https://sketchfab.com/3d-models/jungle-tree-46f83ec5f6c04abf9d509c1070f67d1e
  - Dest: `public/assets/vegetation/source/jungle-tree/`
  - Note: VERIFY bundled sub-asset licenses. CC-BY → credit required when shipped.
- [ ] **Mangrove hero (Nice2meetU2 / nigromancer)** — `CC-BY`
  - URL: https://sketchfab.com/search?q=mangrove&type=models  (pick 2-3 CC-BY)
  - Dest: `public/assets/vegetation/source/mangrove-hero/`
  - Note: capture each author handle + model URL. CC-BY → credit required when shipped.
- [x] **Poly Haven Dead Tree Trunk 01+02 / Stumps 01-02** (DONE 2k gltf x4) — `CC0`
  - URL: https://polyhaven.com/models?search=dead%20tree
  - Dest: `public/assets/vegetation/source/polyhaven-dead-tree/`

## Step 5 — Rice / bamboo / fern fill (Phase 3/5 as needed)

- [ ] **dario-scaramuzza Rice Plant** — `CC-BY`
  - URL: https://sketchfab.com/search?q=rice+plant&type=models  (pick CC-BY)
  - Dest: `public/assets/vegetation/source/rice-plant/`
  - Note: CC-BY → credit required when shipped.
- [ ] **LordSamueliSolo Bamboo** (alpha leaf PNGs) — `CC-BY`
  - URL: https://sketchfab.com/search?q=bamboo&type=models  (pick CC-BY)
  - Dest: `public/assets/vegetation/source/lordsamueli-bamboo/`
  - Note: CC-BY → credit required when shipped.
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
