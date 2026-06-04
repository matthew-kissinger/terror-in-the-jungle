// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
  /**
   * Nearby-enemy count snapshot at deploy time, for the deploy list's threat
   * readout. 0 when the strategic WarSimulator is disabled (e.g. ZC / TDM).
   */
  threat?: number;
}
