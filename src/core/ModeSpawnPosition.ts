import * as THREE from 'three';
import type { GameModeDefinition, ZoneConfig } from '../config/gameModeTypes';
import { resolveInitialSpawnPosition } from '../systems/world/runtime/ModeSpawnResolver';
import { Alliance, Faction } from '../systems/combat/types';

function getPrimaryAllianceBase(
  definition: GameModeDefinition,
  alliance: Alliance
): ZoneConfig | undefined {
  const expectedOwner = alliance === Alliance.BLUFOR ? Faction.US : Faction.NVA;
  const canonicalBaseId = alliance === Alliance.BLUFOR ? 'us_base' : 'opfor_base';
  return definition.config.zones.find(
    z => z.isHomeBase && z.owner === expectedOwner && (z.id.includes('main') || z.id === canonicalBaseId)
  ) ?? definition.config.zones.find(
    z => z.isHomeBase
      && z.owner !== null
      && (
        alliance === Alliance.BLUFOR
          ? z.owner === Faction.US || z.owner === Faction.ARVN
          : z.owner === Faction.NVA || z.owner === Faction.VC
      )
  );
}

export function resolveModeSpawnPosition(
  definition: GameModeDefinition,
  alliance: Alliance = Alliance.BLUFOR
): THREE.Vector3 {
  const policySpawn = resolveInitialSpawnPosition(definition, alliance);
  if (policySpawn) {
    return policySpawn;
  }

  return getPrimaryAllianceBase(definition, alliance)?.position.clone() ?? new THREE.Vector3(0, 0, -50);
}
