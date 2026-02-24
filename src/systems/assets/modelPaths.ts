/**
 * Central registry of GLB model paths relative to public/models/.
 * Used by ModelLoader.loadModel() throughout the engine.
 */

export const WeaponModels = {
  M16A1: 'weapons/m16a1.glb',
  AK47: 'weapons/ak47.glb',
  M60: 'weapons/m60.glb',
  M2_BROWNING: 'weapons/m2-browning.glb',
  M1911: 'weapons/m1911.glb',
  M79: 'weapons/m79.glb',
  RPG7: 'weapons/rpg7.glb',
  ITHACA37: 'weapons/ithaca37.glb',
  M3_GREASE_GUN: 'weapons/m3-grease-gun.glb',
} as const;

export const AircraftModels = {
  UH1_HUEY: 'vehicles/aircraft/uh1-huey.glb',
  UH1C_GUNSHIP: 'vehicles/aircraft/uh1c-gunship.glb',
  AH1_COBRA: 'vehicles/aircraft/ah1-cobra.glb',
  AC47_SPOOKY: 'vehicles/aircraft/ac47-spooky.glb',
  F4_PHANTOM: 'vehicles/aircraft/f4-phantom.glb',
  A1_SKYRAIDER: 'vehicles/aircraft/a1-skyraider.glb',
} as const;

export const GroundVehicleModels = {
  M151_JEEP: 'vehicles/ground/m151-jeep.glb',
  M35_TRUCK: 'vehicles/ground/m35-truck.glb',
  M113_APC: 'vehicles/ground/m113-apc.glb',
  M48_PATTON: 'vehicles/ground/m48-patton.glb',
  PT76: 'vehicles/ground/pt76.glb',
} as const;

export const WatercraftModels = {
  SAMPAN: 'vehicles/watercraft/sampan.glb',
  PBR: 'vehicles/watercraft/pbr.glb',
} as const;

export const StructureModels = {
  HELIPAD: 'structures/helipad.glb',
  SANDBAG_WALL: 'structures/sandbag-wall.glb',
  SANDBAG_BUNKER: 'structures/sandbag-bunker.glb',
  MORTAR_PIT: 'structures/mortar-pit.glb',
  AMMO_CRATE: 'structures/ammo-crate.glb',
  FOXHOLE: 'structures/foxhole.glb',
  GUARD_TOWER: 'structures/guard-tower.glb',
  COMMAND_TENT: 'structures/command-tent.glb',
  BARBED_WIRE: 'structures/barbed-wire-fence.glb',
  CONCERTINA_WIRE: 'structures/concertina-wire.glb',
  CLAYMORE: 'structures/claymore-mine.glb',
  FOOTBRIDGE: 'structures/footbridge.glb',
  AA_37MM: 'structures/37mm-aa.glb',
  FIREBASE_GATE: 'structures/firebase-gate.glb',
  VILLAGE_HUT: 'structures/village-hut.glb',
  VILLAGE_HUT_DAMAGED: 'structures/village-hut-damaged.glb',
  RICE_DIKE: 'structures/rice-dike.glb',
  FUEL_DRUM: 'structures/fuel-drum.glb',
  SUPPLY_CRATE: 'structures/supply-crate.glb',
  ZPU4_AA: 'structures/zpu4-aa.glb',
  PUNJI_TRAP: 'structures/punji-trap.glb',
  TUNNEL_ENTRANCE: 'structures/tunnel-entrance.glb',
  SA2_SAM: 'structures/sa2-sam.glb',
  RADIO_STACK: 'structures/radio-stack.glb',
  TOC_BUNKER: 'structures/toc-bunker.glb',
  ARTILLERY_PIT: 'structures/artillery-pit.glb',
  BARRACKS_TENT: 'structures/barracks-tent.glb',
  AID_STATION: 'structures/aid-station.glb',
  AMMO_BUNKER: 'structures/ammo-bunker.glb',
  COMMS_TOWER: 'structures/comms-tower.glb',
  GENERATOR_SHED: 'structures/generator-shed.glb',
  WATER_TOWER: 'structures/water-tower.glb',
  PERIMETER_BERM: 'structures/perimeter-berm.glb',
  LATRINE: 'structures/latrine.glb',
} as const;

export const BuildingModels = {
  SHOPHOUSE: 'buildings/shophouse.glb',
  SHOPHOUSE_DAMAGED: 'buildings/shophouse-damaged.glb',
  FRENCH_VILLA: 'buildings/french-villa.glb',
  CONCRETE_BUILDING: 'buildings/concrete-building.glb',
  MARKET_STALL: 'buildings/market-stall.glb',
  CHURCH: 'buildings/church.glb',
  PAGODA: 'buildings/pagoda.glb',
  WAREHOUSE: 'buildings/warehouse.glb',
  FARMHOUSE: 'buildings/farmhouse.glb',
  RICE_BARN: 'buildings/rice-barn.glb',
  BRIDGE_STONE: 'buildings/bridge-stone.glb',
  BUNKER_NVA: 'buildings/bunker-nva.glb',
} as const;

export const AnimalModels = {
  EGRET: 'animals/egret.glb',
  WATER_BUFFALO: 'animals/water-buffalo.glb',
  MACAQUE: 'animals/macaque.glb',
  TIGER: 'animals/tiger.glb',
  KING_COBRA: 'animals/king-cobra.glb',
  WILD_BOAR: 'animals/wild-boar.glb',
} as const;

export const PropModels = {
  WOODEN_BARREL: 'props/wooden-barrel.glb',
} as const;
