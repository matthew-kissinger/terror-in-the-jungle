/**
 * Tank IVehicle behavior tests.
 *
 * Authoritative scope: docs/rearch/TANK_SYSTEMS_2026-05-13.md
 * Task brief: docs/tasks/cycle-vekhikl-3-tank-chassis.md (R2 — m48-tank-integration)
 *
 * L2 (one system + scene mocks) per docs/TESTING.md. Assertions are
 * behavior-driven: we observe that the chassis moves when commanded and
 * stays put when not, that the seat API admits and ejects occupants,
 * and that the scenario spawn registers tanks at distinct positions for
 * the two scenarios the cycle ships against (Open Frontier + A Shau).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Tank } from './Tank';
import { VehicleManager } from './VehicleManager';
import { createM48Tank, spawnScenarioM48Tanks, M48_SCENARIO_SPAWNS } from './M48TankSpawn';
import { Faction } from '../combat/types';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

function makeFlatTerrain(height = 0): ITerrainRuntime {
  return {
    getHeightAt: () => height,
    getEffectiveHeightAt: () => height,
    getSlopeAt: () => 0,
    getNormalAt: (_x, _z, target) => {
      const v = target ?? new THREE.Vector3();
      return v.set(0, 1, 0);
    },
    getPlayableWorldSize: () => 4000,
    getWorldSize: () => 4000,
    isTerrainReady: () => true,
    hasTerrainAt: () => true,
    getActiveTerrainTileCount: () => 1,
    setSurfaceWetness: () => {},
    updatePlayerPosition: () => {},
    registerCollisionObject: () => {},
    unregisterCollisionObject: () => {},
    raycastTerrain: () => ({ hit: false }),
  };
}

describe('Tank IVehicle', () => {
  describe('IVehicle surface', () => {
    it('reports the ground category and the configured faction', () => {
      const object = new THREE.Object3D();
      const tank = new Tank('t1', object, Faction.US);
      expect(tank.category).toBe('ground');
      expect(tank.faction).toBe(Faction.US);
    });

    it('seeds physics from the placed object so first update does not snap to origin', () => {
      const object = new THREE.Object3D();
      object.position.set(50, 1.5, -30);
      const scene = new THREE.Scene();
      scene.add(object);

      const tank = new Tank('t_seeded', object, Faction.US);
      tank.setTerrain(makeFlatTerrain(0));

      // One step with no control input — chassis should remain near the
      // seeded XZ anchor (terrain conform settles Y to axleOffset above
      // the flat surface, so XZ is the meaningful invariant here).
      tank.update(0.05);
      const pos = tank.getPosition();
      expect(pos.x).toBeCloseTo(50, 1);
      expect(pos.z).toBeCloseTo(-30, 1);
    });
  });

  describe('Seating (IVehicle + ITankModel role API)', () => {
    it('admits a driver into the pilot seat and ejects them on exit', () => {
      const tank = new Tank('t_seat', new THREE.Object3D(), Faction.US);
      expect(tank.hasFreeSeats('pilot')).toBe(true);
      expect(tank.enterVehicle('player', 'pilot')).toBe(0);
      expect(tank.getPilotId()).toBe('player');
      expect(tank.hasFreeSeats('pilot')).toBe(false);

      const exit = tank.exitVehicle('player');
      expect(exit).not.toBeNull();
      expect(tank.getPilotId()).toBeNull();
    });

    it('exposes a gunner seat the cycle #9 turret can mount onto', () => {
      const tank = new Tank('t_gun', new THREE.Object3D(), Faction.US);
      expect(tank.hasFreeSeats('gunner')).toBe(true);
      expect(tank.enterVehicle('npc_gunner_1', 'gunner')).not.toBeNull();
      expect(tank.hasFreeSeats('gunner')).toBe(false);
    });

    it('routes occupy / release by role for the TankPlayerAdapter (ITankModel shape)', () => {
      const tank = new Tank('t_role', new THREE.Object3D(), Faction.US);
      expect(tank.occupy('pilot', 'player')).toBe(true);
      expect(tank.getPilotId()).toBe('player');

      tank.release('pilot');
      expect(tank.getPilotId()).toBeNull();
      expect(tank.hasFreeSeats('pilot')).toBe(true);
    });
  });

  describe('Delegating to TrackedVehiclePhysics', () => {
    it('moves forward when the driver commands full throttle', () => {
      const scene = new THREE.Scene();
      const object = new THREE.Object3D();
      object.position.set(0, 1, 0);
      scene.add(object);

      const tank = new Tank('t_drive', object, Faction.US);
      tank.setTerrain(makeFlatTerrain(0));

      // Settle.
      for (let i = 0; i < 30; i += 1) tank.update(0.02);
      const startZ = tank.getPosition().z;

      // Forward throttle: -Z is chassis-forward in this engine.
      tank.setControls(1.0, 0, false);
      for (let i = 0; i < 180; i += 1) tank.update(0.02);

      const endZ = tank.getPosition().z;
      // Behavior: net forward translation. We don't pin the magnitude —
      // tuning constants in TrackedVehiclePhysics may change. -Z is
      // chassis-forward, so the integrated Z drops.
      expect(endZ).toBeLessThan(startZ - 1.0);
      // Forward speed (chassis-forward projection of velocity) is
      // positive when moving forward.
      expect(tank.getForwardSpeed()).toBeGreaterThan(0.5);
    });

    it('pivots in place when the driver commands pure turn', () => {
      const scene = new THREE.Scene();
      const object = new THREE.Object3D();
      object.position.set(0, 1, 0);
      scene.add(object);

      const tank = new Tank('t_pivot', object, Faction.US);
      tank.setTerrain(makeFlatTerrain(0));
      for (let i = 0; i < 30; i += 1) tank.update(0.02);

      const yawBefore = new THREE.Euler().setFromQuaternion(tank.getQuaternion(), 'YXZ').y;
      const posBefore = tank.getPosition().clone();

      tank.setControls(0, 1.0, false);
      for (let i = 0; i < 240; i += 1) tank.update(0.02);

      const yawAfter = new THREE.Euler().setFromQuaternion(tank.getQuaternion(), 'YXZ').y;
      const posAfter = tank.getPosition();

      // Yaw advanced.
      expect(Math.abs(yawAfter - yawBefore)).toBeGreaterThan(0.1);
      // Translation is small (in-place pivot characteristic).
      const horizontalDrift = Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z);
      expect(horizontalDrift).toBeLessThan(1.0);
    });

    it('respects tracks-blown immobilization by ignoring driver commands', () => {
      const scene = new THREE.Scene();
      const object = new THREE.Object3D();
      object.position.set(0, 1, 0);
      scene.add(object);

      const tank = new Tank('t_blown', object, Faction.US);
      tank.setTerrain(makeFlatTerrain(0));
      for (let i = 0; i < 30; i += 1) tank.update(0.02);

      tank.setTracksBlown(true);
      tank.setControls(1.0, 0, false);
      const startPos = tank.getPosition().clone();
      for (let i = 0; i < 240; i += 1) tank.update(0.02);
      const endPos = tank.getPosition();

      const horizontalDrift = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
      expect(horizontalDrift).toBeLessThan(0.5);
    });
  });

  describe('Lifecycle', () => {
    it('disposes by removing the scene object and marking destroyed', () => {
      const scene = new THREE.Scene();
      const object = new THREE.Object3D();
      scene.add(object);
      const tank = new Tank('t_dispose', object, Faction.US);

      expect(scene.children).toContain(object);
      tank.dispose();

      expect(scene.children).not.toContain(object);
      expect(tank.isDestroyed()).toBe(true);
      expect(tank.getHealthPercent()).toBe(0);
    });

    it('is a no-op when update is called after dispose', () => {
      const tank = new Tank('t_post_dispose', new THREE.Object3D(), Faction.US);
      tank.dispose();
      // Should not throw.
      tank.update(0.016);
      expect(tank.isDestroyed()).toBe(true);
    });
  });
});

describe('M48 scenario spawn', () => {
  it('registers an M48 with the VehicleManager and attaches the procedural mesh to the scene', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const { tank, root } = createM48Tank(scene, vm, {
      vehicleId: 'm48_test',
      position: new THREE.Vector3(10, 0, 20),
      faction: Faction.US,
    });

    expect(scene.children).toContain(root);
    expect(tank.category).toBe('ground');
    expect(tank.faction).toBe(Faction.US);
    expect(vm.getVehicle('m48_test')).toBe(tank);
  });

  it('spawn table covers Open Frontier and A Shau with distinct vehicle ids', () => {
    expect(M48_SCENARIO_SPAWNS.open_frontier.vehicleId)
      .not.toBe(M48_SCENARIO_SPAWNS.a_shau_valley.vehicleId);
    expect(M48_SCENARIO_SPAWNS.open_frontier.faction).toBe(Faction.US);
    expect(M48_SCENARIO_SPAWNS.a_shau_valley.faction).toBe(Faction.US);
  });

  it('spawnScenarioM48Tanks registers both modes when both are requested', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const spawned = spawnScenarioM48Tanks({
      modes: ['open_frontier', 'a_shau_valley'],
      scene,
      vehicleManager: vm,
    });

    expect(spawned).toHaveLength(2);
    // Both should be registered ground-category vehicles.
    const ground = vm.getVehiclesByCategory('ground');
    expect(ground).toHaveLength(2);
  });

  it('spawns at the table positions when no resolver is supplied', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    spawnScenarioM48Tanks({
      modes: ['open_frontier', 'a_shau_valley'],
      scene,
      vehicleManager: vm,
    });

    const ofTank = vm.getVehicle(M48_SCENARIO_SPAWNS.open_frontier.vehicleId)!;
    const ashauTank = vm.getVehicle(M48_SCENARIO_SPAWNS.a_shau_valley.vehicleId)!;
    expect(ofTank.getPosition().x).toBeCloseTo(M48_SCENARIO_SPAWNS.open_frontier.position.x, 2);
    expect(ofTank.getPosition().z).toBeCloseTo(M48_SCENARIO_SPAWNS.open_frontier.position.z, 2);
    expect(ashauTank.getPosition().x).toBeCloseTo(M48_SCENARIO_SPAWNS.a_shau_valley.position.x, 2);
    expect(ashauTank.getPosition().z).toBeCloseTo(M48_SCENARIO_SPAWNS.a_shau_valley.position.z, 2);
  });

  it('honours an optional resolvePosition (terrain-snap callback)', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const snapped = new THREE.Vector3(123, 7.5, 456);
    spawnScenarioM48Tanks({
      modes: ['open_frontier'],
      scene,
      vehicleManager: vm,
      resolvePosition: () => snapped,
    });

    const tank = vm.getVehicle(M48_SCENARIO_SPAWNS.open_frontier.vehicleId)!;
    expect(tank.getPosition().x).toBeCloseTo(snapped.x, 2);
    expect(tank.getPosition().z).toBeCloseTo(snapped.z, 2);
  });
});

describe('VehicleManager.spawnScenarioM48Tanks surface', () => {
  it('registers M48 tanks through the VehicleManager pass-through method', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const ids = vm.spawnScenarioM48Tanks({
      scene,
      modes: ['open_frontier', 'a_shau_valley'],
    });

    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(vm.getVehicle(id)?.category).toBe('ground');
    }
  });

  it('answers getTankByOccupant only when the seated vehicle is a Tank', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const { tank } = createM48Tank(scene, vm, {
      vehicleId: 'm48_occupant',
      position: new THREE.Vector3(),
      faction: Faction.US,
    });
    tank.enterVehicle('player', 'pilot');

    expect(vm.getTankByOccupant('player')).toBe(tank);
    expect(vm.getTankByOccupant('not_seated')).toBeNull();
  });
});
