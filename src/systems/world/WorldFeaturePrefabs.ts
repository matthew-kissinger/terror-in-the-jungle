// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { MapFeatureDefinition, StaticModelPlacementConfig } from '../../config/gameModeTypes';
import { AircraftModels, AnimalModels, BuildingModels, GroundVehicleModels, PropModels, StructureModels } from '../assets/modelPaths';
import { pickVehicleArt } from '../../config/vehicleArt';

interface WorldFeaturePrefabDefinition {
  placements: StaticModelPlacementConfig[];
}

// kiln-war-2026-06 art cutover for the placement-promoted ground vehicles. Kiln
// by default; `?vehicleArt=legacy` reverts (node/SSR resolves legacy, so the
// prefab tests keep asserting the legacy paths). All three Kiln GLBs measure
// true-scale + ground-anchored (minY 0), so the generic dynamic-render path
// needs no per-vehicle scale fudge; GroundVehicle + GroundVehicleRenderOptimization
// register both art paths so promotion matches whichever resolves.
const M35_TRUCK_ART = pickVehicleArt(GroundVehicleModels.M35_DEUCE_A_HALF, GroundVehicleModels.M35_TRUCK);
const M113_APC_ART = pickVehicleArt(GroundVehicleModels.M113_ARMORED_PERSONNEL_CARRIER, GroundVehicleModels.M113_APC);
const ZIL_157_ART = pickVehicleArt(GroundVehicleModels.ZIL_157_SIX_WHEEL, GroundVehicleModels.ZIL_157);

