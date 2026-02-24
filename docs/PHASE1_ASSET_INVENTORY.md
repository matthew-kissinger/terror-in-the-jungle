# Phase 1 Asset Inventory & Integration Plan

Last updated: 2026-02-23

## Overview

This document inventories the **new 2D assets** staged in `public/assets/source/` and maps them to Phase 1 of the roadmap. Runtime-ready outputs are optimized into `public/assets/`.

**Source staging:** `public/assets/source/`  
**Current engine assets:** `public/assets/` (WebP/PNG runtime files)  
**Status:** Ongoing integration and optimization

## Vision Alignment

The engine is a **war simulation** with configurable game modes. **Four distinct factions:** US Army, NVA, ARVN, Viet Cong. Historically accurate modes use US+ARVN vs NVA+VC.

## Current Phase 1 Focus

**Reskinning the game.** Maybe terrain. Cleaning things up. Not full faction system expansion or 3D vehicle/turret integration yet.

---

## Asset Inventory by Category

### 1. Soldiers (NPC Billboard Sprites)

**Location:** `war-assets/soldiers/`  
**Format:** PNG (unoptimized)  
**Naming:** `{faction}-{direction}-{state}.png` (e.g. `nva-front-walk1.png`)

| Faction | Files | Notes |
|---------|-------|-------|
| **US** | mounted only (walk/fire in `assets/`) | — |
| **NVA** | 9 sprites + mounted + tpose-ref | New faction |
| **ARVN** | 9 sprites + mounted + tpose-ref | New faction |
| **VC** | refs in war-assets, walk/fire in `assets/` | VC mounted sprite too—for later phases when 3D vehicles and turrets work |

**Mounted sprites** (us, nva, arvn): For vehicle/turret operators. Used when 3D vehicles and turrets are in place—later phases.

**NVA/ARVN infantry sprites:** 9 poses each (front/back/side × walk1, walk2, fire) + mounted.

---

### 2. Terrain Textures

**Location:** `war-assets/textures/`  
**Format:** 512×512 PNG, tileable  
**Count:** 12 textures

| File | Roadmap Phase 1 Use | Replaces |
|------|---------------------|----------|
| `jungle-floor.png` | Primary terrain under canopy | `forestfloor.png` |
| `mud-ground.png` | Trails, monsoon, LZ | — |
| `firebase-ground.png` | Firebase perimeter | — |
| `rice-paddy.png` | Mekong Delta | — |
| `rocky-highland.png` | A Shau, Central Highlands | — |
| `river-bank.png` | River edges | — |
| `red-laterite.png` | Highland roads | — |
| `tall-grass.png` | Open fields | — |
| `bamboo-floor.png` | Bamboo groves | — |
| `swamp.png` | Mekong Delta | — |
| `sandy-beach.png` | Coastal ops | — |
| `defoliated-ground.png` | Agent Orange zones | — |

**Integration:** TBD. `ChunkMaterials.ts` currently uses only `forestfloor`.

---

### 3. Vegetation Billboards

**Location:** `war-assets/vegetation/`  
**Format:** PNG, transparent  
**Count:** 13 types

| File | Roadmap Mapping | Current Engine Asset |
|------|-----------------|----------------------|
| `jungle-fern.png` | 9.1 Fern | `Fern.webp` |
| `elephant-ear-plants.png` | 9.2 Elephant Ear | `ElephantEarPlants.webp` |
| `fan-palm-cluster.png` | 9.3 Fan Palm | `FanPalmCluster.webp` |
| `coconut-palm.png` | 9.4 Coconut Palm | `CoconutPalm.webp` |
| `areca-palm-cluster.png` | 9.5 Areca Palm | `ArecaPalmCluster.webp` |
| `dipterocarp-giant.png` | 9.6 Dipterocarp | `DipterocarpGiant.webp` |
| `banyan-tree.png` | 9.7 Banyan | `TwisterBanyan.webp` |
| `bamboo-grove.png` | 9.8 Bamboo (NEW) | — |
| `rice-paddy-plants.png` | 9.9 Rice Paddy (NEW) | — |
| `banana-plant.png` | 9.10 Banana (NEW) | — |
| `elephant-grass.png` | 9.11 Tall Grass (NEW) | — |
| `mangrove.png` | 9.12 Mangrove (NEW) | — |
| `rubber-tree.png` | 9.13 Rubber Tree (NEW) | — |

