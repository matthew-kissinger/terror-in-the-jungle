# Attribution pending — CC-BY vegetation credits (DRAFT)

Drafted credit lines for the **CC-BY** Strategy A vegetation sources. These are
**not yet shipped** — every asset below is pending download and not in the build.

**Do NOT edit `src/ui/AttributionNotice.ts` yet.** Copy a credit line into it
**only when the derived asset actually ships** (per the manifest's "Attribution
obligations" section and `ASSET_ACCEPTANCE_STANDARD.md`). CC0 sources
(ambientCG, Poly Haven, Quaternius, CC0 Malayan Banyan) and MIT (EZ-Tree) need
no credit — provenance only.

At ship time, **fill the bracketed placeholders** with the exact values captured
at download (author handle, model title as published, source URL, license
version, e.g. `CC BY 4.0`).

---

## Credit lines to add when shipped

Format: `<Model name> by <author> — <license version> — <url>`

- [ ] **M02P (Tropical Plants Pack)** — CC-BY — *unshipped/pending*
  `"Tropical Plants Pack M02P" by mozzarellaARC — [CC BY x.x] — https://sketchfab.com/3d-models/tropical-plants-pack-m02p-2f093afb792742438f0f7ba7eaab90f0`

- [ ] **mangrove tree roots** — CC-BY — *unshipped/pending*
  `"Mangrove Tree Roots" by [author handle] — [CC BY x.x] — https://sketchfab.com/3d-models/mangrove-tree-roots-c32d977c14e04e5ebc1fbef9b6111957`

- [ ] **Chinese Banyan** (impostor-bake source) — CC-BY — *unshipped/pending*
  `"Chinese Banyan (Ficus microcarpa)" by [author handle] — [CC BY x.x] — https://sketchfab.com/3d-models/chinese-banyan-ficus-microcarpa-2a0dbcdf8f5d48f5ad79987c7a8170ce`

- [ ] **Jungle Tree** — CC-BY — *unshipped/pending*  (also verify bundled sub-asset licenses)
  `"Jungle Tree" by [author handle] — [CC BY x.x] — https://sketchfab.com/3d-models/jungle-tree-46f83ec5f6c04abf9d509c1070f67d1e`

- [ ] **Mangrove hero** (Nice2meetU2 / nigromancer) — CC-BY — *unshipped/pending*  (one line per model actually used)
  `"[Mangrove model title]" by [author handle] — [CC BY x.x] — [model url]`

- [ ] **Rice Plant** (dario-scaramuzza) — CC-BY — *unshipped/pending*
  `"Rice Plant" by dario-scaramuzza — [CC BY x.x] — [model url]`

- [ ] **Bamboo** (LordSamueliSolo) — CC-BY — *unshipped/pending*
  `"Bamboo" by LordSamueliSolo — [CC BY x.x] — [model url]`

---

## Where it goes

`src/ui/AttributionNotice.ts` renders the Credits / About panel
(`showCreditsPanel`). When the first CC-BY veg asset ships, add a
vegetation-credits block there (a third-party art credits list), matching the
existing CC BY-SA / THIRD-PARTY-ASSETS.md prose style. Also reconcile with
`THIRD-PARTY-ASSETS.md` so the in-app panel and the repo file agree.
