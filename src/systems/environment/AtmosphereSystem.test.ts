import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AtmosphereSystem } from './AtmosphereSystem';
import type { ISkyBackend } from './atmosphere/ISkyBackend';

/**
 * Behavior contract for `AtmosphereSystem` as exposed via `ISkyRuntime` /
 * `ICloudRuntime`. These tests guard the seam, not the implementation —
 * future backends (Hosek-Wilkie, prebaked cubemap, volumetric) must
 * satisfy the same caller-visible contract.
 *
 * The legacy color constants (`0x5a7a6a` horizon, `0x87ceeb` zenith,
 * `0xfffacd` sun) are the brief's exit criterion: the default backend
 * must reproduce the existing `Skybox` + `setupLighting()` look so the
 * cycle ships with no visible change.
 */
describe('AtmosphereSystem (ISkyRuntime contract)', () => {
  it('returns a non-zero unit-length sun direction by default', () => {
    const system = new AtmosphereSystem();
    const dir = system.getSunDirection(new THREE.Vector3());
    expect(dir.lengthSq()).toBeGreaterThan(0);
    expect(dir.length()).toBeCloseTo(1, 5);
  });

  it('default backend reproduces legacy sky colors (no visible change this cycle)', () => {
    const system = new AtmosphereSystem();
    const horizon = system.getHorizonColor(new THREE.Color());
    const zenith = system.getZenithColor(new THREE.Color());
    const sun = system.getSunColor(new THREE.Color());

    expect(horizon.getHex()).toBe(0x5a7a6a);
    expect(zenith.getHex()).toBe(0x87ceeb);
    expect(sun.getHex()).toBe(0xfffacd);
  });

  it('sky color along straight-up direction matches the zenith color', () => {
    const system = new AtmosphereSystem();
    const zenith = system.getZenithColor(new THREE.Color());
    const sample = system.getSkyColorAtDirection(new THREE.Vector3(0, 1, 0), new THREE.Color());
    expect(sample.getHex()).toBe(zenith.getHex());
  });

  it('sky color along the horizon ring matches the horizon color', () => {
    const system = new AtmosphereSystem();
    const horizon = system.getHorizonColor(new THREE.Color());
    const sample = system.getSkyColorAtDirection(new THREE.Vector3(1, 0, 0), new THREE.Color());
    expect(sample.getHex()).toBe(horizon.getHex());
  });

  it('writes into the caller-supplied out parameter and returns it', () => {
    const system = new AtmosphereSystem();
    const out = new THREE.Color();
    const result = system.getZenithColor(out);
    expect(result).toBe(out);
  });

  it('delegates to a swapped backend instead of the default', () => {
    const system = new AtmosphereSystem();
    const customSun = new THREE.Color(0x123456);
    const customZenith = new THREE.Color(0x654321);
    const customHorizon = new THREE.Color(0xabcdef);
    const fakeBackend: ISkyBackend = {
      update: () => {},
      sample: (_dir, out) => out.copy(customZenith),
      getSun: (out) => out.copy(customSun),
      getZenith: (out) => out.copy(customZenith),
      getHorizon: (out) => out.copy(customHorizon),
    };
    system.setBackend(fakeBackend);

    expect(system.getSunColor(new THREE.Color()).getHex()).toBe(0x123456);
    expect(system.getZenithColor(new THREE.Color()).getHex()).toBe(0x654321);
    expect(system.getHorizonColor(new THREE.Color()).getHex()).toBe(0xabcdef);
  });

  it('forwards update() with current sun direction to the backend', () => {
    const system = new AtmosphereSystem();
    let observedDt = -1;
    const observed = new THREE.Vector3();
    const fakeBackend: ISkyBackend = {
      update: (dt, sun) => {
        observedDt = dt;
        observed.copy(sun);
      },
      sample: (_dir, out) => out,
      getSun: (out) => out,
      getZenith: (out) => out,
      getHorizon: (out) => out,
    };
    system.setBackend(fakeBackend);
    system.update(0.016);

    expect(observedDt).toBeCloseTo(0.016, 5);
    expect(observed.length()).toBeCloseTo(1, 5);
  });
});

describe('AtmosphereSystem (ICloudRuntime contract)', () => {
  it('starts with zero coverage and round-trips a normal value', () => {
    const system = new AtmosphereSystem();
    expect(system.getCoverage()).toBe(0);
    system.setCoverage(0.4);
    expect(system.getCoverage()).toBeCloseTo(0.4, 5);
  });

  it('clamps coverage into [0, 1]', () => {
    const system = new AtmosphereSystem();
    system.setCoverage(-0.5);
    expect(system.getCoverage()).toBe(0);
    system.setCoverage(2.5);
    expect(system.getCoverage()).toBe(1);
  });
});
