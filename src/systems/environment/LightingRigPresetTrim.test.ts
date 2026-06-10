// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  applyRigPresetTrim,
  clampRigIntensity,
  clampRigTint,
  RIG_TRIM_INTENSITY_MAX,
  RIG_TRIM_INTENSITY_MIN,
  RIG_TRIM_TINT_MAX,
  RIG_TRIM_TINT_MIN,
  type RigTrimTargets,
} from './LightingRigPresetTrim';

/**
 * Behavior tests for the per-scenario rig trim helper (Phase 3,
 * `exposure-fog-presets-rig`). The trim is the rig path's ONLY scenario-specific
 * shaping: bounded multipliers over the physical baseline, never an absolute
 * stack. These tests assert the observable contract — identity by default,
 * bounded so a trim can nudge but never dominate — not the specific bound
 * constants (those are tuning values). See docs/TESTING.md.
 */

function makeTargets(): RigTrimTargets {
  return {
    sunRadiance: new THREE.Color(2, 2, 2),
    skyIrradiance: new THREE.Color(1, 1, 1),
    groundIrradiance: new THREE.Color(0.5, 0.5, 0.5),
    fogColor: new THREE.Color(0.8, 0.8, 0.8),
  };
}

describe('applyRigPresetTrim', () => {
  it('is identity when no trim is supplied (pure physical baseline)', () => {
    const t = makeTargets();
    const exposure = applyRigPresetTrim(t, 1.5, undefined);
    expect(exposure).toBe(1.5);
    expect(t.sunRadiance.r).toBe(2);
    expect(t.skyIrradiance.r).toBe(1);
    expect(t.fogColor.r).toBeCloseTo(0.8, 6);
  });

  it('applies a sun tint as a channel-wise multiplier', () => {
    const t = makeTargets();
    applyRigPresetTrim(t, 1, { sunTint: new THREE.Color(1.1, 1.0, 0.8) });
    expect(t.sunRadiance.r).toBeCloseTo(2 * 1.1, 5);
    expect(t.sunRadiance.b).toBeCloseTo(2 * 0.8, 5);
    // Sky/ground/fog untouched by a sun-only trim.
    expect(t.skyIrradiance.r).toBe(1);
    expect(t.fogColor.r).toBeCloseTo(0.8, 6);
  });

  it('applies a sky tint to BOTH the sky and ground irradiance (hemisphere stays consistent)', () => {
    const t = makeTargets();
    applyRigPresetTrim(t, 1, { skyTint: new THREE.Color(0.9, 1.1, 1.2) });
    expect(t.skyIrradiance.g).toBeCloseTo(1 * 1.1, 5);
    expect(t.groundIrradiance.g).toBeCloseTo(0.5 * 1.1, 5);
    expect(t.skyIrradiance.b).toBeCloseTo(1 * 1.2, 5);
    expect(t.groundIrradiance.b).toBeCloseTo(0.5 * 1.2, 5);
  });

  it('scales the exposure by the intensity multiplier', () => {
    const t = makeTargets();
    const exposure = applyRigPresetTrim(t, 2.0, { intensity: 1.1 });
    expect(exposure).toBeCloseTo(2.0 * 1.1, 5);
  });

  it('clamps an absurd trim into the band so it can never dominate the baseline', () => {
    const t = makeTargets();
    const exposure = applyRigPresetTrim(t, 1.0, {
      sunTint: new THREE.Color(99, 99, 99),
      intensity: 99,
    });
    // Sun term capped at baseline × max tint; exposure at baseline × max intensity.
    expect(t.sunRadiance.r).toBeCloseTo(2 * RIG_TRIM_TINT_MAX, 5);
    expect(exposure).toBeCloseTo(1.0 * RIG_TRIM_INTENSITY_MAX, 5);
  });

  it('clamps a too-dim trim up to the floor so a typo cannot black the scene out', () => {
    const t = makeTargets();
    const exposure = applyRigPresetTrim(t, 1.0, {
      sunTint: new THREE.Color(0.001, 0.001, 0.001),
      intensity: 0.001,
    });
    expect(t.sunRadiance.r).toBeCloseTo(2 * RIG_TRIM_TINT_MIN, 5);
    expect(exposure).toBeCloseTo(1.0 * RIG_TRIM_INTENSITY_MIN, 5);
  });
});

describe('trim clamp helpers', () => {
  it('clampRigTint pins each channel into the tint band', () => {
    const out = new THREE.Color();
    clampRigTint(new THREE.Color(5, 0.01, 1.0), out);
    expect(out.r).toBeCloseTo(RIG_TRIM_TINT_MAX, 6);
    expect(out.g).toBeCloseTo(RIG_TRIM_TINT_MIN, 6);
    expect(out.b).toBeCloseTo(1.0, 6);
  });

  it('clampRigIntensity pins into the intensity band', () => {
    expect(clampRigIntensity(99)).toBeCloseTo(RIG_TRIM_INTENSITY_MAX, 6);
    expect(clampRigIntensity(0)).toBeCloseTo(RIG_TRIM_INTENSITY_MIN, 6);
    expect(clampRigIntensity(1.0)).toBeCloseTo(1.0, 6);
  });
});
