// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeFixedWingShot, getFixedWingWeaponConfig } from './FixedWingArmament';

const RAD = Math.PI / 180;

/** Angle in degrees between two (assumed-normalized) directions. */
function angleDeg(a: THREE.Vector3, b: THREE.Vector3): number {
  return (Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) * 180) / Math.PI;
}

describe('FixedWingArmament — per-airframe weapon table', () => {
  it('gives each airframe its own named weapon', () => {
    const a1 = getFixedWingWeaponConfig('A1_SKYRAIDER');
    const f4 = getFixedWingWeaponConfig('F4_PHANTOM');
    const ac47 = getFixedWingWeaponConfig('AC47_SPOOKY');

    // Three distinct armaments, not one shared gun.
    const names = new Set([a1.name, f4.name, ac47.name]);
    expect(names.size).toBe(3);
    expect(a1.name.length).toBeGreaterThan(0);
    expect(f4.name.length).toBeGreaterThan(0);
    expect(ac47.name.length).toBeGreaterThan(0);
  });

  it('gives each airframe its own magazine size', () => {
    const a1 = getFixedWingWeaponConfig('A1_SKYRAIDER').ammoCapacity;
    const f4 = getFixedWingWeaponConfig('F4_PHANTOM').ammoCapacity;
    const ac47 = getFixedWingWeaponConfig('AC47_SPOOKY').ammoCapacity;

    // All positive and the AC-47's gunship battery carries the most rounds.
    expect(a1).toBeGreaterThan(0);
    expect(f4).toBeGreaterThan(0);
    expect(ac47).toBeGreaterThan(0);
    expect(ac47).toBeGreaterThan(a1);
    expect(ac47).toBeGreaterThan(f4);
  });

  it('falls back to a forward-firing gun for an unknown airframe', () => {
    const fallback = getFixedWingWeaponConfig(null);
    const unknown = getFixedWingWeaponConfig('NOT_A_PLANE');
    expect(fallback.ammoCapacity).toBeGreaterThan(0);
    expect(unknown.ammoCapacity).toBeGreaterThan(0);

    // The fallback fires forward (the muzzle clears the nose ahead of the craft).
    const muzzle = new THREE.Vector3();
    const dir = new THREE.Vector3();
    computeFixedWingShot(fallback, new THREE.Vector3(), new THREE.Quaternion(), 0, muzzle, dir);
    expect(angleDeg(dir, new THREE.Vector3(0, 0, -1))).toBeLessThan(15);
  });

  describe('fire direction (airframe identity)', () => {
    // World-aligned aircraft: physics forward is -Z, left is +X.
    const identity = new THREE.Quaternion();
    const origin = new THREE.Vector3();

    it('the A-1 and F-4 fire forward off the nose', () => {
      for (const key of ['A1_SKYRAIDER', 'F4_PHANTOM']) {
        const config = getFixedWingWeaponConfig(key);
        const dir = new THREE.Vector3();
        const muzzle = new THREE.Vector3();
        computeFixedWingShot(config, origin, identity, 0, muzzle, dir);
        // Within a few degrees of the forward axis.
        expect(angleDeg(dir, new THREE.Vector3(0, 0, -1))).toBeLessThan(5);
      }
    });

    it('the AC-47 fires broadside ~90 degrees to the LEFT of the nose', () => {
      const config = getFixedWingWeaponConfig('AC47_SPOOKY');
      const dir = new THREE.Vector3();
      const muzzle = new THREE.Vector3();
      computeFixedWingShot(config, origin, identity, 0, muzzle, dir);

      const forward = new THREE.Vector3(0, 0, -1);
      const left = new THREE.Vector3(-1, 0, 0); // +X is right; left is -X in world

      // The broadside fire is perpendicular to the nose (roughly 90 degrees off
      // forward) and points to the aircraft's left, not its right.
      expect(angleDeg(dir, forward)).toBeGreaterThan(80);
      expect(angleDeg(dir, forward)).toBeLessThan(100);
      expect(angleDeg(dir, left)).toBeLessThan(5);
    });

    it('broadside direction rotates with the airframe heading', () => {
      // Yaw the aircraft so its nose and left side reorient; the broadside fire
      // must follow the airframe's left axis, not stay world-fixed.
      const yawed = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        90 * RAD,
      );
      const config = getFixedWingWeaponConfig('AC47_SPOOKY');
      const dir = new THREE.Vector3();
      const muzzle = new THREE.Vector3();
      computeFixedWingShot(config, origin, yawed, 0, muzzle, dir);

      // The fire axis is the aircraft's left (local -X) rotated by the yaw.
      const expectedLeft = new THREE.Vector3(-1, 0, 0).applyQuaternion(yawed);
      expect(angleDeg(dir, expectedLeft)).toBeLessThan(5);
      // And it is no longer the world-left it started at (heading changed it).
      expect(angleDeg(dir, new THREE.Vector3(-1, 0, 0))).toBeGreaterThan(80);
    });
  });

  it('round-robins across multiple barrels (paired/battery muzzles)', () => {
    const a1 = getFixedWingWeaponConfig('A1_SKYRAIDER');
    expect(a1.muzzles.length).toBeGreaterThan(1);

    const identity = new THREE.Quaternion();
    const origin = new THREE.Vector3();
    const m0 = new THREE.Vector3();
    const m1 = new THREE.Vector3();
    const dir = new THREE.Vector3();
    computeFixedWingShot(a1, origin, identity, 0, m0, dir);
    computeFixedWingShot(a1, origin, identity, 1, m1, dir);

    // Consecutive barrels fire from distinct muzzle origins.
    expect(m0.distanceTo(m1)).toBeGreaterThan(0.1);
  });
});
