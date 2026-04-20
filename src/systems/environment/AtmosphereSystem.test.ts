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

/**
 * Behavior contract for the fog-tint plumbing (`atmosphere-fog-tinted-by-sky`).
 * These tests guard the observable seam, not the shader ordering — a
 * future backend that swaps in a different horizon sampler or moves the
 * darken factor still needs to produce:
 *   - fog color sampled from the sky horizon by default,
 *   - fog color darkened by the weather multiplier,
 *   - fog color snapped to the underwater teal regardless of sky state.
 */
describe('AtmosphereSystem (fog-tint plumbing)', () => {
  const makeCustomBackend = (horizonHex: number): ISkyBackend => {
    const horizon = new THREE.Color(horizonHex);
    return {
      update: () => {},
      sample: (_dir, out) => out.copy(horizon),
      getSun: (out) => out,
      getZenith: (out) => out,
      getHorizon: (out) => out.copy(horizon),
    };
  };

  const makeFogStub = () => {
    const fog: any = { color: new THREE.Color(0x000000), density: 0.004 };
    return { renderer: { fog } as any, fog };
  };

  it('fog color tracks the sky horizon color each frame', () => {
    const system = new AtmosphereSystem(makeCustomBackend(0xaabbcc));
    const { renderer, fog } = makeFogStub();
    system.setRenderer(renderer);

    system.update(0.016);

    expect(fog.color.getHex()).toBe(0xaabbcc);
  });

  it('fog color updates when the backend horizon color changes between frames', () => {
    const systemA = new AtmosphereSystem(makeCustomBackend(0x112233));
    const { renderer, fog } = makeFogStub();
    systemA.setRenderer(renderer);
    systemA.update(0.016);
    expect(fog.color.getHex()).toBe(0x112233);

    // Swap to a backend representing a different time of day; fog should
    // follow without needing a new atmosphere system.
    systemA.setBackend(makeCustomBackend(0xddaa55));
    systemA.update(0.016);
    expect(fog.color.getHex()).toBe(0xddaa55);
  });

  it('underwater override snaps fog color to teal regardless of sky state', () => {
    const system = new AtmosphereSystem(makeCustomBackend(0xff0000));
    const { renderer, fog } = makeFogStub();
    system.setRenderer(renderer);

    system.setFogUnderwaterOverride(true);
    system.update(0.016);

    expect(fog.color.getHex()).toBe(0x003344);
  });

  it('clearing the underwater override restores the sky-driven fog color', () => {
    const system = new AtmosphereSystem(makeCustomBackend(0x4488aa));
    const { renderer, fog } = makeFogStub();
    system.setRenderer(renderer);

    system.setFogUnderwaterOverride(true);
    system.update(0.016);
    expect(fog.color.getHex()).toBe(0x003344);

    system.setFogUnderwaterOverride(false);
    system.update(0.016);
    expect(fog.color.getHex()).toBe(0x4488aa);
  });

  it('darken factor dims the fog color without changing hue for grayscale samples', () => {
    const system = new AtmosphereSystem(makeCustomBackend(0x888888));
    const { renderer, fog } = makeFogStub();
    system.setRenderer(renderer);

    system.setFogDarkenFactor(0.5);
    system.update(0.016);

    // A 0.5 multiplier on 0x888888 (r=g=b=0.533 linear-ish) must drop
    // toward ~0x444444; the hue (all channels equal) is preserved.
    const hex = fog.color.getHex();
    const r = (hex >> 16) & 0xff;
    const g = (hex >> 8) & 0xff;
    const b = hex & 0xff;
    expect(r).toBe(g);
    expect(g).toBe(b);
    // Must be strictly darker than the un-darkened sample.
    expect(r).toBeLessThan(0x88);
  });

  it('darken factor is clamped into [0, 1]', () => {
    const system = new AtmosphereSystem(makeCustomBackend(0x808080));
    const { renderer, fog } = makeFogStub();
    system.setRenderer(renderer);

    // Overshoot the upper bound — fog color must still be the sky color
    // (factor clamped to 1).
    system.setFogDarkenFactor(5.0);
    system.update(0.016);
    expect(fog.color.getHex()).toBe(0x808080);

    // Negative darken must clamp to zero — fog color is black.
    system.setFogDarkenFactor(-1);
    system.update(0.016);
    expect(fog.color.getHex()).toBe(0x000000);
  });

  it('is a no-op when no renderer has been wired', () => {
    const system = new AtmosphereSystem(makeCustomBackend(0x222222));

    // Should not throw without a renderer (tests and menu phase run
    // before the composer wires the renderer).
    expect(() => system.update(0.016)).not.toThrow();
  });
});
