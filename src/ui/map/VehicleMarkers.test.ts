// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Faction } from '../../systems/combat/types';
import type { IVehicle, VehicleCategory } from '../../systems/vehicle/IVehicle';
import {
  refreshVehicleMarkersFromSource,
  type VehicleMarker,
  type VehicleMarkerCategory,
  type VehicleMarkerSource,
} from './VehicleMarkers';

function makeVehicle(opts: {
  id: string;
  category: VehicleCategory;
  faction: Faction;
  position: THREE.Vector3;
  destroyed?: boolean;
}): IVehicle {
  return {
    vehicleId: opts.id,
    category: opts.category,
    faction: opts.faction,
    getSeats: () => [],
    enterVehicle: () => null,
    exitVehicle: () => null,
    getOccupant: () => null,
    getPilotId: () => null,
    hasFreeSeats: () => false,
    getPosition: () => opts.position,
    getQuaternion: () => new THREE.Quaternion(),
    getVelocity: () => new THREE.Vector3(),
    isDestroyed: () => opts.destroyed === true,
    getHealthPercent: () => 1,
    update: () => undefined,
    dispose: () => undefined,
  };
}

class StubVehicleSource implements VehicleMarkerSource {
  ground: IVehicle[] = [];
  watercraft: IVehicle[] = [];
  emplacement: IVehicle[] = [];

  getVehiclesByCategory(category: VehicleMarkerCategory): readonly IVehicle[] {
    switch (category) {
      case 'ground': return this.ground;
      case 'watercraft': return this.watercraft;
      case 'emplacement': return this.emplacement;
    }
  }
}

class IteratorVehicleSource extends StubVehicleSource {
  getVehiclesByCategory(_category: VehicleMarkerCategory): readonly IVehicle[] {
    throw new Error('getVehiclesByCategory should not be used when forEachVehicleByCategory is available');
  }

  forEachVehicleByCategory(
    category: VehicleMarkerCategory,
    visitor: (vehicle: IVehicle) => void,
  ): void {
    const vehicles = category === 'ground'
      ? this.ground
      : category === 'watercraft'
        ? this.watercraft
        : this.emplacement;
    for (const vehicle of vehicles) {
      visitor(vehicle);
    }
  }
}

describe('refreshVehicleMarkersFromSource', () => {
  it('builds map markers in shared category order and skips destroyed vehicles', () => {
    const source = new StubVehicleSource();
    source.watercraft.push(makeVehicle({
      id: 'sampan_a',
      category: 'watercraft',
      faction: Faction.NVA,
      position: new THREE.Vector3(0, 0, 10),
    }));
    source.ground.push(
      makeVehicle({
        id: 'm151_wreck',
        category: 'ground',
        faction: Faction.US,
        position: new THREE.Vector3(5, 0, 0),
        destroyed: true,
      }),
      makeVehicle({
        id: 'm48_a',
        category: 'ground',
        faction: Faction.US,
        position: new THREE.Vector3(15, 0, 0),
      }),
    );

    const markers: VehicleMarker[] = [];
    refreshVehicleMarkersFromSource(markers, source);

    expect(markers.map(marker => [marker.vehicleType, marker.category])).toEqual([
      ['m48_a', 'ground'],
      ['sampan_a', 'watercraft'],
    ]);
  });

  it('reuses marker and position objects across source-driven refreshes', () => {
    const source = new StubVehicleSource();
    const sourcePosition = new THREE.Vector3(10, 1, -5);
    source.ground.push(makeVehicle({
      id: 'm151_alpha',
      category: 'ground',
      faction: Faction.US,
      position: sourcePosition,
    }));

    const markers: VehicleMarker[] = [];
    refreshVehicleMarkersFromSource(markers, source);
    const marker = markers[0];
    const markerPosition = marker.worldPos;

    expect(marker.worldPos).not.toBe(sourcePosition);
    expect(marker.worldPos.toArray()).toEqual([10, 1, -5]);

    sourcePosition.set(20, 2, -15);
    refreshVehicleMarkersFromSource(markers, source);

    expect(markers[0]).toBe(marker);
    expect(markers[0].worldPos).toBe(markerPosition);
    expect(markers[0].worldPos.toArray()).toEqual([20, 2, -15]);
  });

  it('compacts stale markers in place when a source shrinks', () => {
    const source = new StubVehicleSource();
    source.ground.push(
      makeVehicle({
        id: 'm151_a',
        category: 'ground',
        faction: Faction.US,
        position: new THREE.Vector3(1, 0, 0),
      }),
      makeVehicle({
        id: 'm151_b',
        category: 'ground',
        faction: Faction.US,
        position: new THREE.Vector3(2, 0, 0),
      }),
    );

    const markers: VehicleMarker[] = [];
    refreshVehicleMarkersFromSource(markers, source);
    const firstMarker = markers[0];

    source.ground.shift();
    refreshVehicleMarkersFromSource(markers, source);

    expect(markers).toHaveLength(1);
    expect(markers[0]).toBe(firstMarker);
    expect(markers[0].vehicleType).toBe('m151_b');
    expect(markers[0].worldPos.toArray()).toEqual([2, 0, 0]);
  });

  it('uses the allocation-free category iterator when the source exposes one', () => {
    const source = new IteratorVehicleSource();
    source.ground.push(makeVehicle({
      id: 'm151_alpha',
      category: 'ground',
      faction: Faction.US,
      position: new THREE.Vector3(10, 0, 0),
    }));
    source.emplacement.push(makeVehicle({
      id: 'm2hb_alpha',
      category: 'emplacement',
      faction: Faction.NVA,
      position: new THREE.Vector3(-10, 0, 0),
    }));

    const markers: VehicleMarker[] = [];
    refreshVehicleMarkersFromSource(markers, source);

    expect(markers.map(marker => [marker.vehicleType, marker.category])).toEqual([
      ['m151_alpha', 'ground'],
      ['m2hb_alpha', 'emplacement'],
    ]);
  });
});
