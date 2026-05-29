import { Faction, GrenadeType } from '../../systems/combat/types';
import { M48_SPAWN_OFFSETS } from '../../config/vehicles/m48-config';

export enum LoadoutWeapon {
  RIFLE = 'rifle',
  SHOTGUN = 'shotgun',
  SMG = 'smg',
  PISTOL = 'pistol',
  LMG = 'lmg',
  LAUNCHER = 'launcher'
}

export enum LoadoutEquipment {
  FRAG_GRENADE = 'frag_grenade',
  SMOKE_GRENADE = 'smoke_grenade',
  FLASHBANG = 'flashbang',
  SANDBAG_KIT = 'sandbag_kit',
  MORTAR_KIT = 'mortar_kit'
}

export interface PlayerLoadout {
  primaryWeapon: LoadoutWeapon;
  secondaryWeapon: LoadoutWeapon;
  equipment: LoadoutEquipment;
}

export interface LoadoutPresetTemplate {
  id: string;
  name: string;
  description: string;
  loadout: PlayerLoadout;
}

export interface LoadoutOptionPool {
  faction: Faction;
  weapons: LoadoutWeapon[];
  equipment: LoadoutEquipment[];
  presetTemplates: LoadoutPresetTemplate[];
}

interface LoadoutFieldOption<TValue extends string> {
  value: TValue;
  label: string;
  shortLabel: string;
}

export type LoadoutFieldKey =
  | 'primaryWeapon'
  | 'secondaryWeapon'
  | 'equipment';

const LOADOUT_WEAPON_OPTIONS: ReadonlyArray<LoadoutFieldOption<LoadoutWeapon>> = [
  { value: LoadoutWeapon.RIFLE, label: 'Rifle', shortLabel: 'AR' },
  { value: LoadoutWeapon.SHOTGUN, label: 'Shotgun', shortLabel: 'SG' },
  { value: LoadoutWeapon.SMG, label: 'SMG', shortLabel: 'SMG' },
  { value: LoadoutWeapon.PISTOL, label: 'Pistol', shortLabel: 'PST' },
  { value: LoadoutWeapon.LMG, label: 'LMG', shortLabel: 'MG' },
  { value: LoadoutWeapon.LAUNCHER, label: 'Grenade Launcher', shortLabel: 'GL' },
];

const LOADOUT_EQUIPMENT_OPTIONS: ReadonlyArray<LoadoutFieldOption<LoadoutEquipment>> = [
  { value: LoadoutEquipment.FRAG_GRENADE, label: 'Frag Grenade', shortLabel: 'FRG' },
  { value: LoadoutEquipment.SMOKE_GRENADE, label: 'Smoke Grenade', shortLabel: 'SMK' },
  { value: LoadoutEquipment.FLASHBANG, label: 'Flashbang', shortLabel: 'FLS' },
  { value: LoadoutEquipment.SANDBAG_KIT, label: 'Sandbag Kit', shortLabel: 'SB' },
  { value: LoadoutEquipment.MORTAR_KIT, label: 'Mortar Kit', shortLabel: 'MTR' },
];

export const DEFAULT_PLAYER_LOADOUT: PlayerLoadout = {
  primaryWeapon: LoadoutWeapon.RIFLE,
  secondaryWeapon: LoadoutWeapon.SHOTGUN,
  equipment: LoadoutEquipment.FRAG_GRENADE,
};

const LOADOUT_POOL_BY_FACTION: Record<
  Faction,
  Omit<LoadoutOptionPool, 'faction'>
