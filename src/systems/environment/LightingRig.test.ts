// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import type { ISkyBackend } from './atmosphere/ISkyBackend';
import {
  LightingRigConfig,
  createLightingRigState,
  createRigSceneLightRadiance,
  deriveLightingRigState,
  isLightingRigEnabled,
  lightingRigBindings,
  rigExposureForElevation,
  rigSceneLightRadiance,
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

describe('LightingRig shares the low-sun + fog terms the foliage branch reads', () => {
  beforeEach(() => {
    LightingRigConfig.enabled = false;
  });

  it('exposes the sun height so the foliage direct-sun term can fade with a low sun', () => {
    // The unlit foliage card has no sloped normal or horizon ray-march, so the
    // billboard rig branch fades its direct sun contribution using this term —
    // the same sun-height driver terrain's horizon occlusion uses. Behaviour we
    // depend on: the binding tracks the sun's up component (drops as the sun
    // sinks toward and below the horizon).
    const state = createLightingRigState();
    const backend = makeBackend({ sun: [1, 1, 1], zenith: [1, 1, 1], horizon: [1, 1, 1] });

    deriveLightingRigState(backend, new THREE.Vector3(0, 1, 0), 1, state);
    const highSun = lightingRigBindings.sunElevationSin.value;

    deriveLightingRigState(backend, new THREE.Vector3(1, 0.18, 0).normalize(), 1, state);
    const lowSun = lightingRigBindings.sunElevationSin.value;

    deriveLightingRigState(backend, new THREE.Vector3(1, -0.2, 0).normalize(), 1, state);
    const belowHorizon = lightingRigBindings.sunElevationSin.value;

    expect(highSun).toBeGreaterThan(lowSun);
    expect(lowSun).toBeGreaterThan(belowHorizon);
    expect(belowHorizon).toBeLessThan(0);
  });

  it('publishes the rig fog color so the billboard buffer can drop its parallel fog read', () => {
    // BillboardBufferManager reads scene.fog.color directly on the legacy path
    // (a second fog authority). On the rig path it folds in this binding instead,
    // so foliage fog tint comes from the same horizon source the rest of the
    // scene fog derives from. Behaviour: the binding mirrors the rig fog color,
    // and weather darkening drives it toward black like the state field.
    const state = createLightingRigState();
    const backend = makeBackend({ sun: [1, 1, 1], zenith: [1, 1, 1], horizon: [0.8, 0.7, 0.6] });

    deriveLightingRigState(backend, new THREE.Vector3(0, 0.5, 0), 1, state);
    expect(lightingRigBindings.fogColor.value.r).toBeCloseTo(state.fogColor.r, 5);
    expect(lightingRigBindings.fogColor.value.r).toBeGreaterThan(0);

    deriveLightingRigState(backend, new THREE.Vector3(0, 0.5, 0), 0, state);
    expect(lightingRigBindings.fogColor.value.r).toBeCloseTo(0, 5);
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

  it('keeps a measurable (non-black) night ambient floor so deep-night terrain is readable', () => {
    // Phase 1 raised the floor: with terrain rig-lit via PBR ambient (no
    // colorNode self-light), a near-black floor made midnight terrain
    // unmeasurable. The floor must lift deep-night radiance into a readable band.
    const state = createLightingRigState();
    const backend = makeBackend({ sun: [0.001, 0.001, 0.002], zenith: [0.01, 0.012, 0.02], horizon: [0.01, 0.01, 0.012] });
    deriveLightingRigState(backend, new THREE.Vector3(0.05, -0.25, 0), 1, state);
    // Some readable green-channel radiance, and cool-biased (blue > red) night.
    expect(state.ambientRadiance.g).toBeGreaterThan(0.02);
    expect(state.ambientRadiance.b).toBeGreaterThan(state.ambientRadiance.r);
  });
});

describe('LightingRig scene-light projection drives the PBR lights from rig terms', () => {
  beforeEach(() => {
    LightingRigConfig.enabled = false;
  });

  // Base construction intensities the rig divides out (mirrors GameRenderer).
  const BASE = { ambient: 1.0, directional: 2.0, hemisphere: 0.8 };

  it('projects the scene-light colors so color × base intensity equals rig radiance × exposure', () => {
    // The scene-light projection is how terrain + GLB PBR are made to track the
    // rig curve: each light's PBR contribution (color × base intensity) equals
    // the matching rig radiance scaled by the one exposure scalar. The rig
    // divides the base intensity out so it can leave `.intensity` to weather.
    const state = createLightingRigState();
    const backend = makeBackend({ sun: [2.0, 1.5, 1.0], zenith: [1.2, 1.4, 2.0], horizon: [1.0, 0.8, 0.6] });
    // Mid-morning sun: above horizon, daylight exposure regime.
    deriveLightingRigState(backend, new THREE.Vector3(0.2, 0.6, 0.1), 1, state);

    const lights = createRigSceneLightRadiance();
    rigSceneLightRadiance(state, BASE, lights);
    const exposure = rigExposureForElevation(state.sunElevation);

    // color × baseIntensity reproduces rigRadiance × exposure for each light.
    expect(lights.sunColor.r * BASE.directional).toBeCloseTo(state.sunRadiance.r * exposure, 5);
    expect(lights.skyColor.b * BASE.hemisphere).toBeCloseTo(state.skyIrradiance.b * exposure, 5);
    expect(lights.groundColor.r * BASE.hemisphere).toBeCloseTo(state.groundIrradiance.r * exposure, 5);
    expect(lights.ambientColor.g * BASE.ambient).toBeCloseTo(state.ambientRadiance.g * exposure, 5);
  });

  it('keeps the scene sun light brighter by day than by night so terrain swings the full range', () => {
    const state = createLightingRigState();
    const lights = createRigSceneLightRadiance();

    // Bright HDR daytime sun.
    const dayBackend = makeBackend({ sun: [3.0, 2.5, 2.0], zenith: [1.5, 1.6, 2.0], horizon: [1.2, 1.0, 0.8] });
    deriveLightingRigState(dayBackend, new THREE.Vector3(0, 0.85, 0), 1, state);
    rigSceneLightRadiance(state, BASE, lights);
    const daySun = lights.sunColor.r;

    // Below-horizon: getSun has crossfaded to a dim moon term.
    const nightBackend = makeBackend({ sun: [0.02, 0.025, 0.04], zenith: [0.02, 0.025, 0.04], horizon: [0.02, 0.02, 0.025] });
    deriveLightingRigState(nightBackend, new THREE.Vector3(0.05, -0.2, 0), 1, state);
    rigSceneLightRadiance(state, BASE, lights);
    const nightSun = lights.sunColor.r;

    expect(daySun).toBeGreaterThan(nightSun);
  });
});
