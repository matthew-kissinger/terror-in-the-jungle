# Vegetation Asset Audit & Source Research

## Context

Research report auditing current vegetation assets in Terror in the Jungle, documenting the current rendering approach, and identifying free/low-cost sources for potential asset upgrades — particularly low-poly 3D models that could be used with octahedral imposters and multi-tier LOD.

---

## Current Asset Inventory

### Vegetation Textures (13 WebP billboards in `public/assets/`)

| Type | Category | Quad Size | Fade/Max Distance | Density | Placement |
|------|----------|-----------|-------------------|---------|-----------|
| Fern | Ground | 4m | 200/250m | 6.0 | Random |
| Elephant Ear | Ground | 5m | 250/300m | 0.8 | Random |
| Elephant Grass | Ground | 3m | 200/250m | 1.0 | Random |
| Rice Paddy Plants | Ground | 2m | 150/200m | 4.0 | Random |
| Fan Palm | Mid | 16m | 360/430m | 0.5 | Poisson 12m |
| Coconut Palm | Mid | 25m | 450/520m | 0.3 | Poisson 12m |
| Areca Palm | Mid | 18m | 360/430m | 0.4 | Poisson 8m |
| Bamboo Grove | Mid | 18m | 350/400m | 0.5 | Poisson 8m |
| Banana Plant | Mid | 8m | 250/300m | 0.4 | Random |
| Mangrove | Mid | 12m | 300/350m | 0.3 | Poisson 10m |
| Dipterocarp Giant | Canopy | 30m | 500/600m | 0.15 | Poisson 16m |
| Twister Banyan | Canopy | 27m | 500/600m | 0.15 | Poisson 16m |
| Rubber Tree | Canopy | 22m | 450/550m | 0.12 | Poisson 16m |

### Current Rendering Approach
- **Geometry**: Single `PlaneGeometry` (2 triangles) per instance — cylindrical billboard rotation in vertex shader
- **No cross-billboards**: Even ground cover uses single planes, not intersecting pairs
- **GPU instancing**: `InstancedBufferGeometry` with position/scale/rotation attributes
- **LOD**: Shader-only — distance-based opacity fade + wind reduction. No geometry swaps at any distance.
- **Cell system**: 128m cells, 6-cell radius (~770m), budgeted async add/remove

### Key Code Files
- `src/config/vegetationTypes.ts` — type registry (all 13 types)
- `src/systems/terrain/ChunkVegetationGenerator.ts` — 3-pass placement
- `src/systems/world/billboard/GPUBillboardSystem.ts` — GPU instanced rendering
- `src/systems/world/billboard/BillboardShaders.ts` — vertex/fragment shaders
- `src/systems/world/billboard/BillboardBufferManager.ts` — buffer slot management

### Other Assets in Project
- **Terrain**: 12 ground textures (WebP) + splatmap shader
- **Soldiers**: 40 directional sprites (4 factions × 10 poses)
- **UI**: 38 pixel-art PNGs in `public/assets/ui/icons/`
- **Audio**: 20 WAV/OGG files
- **Environment**: skybox.png, waternormals.jpg

---

## Potential LOD Tiers (for reference)

If upgrading, the natural progression would be:

| Distance | Method | Best For |
|----------|--------|----------|
| 0–50m | Low-poly 3D mesh (glTF) | Large trees/palms visible up close |
| 50–150m | Octahedral imposter (8×8 or 12×12 atlas) | Mid-range canopy & palms |
| 150m+ | Billboard (current system) | Everything at distance |
| Ground cover | Cross-billboard (2 intersecting planes) | Fern, grass, small plants |

Biggest visual upgrade candidates by size: Dipterocarp (30m), Banyan (27m), Coconut (25m), Rubber (22m).

---

## Free Asset Sources

### Primary Repositories

