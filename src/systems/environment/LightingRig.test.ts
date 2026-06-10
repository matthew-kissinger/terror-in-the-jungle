// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import type { ISkyBackend } from './atmosphere/ISkyBackend';
import {
  LightingRigConfig,
  createLightingRigState,
  deriveLightingRigState,
  isLightingRigEnabled,
  lightingRigBindings,
  rigExposureForElevation,
} from './LightingRig';

/**
 * Behavior tests for the Phase 0 unified lighting rig (cycle
 * `cycle-2026-06-09-lighting-rig-spike`). These assert the rig's observable
 * contract from a consumer's perspective — that it carries energy honestly
 * (uncompressed radiance), that the flag gates consumption, and that exposure
 * tracks time of day — not the specific constants (those are tuning values that
 * Phase 3 re-litigates). See docs/TESTING.md.
 */

/**
 * Fake backend returning HDR-ish (>1) linear radiance, like the real Hosek
 * backend does. Lets us assert the rig does NOT clamp it down to a presentation
 * ceiling the way the legacy snapshot's compressors do.
 */
function makeBackend(opts: {
  sun: [number, number, number];
  zenith: [number, number, number];
  horizon: [number, number, number];
}): ISkyBackend {
  return {
    update: () => {},
    sample: (_dir, out) => out,
    getSun: (out) => out.setRGB(...opts.sun),
    getZenith: (out) => out.setRGB(...opts.zenith),
    getHorizon: (out) => out.setRGB(...opts.horizon),
  };
}

describe('LightingRig flag gating', () => {
  beforeEach(() => {
    LightingRigConfig.enabled = false;
  });

  it('defaults OFF so production keeps the legacy lighting path', () => {
    expect(isLightingRigEnabled()).toBe(false);
  });

  it('reflects a runtime flag flip into the shared binding the materials read', () => {
    const state = createLightingRigState();
    const backend = makeBackend({ sun: [2, 1.5, 1], zenith: [1.2, 1.4, 2.0], horizon: [1, 0.8, 0.6] });
    const sunDir = new THREE.Vector3(0.2, 0.8, 0.1);

    deriveLightingRigState(backend, sunDir, 1, state);
    expect(lightingRigBindings.rigEnabled.value).toBe(0);

    LightingRigConfig.enabled = true;
    deriveLightingRigState(backend, sunDir, 1, state);
    expect(lightingRigBindings.rigEnabled.value).toBe(1);
  });
});

describe('LightingRig radiance is honest (uncompressed)', () => {
  beforeEach(() => {
    LightingRigConfig.enabled = false;
  });

  it('keeps HDR sun radiance above the legacy [0,1] presentation ceiling', () => {
    // The legacy shapeDirectLightForRenderer compresses the sun to a ~0.78
    // channel ceiling. The rig must NOT — it passes the backend radiance through.
    const state = createLightingRigState();
    const backend = makeBackend({ sun: [3.5, 2.0, 0.8], zenith: [1, 1, 1], horizon: [1, 1, 1] });
    deriveLightingRigState(backend, new THREE.Vector3(0.1, 0.7, 0), 1, state);

    expect(state.sunRadiance.r).toBeGreaterThan(1.0);
    expect(state.sunRadiance.r).toBeCloseTo(3.5, 5);
  });

  it('does not clamp sky/ground irradiance to a fixed component ceiling', () => {
    const state = createLightingRigState();
    const backend = makeBackend({ sun: [1, 1, 1], zenith: [2.5, 2.7, 3.0], horizon: [1.8, 1.5, 1.2] });
    deriveLightingRigState(backend, new THREE.Vector3(0, 1, 0), 1, state);

    expect(state.skyIrradiance.b).toBeGreaterThan(1.0);
    // Ground is the horizon radiance scaled by a bounce factor (< 1x), still > 0.
    expect(state.groundIrradiance.r).toBeGreaterThan(0);
    expect(state.groundIrradiance.r).toBeLessThan(state.skyIrradiance.r + 3);
  });

  it('derives sun elevation from the sun direction', () => {
    const state = createLightingRigState();
    const backend = makeBackend({ sun: [1, 1, 1], zenith: [1, 1, 1], horizon: [1, 1, 1] });
    // Sun straight up -> elevation pi/2.
    deriveLightingRigState(backend, new THREE.Vector3(0, 1, 0), 1, state);
    expect(state.sunElevation).toBeCloseTo(Math.PI / 2, 4);
    // Sun on the horizon -> elevation ~0.
    deriveLightingRigState(backend, new THREE.Vector3(1, 0, 0), 1, state);
    expect(state.sunElevation).toBeCloseTo(0, 4);
  });
});

describe('LightingRig night floor + exposure track time of day', () => {
  beforeEach(() => {
    LightingRigConfig.enabled = false;
  });

  it('fades a non-zero ambient night floor in only below the horizon', () => {
    const state = createLightingRigState();
    const backend = makeBackend({ sun: [1, 1, 1], zenith: [1, 1, 1], horizon: [1, 1, 1] });

    // Daytime: sun well above horizon -> negligible night ambient.
    deriveLightingRigState(backend, new THREE.Vector3(0, 0.9, 0), 1, state);
    const dayAmbient = state.ambientRadiance.r;

    // Night: sun below horizon -> ambient floor present.
    deriveLightingRigState(backend, new THREE.Vector3(0.1, -0.2, 0), 1, state);
    const nightAmbient = state.ambientRadiance.r;

    expect(nightAmbient).toBeGreaterThan(dayAmbient);
    expect(nightAmbient).toBeGreaterThan(0);
  });

  it('exposure is higher at night than at noon and varies monotonically with sun height', () => {
    const midnight = rigExposureForElevation(-0.15);
    const dawn = rigExposureForElevation(0.0);
    const noon = rigExposureForElevation(1.3);

    // Single scene-wide curve: lifts dim night, tames bright noon.
    expect(midnight).toBeGreaterThan(noon);
    expect(dawn).toBeGreaterThan(noon);
    expect(midnight).toBeGreaterThanOrEqual(dawn);
  });

  it('fog color falls to zero when weather fully darkens it', () => {
    const state = createLightingRigState();
    const backend = makeBackend({ sun: [1, 1, 1], zenith: [1, 1, 1], horizon: [0.8, 0.7, 0.6] });

    deriveLightingRigState(backend, new THREE.Vector3(0, 0.5, 0), 1, state);
    expect(state.fogColor.r).toBeGreaterThan(0);

    deriveLightingRigState(backend, new THREE.Vector3(0, 0.5, 0), 0, state);
    expect(state.fogColor.r).toBeCloseTo(0, 5);
  });
});
