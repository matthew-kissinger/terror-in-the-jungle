// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GrenadeType } from '../combat/types';
import { Grenade, GrenadePhysics } from './GrenadePhysics';

function createGrenade(position: THREE.Vector3, velocity: THREE.Vector3): Grenade {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 8),
    new THREE.MeshBasicMaterial()
  );
  mesh.position.copy(position);

  return {
    id: 'grenade_test',
    type: GrenadeType.FRAG,
    position: position.clone(),
    velocity: velocity.clone(),
    rotation: new THREE.Vector3(),
    rotationVelocity: new THREE.Vector3(1, 2, 3),
    mesh,
    fuseTime: 1,
    isActive: true,
  };
}

describe('GrenadePhysics', () => {
  it('advances airborne grenades with gravity, air resistance, and rotation', () => {
    const physics = new GrenadePhysics(-10, 0.5, 0.4, 0.7, 1.0);
    const grenade = createGrenade(
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(2, 4, 6)
    );

    physics.updateGrenade(grenade, 0.1, () => -100);

    expect(grenade.velocity.x).toBeCloseTo(1);
    expect(grenade.velocity.y).toBeCloseTo(1.5);
    expect(grenade.velocity.z).toBeCloseTo(3);
    expect(grenade.position.x).toBeCloseTo(0.1);
    expect(grenade.position.y).toBeCloseTo(10.15);
    expect(grenade.position.z).toBeCloseTo(0.3);
    expect(grenade.rotation.x).toBeCloseTo(0.1);
    expect(grenade.rotation.y).toBeCloseTo(0.2);
    expect(grenade.rotation.z).toBeCloseTo(0.3);
    expect(grenade.mesh.position.x).toBeCloseTo(grenade.position.x);
    expect(grenade.mesh.position.y).toBeCloseTo(grenade.position.y);
    expect(grenade.mesh.position.z).toBeCloseTo(grenade.position.z);
  });

  it('bounces fast impacts at ground height with surface friction', () => {
    const physics = new GrenadePhysics(0, 1, 0.4, 0.7, 1.0);
    const grenade = createGrenade(
      new THREE.Vector3(0, 0.31, 0),
      new THREE.Vector3(2, -5, 0)
    );

    physics.updateGrenade(grenade, 0.1, () => 0);

    expect(grenade.position.y).toBeCloseTo(0.3);
    expect(grenade.velocity.x).toBeCloseTo(2 * (1 - 1.0 * 0.3));
    expect(grenade.velocity.y).toBeCloseTo(2);
    expect(grenade.velocity.z).toBeCloseTo(0);
    expect(grenade.mesh.position.y).toBeCloseTo(0.3);
    expect(grenade.mesh.rotation.x).toBeCloseTo(grenade.rotation.x);
    expect(grenade.mesh.rotation.y).toBeCloseTo(grenade.rotation.y);
    expect(grenade.mesh.rotation.z).toBeCloseTo(grenade.rotation.z);
  });
});
