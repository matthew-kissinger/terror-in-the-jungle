# War-Asset Repaint Audit — 2026-06-11

Ground-truth audit of the pixel-forge repaint package
(`C:\Users\Mattm\X\games-3d\pixel-forge\war-assets\_repaint-2026-06\`, 108 GLBs:
69 replacements + 39 net-new, manifest + HANDOFF.md in-package) against the
TIJ engine, measured by parsing every GLB JSON chunk on both sides (world-space
bbox from node-transformed accessor min/max, tri counts, node names,
animations). Seeds `cycle-2026-06-11-war-asset-repaint`.

**Headline: the handoff's "replacements are drop-in" claim is false for TIJ.**
The package is good (silhouettes, material counts, real-world scale all improve)
but it must come in through our own import pipeline per
[ASSET_ACCEPTANCE_STANDARD.md](../ASSET_ACCEPTANCE_STANDARD.md) ("GLB
replacement is not a file-copy task"). Do NOT run the package's
`copy-to-tij.ps1` — it is a blind overwrite that bypasses every gate below.

## Five core-assumption breaks (measured)

1. **Forward axis.** Repaint is `+X`-forward (per its own conventions section;
   confirmed by bbox long-axis on all weapons/vehicles). TIJ on-disk inventory
   is `+Z`-forward for weapons (rotated `Math.PI/2` at load,
   `WeaponRigManager.ts:182`) and aircraft (rotated `-Math.PI/2`,
   `HelicopterGeometry.ts:53`), and `-Z`-forward for ground vehicles (no
   rotation, `VehicleGlbVisuals.ts:19-22`). Every weapon/vehicle/aircraft
   replacement is yawed 90° if copied blind. Example: current m48 is Z-long
   (4.28×2.8×8.94), repaint m48 is X-long (9.44×3.34×3.74).
2. **Rig joints deleted.** Current `m48-patton.glb` has `Joint_Turret`,
   `Joint_MainGun`, cupola/hatch joints (re-seated on the TankTurret rig
   2026-06-10). Repaint m48 has NONE — turret parts exist only as named meshes
   (`Mesh_Turret`, `Mesh_Mantlet`, `Mesh_Barrel`, `Mesh_BoreEvacuator`,
   `Mesh_MuzzleBrake*`). Current m151 has `Joint_GunMount`/`Joint_GunBarrel`/
   `Joint_Wheel*`; repaint has none. Blind swap breaks tank turret articulation.
3. **Animations deleted.** Every current aircraft GLB carries 1-3 rotor/prop
   animation clips; `HelicopterGeometry` infers spin axes from animation
   quaternion tracks and `loadAnimatedModel` preserves them. The repaint is
   100% static (0 animations). Rotor/prop wiring must move to named-pivot +
   procedural spin.
4. **Node-name contracts drifted, inconsistently per asset.** Current rotor
   vocab `Joint_mainRotor`/`Joint_tailRotor` → repaint has `Joint_MainRotor`/
   `Joint_TailRotor` (uh1), `Joint_Rotor` + joint-less `Mesh_TRHub/TRBlades`
   (uh1c), mesh-only `Mesh_RotorMast/Mesh_MainRotorBlades` (ah1), per-blade
   `Joint_Blade0..3` (a1), `Mesh_PropHubR/L` (ac47). Weapon magazine: the
   `'magazine'` substring search in `WeaponRigManager` matches nothing in the
   repaint m16 (`Mesh_MagSeg1/2/3`, `Mesh_MagFloor`; a looser `'mag'` would
   wrongly capture `Mesh_Magwell`). Muzzle names changed per weapon
   (`Mesh_FlashHiderBore`, `Mesh_GunMuzzle*`, `Mesh_MuzzleBrake*`).
5. **Budget blowouts.** Acceptance standard: structures ≤2,500 tris/placement.
   Measured current→repaint: sandbag-wall 420→48,472; helipad 252→41,704 (also
   14m flat pad → 26m footprint 4.4m TALL — breaks landing + layouts);
   ammo-bunker 192→35,456; toc-bunker 272→15,132 (+minY −2.2m: bounds-snap
   would beach it as a 6.6m monolith); concertina-wire 384→14,948 (464KB);
   barbed-wire-fence 1,284→8,520 (375KB); sandbag-bunker 100→8,524; rice-dike
   168→8,812 (739KB!); egret 512KB. These include the mass-placed fence-line
   assets — worst possible place for 20-100x inflation.

Also measured: aircraft dims grew toward real scale (huey 10.3→13.9m long,
f4 14.2→18.8m) — camera/collision/gear/seat configs were tuned to the old
undersized models; m2-browning roughly doubled (1.19→2.0m) — emplacement and
mount offsets shift; net-new `a37-dragonfly` (5.5m vs real 8.6m) and
`hh3e-jolly-green-giant` (9.4m vs real ~17.6m fuselage) are under-scale —
re-roll advisories; `artillery-pit` POSITION accessors lack min/max (importer
must decode buffers, not trust accessor bounds).

## Per-class on-disk convention (the importer enforces; record in standard)

| Class | Source frame | On-disk target | Loader behavior today |
|---|---|---|---|
| weapons | +X fwd | **+Z fwd** | `WeaponRigManager.ts:182` rotates +Z→rig axis (keep) |
| aircraft | +X fwd | **+Z fwd** | `HelicopterGeometry.ts:53` `-Math.PI/2` (keep); matches existing `TIJ_AxisNormalize_XForward_To_ZForward` importer wrap (`scripts/import-pixel-forge-aircraft.ts:109-110`) |
| ground vehicles | +X fwd | **-Z fwd** | `VehicleGlbVisuals.ts` no rotation (keep) |
| buildings/structures/props/animals | +X "front" | **+Z front** | layout yaw applied at placement; orientation-sensitive assets (command-tent, aid-station — measured ridge axes DISAGREE with the package's own hand-fix notes) verified in gallery |

Decision: do NOT re-litigate engine frames at load time. The importer owns all
rotation (proven aircraft-importer pattern, generalized); loaders keep their
documented per-class assumption; the generated catalog records `forward` per
asset so the convention is data, not tribal knowledge.

## Engine-side debt this cycle fixes (the "prior integration was non-optimal" list)

- `HelicopterGeometry` and `FixedWingModel` each construct private
  `ModelLoader` instances instead of the shared singleton (cache fragmentation).
- `ModelPlacementProfiles.ts` carries ~100 lines of hand-tuned per-asset
  overrides (e.g. `displayScale 0.5` on fuel-drum/supply-crate/ammo-crate/
  wooden-barrel) calibrated to OLD asset dims; repaint is real-scale. Replace
  fudges with measured-dims-driven normalization from the generated catalog.
- Magazine/muzzle/rotor discovery is fuzzy substring search; move to canonical
  joints grafted at import + explicit per-asset node metadata in the catalog.
- `modelPaths.ts` is hand-typed; regenerate from the import manifest (single
  writer; becomes a re-export of `src/config/generated/warAssetCatalog.ts`).
- No standing GLB validation gate (the aircraft importer exists but is
  class-limited and was bypassed entirely by this handoff's copy script).
- `PixelForgePropCatalog.ts` (80 entries) is dead code — known, out of scope,
  do not touch this cycle.

## Budget triage policy (importer computes; expected outcome listed)

- **REJECT** (keep current GLB; entry in `REROLL_REQUESTS.md`): tris >20k, or
  KB >300, or mass-placed (sandbag-wall, sandbag-bunker, barbed-wire-fence,
  concertina-wire) >6k tris, or placement-contract break (helipad footprint/
  height, toc-bunker −2.2m burial). Expected: **8 replacement rejects**
  (sandbag-wall, helipad, ammo-bunker, toc-bunker, concertina-wire,
  barbed-wire-fence, rice-dike, sandbag-bunker) + net-new withheld: egret
  (512KB); scale advisories a37-dragonfly, hh3e-jolly-green-giant (cataloged
  dormant, flagged). 61/69 replacements ship; re-rolls re-enter via the same
  importer later (idempotent).
- **EXCEPTION** (ship with acceptance note + scene-attribution/perf evidence
  per the standard): structures/buildings over 2,500 but under the reject bar
  (french-villa 12.4k, buddhist-temple 14.6k, mansion 13.4k, pagoda,
  market-stall, warehouse, tea-house, mortar/artillery pits, towers, t54 8k…)
  and the five weapons over 1,500 (m16a1 1,976, ithaca 2,152, m3 2,256,
  m60 1,896, m2 2,084). One aggregated exception note at cycle close.

## Net-new integration verdicts (from code sweep)

- **Drop-in this cycle:** 6 buildings → `BuildingModels` + village/settlement
  prefab pools (`WorldFeaturePrefabs.ts`); parked-vehicle scenery (t54 at NVA
  depots, zil-157 supply, m42/ontos US motor pool — M35 static precedent).
- **Featured this cycle:** B-52 arclight call-in (extends live SVYAZ-3
  `AirSupportRadioCatalog`); ambient-wildlife MVP (tiger, water-buffalo,
  wild-boar, macaque ground wanderers; new `WildlifeSystem` — no wildlife code
  exists today, confirmed).
- **Catalog + gallery only (deferred, future cycles):** new weapons as
  selectable loadout variants (m14/sks/dragunov-svd/rpd-lmg — loadout is
  category-based today, `LoadoutTypes.ts`), kbar (no melee system),
  claymore-clicker (no deployable system), c130/ch47/oh6/ov10/mig17 (no role
  systems), boats (water scorched 2026-06-09; swift-boat-pcf/lcm-8/raiding-raft
  + pbr/sampan replacements land dormant), remaining animals.

## Measurement method

GLB header parse (12-byte header, JSON chunk at offset 20), world bbox from
per-node composed transforms × accessor min/max corners, tri count from indexed
primitive counts. The import pipeline re-derives all numbers with buffer-level
position decode as the durable tool; this memo's tables are the seed evidence.
