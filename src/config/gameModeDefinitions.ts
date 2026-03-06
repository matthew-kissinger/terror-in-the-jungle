import { Alliance, Faction } from '../systems/combat/types';
import { getGameModeConfig } from './gameModes';
import {
  CommandScale,
  GameMode,
  GameModeConfig,
  GameModeDefinition,
  GameLaunchSelection,
  GameModePolicies
} from './gameModeTypes';

function getCommandScaleForMode(config: GameModeConfig): CommandScale {
  switch (config.id) {
    case GameMode.ZONE_CONTROL:
      return 'platoon';
    case GameMode.OPEN_FRONTIER:
      return 'company';
    case GameMode.A_SHAU_VALLEY:
      return 'battalion';
    default:
      return 'squad';
  }
}

function createBasePolicies(config: GameModeConfig): GameModePolicies {
  const usesWarSimulator = config.warSimulator?.enabled === true;
  const usesZones = config.zones.length > 0 && config.captureRadius > 0;
  const usesTickets = config.maxTickets > 0;

  return {
    objective: {
      kind: usesWarSimulator ? 'warfront' : 'zone_control',
      usesZones,
      usesTickets,
      usesWarSimulator
    },
    deploy: {
      flow: usesWarSimulator ? 'air_assault' : 'standard',
      mapVariant: 'standard',
      allowSpawnSelection: true,
      allowLoadoutEditingOnRespawn: true
    },
    respawn: {
      allowControlledZoneSpawns: config.playerCanSpawnAtZones,
      initialSpawnRule: usesWarSimulator ? 'forward_insertion' : 'homebase',
      fallbackRule: usesWarSimulator ? 'pressure_front' : 'homebase',
      contactAssistStyle: usesWarSimulator ? 'pressure_front' : 'none'
    },
    mapIntel: {
      tacticalRangeOverride: config.worldSize >= 10000 ? 900 : null,
      showStrategicAgentsOnMinimap: false,
      strategicLayer: usesWarSimulator ? 'optional' : 'none'
    },
    command: {
      quickCommands: true,
      surface: 'radial',
      scale: getCommandScaleForMode(config)
    },
    teamRules: {
      ownershipModel: 'alliance',
      composition: config.factionMix ? 'alliance_mix' : 'single_faction',
      playableAlliances: [Alliance.BLUFOR, Alliance.OPFOR]
    }
  };
}

export function getPlayableAlliances(definition: GameModeDefinition): Alliance[] {
  const alliances = definition.policies.teamRules.playableAlliances;
  return alliances.length > 0
    ? [...alliances]
    : [Alliance.BLUFOR];
}

export function getFactionOptionsForAlliance(
  definition: GameModeDefinition,
  alliance: Alliance
): Faction[] {
  const configuredMix = definition.config.factionMix?.[alliance];
  if (Array.isArray(configuredMix) && configuredMix.length > 0) {
    return [...configuredMix];
  }

  return alliance === Alliance.BLUFOR
    ? [Faction.US]
    : [Faction.NVA];
}

export function resolveDefaultFactionForAlliance(
  definition: GameModeDefinition,
  alliance: Alliance
): Faction {
  return getFactionOptionsForAlliance(definition, alliance)[0] ?? Faction.US;
}

export function resolveLaunchSelection(
  definition: GameModeDefinition,
  selection?: Partial<Pick<GameLaunchSelection, 'alliance' | 'faction'>>
): Pick<GameLaunchSelection, 'alliance' | 'faction'> {
  const playableAlliances = getPlayableAlliances(definition);
  const alliance = selection?.alliance && playableAlliances.includes(selection.alliance)
    ? selection.alliance
    : playableAlliances[0] ?? Alliance.BLUFOR;
  const availableFactions = getFactionOptionsForAlliance(definition, alliance);
  const faction = selection?.faction && availableFactions.includes(selection.faction)
    ? selection.faction
    : resolveDefaultFactionForAlliance(definition, alliance);

  return { alliance, faction };
}

export function getGameModeDefinition(mode: GameMode): GameModeDefinition {
  const config = getGameModeConfig(mode);
  const policies = createBasePolicies(config);

  switch (mode) {
    case GameMode.TEAM_DEATHMATCH:
      policies.objective.kind = 'deathmatch';
      policies.objective.usesZones = false;
      policies.deploy.flow = 'standard';
      policies.respawn.allowControlledZoneSpawns = false;
      policies.respawn.initialSpawnRule = 'homebase';
      policies.respawn.fallbackRule = 'homebase';
      policies.command.scale = 'squad';
      break;
    case GameMode.OPEN_FRONTIER:
      policies.deploy.flow = 'frontier';
      policies.deploy.mapVariant = 'frontier';
      policies.command.scale = 'company';
      break;
    case GameMode.AI_SANDBOX:
      policies.objective.kind = 'sandbox';
      policies.objective.usesZones = false;
      policies.objective.usesTickets = false;
      policies.deploy.flow = 'sandbox';
      policies.respawn.allowControlledZoneSpawns = false;
      policies.respawn.initialSpawnRule = 'origin';
      policies.respawn.fallbackRule = 'homebase';
      policies.respawn.contactAssistStyle = 'none';
      policies.command.scale = 'squad';
      policies.mapIntel.tacticalRangeOverride = null;
      policies.mapIntel.strategicLayer = 'none';
      break;
    case GameMode.A_SHAU_VALLEY:
      policies.deploy.flow = 'air_assault';
      policies.command.scale = 'battalion';
      policies.mapIntel.strategicLayer = 'optional';
      break;
    case GameMode.ZONE_CONTROL:
    default:
      policies.deploy.flow = 'standard';
      policies.command.scale = 'platoon';
      break;
  }

  return {
    id: mode,
    config,
    policies
  };
}
