// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { Faction } from '../../systems/combat/types';
import type { IVehicle } from '../../systems/vehicle/IVehicle';

export type VehicleMarkerCategory = 'ground' | 'watercraft' | 'emplacement';

export type VehicleMarker = {
  worldPos: THREE.Vector3;
  category: VehicleMarkerCategory;
  faction: Faction;
  vehicleType: string;
};

export interface VehicleMarkerSource {
  getVehiclesByCategory(category: VehicleMarkerCategory): readonly IVehicle[];
  forEachVehicleByCategory?(
    category: VehicleMarkerCategory,
    visitor: (vehicle: IVehicle) => void,
  ): void;
}

export const VEHICLE_MARKER_CATEGORIES: ReadonlyArray<VehicleMarkerCategory> = [
  'ground',
  'watercraft',
  'emplacement',
];

export function refreshVehicleMarkersFromSource(
  markers: VehicleMarker[],
  source: VehicleMarkerSource,
): void {
  let count = 0;

  for (const category of VEHICLE_MARKER_CATEGORIES) {
    if (source.forEachVehicleByCategory) {
      source.forEachVehicleByCategory(category, (vehicle) => {
        count = writeVehicleMarker(markers, count, category, vehicle);
      });
      continue;
    }

    const vehicles = source.getVehiclesByCategory(category);
    for (const vehicle of vehicles) {
      count = writeVehicleMarker(markers, count, category, vehicle);
    }
  }

  markers.length = count;
}

function writeVehicleMarker(
  markers: VehicleMarker[],
  index: number,
  category: VehicleMarkerCategory,
  vehicle: IVehicle,
): number {
  if (vehicle.isDestroyed()) return index;

  let marker = markers[index];
  if (!marker) {
    marker = {
      worldPos: new THREE.Vector3(),
      category,
      faction: vehicle.faction,
      vehicleType: vehicle.vehicleId,
    };
    markers[index] = marker;
  }

  marker.worldPos.copy(vehicle.getPosition());
  marker.category = category;
  marker.faction = vehicle.faction;
  marker.vehicleType = vehicle.vehicleId;
  return index + 1;
}
