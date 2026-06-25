<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Strategy A source acquisition + attribution checklist. Authored 2026-06-25. -->

# Strategy A — Source Manifest & Attribution Checklist

Download list for the Vietnam vegetation layer. **All licenses are CC0 / CC-BY / MIT — total cost $0.** Verify each license badge at download time; CC-BY requires attribution in `src/ui/AttributionNotice.ts`.

Legend: ✅ verified this session · ⚠️ verify on download · 🔧 needs mesh/texture work.

---

## Tier 1 — Backbone (get these first)

| # | Asset | Source | License | Verified | URL | Use |
|---|---|---|---|---|---|---|
| 1 | **Tropical Plants Pack M02P** | mozzarellaARC / Sketchfab | CC-BY | ✅ 46,575 tris, 23,397 verts, GLB, 18 tex, 0 anim | https://sketchfab.com/3d-models/tropical-plants-pack-m02p-2f093afb792742438f0f7ba7eaab90f0 | palms, areca, banana, fern, taro, understory — the spine |
| 2 | **EZ-Tree** (generator) | dgreenheck | MIT | ✅ native GLB export | https://eztree.dev · repo https://github.com/dgreenheck/ez-tree | teak, rubber, saplings, shrubs |
| 3 | **ambientCG leaf/grass atlases** | ambientCG | CC0 | ⚠️ pick sets at download | https://ambientcg.com/list?q=leaf · https://ambientcg.com/list?q=grass | Grass004 (elephant grass), LeafSet013/017 (vines, fern cards), Foliage001 |

## Tier 2 — Hero canopy (Path B: GLB + octahedral impostor)

| # | Asset | Source | License | Verified | URL | Use |
|---|---|---|---|---|---|---|
| 4 | **CC0 Malayan Banyan (Ficus microcarpa)** | ffish.asia/floraZia / Sketchfab | **CC0** | ⚠️ roots understated 🔧 | https://sketchfab.com/3d-models/cc0-malayan-banyan-ficus-microcarpa-038bae6f4bfe4a4f804b63efa2155481 | banyan hero — decimate trunk, author roots, bake impostor |
| 5 | **mangrove tree roots** | Sketchfab | CC-BY | ✅ 3,926 tris / 1,957 verts | https://sketchfab.com/3d-models/mangrove-tree-roots-c32d977c14e04e5ebc1fbef9b6111957 | banyan/mangrove prop-root system (compose with canopy) |
| 6 | **Chinese Banyan (Ficus microcarpa)** | Sketchfab | CC-BY | ✅ 111,392 tris / 71,033 verts 🔧 | https://sketchfab.com/3d-models/chinese-banyan-ficus-microcarpa-2a0dbcdf8f5d48f5ad79987c7a8170ce | **impostor-bake source only** (real banyan silhouette; too heavy for LOD0) |
| 7 | **Jungle Tree** | Sketchfab | CC-BY | ✅ 30,720 tris / 37,082 verts 🔧 | https://sketchfab.com/3d-models/jungle-tree-46f83ec5f6c04abf9d509c1070f67d1e | full aerial-root look; decimate one pass to ~15k. ⚠️ verify bundled sub-asset licenses |
| 8 | **Nice2meetU2 / nigromancer Mangrove** | Sketchfab | CC-BY | ⚠️ | (search "mangrove" CC-BY on Sketchfab) | mangrove hero variants (2–3 for a stand) |
| 9 | **Poly Haven Dead Tree Trunk 02 / Stumps 01–02** | Poly Haven | CC0 | ✅ multi-LOD GLB | https://polyhaven.com/models?search=dead%20tree | jungleDeadfall (decimate; add collision footprint) |

## Tier 3 — Mid + ground cards / fill

| # | Asset | Source | License | Verified | URL | Use |
|---|---|---|---|---|---|---|
| 10 | **dario-scaramuzza Rice Plant** | Sketchfab | CC-BY | ⚠️ | (search "rice plant" CC-BY) | ricePaddyPlants close |
| 11 | **LordSamueliSolo Bamboo (alpha PNGs)** | Sketchfab | CC-BY | ⚠️ ships alpha leaf PNGs | (search "bamboo" CC-BY) | bambooGrove alt (M02P bamboo is primary) |
| 12 | **Quaternius Ultimate Stylized Nature** | Quaternius | CC0 | ⚠️ | https://quaternius.com | fallback/Strategy-B backbone if M02P style clashes |
| 13 | **Poly Haven Fern 02** | Poly Haven | CC0 | ⚠️ spans all bands (GLB + Alpha) | https://polyhaven.com/models?search=fern | fern alt / impostor-card source |

---

## Not buying (over cap or license-fatal)

| Asset | Why excluded |
|---|---|
| NatureManufacture SE-Asia pack ($55) | over $20 cap |
| SpeedTree Indie ($19/mo) | recurring + no glTF export; only if banyan fidelity escalated (owner call) |
| xfrog paid Banyan Collection (~$26) | over $20 cap |
| **xfrog AS06 Ficus benghalensis (free)** | **CC BY-NC-ND — non-commercial + no-derivatives; license-fatal for our AGPL ship + decimation pipeline. Do NOT use.** |
| Quixel Megascans | no banyan in catalog; 2.1M-tri Nanite, WebGL-incompatible |
| The Grove 3D | license forbids distributing grown models |

---

## Attribution obligations (CC-BY → must credit)

Add to `src/ui/AttributionNotice.ts` for every CC-BY asset actually shipped. CC0 (M02P is CC-BY, ambientCG/Poly Haven/Quaternius are CC0) needs no attribution but record provenance anyway.

Required-if-used credits: M02P (mozzarellaARC), mangrove-tree-roots author, Chinese Banyan author, Jungle Tree author, mangrove hero authors, rice plant author, LordSamueliSolo bamboo. Capture exact author handle + model URL + license version at download.

Record full provenance per asset under `docs/asset-provenance/vegetation-2026-06/<slug>.provenance.json` (provider, source URL, license, source triangles, prompt/notes) per `ASSET_ACCEPTANCE_STANDARD.md`.

---

## Acquisition order (matches implementation phases)

1. **M02P** (#1) → Phase 1 cohesion re-bake (biggest win).
2. **ambientCG cards** (#3) → Phase 3 billboard species.
3. **EZ-Tree** (#2) → Phase 4 hardwoods.
4. **Banyan + mangrove + deadfall** (#4–9) → Phase 5 heroes.
5. **Rice/bamboo/fern fill** (#10–13) → Phase 3/5 as needed.
