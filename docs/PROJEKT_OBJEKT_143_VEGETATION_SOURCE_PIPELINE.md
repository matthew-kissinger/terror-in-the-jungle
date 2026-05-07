# Projekt Objekt-143 Vegetation Source Pipeline Review

Last updated: 2026-05-06

Status: decision packet and source-pipeline guidance only. This file now sits
under KB-FORGE, the Projekt bureau that treats the sibling Pixel Forge repo as
our local asset pipeline rather than an external vendor. No source generator,
asset-library item, generated GLB, or exported texture is accepted for runtime
by this note.

## Current Constraint

The current runtime vegetation set is Pixel Forge imposter-only. The short
Quaternius palm previously named `giantPalm` / `palm-quaternius-2` is retired,
while `fanPalm` and `coconut` remain the taller palm-like runtime species.
Projekt now needs more Vietnam-relevant variety in four different layers:

- canopy and far-horizon silhouettes;
- understory and mid-level plants;
- grass and low ground cover;
- trail-edge cover and worn route-surface detail.

All new source assets must pass `docs/ASSET_ACCEPTANCE_STANDARD.md` before
runtime import: license/provenance, browser-budget GLB geometry and textures,
Pixel Forge-compatible bake, screenshot review, and Open Frontier/A Shau perf
or horizon evidence when the asset can affect large modes. Runtime procedural
generation is out of scope for Cycle 3; use source tools offline, then bake.

Mechanical local audit:

```bash
npm run check:projekt-143-pixel-forge
```

This reads `C:\Users\Mattm\X\games-3d\pixel-forge`, catalogs the existing TIJ
pipeline commands, review gallery, output manifest, NPC package surface, and
vegetation package state, then compares Pixel Forge output against TIJ runtime,
blocked, and retired vegetation species. It also emits a relevance catalog for
Pixel Forge prop families, vegetation packages, and review queues covering
ground-cover budget replacement, route/trail surfaces, base/foundation kits,
far-canopy/tree variety, and NPC/weapon packaging.

## Local Pixel Forge Bureau Findings

The sibling repo already has enough TIJ-specific structure to act as a bureau
for this work:

- `bun run tij:pipeline` remains the production pipeline entrypoint, while
  `bun run tij:pipeline:kb-load-vegetation-256` is the narrow review-only
  candidate branch for `bambooGrove`, `bananaPlant`, `coconut`, and `fanPalm`.
- Production review output is rooted at
  `packages/server/output/tij/gallery-manifest.json`; the KB-LOAD candidate
  branch writes separately to
  `packages/server/output/tij-candidates/kb-load-vegetation-256/` so candidate
  bakes do not silently replace accepted gallery output.
- The validator has atlas-profile rules for `ground-compact`, `mid-balanced`,
  `canopy-balanced`, and `canopy-hero`. Profiles above ground cover require
  normal atlases with `normalSpace=capture-view`, which matches the current
  normal-lit vegetation direction.
- The current local TIJ gallery manifest reports `13` vegetation entries and
  `80` prop entries. The prop side includes survival-kit-style ground and trail
  candidates such as `grass`, `grass-large`, `patch-grass`, `patch-grass-large`,
  flat rocks, logs, fences, and structure parts. Treat those as review-source
  material for trail/ground-cover experiments, not as accepted runtime
  vegetation.
- There is no dedicated `EZ-Tree` adapter yet. A sensible pilot is a small
  source-adapter script that records tool version, seed/preset, license URL,
  source GLB path, dimensions, triangle/material counts, and intended habitat
  zone before handing the GLB to the existing bake/manifest path.

The practical gap is provenance and candidate cataloging, not rendering
infrastructure. The bureau should accept source GLBs, classify their intended
use (`channel`, `bank`, `wetland-shoulder`, `trail-edge`, `upland`,
`far-canopy`), then bake and validate with the existing Pixel Forge output
contract.

## Source Tool Read

| Source | Fit | Use | Blockers |
| --- | --- | --- | --- |
| Dan Greenheck `EZ-Tree` | Best first procedural candidate for tree GLB source generation. It is Three.js/JavaScript based, MIT licensed, has deterministic options, and the app exports `.PNG` and `.GLB`. | Offline pilot for 2-3 tree families, then Pixel Forge bake to imposters/LODs. | Need Vietnam-specific presets, art-direction review, triangle/texture budget, and bake proof. Not enough for grass or trail detail by itself. |
| QuickMesh Tree Generator | Useful fallback for simple low-poly silhouettes. It exports GLTF/GLB/OBJ and states generated models are free for commercial and personal use, but the source is not open. | Low-risk outer-canopy silhouette experiments or throwaway comparisons. | Closed-source generator; visual style may be too generic/stylized for TIJ. License still needs local provenance capture. |
| botaniq | Strong candidate for fast art variety if commercial license/export terms are acceptable. It is a Blender tree/grass/plant asset library with tropical vegetation, grass, weeds, ferns, ivy, and scatter presets. | Ground cover, trail-edge plants, tropical understory references, and possible source GLBs. | Commercial asset-license review, texture budget, export workflow, LOD/imposter bake compatibility. Not a procedural source we control. |
| Shizen | Tropical overlap with bamboo, banana, coconut palms, and other palms. | Reference or paid-source candidate for tropical tree/plant shapes. | Older Blender addon target, commercial purchase/license review, unknown export and texture budget. |
| Blender Sapling / Tree-Gen | Free/open experimentation path for parameterized shapes. | Fallback for internal prototypes or silhouettes if EZ-Tree is insufficient. | Art quality, material setup, and license details must be checked before game-distributed assets. |