**Integration:** TBD. Engine expects names like `Fern`, `CoconutPalm`; new assets use `jungle-fern`, `coconut-palm`.

---

### 4. UI Icons

**Location:** `war-assets/ui/icons/`  
**Format:** PNG (unoptimized)

#### Weapon silhouettes (11)
`weapon-m16a1.png`, `weapon-ak47.png`, `weapon-shotgun.png`, `weapon-m3a1.png`, `weapon-m1911.png`, `weapon-m60.png`, `weapon-m79.png`, `weapon-rpg7.png`, `weapon-grenade.png`, `weapon-smoke.png`, `weapon-mortar.png`

#### Squad command (10)
`cmd-follow.png`, `cmd-hold.png`, `cmd-assault.png`, `cmd-defend.png`, `cmd-retreat.png`, `cmd-wedge.png`, `cmd-line.png`, `cmd-flank-left.png`, `cmd-flank-right.png`, `cmd-regroup.png`

#### Equipment (8)
`equip-sandbag.png`, `equip-claymore.png`, `equip-medkit.png`, `equip-binoculars.png`, `equip-radio.png`, `equip-ammo.png`, `equip-wire.png`, `equip-flare.png`

#### Vehicle side silhouettes (9)
`vehicle-huey.png`, `vehicle-cobra.png`, `vehicle-spooky.png`, `vehicle-phantom.png`, `vehicle-jeep.png`, `vehicle-apc.png`, `vehicle-tank.png`, `vehicle-sampan.png`, `vehicle-pbr.png`

#### Vehicle top-down / minimap (9)
`map-huey.png`, `map-cobra.png`, `map-spooky.png`, `map-phantom.png`, `map-jeep.png`, `map-apc.png`, `map-tank.png`, `map-sampan.png`, `map-pbr.png`

#### Map markers (8)
`marker-waypoint.png`, `marker-rally.png`, `marker-lz.png`, `marker-objective.png`, `marker-enemy.png`, `marker-friendly.png`, `marker-airsupport.png`, `marker-artillery.png`

#### Air support (5)
`air-insertion.png`, `air-gunrun.png`, `air-napalm.png`, `air-bombrun.png`, `air-medevac.png`

#### Faction insignia (4)
`faction-us.png`, `faction-nva.png`, `faction-arvn.png`, `faction-vc.png`

#### Reticles (4)
`reticle-rifle.png`, `reticle-shotgun.png`, `reticle-sniper.png`, `reticle-machinegun.png`

#### Rank chevrons (8)
`rank-pfc.png`, `rank-cpl.png`, `rank-sgt.png`, `rank-ssg.png`, `rank-sfc.png`, `rank-1sg.png`, `rank-lt.png`, `rank-cpt.png`

#### Compass
`compass-rose.png`

**Integration:** TBD. For future HUD/loadout/command UI.

---

### 5. UI Screens

**Location:** `war-assets/ui/screens/`  
**Format:** 16:9 PNG

| File | Use |
|------|-----|
| `start-screen.png` | Title screen background |
| `loadout-screen.png` | Loadout/deploy screen |
| `loading-screen.png` | Loading screen |

**Integration:** TBD. `StartScreen.module.css` uses `assets/background.png`.

---

## Phase 1 Roadmap Alignment

From `ROADMAP.md`, Phase 1 Sprint 1 priority order:

