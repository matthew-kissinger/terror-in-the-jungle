# Asset Manifest

Last updated: 2026-03-30

## Generated Assets (75 GLBs)

Shipped path: `public/models/**` (Vite static assets). Catalog in `deploy-3d-assets/README.md`.

| Category | Count | Examples |
|----------|------:|---------|
| Weapons | 9 | M16A1, AK-47, M60, RPG-7, M79, Ithaca 37, M1911, M2 Browning, M3 Grease Gun |
| Aircraft | 6 | UH-1 Huey, UH-1C Gunship, AH-1 Cobra, F-4 Phantom, AC-47 Spooky, A-1 Skyraider |
| Ground vehicles | 5 | M151 Jeep, M113 APC, M35 Truck, M48 Patton, PT-76 |
| Watercraft | 2 | Sampan, PBR |
| Structures | 32 | Sandbag wall/bunker, guard tower, helipad, TOC bunker, tunnel entrance |
| Buildings | 12 | Shophouse, French villa, pagoda, church, farmhouse |
| Animals | 6 | Water buffalo, tiger, macaque, king cobra, egret, wild boar |
| Props | 1 | Wooden barrel |

## Integration Status

| Category | Status | Details |
|----------|--------|---------|
| Weapons | 7/9 integrated | M16A1, AK-47, Ithaca 37, M3, M1911, M60, M79 via WeaponRigManager |
| Helicopters | 3/3 integrated | UH-1 Huey, UH-1C Gunship, AH-1 Cobra via ModelLoader |
| Animals | 6/6 integrated | All types via AnimalSystem |
| Structures | Integrated | Procedural firebase/airfield generators, WorldFeatureSystem |
| Fixed-wing | Static only | Staged at airfields in Open Frontier / A Shau, no live vehicle runtime |
| Ground vehicles | Static only | Staged in motor pools, no driving/interaction |
| Watercraft | Not wired | Blocked on water engine |
| NPCs | 2D sprites | Billboard sprite system (18 InstancedMesh), no 3D NPC models |

## Other Assets

- **UI Icons:** 38 pixel-art PNGs in `public/assets/ui/icons/`. See [UI_ICON_MANIFEST.md](UI_ICON_MANIFEST.md).
- **Vegetation:** 14 billboard WebP textures in `public/assets/`
- **Faction sprites:** 4 factions (US, ARVN, NVA, VC) x 10 sprites each in `public/assets/`
- **Terrain textures:** 12 biome textures in `public/assets/`
- **Audio:** 21 sound files in `public/assets/audio/`
- **Skybox:** `public/assets/skybox.png`

## Art Direction

- Vietnam War era (1955-1975), historically accurate equipment
- Low-poly stylized aesthetic (PS2-era fidelity, not photorealism)
- Military color palette: olive drab, jungle green, khaki, rust red, dark earth
- All 3D models as GLB (binary glTF 2.0), PBR materials (metalness/roughness)
- Strict triangle budgets for mobile/laptop performance

Full generation specs archived in `docs/archive/ASSET_MANIFEST_FULL.md`.
