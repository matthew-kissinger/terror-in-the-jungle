// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Faction } from '../combat/types';
import { GroundVehicle, isM151ModelPath } from './GroundVehicle';
import {
  createM151Jeep,
  M151_SCENARIO_SPAWNS,
  spawnScenarioM151Jeeps,
} from './M151JeepSpawn';
import { VehicleManager } from './VehicleManager';

describe('GroundVehicle', () => {
  it('recognizes the M151 model path', () => {
    expect(isM151ModelPath('vehicles/ground/m151-jeep.glb')).toBe(true);
    expect(isM151ModelPath('vehicles/ground/m35-truck.glb')).toBe(false);
  });

  it('tracks M151 seats and occupant handoff behavior', () => {
    const object = new THREE.Object3D();
    object.position.set(10, 5, 20);
    const vehicle = new GroundVehicle('m151_1', object, Faction.US);

    expect(vehicle.category).toBe('ground');
    expect(vehicle.faction).toBe(Faction.US);
    expect(vehicle.hasFreeSeats('pilot')).toBe(true);

    expect(vehicle.enterVehicle('player', 'pilot')).toBe(0);
    expect(vehicle.getPilotId()).toBe('player');
    expect(vehicle.hasFreeSeats('pilot')).toBe(false);
    expect(vehicle.enterVehicle('rifleman', 'passenger')).toBe(1);
    expect(vehicle.getOccupant(1)).toBe('rifleman');

    const exit = vehicle.exitVehicle('player');
    expect(exit?.toArray()).toEqual([8, 5, 20]);
    expect(vehicle.getPilotId()).toBeNull();
  });

  it('exposes transform state from the placed object and disposes it from the scene', () => {
    const scene = new THREE.Scene();
    const object = new THREE.Object3D();
    object.position.set(4, 2, -6);
    object.rotation.y = Math.PI * 0.5;
    scene.add(object);

    const vehicle = new GroundVehicle('m151_2', object);

    expect(vehicle.getPosition().toArray()).toEqual([4, 2, -6]);
    expect(vehicle.getVelocity().length()).toBe(0);
    expect(vehicle.getHealthPercent()).toBe(1);
    expect(vehicle.getQuaternion().equals(object.quaternion)).toBe(true);

    vehicle.dispose();

    expect(scene.children).toHaveLength(0);
    expect(vehicle.isDestroyed()).toBe(true);
    expect(vehicle.getHealthPercent()).toBe(0);
  });

  it('applies damage to the M151 without removing the object from the scene', () => {
    const scene = new THREE.Scene();
    const object = new THREE.Object3D();
    scene.add(object);
    const vehicle = new GroundVehicle('motor_pool_small_m151', object, Faction.US);

    const first = vehicle.applyDamage(vehicle.getMaxHp() * 0.4, new THREE.Vector3());
    expect(first.destroyed).toBe(false);
    expect(vehicle.isDestroyed()).toBe(false);
    expect(vehicle.getHealthPercent()).toBeCloseTo(0.6, 5);
    expect(scene.children).toHaveLength(1);

    const second = vehicle.applyDamage(vehicle.getMaxHp(), new THREE.Vector3());
    expect(second.destroyed).toBe(true);
    expect(vehicle.isDestroyed()).toBe(true);
    expect(vehicle.getHealthPercent()).toBe(0);
    expect(scene.children).toHaveLength(1);
  });
});

describe('M151 scenario spawn', () => {
  it('registers a procedural M151 with the VehicleManager and attaches it to the scene', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const { jeep, root } = createM151Jeep(scene, vm, {
      vehicleId: 'm151_test',
      position: new THREE.Vector3(10, 0, 20),
      faction: Faction.US,
      initialYaw: Math.PI * 0.5,
    });

    expect(scene.children).toContain(root);
    expect(jeep.category).toBe('ground');
    expect(jeep.faction).toBe(Faction.US);
    expect(vm.getVehicle('m151_test')).toBe(jeep);
  });

  it('spawn table covers Open Frontier and A Shau with stable M151 ids', () => {
    expect(M151_SCENARIO_SPAWNS.open_frontier.vehicleId).toContain('m151');
    expect(M151_SCENARIO_SPAWNS.a_shau_valley.vehicleId).toContain('m151');
    expect(M151_SCENARIO_SPAWNS.open_frontier.vehicleId)
      .not.toBe(M151_SCENARIO_SPAWNS.a_shau_valley.vehicleId);
    expect(M151_SCENARIO_SPAWNS.open_frontier.faction).toBe(Faction.US);
    expect(M151_SCENARIO_SPAWNS.a_shau_valley.faction).toBe(Faction.US);
  });

  it('places the Open Frontier M151 inside the main motor-pool footprint', () => {
    const motorPoolAnchor = { x: 155, z: -1195 };
    const motorPoolRadius = 36;
    const spawn = M151_SCENARIO_SPAWNS.open_frontier.position;
    expect(Math.hypot(spawn.x - motorPoolAnchor.x, spawn.z - motorPoolAnchor.z))
      .toBeLessThanOrEqual(motorPoolRadius);
  });

  it('spawnScenarioM151Jeeps registers both supported modes', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const spawned = spawnScenarioM151Jeeps({
      modes: ['open_frontier', 'a_shau_valley'],
      scene,
      vehicleManager: vm,
    });

    expect(spawned).toHaveLength(2);
    expect(vm.getVehicle(M151_SCENARIO_SPAWNS.open_frontier.vehicleId)).toBeTruthy();
    expect(vm.getVehicle(M151_SCENARIO_SPAWNS.a_shau_valley.vehicleId)).toBeTruthy();
  });

  it('honours an optional resolvePosition terrain-snap callback', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const snapped = new THREE.Vector3(123, 7.5, 456);

    spawnScenarioM151Jeeps({
      modes: ['open_frontier'],
      scene,
      vehicleManager: vm,
      resolvePosition: () => snapped,
    });

    const jeep = vm.getVehicle(M151_SCENARIO_SPAWNS.open_frontier.vehicleId)!;
    expect(jeep.getPosition().x).toBeCloseTo(snapped.x, 2);
    expect(jeep.getPosition().z).toBeCloseTo(snapped.z, 2);
  });
});