| # | Roadmap Item | New Assets Available | Status |
|---|--------------|----------------------|--------|
| 1 | All 7 vegetation billboard remakes + bamboo grove | ✅ 7 remakes + bamboo + 5 more | Ready |
| 2 | Dense jungle floor + muddy trail textures | ✅ jungle-floor, mud-ground | Ready |
| 3 | UH-1 Huey Transport + UH-1C Gunship GLBs | ❌ 3D – not in war-assets | Pending |
| 4 | M16A1, AK-47, M60 weapon viewmodel GLBs | ❌ 3D – not in war-assets | Pending |
| 5 | Sandbag Wall, Bunker, Ammo Crate, Helipad GLBs | ❌ 3D – not in war-assets | Pending |
| 6 | M2 Browning .50 cal mounted weapon GLB | ❌ 3D – not in war-assets | Pending |
| 7 | NVA Regular infantry sprites (add as new faction) | ✅ Full NVA set + ARVN | Ready |

**2D assets in war-assets:** Ready for Phase 1 integration.  
**3D assets (GLB):** Not in war-assets; to be generated via Pixel Forge Kiln API.

---

## Optimization Pipeline

**Script:** `scripts/optimize-assets.ts` (sharp + tsx)  
**Run:** `npm run assets:optimize` (all) or `npm run assets:optimize:vegetation` (one category)  
**Dry run:** `npm run assets:optimize:dry`

### What it does per file

1. Skips `_raw` and `tpose-ref` files
2. Trims transparent padding (vegetation, soldiers)
3. Cleans dark alpha fringe from background removal (vegetation, soldiers)
4. Resizes to fit within max dimension (Lanczos resampling)
5. Enforces power-of-two dimensions for GPU mipmap compatibility
6. Converts PNG to WebP (configurable quality per category)
7. Maps filenames to engine-expected names (vegetation)
8. Outputs to `public/assets/`

### Category settings

| Category | Max Dim | Quality | Trim | POT | Output |
|----------|---------|---------|------|-----|--------|
| vegetation | 1024 | 90 | yes | yes | `public/assets/` |
| soldiers | 512 | 95 | yes | yes | `public/assets/` |
| textures | 512 | 90 | no | yes | `public/assets/` |
| icons | native | 100 (lossless) | no | no | `public/assets/ui/icons/` |
| screens | native | 85 | no | no | `public/assets/ui/screens/` |

### Vegetation results (first run)

13 files: **10.89 MB PNG → 1.52 MB WebP (86% savings)**. Names mapped to engine convention (e.g. `jungle-fern.png` → `Fern.webp`). 6 new vegetation types added (BambooGrove, BananaPlant, ElephantGrass, Mangrove, RicePaddyPlants, RubberTree).

### Mipmaps

Mipmaps are GPU-generated at runtime (`generateMipmaps = true` in `configureBillboardTexture`). The pipeline ensures power-of-two dimensions so the GPU can build a clean mipmap chain. No offline mipmap pre-generation needed.

**Known bug:** `BillboardVegetationTypes.ts` calls `createPixelPerfectMaterial()` which overrides mipmap config back to off. Separate fix needed.

---

## File Count Summary

| Category | Final Assets (excl. _raw) | Notes |
|----------|---------------------------|-------|
| Soldiers | 21 (NVA 10, ARVN 10, US mounted 1) | VC in `assets/`; + 2 ref .webp |
| Textures | 12 | |
| Vegetation | 13 | |
| UI Icons | 60+ | |
| UI Screens | 3 | |
| **Total** | **~110+** | Excluding _raw duplicates |

---

## Next Steps

1. ~~**Optimize vegetation:**~~ Done. `npm run assets:optimize:vegetation`
2. **Optimize remaining:** Run `npm run assets:optimize` for soldiers, textures, icons, screens.
3. **Reskin:** Wire new vegetation WebPs into engine (already named correctly for existing 7 types).
4. **Add new veg types:** Wire BambooGrove, BananaPlant, ElephantGrass, Mangrove, RicePaddyPlants, RubberTree into `BillboardVegetationTypes.ts` and `ChunkVegetationGenerator.ts`.
5. **Fix mipmap bug:** Update `BillboardVegetationTypes.ts` to use billboard-aware material.
6. **Terrain:** Wire new ground textures if in scope.
7. **Cleanup:** TBD.
