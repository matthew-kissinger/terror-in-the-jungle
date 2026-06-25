# Asset Regen + r185 Upgrade Scaffold — 2026-06-25

Stabilize-then-upgrade plan. **Redo the full asset pack first** (so perf readings are
measured against final art, not placeholder/over-budget GLBs), then bump Three.js r184→r185,
then pursue the BatchedMesh-LOD-BVH / ClusteredLighting render levers.

Branch: `task/asset-regen-r185-scaffold` (off `origin/master` @ `50956cff`).

---

## 0. Status snapshot

| Track | State |
|---|---|
| r185 runtime bump | **DONE on branch** — `three@0.185.0` installed; `tsc --noEmit` PASS; `npm run build` PASS |
| r185 types | `@types/three@0.185` **not published** (latest `0.184.1`) — pinned `^0.184.1`, compiles clean against 0.185 runtime. Re-pin types when DefinitelyTyped catches up. |
| Local peer deps | `@game-field-kits/{three-model-optimizer,three-effect-pool}` peer-pin `three@^0.184.0` → install **warns** (non-blocking). Bump their peer ranges in `X/games-field-kits`. |
| Full test suite | running (notify on completion) |
| Asset inventory | **191 GLBs / 11.8 MB** catalogued (below) |
| Kiln batch recipe | researched — §3 |
| Vegetation sourcing | researched — §4 |

---

## 1. The regeneration list (what gets remade in Kiln)

191 GLBs on disk. Split into three buckets:

### A. REGENERATE in Kiln — the 108-asset war catalog (`src/config/generated/warAssetCatalog.ts`)
Already text-to-3D generated (pixel-forge + Gemini); regenerate through the **Kiln engine** with a
locked palette + material consolidation. **The existing 99 `sourcePrompt`s in
`docs/asset-provenance/repaint-2026-06/*.provenance.json` are reusable batch seeds** — refine, don't rewrite.

| Class | Count | Priority signal |
|---|---|---|
| structures | 32 | **4 REJECT** (sandbag-bunker, sandbag-wall, helipad, ammo-bunker, toc-bunker, concertina-wire, barbed-wire-fence, rice-dike), 19-mat aid-station |
| buildings | 20 | high material sprawl (warehouse 14-mat, tea-house 13-mat 6.8k-tri, french-villa 10-mat 12.4k-tri, rubber-plantation-mansion 12-mat 13.4k-tri) |
| weapons | 15 | mostly PASS; a few tri-budget EXCEPTIONs (m16a1 1976/1500) |
| aircraft | 14 | joints (rotors/props) must survive — see §3 export notes |
| animals | 12 | organic; Kiln is weakest here — consider sourcing instead |
| ground | 9 | turret/wheel joints; -Z-forward normalization |
| boats | 5 | dormant (water scorched) but cataloged |
| props | 1 | wooden-barrel |

**Worst instanceability (regen first — material count is the Kiln grade lever):**
`aid-station` 19mat · `generator-shed` 17mat · `shophouse` 15mat · `warehouse`/`market-stall` 14mat ·
`tea-house`/`rice-mill`/`firebase-gate` 13mat. Locking one palette collapses these C/D/F → A/B.

**REJECTs (10) — structurally broken, top of the queue:** `sandbag-bunker`, `sandbag-wall` (48k tris!),
`helipad` (41k tris!), `ammo-bunker`, `toc-bunker`, `concertina-wire`, `barbed-wire-fence`, `rice-dike`,
`egret`, plus any flagged in `docs/asset-provenance/repaint-2026-06/REROLL_REQUESTS.md`.

### B. DELETE (don't regenerate) — 80 dead pixel-forge props
`public/models/props/pixel-forge/*.glb` (80 files) are consumed only by
`src/systems/assets/PixelForgePropCatalog.ts`, which **is not imported by any live system** (dead code,
matches the project-memory "dead PixelForgePropCatalog" note). They are generic survival-game assets
(tools, fishing, chests, autumn trees, campfires) — not Vietnam. **Confirm no live spawn path, then delete
both the GLBs and the catalog** to clean the perf baseline. (~0.6 MB + knip win.)

### C. KEEP as-is — rigged NPC characters
`public/models/npcs/pixel-forge-v1/{vc,usArmy,nva,arvn}.glb` (4 × ~740 KB). Rigged animated humanoids —
**Kiln does not author rigged characters.** Out of scope; revisit only if a character-art pipeline appears.

---

## 2. The custom palette set (proposed "Vietnam War")

Kiln palettes are **named material *slots*** (role + sRGB hex + PBR + a "use for" hint), max 32 slots,
hard color-snapped into every baked GLB via OKLab nearest-slot. One palette locked across the batch =
visual cohesion **and** fewer materials = better instanceability/batching. Proposed starter set:

| slot | hex | metal | rough | use for |
|---|---|---|---|---|
| od-green | `#4a5236` | 0 | 0.85 | olive-drab gear, US vehicle bodies, fatigues |
| gunmetal | `#3a3f47` | 0.9 | 0.45 | weapons, barrels, fittings |
| wood | `#6e4c2f` | 0 | 0.8 | stocks, crates, stilt-house timber |
| sandbag/earth | `#9b8a5e` | 0 | 1.0 | sandbags, earthworks, dirt, thatch |
| rust | `#8a4a2c` | 0.2 | 0.8 | oxidized metal, fuel drums |
| foliage | `#3f5d2a` | 0 | 0.9 | jungle leaves, camo netting, NVA green |
| black-rubber | `#1c1d1f` | 0 | 0.6 | tires, hoses, charred |
| concrete | `#9a958c` | 0 | 0.95 | bunkers, French-colonial masonry |
| glass | `#aacbe0` | — | 0.1 | canopies, optics, windows (`kind:'glass'`, opacity 0.35) |