> = {
  [Faction.US]: {
    weapons: [
      LoadoutWeapon.RIFLE,
      LoadoutWeapon.SHOTGUN,
      LoadoutWeapon.SMG,
      LoadoutWeapon.PISTOL,
      LoadoutWeapon.LMG,
      LoadoutWeapon.LAUNCHER,
    ],
    equipment: [
      LoadoutEquipment.FRAG_GRENADE,
      LoadoutEquipment.SMOKE_GRENADE,
      LoadoutEquipment.FLASHBANG,
      LoadoutEquipment.SANDBAG_KIT,
      LoadoutEquipment.MORTAR_KIT,
    ],
    presetTemplates: [
      {
        id: 'rifleman',
        name: 'Rifleman',
        description: 'Balanced assault loadout for frontline pushes.',
        loadout: {
          primaryWeapon: LoadoutWeapon.RIFLE,
          secondaryWeapon: LoadoutWeapon.SHOTGUN,
          equipment: LoadoutEquipment.FRAG_GRENADE,
        },
      },
      {
        id: 'recon',
        name: 'Recon',
        description: 'Fast two-gun profile for maneuver and smoke cover.',
        loadout: {
          primaryWeapon: LoadoutWeapon.SMG,
          secondaryWeapon: LoadoutWeapon.PISTOL,
          equipment: LoadoutEquipment.SMOKE_GRENADE,
        },
      },
      {
        id: 'engineer',
        name: 'Engineer',
        description: 'Fieldworks-focused preset for holding ground.',
        loadout: {
          primaryWeapon: LoadoutWeapon.RIFLE,
          secondaryWeapon: LoadoutWeapon.SMG,
          equipment: LoadoutEquipment.SANDBAG_KIT,
        },
      },
    ],
  },
  [Faction.ARVN]: {
    weapons: [
      LoadoutWeapon.RIFLE,
      LoadoutWeapon.SHOTGUN,
      LoadoutWeapon.SMG,
      LoadoutWeapon.PISTOL,
      LoadoutWeapon.LMG,
    ],
    equipment: [
      LoadoutEquipment.FRAG_GRENADE,
      LoadoutEquipment.SMOKE_GRENADE,
      LoadoutEquipment.SANDBAG_KIT,
    ],
    presetTemplates: [
      {
        id: 'line_infantry',
        name: 'Line Infantry',
        description: 'General-purpose infantry setup for zone fighting.',
        loadout: {
          primaryWeapon: LoadoutWeapon.RIFLE,
          secondaryWeapon: LoadoutWeapon.SHOTGUN,
          equipment: LoadoutEquipment.FRAG_GRENADE,
        },
      },
      {
        id: 'point_man',
        name: 'Point Man',
        description: 'Closer-range preset with smoke for movement.',
        loadout: {
          primaryWeapon: LoadoutWeapon.SMG,
          secondaryWeapon: LoadoutWeapon.PISTOL,
          equipment: LoadoutEquipment.SMOKE_GRENADE,
        },
      },
      {
        id: 'militia_support',
        name: 'Militia Support',
        description: 'Defensive preset built around fast cover placement.',
        loadout: {
          primaryWeapon: LoadoutWeapon.RIFLE,
          secondaryWeapon: LoadoutWeapon.PISTOL,
          equipment: LoadoutEquipment.SANDBAG_KIT,
        },
      },
    ],
  },
  [Faction.NVA]: {
    weapons: [
      LoadoutWeapon.RIFLE,
      LoadoutWeapon.SMG,
      LoadoutWeapon.PISTOL,
    ],
    equipment: [
      LoadoutEquipment.FRAG_GRENADE,
      LoadoutEquipment.SMOKE_GRENADE,
      LoadoutEquipment.MORTAR_KIT,
    ],
    presetTemplates: [
      {
        id: 'regulars',
        name: 'Regulars',
        description: 'Core infantry preset for sustained pressure.',
        loadout: {
          primaryWeapon: LoadoutWeapon.RIFLE,
          secondaryWeapon: LoadoutWeapon.SMG,
          equipment: LoadoutEquipment.FRAG_GRENADE,
        },
      },
      {
        id: 'sapper',
        name: 'Sapper',
        description: 'Aggressive close-range preset with smoke support.',
        loadout: {
          primaryWeapon: LoadoutWeapon.SMG,
          secondaryWeapon: LoadoutWeapon.PISTOL,
          equipment: LoadoutEquipment.SMOKE_GRENADE,
        },
      },
      {
        id: 'fire_support',
        name: 'Fire Support',
        description: 'Indirect-fire preset for longer engagements.',
        loadout: {
          primaryWeapon: LoadoutWeapon.RIFLE,
          secondaryWeapon: LoadoutWeapon.PISTOL,
          equipment: LoadoutEquipment.MORTAR_KIT,
        },
      },
    ],
  },
  [Faction.VC]: {
    weapons: [
      LoadoutWeapon.RIFLE,
      LoadoutWeapon.SHOTGUN,
      LoadoutWeapon.PISTOL,
    ],
    equipment: [
      LoadoutEquipment.FRAG_GRENADE,
      LoadoutEquipment.SMOKE_GRENADE,
      LoadoutEquipment.SANDBAG_KIT,
    ],
    presetTemplates: [
      {
        id: 'guerrilla',
        name: 'Guerrilla',
        description: 'Flexible preset for ambushes and short pushes.',
        loadout: {
          primaryWeapon: LoadoutWeapon.RIFLE,
          secondaryWeapon: LoadoutWeapon.SHOTGUN,
          equipment: LoadoutEquipment.FRAG_GRENADE,
        },
      },
      {
        id: 'ambusher',
        name: 'Ambusher',
        description: 'Close-range preset for sudden contact.',
        loadout: {
          primaryWeapon: LoadoutWeapon.SHOTGUN,
          secondaryWeapon: LoadoutWeapon.PISTOL,
          equipment: LoadoutEquipment.SMOKE_GRENADE,
        },
      },
      {
        id: 'cell_support',
        name: 'Cell Support',
        description: 'Entrenchment-focused preset for holding lanes.',
        loadout: {
          primaryWeapon: LoadoutWeapon.RIFLE,
          secondaryWeapon: LoadoutWeapon.PISTOL,
          equipment: LoadoutEquipment.SANDBAG_KIT,
        },
      },
    ],
  },
};

