// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeFixedWingConvergencePoint,
  computeFixedWingShot,
  getFixedWingCameraFit,
  getFixedWingWeaponConfig,
} from './FixedWingArmament';

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

describe('FixedWingArmament — per-airframe camera fit', () => {
  it('gives each airframe its own chase feel (distance / height differ)', () => {
    const a1 = getFixedWingCameraFit('A1_SKYRAIDER');
    const f4 = getFixedWingCameraFit('F4_PHANTOM');
    const ac47 = getFixedWingCameraFit('AC47_SPOOKY');

    // Distinct chase distances; the gunship sits the widest, the agile prop the
    // closest, so each craft frames differently.
    const distances = new Set([a1.chaseDistance, f4.chaseDistance, ac47.chaseDistance]);
    expect(distances.size).toBe(3);
    expect(a1.chaseDistance).toBeLessThan(f4.chaseDistance);
    expect(f4.chaseDistance).toBeLessThan(ac47.chaseDistance);
    expect(ac47.chaseHeight).toBeGreaterThan(a1.chaseHeight);

    // Every airframe boresights its reticle at a positive reference range.
    expect(a1.sightConvergenceRange).toBeGreaterThan(0);
    expect(f4.sightConvergenceRange).toBeGreaterThan(0);
    expect(ac47.sightConvergenceRange).toBeGreaterThan(0);
  });

  it('only the AC-47 carries a broadside gunner view', () => {
    expect(getFixedWingCameraFit('A1_SKYRAIDER').broadside).toBeUndefined();
    expect(getFixedWingCameraFit('F4_PHANTOM').broadside).toBeUndefined();

    const broadside = getFixedWingCameraFit('AC47_SPOOKY').broadside;
    expect(broadside).toBeDefined();
    // The gunner camera sits off the side and above the airframe.
    expect(broadside!.lateralOffset).toBeGreaterThan(0);
    expect(broadside!.heightOffset).toBeGreaterThan(0);
  });

  it('falls back to a forward-firing fit for an unknown airframe', () => {
    const fallback = getFixedWingCameraFit(null);
    const unknown = getFixedWingCameraFit('NOT_A_PLANE');
    expect(fallback.chaseDistance).toBeGreaterThan(0);
    expect(unknown.chaseDistance).toBeGreaterThan(0);
    // No broadside on the fallback (forward guns only).
    expect(fallback.broadside).toBeUndefined();
  });
});

describe('FixedWingArmament — gun convergence point (reticle boresight)', () => {
  const identity = new THREE.Quaternion();

  it('places the A-1 and F-4 convergence ahead of the nose', () => {
    for (const key of ['A1_SKYRAIDER', 'F4_PHANTOM']) {
      const weapon = getFixedWingWeaponConfig(key);
      const range = getFixedWingCameraFit(key).sightConvergenceRange;
      const position = new THREE.Vector3(100, 200, 300);
      const out = new THREE.Vector3();
      computeFixedWingConvergencePoint(weapon, position, identity, range, out);

      // Forward is -Z: the convergence sits far in front of the aircraft.
      const toPoint = out.clone().sub(position);
      expect(toPoint.z).toBeLessThan(-range * 0.9);
      // Roughly along the forward axis (small lateral/vertical offset only).
      expect(Math.abs(toPoint.x)).toBeLessThan(range * 0.1);
    }
  });

  it('places the AC-47 convergence out to the aircraft left, not ahead', () => {
    const weapon = getFixedWingWeaponConfig('AC47_SPOOKY');
    const range = getFixedWingCameraFit('AC47_SPOOKY').sightConvergenceRange;
    const position = new THREE.Vector3(0, 100, 0);
    const out = new THREE.Vector3();
    computeFixedWingConvergencePoint(weapon, position, identity, range, out);

    // Left is -X in world; the broadside convergence is far to the left and not
    // appreciably forward of the nose.
    const toPoint = out.clone().sub(position);
    expect(toPoint.x).toBeLessThan(-range * 0.9);
    expect(Math.abs(toPoint.z)).toBeLessThan(range * 0.1);
  });

  it('rotates the convergence point with the airframe heading', () => {
    const weapon = getFixedWingWeaponConfig('A1_SKYRAIDER');
    const range = getFixedWingCameraFit('A1_SKYRAIDER').sightConvergenceRange;
    const position = new THREE.Vector3();
    const yawed = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 90 * RAD);

    const straight = new THREE.Vector3();
    const turned = new THREE.Vector3();
    computeFixedWingConvergencePoint(weapon, position, identity, range, straight);
    computeFixedWingConvergencePoint(weapon, position, yawed, range, turned);

    // The convergence follows the nose as it turns (it is not world-fixed).
    expect(straight.distanceTo(turned)).toBeGreaterThan(range);
  });
});
