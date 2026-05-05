# Asset Manifest

Last updated: 2026-05-03

## 3D Models (159 GLBs)

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
| Legacy props | 1 | Wooden barrel |
| Pixel Forge NPC bodies | 4 | US Army, ARVN, NVA, VC combined skinned GLBs |
| Pixel Forge props | 80 | Barrels, boxes, bottles, fences, fish, camp, fortification, and clutter GLBs |

All models: low-poly stylized (PS2-era fidelity), GLB (binary glTF 2.0), PBR materials (metalness/roughness).

## Integration Status

| Category | Status | Details |
|----------|--------|---------|
| Weapons | 7/9 integrated | M16A1, AK-47, Ithaca 37, M3, M1911, M60, M79 via WeaponRigManager. RPG-7 and M2 Browning not wired. |
| Helicopters | 3/3 integrated | UH-1 Huey, UH-1C Gunship, AH-1 Cobra via ModelLoader. Runtime aircraft GLBs now come from the Pixel Forge aircraft import and preserve embedded rotor pivot animation metadata. |
| Fixed-wing | 3/3 integrated | F-4 Phantom, AC-47 Spooky, A-1 Skyraider flyable at airfields via FixedWingModel. Runtime aircraft GLBs now come from the Pixel Forge aircraft import; propeller spin axes are inferred from embedded GLB animation tracks. |
| Ground vehicles | 5/5 static | Staged in motor pools. No driving/interaction. |
| Watercraft | Not wired | Blocked on water engine. |
| Animals | 6/6 integrated | All types via AnimalSystem. |
| Structures | Integrated | Procedural firebase/airfield generators, WorldFeatureSystem. |
| Pixel Forge NPCs | Integrated first pass | Close actors use combined skinned GLBs with M16A1/AK-47 attachments. Mid/far actors use Pixel Forge animated impostor atlases through instanced buckets. No old NPC sprite assets are allowed by the cutover validator. |
| Pixel Forge props | Cataloged | `PixelForgePropCatalog` exposes the 80 curated GLBs for placement profiles. These props are not substitutes for vegetation or NPC gaps. |

## Other Assets

| Category | Count | Location | Format |
|----------|------:|----------|--------|
| UI icons | 38 | `public/assets/ui/icons/` | PNG (pixel art, white-on-transparent) |
| Pixel Forge vegetation impostors | 7 approved species | `public/assets/pixel-forge/vegetation/` | PNG color atlas + PNG normal atlas + JSON metadata |
| Pixel Forge NPC animated impostors | 32 clip packages, 28 runtime-manifested clips | `public/assets/pixel-forge/npcs/` | PNG atlas + JSON metadata |
| Terrain/biome textures | 12 | `public/assets/` (lowercase names) | WebP |
| Audio | 21 | `public/assets/` + `public/assets/optimized/` | WAV, OGG, MP3 |
| First-person hands | 1 | `public/assets/first-person.png` | PNG |

Old root-level vegetation WebP files, old faction sprite WebP files, and old
source-soldier PNG files are no longer runtime or shipped assets. `npm run
check:pixel-forge-cutover` fails on old vegetation filenames, old NPC sprite
filenames, old `assets/source/soldiers` paths, blocked vegetation species IDs,
`dipterocarp`, and `rejected-do-not-import` paths in source or shipped output.

Approved runtime vegetation species are `bambooGrove`, `fern`, `bananaPlant`,
`fanPalm`, `elephantEar`, and `coconut`. The short Quaternius palm previously
named `giantPalm` / `palm-quaternius-2` is owner-retired and its public shipped
assets were removed on 2026-05-05; do not confuse it with the preserved taller
`fanPalm` or `coconut` palm-like trees. Blocked species remain excluded until
regenerated or approved: `rubberTree`, `ricePaddyPlants`, `elephantGrass`,
`areca`, `mangrove`, and `banyan`.

Pixel Forge vegetation is currently impostor-only. Runtime metadata now carries
review fixes for asymmetric palm packages: `coconut` is locked to a clean
column while avoiding its bad low-elevation atlas row. These guards are an
interim runtime answer, not final tree art. For polished close-range palms,
prefer regenerated assets with close mesh LODs or a hybrid instanced trunk plus
impostor canopy path.

