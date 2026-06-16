# Asset Manifest

## 3D Models (191 GLBs)

Shipped path: `public/models/**` (Vite static assets).

| Category | Count | Examples |
|----------|------:|---------|
| Weapons | 15 | M16A1, AK-47, M60, RPG-7, M79, Ithaca 37, M1911, M2 Browning, M3 Grease Gun, M14, SKS, Dragunov SVD, RPD, K-bar, claymore clicker |
| Aircraft | 14 | UH-1 Huey, UH-1C Gunship, AH-1 Cobra, F-4 Phantom, AC-47 Spooky, A-1 Skyraider, B-52, C-130, CH-47, OH-6, OV-10, A-37, HH-3E, MiG-17 |
| Ground vehicles | 9 | M151 Jeep, M113 APC, M35 Truck, M48 Patton, PT-76, T-54, Ontos, ZIL-157, M42 Duster |
| Watercraft | 5 | Sampan, PBR, Swift Boat (PCF), LCM-8, raiding raft |
| Structures | 34 | Sandbag wall/bunker, guard tower, helipad, TOC bunker, tunnel entrance, AA emplacements |
| Buildings | 18 | Shophouse, French villa, pagoda, church, farmhouse, warehouse, Buddhist temple, stilt house, schoolhouse, tea house |
| Animals | 11 | Tiger, water buffalo, wild boar, macaque, gibbon, king cobra, monitor, gecko, heron, python, flying-fox bat |
| Legacy props | 1 | Wooden barrel |
| Pixel Forge NPC bodies | 4 | US Army, ARVN, NVA, VC combined skinned GLBs |
| Pixel Forge props | 80 | Barrels, boxes, bottles, fences, fish, camp, fortification, and clutter GLBs |

All models: low-poly stylized (PS2-era fidelity), GLB (binary glTF 2.0), PBR materials (metalness/roughness).

The runtime model registry (`src/systems/assets/modelPaths.ts`) is now a stable
re-export of the GENERATED catalog `src/config/generated/warAssetCatalog.ts`,
emitted by `npm run assets:import-war-catalog`. The importer normalizes the
pixel-forge `_repaint-2026-06` package (axis-wrap per class, canonical rig-joint
grafts, budget triage) instead of the package's blind `copy-to-tij.ps1`. Per-asset
import records (provenance + the budget REROLL_REQUESTS list) live under
`docs/asset-provenance/repaint-2026-06/`; the import pipeline and the five
drop-in breaks it corrects are documented in
`docs/rearch/WAR_ASSET_REPAINT_AUDIT_2026-06-11.md`. The 2026-06 import shipped 99
normalized GLBs (9 budget rejects keep their prior GLB on disk: helipad,
sandbag-wall, sandbag-bunker, ammo-bunker, toc-bunker, concertina-wire,
barbed-wire-fence, rice-dike, and the net-new egret). New aircraft/ground/animal
slugs land cataloged but are wired into runtime by later cutover tasks of the
cycle. Note: `village-hut` / `village-hut-damaged` are classed `buildings` in the
source package but live under `structures/` in TIJ (catalog `StructureModels`).

## Integration Status

| Category | Status | Details |
|----------|--------|---------|
| Weapons | 7 viewmodel + M2HB emplacement | M16A1, AK-47, Ithaca 37, M3, M1911, M60, M79 via WeaponRigManager on 2026-06 repaint GLBs; magazine/muzzle nodes come from catalog metadata (`magazineNodes`/`muzzleNodes`), not substring search. M2 Browning is the emplacement gun (player + NPC adapters). New m14/sks/dragunov/rpd/kbar/claymore GLBs are cataloged, not yet loadout-wired (backlog). |
| Helicopters | 3/3 integrated | UH-1 Huey, UH-1C Gunship, AH-1 Cobra on 2026-06 repaint GLBs; rotor pivots are canonical `Joint_*` nodes grafted at import (rotor contract verified by `check:visual-integrity`). |
| Fixed-wing | 3/3 flyable + 5 dormant + B-52 sortie | F-4 Phantom, AC-47 Spooky, A-1 Skyraider flyable on repaint GLBs. B-52, C-130, OV-10, A-37, MiG-17 registered dormant (`getDormantFixedWingKeys()`); the B-52 flies the non-player `arclight` air-support sortie. |
| Ground vehicles | 2 drivable + 7 scenery | M151 jeep + M48 Patton drivable on repaint GLBs (turret rig re-seated via `attach()`); M35/M113/PT-76 scenery swapped to catalog paths; T-54, ZIL-157, M42 Duster, Ontos placed as parked scenery at faction bases (world-catalog pass). |
| Animals | 4 ambient + 7 cataloged | Tiger, water buffalo, wild boar, macaque wander/flee via `WildlifeSystem` (Open Frontier + A Shau only; combat120 harness stays animal-free). Remaining species catalog/gallery-only; egret is a size re-roll. |
| Watercraft | Dormant | Sampan + PBR retained but not spawned since the 2026-06-09 water scorch; rework deferred to a terrain/world-gen cycle. |
| Structures + buildings | Integrated | Procedural firebase/airfield/settlement generators via WorldFeatureSystem on the repaint catalog; placement profiles derive from measured catalog dims (displayScale fudges removed). 6 net-new buildings (Buddhist temple, stilt house, schoolhouse, tea house, plantation mansion, rice mill) in settlement pools. 8 budget REJECTs keep their prior GLBs (see REROLL_REQUESTS). |
| Pixel Forge NPCs | Integrated first pass | Close actors use combined skinned GLBs with M16A1/AK-47 attachments. Mid/far actors use Pixel Forge animated impostor atlases through instanced buckets. No old NPC sprite assets are allowed by the cutover validator. |
| Pixel Forge props | Cataloged | `PixelForgePropCatalog` exposes the 80 curated GLBs for placement profiles. These props are not substitutes for vegetation or NPC gaps. |

The `/gallery` dev route (Vite dev/perf builds only) renders every catalog
entry on a neutral rig with dims/tris overlays — it is the owner's re-roll
review surface for the 2026-06 repaint.

## Other Assets

| Category | Count | Location | Format |
|----------|------:|----------|--------|
| UI icons | 38 | `public/assets/ui/icons/` | PNG (pixel art, white-on-transparent) |
| Pixel Forge vegetation impostors | 6 approved species | `public/assets/pixel-forge/vegetation/` | PNG color atlas + PNG normal atlas + JSON metadata |
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

The 2026-06-13 jungle vegetation pass briefly routed near-field ground cover
through `JungleGroundRing`, but owner follow-up rejected the dense
camera-following vegetation circle. Normal runtime now routes accepted ground
cover back through `VegetationScatterer` with the rest of the approved
vegetation set; `JungleGroundRing` is dormant experiment/reference code, not
the current player-facing vegetation owner. `fanPalm` and `coconut` are the
first accepted canopy/tree tier families for runtime placement, backed by
their existing Pixel Forge impostor assets. This does not approve any blocked
vegetation species or promote generic Pixel Forge prop trees into runtime
vegetation.

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
