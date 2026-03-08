import * as THREE from 'three';

export type RespawnSpawnPointKind =
  | 'default'
  | 'home_base'
  | 'zone'
  | 'helipad'
  | 'insertion';

export type RespawnSpawnSelectionClass =
  | 'default'
  | 'home_base'
  | 'nearest_controlled_zone'
  | 'helipad'
  | 'direct_insertion';

export interface RespawnSpawnPoint {
  id: string;
  name: string;
  position: THREE.Vector3;
  safe: boolean;
  kind: RespawnSpawnPointKind;
  selectionClass: RespawnSpawnSelectionClass;
  sourceZoneId?: string;
  priority?: number;
}