export function getWeaponLabel(weapon: LoadoutWeapon): string {
  return LOADOUT_WEAPON_OPTIONS.find(option => option.value === weapon)?.label ?? 'Weapon';
}

export function getWeaponShortLabel(weapon: LoadoutWeapon): string {
  return LOADOUT_WEAPON_OPTIONS.find(option => option.value === weapon)?.shortLabel ?? 'WPN';
}

export function getEquipmentLabel(equipment: LoadoutEquipment): string {
  return LOADOUT_EQUIPMENT_OPTIONS.find(option => option.value === equipment)?.label ?? 'Equipment';
}

export function getEquipmentShortLabel(equipment: LoadoutEquipment): string {
  return LOADOUT_EQUIPMENT_OPTIONS.find(option => option.value === equipment)?.shortLabel ?? 'EQP';
}

export function isGrenadeEquipment(equipment: LoadoutEquipment): boolean {
  return equipment === LoadoutEquipment.FRAG_GRENADE
    || equipment === LoadoutEquipment.SMOKE_GRENADE
    || equipment === LoadoutEquipment.FLASHBANG;
}

export function getGrenadeTypeForEquipment(equipment: LoadoutEquipment): GrenadeType | null {
  switch (equipment) {
    case LoadoutEquipment.FRAG_GRENADE:
      return GrenadeType.FRAG;
    case LoadoutEquipment.SMOKE_GRENADE:
      return GrenadeType.SMOKE;
    case LoadoutEquipment.FLASHBANG:
      return GrenadeType.FLASHBANG;
    default:
      return null;
  }
}

export function clonePlayerLoadout(loadout: PlayerLoadout): PlayerLoadout {
  return {
    primaryWeapon: loadout.primaryWeapon,
    secondaryWeapon: loadout.secondaryWeapon,
    equipment: loadout.equipment,
  };
}

