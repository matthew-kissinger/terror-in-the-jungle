/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Faction } from '../../systems/combat/types';
import {
  updateVehicleMarkers,
  createVehicleMarkerState,
  type IVehicleMarkerQuery,
  type VehicleMarkerEntry,
  type VehicleMarkerState
} from './CompassVehicleMarkers';

function makeQuery(entries: VehicleMarkerEntry[]): IVehicleMarkerQuery {
  return {
    getVehicleMarkers: () => entries
  };
}

function makeCamera(position: THREE.Vector3): THREE.Camera {
  const cam = new THREE.PerspectiveCamera();
  cam.position.copy(position);
  return cam;
}

function makeEntry(
  id: string,
  category: VehicleMarkerEntry['category'],
  faction: Faction,
  pos: [number, number, number]
): VehicleMarkerEntry {
  return {
    vehicleId: id,
    category,
    faction,
    position: new THREE.Vector3(pos[0], pos[1], pos[2])
  };
}

describe('updateVehicleMarkers', () => {
  let container: HTMLDivElement;
  let state: VehicleMarkerState;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    state = createVehicleMarkerState();
  });

  it('shows at most one marker per drivable category (max 3 markers total)', () => {
    const camera = makeCamera(new THREE.Vector3(0, 2, 0));
    const query = makeQuery([
      makeEntry('m151_a', 'ground', Faction.US, [10, 0, 0]),
      makeEntry('m151_b', 'ground', Faction.US, [50, 0, 0]),
      makeEntry('m48_a', 'ground', Faction.US, [80, 0, 0]),
      makeEntry('sampan_a', 'watercraft', Faction.US, [20, 0, 0]),
      makeEntry('m2hb_a', 'emplacement', Faction.US, [30, 0, 0])
    ]);

    updateVehicleMarkers({
      camera,
      vehicleQuery: query,
      markersContainer: container,
      playerHeadingDegrees: 0,
      state
    });

    expect(state.markers.size).toBe(3);
    expect(state.markers.has('ground')).toBe(true);
    expect(state.markers.has('watercraft')).toBe(true);
    expect(state.markers.has('emplacement')).toBe(true);
  });

  it('picks the nearest vehicle within each category', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const query = makeQuery([
      makeEntry('m151_far', 'ground', Faction.US, [200, 0, 0]),
      makeEntry('m151_near', 'ground', Faction.US, [10, 0, 0])
    ]);

    updateVehicleMarkers({
      camera,
      vehicleQuery: query,
      markersContainer: container,
      playerHeadingDegrees: 0,
      state
    });

    const groundMarker = state.markers.get('ground');
    expect(groundMarker).toBeDefined();
    // Distance label reflects the nearer vehicle at 10m, not 200m.
    expect(groundMarker?.textContent).toContain('10m');
    expect(groundMarker?.textContent).not.toContain('200m');
  });

  it('skips aircraft and unknown categories', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const query: IVehicleMarkerQuery = {
      getVehicleMarkers: () => [
        // Cast through unknown so the test can assert filtering on
        // categories the runtime might emit but the compass ignores.
        { vehicleId: 'huey_a', category: 'helicopter', faction: Faction.US, position: new THREE.Vector3(10, 0, 0) } as unknown as VehicleMarkerEntry,
        { vehicleId: 'ac47_a', category: 'fixed_wing', faction: Faction.US, position: new THREE.Vector3(10, 0, 0) } as unknown as VehicleMarkerEntry
      ]
    };

    updateVehicleMarkers({
      camera,
      vehicleQuery: query,
      markersContainer: container,
      playerHeadingDegrees: 0,
      state
    });

    expect(state.markers.size).toBe(0);
    expect(container.children.length).toBe(0);
  });

  it('hides markers whose bearing falls outside the ±90° compass window', () => {
    // Heading convention (matches CompassZoneMarkers): a vehicle at +Z
    // resolves to bearing 0° via atan2(-x, z). With playerHeading=0,
    // a vehicle at -Z (180° bearing) is behind the player and gets
    // hidden by the ±90° visibility window.
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const query = makeQuery([
      makeEntry('m151_behind', 'ground', Faction.US, [0, 0, -50])
    ]);

    updateVehicleMarkers({
      camera,
      vehicleQuery: query,
      markersContainer: container,
      playerHeadingDegrees: 0,
      state
    });

    const marker = state.markers.get('ground');
    expect(marker).toBeDefined();
    expect(marker?.style.display).toBe('none');
  });

  it('shows a marker in-front-of the player as visible', () => {
    // With playerHeading=0 the "forward" direction is +Z in the
    // shared CompassZoneMarkers heading math (atan2(-x, z)).
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const query = makeQuery([
      makeEntry('m151_front', 'ground', Faction.US, [0, 0, 30])
    ]);

    updateVehicleMarkers({
      camera,
      vehicleQuery: query,
      markersContainer: container,
      playerHeadingDegrees: 0,
      state
    });

    const marker = state.markers.get('ground');
    expect(marker).toBeDefined();
    expect(marker?.style.display).toBe('flex');
  });

  it('removes stale markers when a category disappears from the query', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));

    updateVehicleMarkers({
      camera,
      vehicleQuery: makeQuery([
        makeEntry('m151_a', 'ground', Faction.US, [10, 0, 0]),
        makeEntry('sampan_a', 'watercraft', Faction.US, [10, 0, 0])
      ]),
      markersContainer: container,
      playerHeadingDegrees: 0,
      state
    });

    expect(state.markers.size).toBe(2);

    updateVehicleMarkers({
      camera,
      vehicleQuery: makeQuery([
        makeEntry('m151_a', 'ground', Faction.US, [10, 0, 0])
      ]),
      markersContainer: container,
      playerHeadingDegrees: 0,
      state
    });

    expect(state.markers.size).toBe(1);
    expect(state.markers.has('ground')).toBe(true);
    expect(state.markers.has('watercraft')).toBe(false);
    // DOM is cleaned up too — no orphaned watercraft node left behind.
    expect(container.querySelectorAll('.compass-marker-vehicle-watercraft').length).toBe(0);
  });

  it('clears markers entirely when the query returns no entries', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));

    updateVehicleMarkers({
      camera,
      vehicleQuery: makeQuery([
        makeEntry('m151_a', 'ground', Faction.US, [10, 0, 0])
      ]),
      markersContainer: container,
      playerHeadingDegrees: 0,
      state
    });
    expect(state.markers.size).toBe(1);

    updateVehicleMarkers({
      camera,
      vehicleQuery: makeQuery([]),
      markersContainer: container,
      playerHeadingDegrees: 0,
      state
    });

    expect(state.markers.size).toBe(0);
    expect(container.children.length).toBe(0);
  });

  it('color-codes US vehicles as friendly and NVA/VC as enemy', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const query = makeQuery([
      makeEntry('m151_us', 'ground', Faction.US, [0, 0, 10]),
      makeEntry('sampan_nva', 'watercraft', Faction.NVA, [0, 0, 10]),
      makeEntry('m2hb_vc', 'emplacement', Faction.VC, [0, 0, 10])
    ]);

    updateVehicleMarkers({
      camera,
      vehicleQuery: query,
      markersContainer: container,
      playerHeadingDegrees: 0,
      state
    });

    expect(state.markers.get('ground')?.className).toContain('friendly');
    expect(state.markers.get('watercraft')?.className).toContain('enemy');
    expect(state.markers.get('emplacement')?.className).toContain('enemy');
  });

  it('shows distance in meters under 1km and in km above', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const query = makeQuery([
      makeEntry('m151_near', 'ground', Faction.US, [0, 0, 42]),
      makeEntry('sampan_far', 'watercraft', Faction.US, [0, 0, 1500])
    ]);

    updateVehicleMarkers({
      camera,
      vehicleQuery: query,
      markersContainer: container,
      playerHeadingDegrees: 0,
      state
    });

    expect(state.markers.get('ground')?.textContent).toContain('42m');
    expect(state.markers.get('watercraft')?.textContent).toContain('1.5km');
  });
});
