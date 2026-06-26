<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Asset Wiring Status & Plan — 2026-06-25

Handoff snapshot for the new-asset migration on `task/veg-glb-hero-scatter`,
written after a long debugging session that ROOT-CAUSED and FIXED the r185
WebGPU "invisible terrain" regression (separate branch). Read this first.

## 0. PREREQUISITE — terrain fix is on a different branch

The CDLOD terrain renders **invisible under WebGPU** on this branch, because the
r185 instance-matrix regression fix is **NOT here**. It lives on
`task/fix-r185-webgpu-terrain` (commit `b642242f`, off master) → **PR #414**.

Before doing/verifying ANY asset work on this branch, get the terrain fix in:
- `git merge origin/master` (once #414 lands), **or**
- `git cherry-pick b642242f` (clean — the 3 terrain files are identical on master and this branch).

Without it, new vegetation/assets can't be visually verified (no visible ground).
Root cause + diagnostics: see memory `project_r185_webgpu_terrain_regression_2026-06-25.md`.

## 1. What's true today (verified)

- **Old assets still in scene; "migration" was never wired.**
  - Active billboard vegetation = `VEGETATION_TYPES = PIXEL_FORGE_VEGETATION_ASSETS.map(...)`
    (`src/config/vegetationTypes.ts:198`) — OLD pixel-forge 2D billboard atlases.
  - New vegetation **GLBs ARE imported** (committed this branch under
    `public/assets/vegetation/`: bamboo-grove, banana-plant, banyan ×4, fan-palm,
    jungle-tree +impostor atlas, rice-paddy, rubber-a/b, taro-elephant-ear,
    teak-a/b, understory-fern, + bark/leaf textures) and folded into
    `packages/vegetation-library`, but **not wired into the runtime**.
  - The library only reaches the runtime via the **jungle-tree hero scatterer**,
    which is **gated OFF** by default (`?vegHeroes=1` / `window.__vegHeroScatter`),
    see `TerrainVegetationRuntime.ts:43` `heroScatterEnabled()`. (Its gating comment
    blames a per-object WebGPU uniform overflow — that was a MISDIAGNOSIS; the real
    bug was the CDLOD instance matrix, now fixed. The hero path itself works.)
  - **War pack (guns/buildings/vehicles) was NOT imported** — `warAssetCatalog.ts`
    was not regenerated today. `97b8fb72` (`tools/kiln-asset-batch/`) is only a
    **regen recipe**; the GLBs live in local Kiln. Consumers (WeaponRigManager,
    AircraftConfigs, M2HB, modelPaths, staticImpostorArchetypes) already read
    `src/config/generated/warAssetCatalog.ts`, so importing + regenerating is all
    that's needed for them to pick up new art.

## 2. Decisions made this session (owner)

- **Vegetation ingestion path → MESH + OCTAHEDRAL IMPOSTOR.** Generalize the
  existing (gated) jungle-tree hero scatterer to the whole species palette via
  `StaticImpostorSystem` (real GLB mesh near, octahedral impostor far), then
  un-gate. NOT the bake-to-billboard-atlas route.
- **War pack → "find latest pack"** then import. Kiln install located at
  `C:\Users\Mattm\X\kiln\kiln-studio` (`KILN_STUDIO_STORE=file`). The generated
  pack GLBs need to be located in Kiln's file store / exported (a recursive GLB
  search under `C:\Users\Mattm\X\kiln` timed out — narrow it: look for the file
  store dir, e.g. `*/data`, `*/.kiln`, `*/store`, or per-asset `downloadUrl`
  exports; packs = weapons/structures/buildings/vehicles/wildlife-props).

## 3. Plan — vegetation cutover (mesh + impostor)

1. **Un-gate prerequisite check.** With the terrain fix in, boot `?vegHeroes=1`
   and confirm `StaticImpostorBatch_jungle-tree` renders correctly (mesh near,
   impostor far). The gating reason is obsolete.
2. **Generalize the scatterer.** `GLBHeroScatterer` + `TerrainVegetationRuntime`
   currently inject only the hero archetypes from
   `vegetationLibraryStaticArchetypes()` (`config/vegetation/vegetationLibraryAdapter.ts`).
   Extend the adapter to expose ALL ready library species as
   `StaticImpostorArchetype`s, and scatter them by biome density (the biome entries
   already exist in `src/config/biomes.ts` — `denseJungle`/`ashauJungle`/`riverbank`
   got a `jungle-tree` entry; add the rest).
3. **Retire / shrink the old billboard set.** Decide per-species: keep cheap
   ground cover (ferns/grass) as billboards, move heroes/midstory to mesh+impostor.
   Eventually trim `VEGETATION_TYPES` to only what stays as billboards.
4. **Impostor bake.** Each new species needs an octahedral impostor atlas (jungle-tree
   already has one under `.../jungle-tree/impostor/`). Use the existing bake path
   (`check:asset-gallery` / octahedral bake) per `STRATEGY_A_VEGETATION_IMPLEMENTATION_2026-06-25.md`.
5. **Un-gate** once the palette renders + perf is acceptable (combat120 steady-state p99).

Key files: `src/systems/terrain/GLBHeroScatterer.ts`,
`src/systems/terrain/TerrainVegetationRuntime.ts`,
`src/systems/world/staticImpostors/StaticImpostorSystem.ts`,
`src/config/vegetation/vegetationLibraryAdapter.ts`,
`packages/vegetation-library/`, `src/config/biomes.ts`,
`src/config/vegetationTypes.ts`.

## 4. Plan — war-pack import

1. Find the latest generated pack on disk (Kiln file store under
   `C:\Users\Mattm\X\kiln\kiln-studio`).
2. Export/copy the GLBs to the importer's expected input location.
3. Run `npm run assets:import-war-catalog` (normalizes axis +X→+Z / ground +X→-Z,
   grafts rotor/turret/wheel joints per the canonical joint taxonomy).
4. Regenerate `src/config/generated/warAssetCatalog.ts`; consumers auto-pick-up.
5. Verify in `/gallery` route + in-scene; run asset-acceptance gates.

Recipe + gotchas: `tools/kiln-asset-batch/README.md`,
`docs/rearch/ASSET_REGEN_AND_R185_SCAFFOLD_2026-06-25.md`.

## 5. Other in-flight bits on this branch

- `e67f23c6` ADS sight fix and `56218f41` rice-paddy color fix are committed and
  shippable.
- `tools/diag/` (untracked) holds the WebGPU CDP diagnostic harness from the
  terrain investigation — useful for future WebGPU render debugging; keep or commit
  as desired.