export function getLoadoutPoolForFaction(faction: Faction): LoadoutOptionPool {
  const pool = LOADOUT_POOL_BY_FACTION[faction] ?? LOADOUT_POOL_BY_FACTION[Faction.US];

  return {
    faction,
    weapons: [...pool.weapons],
    equipment: [...pool.equipment],
    presetTemplates: pool.presetTemplates.map(template => ({
      ...template,
      loadout: clonePlayerLoadout(template.loadout),
    })),
  };
}

export function getDefaultLoadoutForFaction(faction: Faction): PlayerLoadout {
  return clonePlayerLoadout(getLoadoutPoolForFaction(faction).presetTemplates[0]?.loadout ?? DEFAULT_PLAYER_LOADOUT);
}

/**
 * A crewable vehicle the player can choose to deploy into/near, surfaced
 * alongside the infantry spawn points in the deploy screen. This is a
 * UI-layer description only -- it carries the world spawn anchor and the
 * controls hint so the deploy screen can render a "crew a tank" choice and
 * the vehicle action bar can show a how-to-use line. Crewing/gunnery
 * behaviour itself is owned by the vehicle systems, not this module.
 */
export interface VehicleDeployOption {
  /** Stable id used for selection wiring (matches the spawned IVehicle id where applicable). */
  id: string;
  /** Display name, e.g. "M48 Patton". */
  name: string;
  /** Short class label shown in the deploy list, e.g. "ARMOR". */
  classLabel: string;
  /** One-line description of the vehicle role. */
  description: string;
  /** World-space spawn anchor (x/z); the deploy flow snaps Y to terrain. */
  position: { x: number; z: number };
  /** Owning faction so the UI can color the choice. */
  faction: Faction;
  /** Brief controls hint shown when near/in the vehicle (enter / seat-swap / fire). */
  controlsHint: string;
}

/**
 * Default controls hint for a crewed ground vehicle (tank). Referenced by
 * both the deploy screen choice and the vehicle action bar. The seat-swap
 * and fire keys are documented here for discoverability; the gunnery
 * behaviour is wired by the tank-crew systems, not this module.
 */
export const TANK_CONTROLS_HINT = 'E enter / exit  -  F swap seat  -  LMB fire';

/**
 * Built-in crewable vehicle deploy options keyed by game-mode id. The M48
 * Patton anchors mirror `M48_SCENARIO_SPAWNS` (config-sourced) so the
 * deploy choice points at the same place the tank actually spawns.
 */
const VEHICLE_DEPLOY_OPTIONS_BY_MODE: Record<string, VehicleDeployOption[]> = {
  open_frontier: [
    {
      id: 'm48_tank_of_us_fob',
      name: 'M48 Patton',
      classLabel: 'ARMOR',
      description: 'Crew the M48 at the airfield motor pool.',
      position: { x: M48_SPAWN_OFFSETS.open_frontier.x, z: M48_SPAWN_OFFSETS.open_frontier.z },
      faction: Faction.US,
      controlsHint: TANK_CONTROLS_HINT,
    },
  ],
  a_shau_valley: [
    {
      id: 'm48_tank_ashau_valley_road',
      name: 'M48 Patton',
      classLabel: 'ARMOR',
      description: 'Crew the M48 on the valley road.',
      position: { x: M48_SPAWN_OFFSETS.a_shau_valley.x, z: M48_SPAWN_OFFSETS.a_shau_valley.z },
      faction: Faction.US,
      controlsHint: TANK_CONTROLS_HINT,
    },
  ],
};

/**
 * Returns the crewable vehicle deploy options available for a game mode.
 * Modes without a tank placement return an empty list so the deploy screen
 * simply omits the vehicles section.
 */
export function getVehicleDeployOptionsForMode(mode: string): VehicleDeployOption[] {
  const options = VEHICLE_DEPLOY_OPTIONS_BY_MODE[mode] ?? [];
  return options.map(option => ({ ...option, position: { ...option.position } }));
}