> Tune against the live atmosphere palette in `src/config/biomes.ts` so assets read correctly under
> the SOL-1 lighting rig at dawn/dusk/night. Add faction-tint slots (ARVN/US khaki vs NVA/VC green) if
> per-faction asset variants are wanted.

---

## 3. How to feed the batch into Kiln (recipe)

Kiln Studio app: `X/kiln/kiln-studio` (live `kilnstudio.tools`). Engine: `X/kiln/kiln`.

1. **Create the palette** — `POST /api/palettes` with the slots above → returns `paletteId:"vietnam-war"`.
   (`ks_palettes` table; UI: PaletteEditor.) Local dev auth header: `x-dev-user: dev-admin` (cap-exempt).
2. **Author explicit named lists** — skip the planner; hand the item array straight in. Reuse the 99
   `sourcePrompt`s as `items[].prompt`.
3. **Two batch surfaces:**
   - **Packs** (`POST /api/packs` → `/run`): grouped, composable, but **40-item cap** → ≥3 packs
     (weapons+ground / structures / buildings+aircraft). Set pack-wide `paletteId:"vietnam-war"`.
   - **Flat loop** (`POST /api/generate` per asset with `paletteId`): **no cap** — cleanest for 108 in one
     pass. (The stock `batch-run.ts` CLI does *not* forward `paletteId` — drive `/api/generate` directly.)
4. **Per-asset knobs:** `category` (`prop|architecture|environment|...`), `role`, `optimizedPalette`
   (material-collapse; redundant when `paletteId` set — palette snap wins), `moreDetail`, `count` (variants).
   **Grade A–F keys ONLY on material count** (≤1=A … 13+=F); triangles don't affect the grade (but watch
   the game's own budgets: weapons 1500, etc.).
5. **Export → game.** Kiln bakes GLB at **+X forward, +Y up, ground Y=0**. The game importer
   (`npm run assets:import-war-catalog`) already normalizes +X→+Z (most) / +X→-Z (ground vehicles) — the
   90/9 split in current provenance. **Caveats:** Kiln does **not** emit `EXT_mesh_gpu_instancing` (add
   post-export if the BatchedMesh path wants it); joints/animations ARE supported via named pivots + clips
   (`includeAnimation:true`, `animationClips:[...]`) — required for aircraft rotors/props + vehicle turrets/wheels.

Full citations: see the kiln-format research in this session.

---

## 4. Vegetation sourcing (parallel track — the one thing Kiln won't do well)

The game already specs the target species in `src/config/VietnamVegetationSpecies.ts` (banyan = primary
hero-tree candidate, teakBroadleaf, rubberTree, bambooGrove, bananaPlant, coconut/fanPalm/areca,
elephantGrass, fern, mangrove, ricePaddyPlants, jungleDeadfall, lianaVines). Only the palm imposter is good today.

**Get-these-first shortlist (all CC0 unless noted — repo-safe for AGPL):**
1. **Quaternius Ultimate Stylized Nature** (CC0, glTF, has palms) — base trees/bushes/grass. `quaternius.com`
2. **ambientCG leaf/foliage atlases** (CC0, 8K alpha) — the alpha-tested cards for banana/fern/elephant-grass billboards. `ambientcg.com/list?q=leaf`
3. **EZ-Tree** (MIT, Three.js-native, exports GLB) — generate Vietnam-shaped canopy hardwoods + rubber rows. **Same author (dgreenheck) as the vendored WebGPU skill.** `eztree.dev`
4. **CC0 Sketchfab spot models** (verify each) — banana, bamboo thicket, rice clump.
5. **agargaro/octahedral-impostor + InstancedMesh2** (MIT) — runtime in-browser imposter bake (hemi-octahedral) + instanced LOD; demo runs ~200k trees on mobile. Extends the existing palm-imposter approach to all trees. `github.com/agargaro/octahedral-impostor`

**Rendering rules:** alpha-**test** (never blend) for foliage; mobile bottleneck is overdraw/fill-rate, not
draw calls; `alphaToCoverage` for crisp edges with MSAA. Hard categories with no good asset (triple-canopy
dipterocarps, rubber, elephant grass, A Shau rice terraces) → **fake the silhouette** (buttress roots,
uniform rows, pale tall grass) via EZ-Tree + recolor; species accuracy matters less than silhouette.

**License flags:** Synty POLYGON Tropical Jungle (paid) is the only complete matched kit — commercial-OK
but **keep raw assets out of the public AGPL repo** (ship-in-build only). Never use CC-BY-**NC**.

---

## 5. Sequence to a stable, upgraded state

1. **Finish r185 bump** — await test suite; if green, run `validate` + tod-coherence/scene-parity gates, merge, deploy. (Types stay `^0.184.1` until DT ships 0.185.)
2. **Regen the 108 war assets in Kiln** (owner, batched) — REJECTs + worst-material-count first; import via existing pipeline; re-measure combat120 against final art.
3. **Delete the 80 dead pixel-forge props** + `PixelForgePropCatalog` (after confirming no live spawn).
4. **Vegetation pass** — Quaternius/ambientCG/EZ-Tree into VegetationScatterer; adopt octahedral-impostor + InstancedMesh2 for tree LOD.
5. **Render levers (post-asset, on r185)** — BatchedMesh-LOD-BVH spike (vegetation first), ClusteredLighting for muzzle/tracer/explosion lights, CSM for A Shau terrain shadows, the new addon Inspector for debug.

The through-line: **Kiln consolidates materials at authoring time → BatchedMesh batches them at render time → `EXT_mesh_gpu_instancing` is the (currently missing) handshake.** Asset cohesion + instanceability come from the locked palette; the render win comes from the r185 batching APIs.