Current external-source check on 2026-05-06:

- `EZ-Tree` remains the best controlled tree-source pilot. The official
  repository describes a JavaScript/Three.js procedural tree generator with
  tunable parameters, deterministic seed control, standalone library use, and a
  browser app that can export `.PNG` and `.GLB`. The repository lists an MIT
  license and latest release `v1.1.0` on 2026-01-15. Treat that as source-tool
  provenance, not runtime approval.
- The Vietnam ecology reference added to the hydrology track supports a more
  structured placement model: bamboo communities are associated with stream
  corridors, water bodies, increased moisture, and dendritic stream structure.
  For TIJ, new bamboo, palm, grass, and ground-cover candidates should be
  reviewed against hydrology corridors and disturbed trail edges rather than
  added as another evenly scattered species.

## Recommendation

Use Pixel Forge first. Use `EZ-Tree` only as an optional offline source
generator feeding Pixel Forge, not as a replacement pipeline. It overlaps best
with this repo because the generator is already Three.js-oriented and can emit
GLB source files, but the runtime should continue consuming baked Pixel
Forge-style imposters and explicit runtime registries. Do not add
`@dgreenheck/ez-tree` to the shipped game bundle for Cycle 3.

For grass, ground cover, and trail-edge assets, `EZ-Tree` is the wrong primary
tool. Pair the `EZ-Tree` tree pilot with either a licensed vegetation asset
library review (`botaniq` or Shizen) or a custom low-card ground-cover bake.
The first runtime branch should be narrow enough to prove the whole path:

1. Generate or source one tall canopy/emergent tree family.
2. Generate or source one wet-bank understory/edge plant family.
3. Generate or source one grass/ground-cover clump set for trail and disturbed
   low vegetation.
4. Bake each through Pixel Forge into `review-only` output with `lod0.glb`,
   `imposter.png`, optional `imposter.normal.png`, and `imposter.json`.
5. Review side-by-side in a gallery before any `public/assets` or runtime
   registry import.
6. Accept placement only after a deterministic cluster audit shows where each
   candidate is allowed: channel, bank, wetland shoulder, trail edge, upland,
   or far-canopy pocket.

## Acceptance Checklist

- License/provenance recorded for each generated/source asset, including tool,
  version, seed/preset/config, author/vendor, and usage terms.
- Source GLB is browser-budgeted before bake: dimensions, triangle count,
  material count, texture dimensions, and axis/origin sanity recorded.
- Pixel Forge bake emits imposter metadata compatible with the existing runtime
  registry shape: tier, world size, y offset, tiles, atlas profile, and shader
  profile.
- Runtime candidate adds no blocked or retired species back into
  `PIXEL_FORGE_VEGETATION_ASSETS`.
- `npm run check:projekt-143-terrain-assets` records the candidate as review
  evidence before import.
- Open Frontier and A Shau ground/elevated screenshots show the new assets
  improving canopy, understory, ground cover, or trail-edge readability.
- Texture residency and upload evidence exists before accepting any new large
  atlas or normal map.
- Outer canopy work keeps the Cycle 3 budget: no more than `+1.5ms` p95 and no
  more than `+10%` draw-call growth unless the owner explicitly accepts an
  exception.
- Placement acceptance includes a distribution audit: no candidate can be
  approved solely by looking good in isolation if it makes A Shau or Open
  Frontier read as uniform scatter.

## Source Links

- `EZ-Tree` official repository:
  https://github.com/dgreenheck/ez-tree
- `EZ-Tree` browser app:
  https://www.eztree.dev/
- Vietnam bamboo/moisture landscape pattern reference:
  https://www.mdpi.com/2073-445X/14/10/2003

## Non-Claims

- This is not approval to import botaniq, Shizen, QuickMesh, Tree-Gen, Sapling,
  or `EZ-Tree` output into runtime.
- This is not approval to bypass Pixel Forge review-only, manifest, validator,
  or gallery gates.
- This is not a WebGPU trigger.
- This does not close KB-TERRAIN; it only makes the missing vegetation source
  decision more concrete.
- This does not change the KB-OPTIK decision still waiting on the near-stress
  NPC imposter human review.