Projekt Objekt-143 KB-OPTIK opened a static imposter optics audit on
2026-05-02: `npm run check:pixel-forge-optics` writes
`artifacts/perf/<timestamp>/pixel-forge-imposter-optics-audit/optics-audit.json`.
The first artifact,
`artifacts/perf/2026-05-02T20-54-56-960Z/pixel-forge-imposter-optics-audit/optics-audit.json`,
flags every runtime NPC animated impostor atlas: 96px tiles have median visible
actor height of 65px. The original runtime stretched the source bakes to a
4.425m plane; the 2026-05-03 first KB-OPTIK remediation now uses the approved
2.95m target plus generated upright per-tile crop maps. Regenerate the crop map
with `npm run assets:generate-npc-crops` after NPC atlas changes and verify it
with `npm run check:pixel-forge-npc-crops`. The refreshed matched proof at
`artifacts/perf/2026-05-03T16-13-34-596Z/projekt-143-optics-scale-proof/summary.json`
puts NPC close/imposter visible-height ratios inside the first-remediation
`+/-15%` band, but luma remains flagged. The same audit flags `bananaPlant` and
`giantPalm` vegetation as oversampled relative to runtime size. This is evidence
for KB-OPTIK/KB-CULL, not full asset approval or rejection.

Projekt Objekt-143 KB-TERRAIN opened a vegetation horizon audit on 2026-05-02:
`npm run check:vegetation-horizon` writes
`artifacts/perf/<timestamp>/vegetation-horizon-audit/horizon-audit.json`. The
first artifact,
`artifacts/perf/2026-05-02T21-29-15-593Z/vegetation-horizon-audit/horizon-audit.json`,
confirms current runtime vegetation has no outer canopy tier beyond the
registered `600m` max distance. Open Frontier and A Shau can render terrain
well beyond that range, so distant barren terrain is an asset representation
gap, not approval to extend the existing near/mid Pixel Forge imposters without
new perf and screenshot evidence.

The sky is now procedural runtime atmosphere (`AtmosphereSystem` +
`HosekWilkieSkyBackend`), not a static skybox texture.

Vehicle and airfield asset quality is not signed off. The 2026-04-24 recovery
pass fixed vehicle-session ownership, helicopter rotor spool-down, and
sky-dome cloud wiring. The 2026-04-26 Pixel Forge pass replaced NPC and
vegetation runtime art. On 2026-05-03, the six runtime aircraft GLBs were
replaced from the Pixel Forge aircraft source set through
`npm run assets:import-pixel-forge-aircraft`, which wraps source `+X`-forward
aircraft under a `TIJ_AxisNormalize_XForward_To_ZForward` root so the public
runtime assets keep TIJ's `+Z`-forward storage contract. Source provenance
sidecars are mirrored under
`docs/asset-provenance/pixel-forge-aircraft-2026-05-02/`. The import summary
is `artifacts/perf/2026-05-03T01-55-00-000Z/pixel-forge-aircraft-import/summary.json`,
and the local visual viewer evidence is
`artifacts/perf/2026-05-03T01-58-00-000Z/pixel-forge-aircraft-viewer/summary.json`.
`npm run probe:fixed-wing -- --boot-attempts=2` passed at
`artifacts/fixed-wing-runtime-probe/summary.json` on 2026-05-03, covering A-1,
F-4, and AC-47 takeoff/climb/approach/bailout/handoff. Large-mode renderer
evidence exists at
`artifacts/perf/2026-05-03T03-07-26-873Z` (Open Frontier short) and
`artifacts/perf/2026-05-03T03-11-40-162Z` (A Shau short): both have trusted
measurement paths and zero browser errors, but both are WARN captures and fail
strict `perf:compare` thresholds, so they are not optimization evidence. This
asset delivery was deployed at `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`:
manual CI run `25274278013` and Deploy run `25274649157` passed, live
`/asset-manifest.json` reported that SHA, representative Pages/R2/build/aircraft
GLB/WASM assets returned `200`, and the live Zone Control browser smoke passed.
This is still not aircraft-feel or performance-improvement sign-off.
Hitbox feel, aircraft/building draw cost, airfield staging surfaces, water
rendering, close-proximity NPC camera occlusion, and measured static-prop
culling/HLOD remain evidence-backed work.

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
- Pixel Forge aircraft source GLBs are `+X` forward. The TIJ runtime aircraft
  contract is public `+Z` forward, so imports must use
  `npm run assets:import-pixel-forge-aircraft` rather than direct file copy.
- Aircraft rotor/propeller pivots must remain named and animated in the GLB.
  Runtime animation infers spin axes from embedded quaternion tracks, and the
  draw-call optimizer must exclude animated prop/rotor descendants by ancestor
  pivot, not only by leaf mesh name.

See `docs/archive/ASSET_MANIFEST_FULL.md` for original generation specs.
