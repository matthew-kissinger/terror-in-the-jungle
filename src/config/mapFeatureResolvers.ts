import * as THREE from 'three';
import type { GameModeConfig, HelipadMapFeature } from './gameModeTypes';

export interface ResolvedHelipadFeature {
  id: string;
  position: THREE.Vector3;
  aircraft: string;
  preparedTerrain: boolean;
}

export function getConfiguredHelipads(config: GameModeConfig): ResolvedHelipadFeature[] {
  const featureHelipads = (config.features ?? [])
    .filter((feature): feature is HelipadMapFeature => feature.kind === 'helipad')
    .map((feature) => ({
      id: feature.id,
      position: feature.position.clone(),
      aircraft: feature.aircraft,
      preparedTerrain: feature.terrain?.flatten === true,
    }));

  if (featureHelipads.length > 0) {
    return featureHelipads;
  }

  return (config.helipads ?? []).map((helipad) => ({
    id: helipad.id,
    position: helipad.position.clone(),
    aircraft: helipad.aircraft,
    preparedTerrain: false,
  }));
}
