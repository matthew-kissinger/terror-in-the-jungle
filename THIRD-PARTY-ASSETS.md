# Third-Party and Public-Domain Assets

This file inventories inputs in this repository (and its delivered runtime
bundle) that are **not** original work of Matthew Kissinger, or that are
otherwise **not** covered by this project's AGPL-3.0 (code) / CC BY-SA 4.0
(original assets) licensing. These retain their own licenses / status and are
**NOT relicensed**.

Scope note: the large terrain DEM payloads and some runtime model/texture
binaries are delivered from object storage (Cloudflare R2) and/or are
git-ignored locally (see [`data/vietnam/DATA_PIPELINE.md`](data/vietnam/DATA_PIPELINE.md)).
The provenance below applies to those copies as well.

## Real-world terrain / elevation data — public domain / third-party

Files: `data/vietnam/**` and `public/data/vietnam/**` — DEM heightfields
(`*.f32`, `*.bin`), metadata (`*.meta.json`, `manifest.json`), and geographic
reference overlays (`*-rivers.json`, `*-firebases.json`).

- The terrain elevation is **derived from real-world Digital Elevation Models**.
  The primary source is **USGS 3DEP**, which as a US-government work is in the
  **public domain** (no copyright; no relicensing applies or is asserted).
- `data/vietnam/DATA_PIPELINE.md` also names candidate sources for future
  layers — **FABDEM** (bare-earth DEM, licensed **CC BY-NC-SA 4.0**) and
  **HydroRIVERS / Hydroviet** river networks. If any such source is adopted,
  that dataset retains **its own** license. Note: FABDEM's non-commercial (NC)
  term would be incompatible with commercial redistribution — confirm the
  actual source per dataset before shipping it.
- **Action for owner:** confirm the exact DEM source for each shipped
  `.f32`/`.bin` is public-domain (USGS 3DEP) and not an NC-restricted source,
  and record source + license + conversion per the pipeline's "Processing
  Contract".

## Fonts — third-party, SIL Open Font License 1.1

Bundled via npm and shipped in the build:

- `@fontsource/special-elite`
- `@fontsource/courier-prime`
- `@fontsource/caveat`

These are third-party typefaces distributed under the **SIL Open Font License
1.1** (see each package's bundled license under `node_modules/`). They are not
relicensed; CC BY-SA 4.0 does not apply to them.

## Vegetation — third-party 3D models + textures

Staged under `public/assets/vegetation/` (normalized binaries) and
`public/assets/vegetation/source/` (raw source, git-ignored). Full provenance
per asset in [`docs/asset-provenance/vegetation-2026-06/`](docs/asset-provenance/vegetation-2026-06/)
and the engine-agnostic descriptors in
[`packages/vegetation-library/catalog/`](packages/vegetation-library/catalog/).

**Shipped (in the runtime bundle):**

- **Jungle Tree** — author **kobaltsecond**, Sketchfab, **CC BY 4.0**.
  https://sketchfab.com/3d-models/jungle-tree-46f83ec5f6c04abf9d509c1070f67d1e
  Normalized (pivot + webp textures) to `public/assets/vegetation/jungle-tree/`.
  **Attribution required** — keep this credit while shipped.

- **Bamboo Grove** — author **verify** (from the "free bamboo set"), Sketchfab, **CC BY 4.0**.
  https://sketchfab.com/search?q=bamboo&type=models
  Representative 3-culm clump extracted + re-clustered + uniform-scaled to a realistic
  ~14m height, normalized (pivot + webp textures) to `public/assets/vegetation/bamboo-grove/`
  (also re-baked as the `bamboo-thicket` ground-card variant for dense high-density placement).
  **Attribution required** — keep this credit while shipped (author handle to be confirmed).

- **Rice Paddy Plant** — author **verify**, Sketchfab, **CC BY 4.0**.
  https://sketchfab.com/search?q=rice+plant&type=models
  Vertex-colored (no textures); pivot-only normalization to `public/assets/vegetation/rice-paddy/`.
  **Attribution required** — keep this credit while shipped (author handle to be confirmed).

- **Tropical Plants Pack M02P** — author **mozzarellaARC**, Sketchfab, **CC BY 4.0**.
  https://sketchfab.com/3d-models/tropical-plants-pack-m02p-2f093afb792742438f0f7ba7eaab90f0
  Split into four per-species assets (cleanest representative variant each), world-transform
  baked, pivot + webp normalized to `public/assets/vegetation/fan-palm/`, `.../banana-plant/`,
  `.../understory-fern/`, `.../taro-elephant-ear/`.
  **Attribution required** — keep this credit while shipped.

- **Coconut Palm** — author **Poly by Google**, via poly.pizza, **CC BY 4.0**.
  https://poly.pizza/m/bXUTyfiwqBb
  Centered to a ground pivot + webp-compressed (2.38MB -> 329KB) via @gltf-transform to
  `public/assets/vegetation/coconut-palm/`; a front-view alpha card is baked for the far LOD.
  **Attribution required** — keep this credit while shipped.

- **EZ-Tree hardwoods (teak-a, teak-b, rubber-a, rubber-b)** — generator by
  **Daniel Greenheck (dgreenheck)**, **MIT**.
  https://github.com/dgreenheck/ez-tree
  Generated headless with `@dgreenheck/ez-tree@1.1.0`; each normalized (ground-center
  pivot, scaled to 19-22m, LOD0 <=10k tris) with EZ-Tree's own MIT bark + leaf textures
  bound (leaf alphaClip). Written to `public/assets/vegetation/{teak-a,teak-b,rubber-a,rubber-b}/`.
  MIT does **not** require attribution; credited here as a courtesy.

**Staged, not yet shipped (credit becomes required if/when shipped):**

- **ambientCG** Grass004 / LeafSet013 / LeafSet017 / Foliage001 — **CC0** (no attribution required).
- **Poly Haven** fern_02 / dead_tree_trunk / dead_tree_trunk_02 — **CC0** (no attribution required).

First-party vegetation (Kiln Studio procedural banyans) is original work under
CC BY-SA 4.0 and is **not** listed here.

## npm runtime + build dependencies — third-party, own licenses

Runtime code dependencies (e.g. **three.js** — MIT; **@recast-navigation/\*** —
MIT; **three-mesh-bvh** — MIT; **tweakpane**; **@preact/signals-core**) and all
build/dev dependencies retain their own licenses (see each package under
`node_modules/` and `package.json`). AGPL-3.0 applies to this project's
**first-party source**, not to these dependencies.

## Audio (owner-declared original — verify)

Files: `public/assets/**/*.wav`, `*.ogg` (gunshots, footsteps, jungle ambience,
rotor noise, etc.). The owner **declares these as original assets**, licensed
CC BY-SA 4.0 (see [LICENSE-ASSETS](LICENSE-ASSETS)). If any clip was in fact
sourced from a third-party sound library (e.g. a freesound or commercial SFX
pack), it retains that source's license and should be **moved into this file**
with its origin.

- **Action for owner:** confirm every audio file is originally authored, or
  list the exceptions here.

## Note: "Pixel Forge" assets are FIRST-PARTY (not third-party)

Models under `public/models/**/pixel-forge*/` and the imported aircraft GLBs are
generated by the owner's own **"Pixel Forge"** procedural pipeline
(`~/X/games-3d/pixel-forge`; AI-assisted via the Anthropic API; output is
procedural geometry exported to GLB). They are **original first-party work**
under CC BY-SA 4.0, recorded here only to preempt confusion — they are not a
third-party asset source.
