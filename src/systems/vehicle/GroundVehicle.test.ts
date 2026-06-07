// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Faction } from '../combat/types';
import { GroundVehicle, isM151ModelPath } from './GroundVehicle';

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
