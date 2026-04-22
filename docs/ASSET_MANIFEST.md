# Asset Manifest

Last updated: 2026-04-21

## 3D Models (75 GLBs)

Shipped path: `public/models/**` (Vite static assets).

| Category | Count | Examples |
|----------|------:|---------|
| Weapons | 9 | M16A1, AK-47, M60, RPG-7, M79, Ithaca 37, M1911, M2 Browning, M3 Grease Gun |
| Aircraft | 6 | UH-1 Huey (w/ M60 door guns), UH-1C Gunship, AH-1 Cobra, F-4 Phantom, AC-47 Spooky, A-1 Skyraider |
| Ground vehicles | 5 | M151 Jeep, M113 APC, M35 Truck, M48 Patton, PT-76 |
| Watercraft | 2 | Sampan, PBR |
| Structures | 34 | Sandbag wall/bunker, guard tower, helipad, TOC bunker, tunnel entrance, AA emplacements |
| Buildings | 12 | Shophouse, French villa, pagoda, church, farmhouse, warehouse |
| Animals | 6 | Water buffalo, tiger, macaque, king cobra, egret, wild boar |
| Props | 1 | Wooden barrel |

All models: low-poly stylized (PS2-era fidelity), GLB (binary glTF 2.0), PBR materials (metalness/roughness).

## Integration Status

| Category | Status | Details |
|----------|--------|---------|
| Weapons | 7/9 integrated | M16A1, AK-47, Ithaca 37, M3, M1911, M60, M79 via WeaponRigManager. RPG-7 and M2 Browning not wired. |
| Helicopters | 3/3 integrated | UH-1 Huey, UH-1C Gunship, AH-1 Cobra via ModelLoader. Rotor pivots rigged (Joint_MainRotor/Joint_TailRotor). Tail rotor has baked `rotation.y = PI/2` for sideways spin. |
| Fixed-wing | 3/3 integrated | F-4 Phantom, AC-47 Spooky, A-1 Skyraider flyable at airfields via FixedWingModel. Aerodynamic physics, propeller animation, per-aircraft HUD. |
| Ground vehicles | 5/5 static | Staged in motor pools. No driving/interaction. |
| Watercraft | Not wired | Blocked on water engine. |
| Animals | 6/6 integrated | All types via AnimalSystem. |
| Structures | Integrated | Procedural firebase/airfield generators, WorldFeatureSystem. |
| NPCs | 2D sprites | Billboard sprite system (InstancedMesh), no 3D NPC models. |

## Other Assets

| Category | Count | Location | Format |
|----------|------:|----------|--------|
| UI icons | 38 | `public/assets/ui/icons/` | PNG (pixel art, white-on-transparent) |
| Vegetation billboards | 13 | `public/assets/` (PascalCase names) | WebP |
| Terrain/biome textures | 12 | `public/assets/` (lowercase names) | WebP |
| Faction sprites | 40 | `public/assets/` (4 factions x 10 poses) | WebP |
| Audio | 21 | `public/assets/` + `public/assets/optimized/` | WAV, OGG, MP3 |
| First-person hands | 1 | `public/assets/first-person.png` | PNG |

The sky is now procedural runtime atmosphere (`AtmosphereSystem` +
`HosekWilkieSkyBackend`), not a static skybox texture.

## Art Direction

- Vietnam War era (1955-1975), historically accurate equipment
- Low-poly stylized aesthetic (PS2-era fidelity, not photorealism)
- Military color palette: olive drab, jungle green, khaki, rust red, dark earth
- Strict triangle budgets for mobile/laptop performance

## Asset Pipeline

Models generated via PixelForge Kiln (procedural geometry -> Three.js GLTFExporter -> GLB). Naming conventions:
- Pivot nodes: `Joint_*` (e.g., `Joint_MainRotor`, `Joint_TailRotor`)
- Mesh nodes: `Mesh_*` (e.g., `Mesh_Fuselage`, `Mesh_Wing_L`)
- Rotor meshes must NOT contain `mainrotor`/`tailrotor` in their names (use MR*/TR* prefixes) to avoid double-animation by HelicopterGeometry.ts detection.

See `docs/archive/ASSET_MANIFEST_FULL.md` for original generation specs.