const PREFABS: Record<string, WorldFeaturePrefabDefinition> = {
  firebase_us_small: {
    placements: [
      { modelPath: StructureModels.FIREBASE_GATE, offset: new THREE.Vector3(0, 0, 18), yaw: 0 },
      { modelPath: StructureModels.GUARD_TOWER, offset: new THREE.Vector3(-22, 0, 22), yaw: Math.PI * 0.25, registerCollision: true },
      { modelPath: StructureModels.GUARD_TOWER, offset: new THREE.Vector3(22, 0, 22), yaw: -Math.PI * 0.25, registerCollision: true },
      { modelPath: StructureModels.COMMAND_TENT, offset: new THREE.Vector3(0, 0, -14), yaw: Math.PI },
      { modelPath: StructureModels.AMMO_BUNKER, offset: new THREE.Vector3(-15, 0, -8), yaw: Math.PI * 0.5 },
      { modelPath: StructureModels.AID_STATION, offset: new THREE.Vector3(15, 0, -8), yaw: -Math.PI * 0.5 },
      // kiln-war-2026-06 repaint guard tower (asset-gameplay-integration): SE perimeter watchpost.
      { modelPath: StructureModels.FIREBASE_GUARD_TOWER_ABOUT, offset: new THREE.Vector3(20, 0, -16), yaw: -Math.PI * 0.7, registerCollision: true },
      { modelPath: StructureModels.GENERATOR_SHED, offset: new THREE.Vector3(-11, 0, 7), yaw: Math.PI * 0.5 },
      { modelPath: StructureModels.WATER_TOWER, offset: new THREE.Vector3(14, 0, 6), yaw: 0, registerCollision: true },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(-5, 0, 12), yaw: 0 },
      { modelPath: StructureModels.FUEL_DRUM, offset: new THREE.Vector3(5, 0, 12), yaw: 0 },
    ],
  },
  firebase_us_medium: {
    placements: [
      { modelPath: StructureModels.FIREBASE_GATE, offset: new THREE.Vector3(0, 0, 28), yaw: 0 },
      { modelPath: StructureModels.TOC_BUNKER, offset: new THREE.Vector3(0, 0, -18), yaw: Math.PI, registerCollision: true },
      { modelPath: StructureModels.GUARD_TOWER, offset: new THREE.Vector3(-28, 0, 24), yaw: Math.PI * 0.25, registerCollision: true },
      { modelPath: StructureModels.GUARD_TOWER, offset: new THREE.Vector3(28, 0, 24), yaw: -Math.PI * 0.25, registerCollision: true },
      { modelPath: StructureModels.BARRACKS_TENT, offset: new THREE.Vector3(-18, 0, -4), yaw: Math.PI * 0.5 },
      { modelPath: StructureModels.BARRACKS_TENT, offset: new THREE.Vector3(18, 0, -4), yaw: -Math.PI * 0.5 },
      { modelPath: StructureModels.AMMO_BUNKER, offset: new THREE.Vector3(-18, 0, -18), yaw: Math.PI * 0.5 },
      { modelPath: StructureModels.AID_STATION, offset: new THREE.Vector3(18, 0, -18), yaw: -Math.PI * 0.5 },
      { modelPath: StructureModels.COMMS_TOWER, offset: new THREE.Vector3(-6, 0, 10), yaw: 0, registerCollision: true },
      { modelPath: StructureModels.WATER_TOWER, offset: new THREE.Vector3(18, 0, 8), yaw: 0, registerCollision: true },
    ],
  },
  firebase_artillery_small: {
    placements: [
      { modelPath: StructureModels.ARTILLERY_PIT, offset: new THREE.Vector3(0, 0, -7.5), yaw: Math.PI },
      // kiln-war-2026-06 repaint mortar emplacement (asset-gameplay-integration): infantry mortar on the line.
      { modelPath: StructureModels._81MM_MORTAR_EMPLACEMENT, offset: new THREE.Vector3(10, 0, -8), yaw: Math.PI * 0.1, registerCollision: true },
      { modelPath: StructureModels.COMMAND_TENT, offset: new THREE.Vector3(0, 0, 10), yaw: 0 },
      { modelPath: StructureModels.GUARD_TOWER, offset: new THREE.Vector3(-13.75, 0, 12.5), yaw: Math.PI * 0.25, registerCollision: true },
      { modelPath: StructureModels.GUARD_TOWER, offset: new THREE.Vector3(13.75, 0, 12.5), yaw: -Math.PI * 0.25, registerCollision: true },
      { modelPath: StructureModels.AMMO_CRATE, offset: new THREE.Vector3(-5, 0, 0), yaw: 0 },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(5, 0, 0), yaw: 0 },
      { modelPath: StructureModels.FUEL_DRUM, offset: new THREE.Vector3(7.5, 0, 5), yaw: 0 },
    ],
  },
  firebase_hq_small: {
    placements: [
      { modelPath: StructureModels.TOC_BUNKER, offset: new THREE.Vector3(0, 0, -8), yaw: Math.PI, registerCollision: true },
      { modelPath: StructureModels.COMMS_TOWER, offset: new THREE.Vector3(-16, 0, 8), yaw: 0, registerCollision: true },
      { modelPath: StructureModels.COMMAND_TENT, offset: new THREE.Vector3(16, 0, 6), yaw: Math.PI * 0.5 },
      { modelPath: StructureModels.GENERATOR_SHED, offset: new THREE.Vector3(-10, 0, -18), yaw: Math.PI * 0.5 },
      { modelPath: StructureModels.AMMO_BUNKER, offset: new THREE.Vector3(12, 0, -18), yaw: -Math.PI * 0.5 },
      { modelPath: StructureModels.WATER_TOWER, offset: new THREE.Vector3(0, 0, 18), yaw: 0, registerCollision: true },
    ],
  },
  nva_bunker_cluster_small: {
    placements: [
      { modelPath: BuildingModels.BUNKER_NVA, offset: new THREE.Vector3(0, 0, 0), yaw: Math.PI, registerCollision: true },
      // kiln-war-2026-06 repaint earthen bunker (asset-gameplay-integration): second fighting position.
      { modelPath: StructureModels.NVA_EARTHEN_BUNKER, offset: new THREE.Vector3(9, 0, -10), yaw: Math.PI * 0.15, registerCollision: true },
      { modelPath: StructureModels.FOXHOLE, offset: new THREE.Vector3(-7.5, 0, 5), yaw: Math.PI * 0.2 },
      { modelPath: StructureModels.FOXHOLE, offset: new THREE.Vector3(8.75, 0, 3.75), yaw: -Math.PI * 0.15 },
      { modelPath: StructureModels.PUNJI_TRAP, offset: new THREE.Vector3(-5, 0, 12.5), yaw: 0 },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(5, 0, -6.25), yaw: 0 },
      { modelPath: StructureModels.FUEL_DRUM, offset: new THREE.Vector3(-6.25, 0, -5), yaw: 0 },
    ],
  },
  nva_aa_site_small: {
    placements: [
      { modelPath: StructureModels.ZPU4_AA, offset: new THREE.Vector3(0, 0, 0), yaw: Math.PI * 0.75, registerCollision: true },
      // kiln-war-2026-06 repaint AA piece (asset-gameplay-integration): a 37mm gun beside the ZPU-4.
      { modelPath: StructureModels._37MM_ANTI_AIRCRAFT_GUN, offset: new THREE.Vector3(-11, 0, -7), yaw: Math.PI * 0.6, registerCollision: true },
      { modelPath: StructureModels.FOXHOLE, offset: new THREE.Vector3(-8.75, 0, 6.25), yaw: Math.PI * 0.2 },
      { modelPath: StructureModels.FOXHOLE, offset: new THREE.Vector3(8.75, 0, 6.25), yaw: -Math.PI * 0.2 },
      { modelPath: StructureModels.AMMO_CRATE, offset: new THREE.Vector3(-3.75, 0, -5), yaw: 0 },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(3.75, 0, -5), yaw: 0 },
    ],
  },
  nva_tunnel_camp_small: {
    placements: [
      { modelPath: StructureModels.TUNNEL_ENTRANCE, offset: new THREE.Vector3(0, 0, 0), yaw: Math.PI, registerCollision: true },
      { modelPath: StructureModels.VILLAGE_HUT_DAMAGED, offset: new THREE.Vector3(-10, 0, 7.5), yaw: Math.PI * 0.5 },
      { modelPath: StructureModels.FUEL_DRUM, offset: new THREE.Vector3(6.25, 0, -3.75), yaw: 0 },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(-5, 0, -6.25), yaw: 0 },
      { modelPath: StructureModels.PUNJI_TRAP, offset: new THREE.Vector3(7.5, 0, 8.75), yaw: Math.PI * 0.25 },
      // NVA supply truck (Soviet ZIL-157) - promoted to the ground vehicle runtime when spawned.
      { modelPath: ZIL_157_ART, offset: new THREE.Vector3(11, 0, -8), yaw: Math.PI * 0.45, registerCollision: true },
    ],
  },
  nva_trail_base_small: {
    placements: [
      { modelPath: StructureModels.VILLAGE_HUT, offset: new THREE.Vector3(0, 0, 0), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: StructureModels.MORTAR_PIT, offset: new THREE.Vector3(-7.5, 0, -5), yaw: Math.PI * 0.8, registerCollision: true },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(6.25, 0, -5), yaw: 0 },
      { modelPath: StructureModels.FUEL_DRUM, offset: new THREE.Vector3(7.5, 0, 5), yaw: 0 },
      { modelPath: M35_TRUCK_ART, offset: new THREE.Vector3(-12.5, 0, 6.25), yaw: Math.PI * 0.5, registerCollision: true },
      // The NVA T-54 is now a live, drivable Tank IVehicle spawned through the
      // scenario path (T54TankSpawn / OperationalRuntimeComposer), so the static
      // armor-dressing prop is removed — exactly one T-54 stands in the world.
    ],
  },
  // Universal hamlet — the only village prefab referenced by every game-mode
  // config, so the repaint catalog reaches OF / A Shau / ZC / TDM through here.
  // A single buddhist-temple landmark sits back-center; dwellings (huts, stilt
  // house) ring it, with the farmhouse on the approach. One landmark per
  // settlement keeps the high-tri temple (14.6k) to a single instance.
  village_cluster_small: {
    placements: [
      { modelPath: BuildingModels.BUDDHIST_TEMPLE, offset: new THREE.Vector3(0, 0, -8), yaw: 0, registerCollision: true },
      { modelPath: StructureModels.VILLAGE_HUT, offset: new THREE.Vector3(-11, 0, 4), yaw: Math.PI * 0.2, registerCollision: true },
      { modelPath: StructureModels.VILLAGE_HUT, offset: new THREE.Vector3(10, 0, 5), yaw: -Math.PI * 0.3, registerCollision: true },
      { modelPath: BuildingModels.STILT_HOUSE, offset: new THREE.Vector3(-13, 0, -6), yaw: Math.PI * 0.4, registerCollision: true },
      { modelPath: BuildingModels.FARMHOUSE, offset: new THREE.Vector3(2.5, 0, 9.5), yaw: Math.PI, registerCollision: true },
      // kiln-war-2026-06 repaint dwelling (asset-gameplay-integration): extra hut on the east edge.
      { modelPath: StructureModels.TRADITIONAL_VIETNAMESE_VILLAGE_HUT, offset: new THREE.Vector3(13, 0, -7), yaw: -Math.PI * 0.35, registerCollision: true },
    ],
  },
  // Market town — civic + commercial buildings. Schoolhouse is the back-center
  // landmark; tea-house and market stalls form the bazaar on the approach.
  village_market_small: {
    placements: [
      { modelPath: BuildingModels.SCHOOLHOUSE, offset: new THREE.Vector3(0, 0, -9), yaw: 0, registerCollision: true },
      { modelPath: BuildingModels.TEA_HOUSE, offset: new THREE.Vector3(-12, 0, 2), yaw: Math.PI * 0.3, registerCollision: true },
      { modelPath: BuildingModels.MARKET_STALL, offset: new THREE.Vector3(2.5, 0, 4), yaw: 0, registerCollision: true },
      { modelPath: BuildingModels.MARKET_STALL, offset: new THREE.Vector3(8.75, 0, 6.25), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: BuildingModels.SHOPHOUSE, offset: new THREE.Vector3(13, 0, -5), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(-3.75, 0, 8), yaw: 0 },
    ],
  },
  // Riverside plantation hamlet — the rubber-plantation-mansion is the estate
  // landmark (one per settlement); a rice-mill and rice barn give it the
  // agricultural reads. RICE_DIKE stays on its old GLB (repaint REJECTED for
  // tri/KB budget — see audit), so its placement is untouched.
  village_riverside_small: {
    placements: [
      { modelPath: BuildingModels.RUBBER_PLANTATION_MANSION, offset: new THREE.Vector3(0, 0, -9), yaw: 0, registerCollision: true },
      { modelPath: StructureModels.VILLAGE_HUT, offset: new THREE.Vector3(-12, 0, 6), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: BuildingModels.RICE_MILL, offset: new THREE.Vector3(11, 0, 4), yaw: Math.PI * 0.55, registerCollision: true },
      { modelPath: BuildingModels.BRIDGE_STONE, offset: new THREE.Vector3(-2.5, 0, 11), yaw: 0, registerCollision: true },
      { modelPath: StructureModels.RICE_DIKE, offset: new THREE.Vector3(13, 0, -4), yaw: 0, registerCollision: true },
      // Paddy-edge scenery dressing — a pond heron at the rice-dike edge. No
      // collision (small bird), no draw-call concern (1.6k tris).
      { modelPath: AnimalModels.POND_HERON, offset: new THREE.Vector3(15, 0, 0), yaw: Math.PI * 0.6 },
    ],
  },
  village_damaged_small: {
    placements: [
      { modelPath: StructureModels.VILLAGE_HUT_DAMAGED, offset: new THREE.Vector3(-7.5, 0, 3.75), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: BuildingModels.SHOPHOUSE_DAMAGED, offset: new THREE.Vector3(5, 0, -3.75), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: StructureModels.FUEL_DRUM, offset: new THREE.Vector3(-2.5, 0, -5), yaw: 0 },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(8.75, 0, 6.25), yaw: 0 },
    ],
  },
  supply_depot_small: {
    placements: [
      { modelPath: BuildingModels.WAREHOUSE, offset: new THREE.Vector3(0, 0, -7.5), yaw: Math.PI, registerCollision: true },
      // kiln-war-2026-06 repaint supply dressing (asset-gameplay-integration): new crates + barrel prop.
      { modelPath: StructureModels.MILITARY_AMMUNITION_CRATE_ABOUT, offset: new THREE.Vector3(-7.5, 0, 8), yaw: Math.PI * 0.15 },
      { modelPath: StructureModels.WOODEN_SUPPLY_CRATE_ABOUT, offset: new THREE.Vector3(-5, 0, 9.5), yaw: -Math.PI * 0.1 },
      { modelPath: PropModels.COOPERED_WOODEN_BARREL_STANDING, offset: new THREE.Vector3(8, 0, 8), yaw: 0 },
      { modelPath: StructureModels.GENERATOR_SHED, offset: new THREE.Vector3(-10, 0, 2.5), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: StructureModels.RADIO_STACK, offset: new THREE.Vector3(10, 0, 5), yaw: 0, registerCollision: true },
      { modelPath: M35_TRUCK_ART, offset: new THREE.Vector3(13.75, 0, -2.5), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: StructureModels.AMMO_CRATE, offset: new THREE.Vector3(-3.75, 0, 6.25), yaw: 0 },
      { modelPath: StructureModels.FUEL_DRUM, offset: new THREE.Vector3(3.75, 0, 6.25), yaw: 0 },
    ],
  },
  bridge_checkpoint_small: {
    placements: [
      { modelPath: BuildingModels.BRIDGE_STONE, offset: new THREE.Vector3(0, 0, 0), yaw: 0, registerCollision: true },
      { modelPath: StructureModels.GUARD_TOWER, offset: new THREE.Vector3(-13.75, 0, 8.75), yaw: Math.PI * 0.25, registerCollision: true },
      { modelPath: StructureModels.SANDBAG_BUNKER, offset: new THREE.Vector3(11.25, 0, 7.5), yaw: -Math.PI * 0.15, registerCollision: true },
      { modelPath: GroundVehicleModels.M151_JEEP, offset: new THREE.Vector3(-8.75, 0, -8.75), yaw: Math.PI * 0.5, registerCollision: true },
    ],
  },
  crossing_outpost_small: {
    placements: [
      { modelPath: StructureModels.FOOTBRIDGE, offset: new THREE.Vector3(0, 0, 0), yaw: 0, registerCollision: true },
      { modelPath: StructureModels.GUARD_TOWER, offset: new THREE.Vector3(10, 0, 7.5), yaw: -Math.PI * 0.25, registerCollision: true },
      { modelPath: StructureModels.COMMAND_TENT, offset: new THREE.Vector3(-10, 0, -7.5), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(-3.75, 0, 5), yaw: 0 },
    ],
  },
  motor_pool_small: {
    placements: [
      { modelPath: BuildingModels.WAREHOUSE, offset: new THREE.Vector3(0, 0, -12), yaw: Math.PI, registerCollision: true },
      { modelPath: M35_TRUCK_ART, offset: new THREE.Vector3(-14, 0, 3), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: GroundVehicleModels.M151_JEEP, offset: new THREE.Vector3(0, 0, 6), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: M113_APC_ART, offset: new THREE.Vector3(14, 0, 1), yaw: Math.PI * 0.55, registerCollision: true },
      // Static US AA + recoilless dressing. M35/M151/M113 placements above promote separately.
      { modelPath: GroundVehicleModels.M42_DUSTER, offset: new THREE.Vector3(-14, 0, 14), yaw: Math.PI * 0.4, registerCollision: true },
      { modelPath: GroundVehicleModels.ONTOS, offset: new THREE.Vector3(14, 0, 14), yaw: -Math.PI * 0.4, registerCollision: true },
      { modelPath: StructureModels.FUEL_DRUM, offset: new THREE.Vector3(0, 0, 14), yaw: 0 },
    ],
  },
  // Open Frontier motor pool — reflowed for ≥ 1.5 m bounding-box clearance.
  // M151 and M48 dressing props are intentionally removed; real scenario
  // IVehicles spawn at the same motor-pool area via M151JeepSpawn and
  // M48TankSpawn. Crate row pushed off the parking strip to flank the
  // comms tower instead. All placements sit within the
  // 36 m footprint radius declared by airfield_motor_pool in
  // OpenFrontierConfig.ts.
  motor_pool_heavy_of: {
    placements: [
      { modelPath: BuildingModels.WAREHOUSE, offset: new THREE.Vector3(0, 0, -14), yaw: Math.PI, registerCollision: true },
      { modelPath: StructureModels.COMMS_TOWER, offset: new THREE.Vector3(-20, 0, -4), yaw: 0, registerCollision: true },
      { modelPath: StructureModels.GENERATOR_SHED, offset: new THREE.Vector3(20, 0, -4), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: M35_TRUCK_ART, offset: new THREE.Vector3(-16, 0, 14), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: M113_APC_ART, offset: new THREE.Vector3(10, 0, 18), yaw: Math.PI * 0.7, registerCollision: true },
      // M151 bay anchor: real GroundVehicle IVehicle spawns here by
      // M151JeepSpawn. Distance from prefab center:
      // sqrt(21^2 + 7^2) ≈ 22.1 m, inside the 36 m OF footprint.
      // M48 bay anchor: real Tank IVehicle is spawned here by M48TankSpawn
      // (see of-tank-relocate-to-motor-pool). Distance from prefab center:
      // sqrt(28^2 + 22^2) ≈ 35.6 m, inside the 36 m OF footprint.
      // Crate row east of warehouse, flanking the comms tower.
      { modelPath: StructureModels.AMMO_CRATE, offset: new THREE.Vector3(-24, 0, 0), yaw: 0 },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(-24, 0, 4), yaw: 0 },
      { modelPath: StructureModels.FUEL_DRUM, offset: new THREE.Vector3(-24, 0, -4), yaw: 0 },
    ],
  },
  // A Shau motor pool — preserves the owner-accepted layout that shipped
  // with cycle-vekhikl-3. Kept as a separate prefab so the OF reflow does
  // not regress A Shau visuals. Footprint radius at A Shau is 34 m
  // (Ta Bat Armored Yard); all placements sit inside it.
  motor_pool_heavy_ashau: {
    placements: [
      { modelPath: BuildingModels.WAREHOUSE, offset: new THREE.Vector3(0, 0, -14), yaw: Math.PI, registerCollision: true },
      { modelPath: StructureModels.COMMS_TOWER, offset: new THREE.Vector3(-20, 0, -4), yaw: 0, registerCollision: true },
      { modelPath: StructureModels.GENERATOR_SHED, offset: new THREE.Vector3(20, 0, -4), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: M35_TRUCK_ART, offset: new THREE.Vector3(-18, 0, 12), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: M113_APC_ART, offset: new THREE.Vector3(12, 0, 10), yaw: Math.PI * 0.58, registerCollision: true },
      { modelPath: GroundVehicleModels.M48_PATTON, offset: new THREE.Vector3(24, 0, 14), yaw: Math.PI * 0.6, registerCollision: true },
      // Static US AA + recoilless dressing. M35/M113 promote separately; both
      // static AA assets sit inside the 34 m Ta Bat footprint radius.
      { modelPath: GroundVehicleModels.M42_DUSTER, offset: new THREE.Vector3(-26, 0, 0), yaw: Math.PI * 0.45, registerCollision: true },
      { modelPath: GroundVehicleModels.ONTOS, offset: new THREE.Vector3(28, 0, 2), yaw: -Math.PI * 0.5, registerCollision: true },
      { modelPath: StructureModels.AMMO_CRATE, offset: new THREE.Vector3(-10, 0, 20), yaw: 0 },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(2, 0, 20), yaw: 0 },
      { modelPath: StructureModels.FUEL_DRUM, offset: new THREE.Vector3(14, 0, 20), yaw: 0 },
    ],
  },
  trail_checkpoint_small: {
    placements: [
      { modelPath: StructureModels.GUARD_TOWER, offset: new THREE.Vector3(0, 0, 0), yaw: Math.PI * 0.1, registerCollision: true },
      { modelPath: StructureModels.SANDBAG_BUNKER, offset: new THREE.Vector3(10, 0, 5), yaw: -Math.PI * 0.2, registerCollision: true },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(-5, 0, -5), yaw: 0 },
      { modelPath: GroundVehicleModels.M151_JEEP, offset: new THREE.Vector3(-10, 0, 6.25), yaw: Math.PI * 0.5, registerCollision: true },
    ],
  },
  airstrip_rough_small: {
    placements: [
      { modelPath: AircraftModels.UH1_HUEY, offset: new THREE.Vector3(0, 0, -12.5), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: M35_TRUCK_ART, offset: new THREE.Vector3(-15, 0, 7.5), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: StructureModels.FUEL_DRUM, offset: new THREE.Vector3(10, 0, 5), yaw: 0 },
      { modelPath: StructureModels.SUPPLY_CRATE, offset: new THREE.Vector3(13.75, 0, 7.5), yaw: 0 },
    ],
  },
  airfield_support_compound_small: {
    placements: [
      { modelPath: BuildingModels.WAREHOUSE, offset: new THREE.Vector3(0, 0, -10), yaw: Math.PI, registerCollision: true },
      { modelPath: StructureModels.COMMS_TOWER, offset: new THREE.Vector3(-15, 0, 2.5), yaw: 0, registerCollision: true },
      { modelPath: StructureModels.GENERATOR_SHED, offset: new THREE.Vector3(15, 0, 2.5), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: M35_TRUCK_ART, offset: new THREE.Vector3(-7.5, 0, 10), yaw: Math.PI * 0.5, registerCollision: true },
      { modelPath: StructureModels.FUEL_DRUM, offset: new THREE.Vector3(6.25, 0, 10), yaw: 0 },
    ],
  },
};

export function getWorldFeaturePrefab(feature: MapFeatureDefinition): WorldFeaturePrefabDefinition | null {
  if (!feature.prefabId) {
    return null;
  }
  return PREFABS[feature.prefabId] ?? null;
}
