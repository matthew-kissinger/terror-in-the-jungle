// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { slopeDriveFactor, conformOrHoldPose } from './vehiclePhysicsMath';

// L1 pure-math tests for the shared ground-vehicle physics helpers. These pin
// the two behaviours the vehicle-heading-hold-and-slope-truth pass turns on:
//   1. `getSlopeAt` returns a 0..1 deficit (1 - normal.y), NOT an angle, so the
//      slope gate must convert it before comparing against a radian ceiling.
//   2. The conform pose keeps the heading EXACT (no euler re-extraction) so a
//      cross-slope chassis holds its pointing instead of weathervaning.

// Deficit for a given true surface angle: 1 - cos(angle) (matches HeightQueryCache).
function deficitForAngle(angleRad: number): number {
  return 1 - Math.cos(angleRad);
}

// World-Y yaw of a quaternion, extracted as YXZ euler. NOTE: on a tilted frame
// this is NOT equal to the composed heading — YXZ yaw of `tilt * Ry(psi)` reads
// `atan2(sin psi, cos psi * cos slope)`. That distortion is the whole reason the
// sim persists the heading scalar and never reads it back from the quaternion.
function yawOf(q: THREE.Quaternion): number {
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  return e.y;
}

// Horizontal (x,z) projection of the chassis-forward axis — the observable
// "which way is it pointing" that heading actually controls.
function horizForward(q: THREE.Quaternion): THREE.Vector2 {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return new THREE.Vector2(f.x, f.z).normalize();
}

describe('slopeDriveFactor (deficit -> angle gate)', () => {
  const CEILING = 0.87; // ~50 deg, jeep ceiling
  const FLOOR = 0.35;

  it('returns full drive on flat ground (zero deficit)', () => {
    expect(slopeDriveFactor(0, CEILING, FLOOR)).toBe(1);
  });

  it('fades to zero at/above the ceiling angle', () => {
    // A grade at the ceiling angle and one well past it both stall (factor 0).
    expect(slopeDriveFactor(deficitForAngle(CEILING), CEILING, FLOOR)).toBe(0);
    expect(slopeDriveFactor(deficitForAngle(1.1), CEILING, FLOOR)).toBe(0);
  });

  it('keeps usable drive below the ceiling, never under the floor', () => {
    const mid = slopeDriveFactor(deficitForAngle(0.6), CEILING, FLOOR); // ~34 deg
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    // A steep-but-climbable grade is clamped to at least the floor, not zero.
    const steep = slopeDriveFactor(deficitForAngle(0.8), CEILING, FLOOR); // ~46 deg
    expect(steep).toBeGreaterThanOrEqual(FLOOR);
  });

  it('treats the deficit as a deficit, not as radians (regression guard)', () => {
    // The pre-fix bug compared the 0..1 deficit directly against the radian
    // ceiling. A 30 deg grade has deficit ~0.134 — if that were compared as
    // radians it would read as a trivial ~7.7 deg slope. Converting first, a
    // 30 deg grade must produce meaningfully reduced (but non-zero) drive.
    const factor = slopeDriveFactor(deficitForAngle(0.52), CEILING, FLOOR); // ~30 deg
    expect(factor).toBeGreaterThan(0);
    expect(factor).toBeLessThan(1);
  });
});

describe('conformOrHoldPose (heading-exact tilt conform)', () => {
  const HEADING = 0.7; // rad, an arbitrary non-axis-aligned pointing
  const slopeNormal = new THREE.Vector3(-0.5, 1, 0).normalize();

  it('tilts to the slope normal while staying near the requested pointing', () => {
    const out = new THREE.Quaternion();
    const smoothed = new THREE.Vector3(0, 1, 0);
    // Hard-snap (tau = 0) so the tilt reaches the slope normal in one step.
    conformOrHoldPose(out, true, HEADING, slopeNormal, smoothed, 0, 1 / 60);
    // The chassis up-axis aligns with the slope normal (it did tilt).
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(out);
    expect(up.dot(slopeNormal)).toBeGreaterThan(0.999);
    // Horizontal forward stays essentially the requested heading (a slope tilt
    // nudges the projected forward by only a few degrees, not a weathervane).
    const refForward = horizForward(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), HEADING),
    );
    expect(horizForward(out).dot(refForward)).toBeGreaterThan(0.99);
  });

  it('holds the pointing across repeated conforms — deterministic, no drift (the weathervane defect)', () => {
    const smoothed = new THREE.Vector3(0, 1, 0);
    // One settled step gives the reference pose for this fixed heading.
    const oneStep = new THREE.Quaternion();
    conformOrHoldPose(oneStep, true, HEADING, slopeNormal, smoothed.clone(), 0, 1 / 60);

    // 600 more steps re-supplying the SAME heading scalar must land on the SAME
    // pose. The pre-fix code re-extracted a distorted yaw each step and fed it
    // back, so the pose drifted by 1/cos(slope) per step; here it cannot.
    const many = new THREE.Quaternion();
    const s = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 600; i += 1) {
      conformOrHoldPose(many, true, HEADING, slopeNormal, s, 0, 1 / 60);
    }
    expect(horizForward(many).dot(horizForward(oneStep))).toBeGreaterThan(0.999999);
    expect(many.angleTo(oneStep)).toBeLessThan(1e-4);
  });

  it('smooths the tilt toward the normal over ~one tau, never overshooting', () => {
    const out = new THREE.Quaternion();
    const smoothed = new THREE.Vector3(0, 1, 0);
    const tau = 0.2;
    let prev = -1;
    // Each step should improve alignment monotonically (no ringing).
    for (let i = 0; i < Math.round((tau / (1 / 60)) * 3); i += 1) {
      conformOrHoldPose(out, true, HEADING, slopeNormal, smoothed, tau, 1 / 60);
      const align = new THREE.Vector3(0, 1, 0).applyQuaternion(out).dot(slopeNormal);
      expect(align).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = align;
    }
    expect(prev).toBeGreaterThan(0.98);
  });

  it('emits a heading-only, untilted pose when airborne and relaxes the smoothed normal', () => {
    const out = new THREE.Quaternion();
    // Start from a fully-tilted smoothed normal; airborne must relax it to up.
    const smoothed = slopeNormal.clone();
    conformOrHoldPose(out, false, HEADING, slopeNormal, smoothed, 0.2, 1 / 60);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(out);
    expect(up.dot(new THREE.Vector3(0, 1, 0))).toBeCloseTo(1, 5); // no tilt
    expect(yawOf(out)).toBeCloseTo(HEADING, 5);
    expect(smoothed.dot(new THREE.Vector3(0, 1, 0))).toBeCloseTo(1, 5); // relaxed to up
  });
});
