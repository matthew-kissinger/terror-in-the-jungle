/**
 * @vitest-environment jsdom
 *
 * Behaviour tests for the minimap's vehicle-marker pipeline.
 *
 * What we care about (caller-visible behaviour):
 *  - When a vehicle source is injected, the minimap pulls fresh
 *    positions every tick so moving vehicles track on the minimap.
 *  - Destroyed vehicles drop out of the marker set.
 *  - Setting the source to undefined clears the marker list (the
 *    minimap should not retain stale vehicle ghosts when its source
 *    is torn down, e.g. game-mode change).
 *  - The explicit `setVehicleMarkers` setter bypasses the per-frame
 *    pull -- useful for callers without a VehicleManager handy.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MinimapSystem, type MinimapVehicleSource } from './MinimapSystem';
import { Faction } from '../../systems/combat/types';
import type { IVehicle, VehicleCategory } from '../../systems/vehicle/IVehicle';

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

class StubVehicleSource implements MinimapVehicleSource {
  ground: IVehicle[] = [];
  watercraft: IVehicle[] = [];
  emplacement: IVehicle[] = [];

  getVehiclesByCategory(category: 'ground' | 'watercraft' | 'emplacement'): readonly IVehicle[] {
    switch (category) {
      case 'ground': return this.ground;
      case 'watercraft': return this.watercraft;
      case 'emplacement': return this.emplacement;
    }
  }
}

function createSystem(): MinimapSystem {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 2, -1);
  return new MinimapSystem(camera);
}

/**
 * Pull the internal vehicle-marker list off the system for assertions.
 * We deliberately avoid hooking into MinimapRenderer here -- the
 * behaviour we care about is "the system tracks the right set of
 * vehicles", not "the renderer draws them" (renderer behaviour is
 * covered in `MinimapRenderer.test.ts`).
 */
function vehicleMarkers(system: MinimapSystem): Array<{ vehicleType: string; category: string }> {
  const internal = system as unknown as { vehicleMarkers?: Array<{ vehicleType: string; category: string }> };
  return (internal.vehicleMarkers ?? []).map(m => ({
    vehicleType: m.vehicleType,
    category: m.category,
  }));
}

describe('MinimapSystem vehicle markers', () => {
  it('pulls live vehicles from the source on each update', async () => {
    const system = createSystem();
    await system.init();
    const source = new StubVehicleSource();

    const jeep = makeVehicle({
      id: 'm151_alpha',
      category: 'ground',
      faction: Faction.US,
      position: new THREE.Vector3(10, 0, 0),
    });
    source.ground.push(jeep);

    system.setVehicleManager(source);
    system.update(1 / 60);

    expect(vehicleMarkers(system)).toEqual([
      { vehicleType: 'm151_alpha', category: 'ground' },
    ]);

    system.dispose();
  });

  it('reflects vehicle additions and removals between ticks', async () => {
    const system = createSystem();
    await system.init();
    const source = new StubVehicleSource();
    system.setVehicleManager(source);

    const sampan = makeVehicle({
      id: 'sampan_a',
      category: 'watercraft',
      faction: Faction.NVA,
      position: new THREE.Vector3(0, 0, 50),
    });
    source.watercraft.push(sampan);
    system.update(1 / 60);
    expect(vehicleMarkers(system)).toHaveLength(1);

    // Add a tank -- next tick should show both.
    const tank = makeVehicle({
      id: 'm48_a',
      category: 'ground',
      faction: Faction.US,
      position: new THREE.Vector3(20, 0, 30),
    });
    source.ground.push(tank);
    system.update(1 / 60);
    expect(vehicleMarkers(system)).toEqual(
      expect.arrayContaining([
        { vehicleType: 'sampan_a', category: 'watercraft' },
        { vehicleType: 'm48_a', category: 'ground' },
      ])
    );

    // Remove the sampan -- next tick should drop it.
    source.watercraft.length = 0;
    system.update(1 / 60);
    expect(vehicleMarkers(system)).toEqual([
      { vehicleType: 'm48_a', category: 'ground' },
    ]);

    system.dispose();
  });

  it('skips destroyed vehicles', async () => {
    const system = createSystem();
    await system.init();
    const source = new StubVehicleSource();

    source.ground.push(
      makeVehicle({
        id: 'm48_wreck',
        category: 'ground',
        faction: Faction.US,
        position: new THREE.Vector3(5, 0, 0),
        destroyed: true,
      }),
      makeVehicle({
        id: 'm151_running',
        category: 'ground',
        faction: Faction.US,
        position: new THREE.Vector3(-5, 0, 0),
      })
    );

    system.setVehicleManager(source);
    system.update(1 / 60);

    expect(vehicleMarkers(system)).toEqual([
      { vehicleType: 'm151_running', category: 'ground' },
    ]);

    system.dispose();
  });

  it('clears markers when the source is removed', async () => {
    const system = createSystem();
    await system.init();
    const source = new StubVehicleSource();
    source.emplacement.push(
      makeVehicle({
        id: 'm2hb_alpha',
        category: 'emplacement',
        faction: Faction.US,
        position: new THREE.Vector3(2, 0, 0),
      })
    );
    system.setVehicleManager(source);
    system.update(1 / 60);
    expect(vehicleMarkers(system)).toHaveLength(1);

    system.setVehicleManager(undefined);
    expect(vehicleMarkers(system)).toHaveLength(0);

    system.dispose();
  });

  it('setVehicleMarkers bypasses the per-frame pull', async () => {
    const system = createSystem();
    await system.init();

    system.setVehicleMarkers([
      {
        worldPos: new THREE.Vector3(1, 0, 1),
        category: 'ground',
        faction: Faction.US,
        vehicleType: 'replay_jeep',
      },
    ]);

    expect(vehicleMarkers(system)).toEqual([
      { vehicleType: 'replay_jeep', category: 'ground' },
    ]);

    system.dispose();
  });
});