| Source | License | Content | URL |
|--------|---------|---------|-----|
| **OpenGameArt.org** | CC0 | 3D plants collection, zero attribution | https://opengameart.org/content/cc0-3d-plants |
| **Sketchfab** | CC-BY | "Low Poly Jungle Plant Package" — rocks, large trees, foliage variations | https://sketchfab.com/tags/jungle-tree |
| **itch.io** | Various | "Tropical Plants 3D Low Poly Pack" — 20 tropical objects | https://itch.io/game-assets/free/tag-low-poly/tag-vegetation |
| **Kenney.nl** | CC0 | Nature Kit — low-poly trees, plants, rocks | https://kenney.nl/ |
| **Poly Haven** | CC0 | PBR materials, some 3D models | https://polyhaven.com/ |
| **CG Channel collection** | CC-BY | 50+ free jungle plant 3D models | https://www.cgchannel.com/2020/08/download-over-50-free-3d-models-of-jungle-plants/ |
| **Free3D** | Various | Searchable low-poly plant/palm models | https://free3d.com/3d-models/palm |
| **TurboSquid** | Various | Free palm tree section | https://www.turbosquid.com/3d-model/free/palm-tree |

### Texture Sources (for custom assets or imposter baking)

| Source | License | Content | URL |
|--------|---------|---------|-----|
| **3D Textures** | Free | Seamless foliage PBR textures (diffuse, normal, AO) | https://3dtextures.me/tag/foliage/ |
| **Raw Catalog** | Free | Leaf/foliage texture atlases, high-res | https://www.rawcatalog.com/library/atlases/?category=276&sort=free |
| **Poly Haven** | CC0 | PBR bark and leaf materials | https://polyhaven.com/ |
| **Polycount Wiki** | Reference | Best practices for game foliage texture atlases | http://wiki.polycount.com/wiki/Foliage |

### GitHub Asset Collections

| Repo | Description | URL |
|------|-------------|-----|
| **teamgravitydev/gamedev-free-resources** | Curated free game assets (3D, textures) | https://github.com/teamgravitydev/gamedev-free-resources |
| **ahnerd/creative-commons-game-assets-collection** | CC-licensed game asset directory | https://github.com/ahnerd/creative-commons-game-assets-collection |
| **nexusmedialab/open-source-3d-assets** | CC0 3D asset registry, 991+ GLB models | https://github.com/nexusmedialab/open-source-3d-assets |
| **KhronosGroup/glTF-Sample-Models** | Reference glTF models | https://github.com/KhronosGroup/glTF-Sample-Models |

---

## Octahedral Imposter Resources

| Resource | Type | URL |
|----------|------|-----|
| **agargaro/octahedral-impostor** | Three.js implementation (active WIP) | https://github.com/agargaro/octahedral-impostor |
| **Three.js forum showcase** | Working demo, 200k+ trees | https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735 |
| **Medium article** | Technical explanation of the technique | Search: "The only imposter who come in handy: Octahedral Imposters" |

---

## Procedural Tree Generators

If pre-made assets don't match the art style, these tools can generate custom low-poly trees:

| Tool | Description | URL |
|------|-------------|-----|
| **procedural-plants-threejs** | Three.js procedural plant geometry | https://github.com/sneha-belkhale/procedural-plants-threejs |
| **AJM Tree Generator** | Web-based procedural tree generator | https://andrewmarsh.com/software/tree3d-web/ |
| **Codrops grass tutorial** | Three.js grass rendering with LOD | https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/ |
| **douges.dev tree tutorial** | Three.js fluffy tree rendering | https://douges.dev/blog/threejs-trees-1 |

---

## Summary

- **13 vegetation types**, all single-plane billboards today
- **No 3D meshes or imposters** currently — all vegetation is flat quads with GPU instancing
- **Strongest free sources**: OpenGameArt (CC0, easiest licensing), Sketchfab (largest jungle selection, CC-BY), itch.io (curated packs)
- **Octahedral imposters in three.js** are actively being developed (agargaro repo) with a proven 200k-tree demo
- **Procedural generators** available if pre-made assets don't fit the aesthetic
- **Ground cover** could cheaply move to cross-billboards (2 intersecting planes) for better visual quality at negligible GPU cost
