import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AtmosphereSystem } from './AtmosphereSystem';
import type { ISkyBackend } from './atmosphere/ISkyBackend';
import type { IGameRenderer } from '../../types/SystemInterfaces';

function makeRendererStub(): IGameRenderer {
  const moonLight = new THREE.DirectionalLight(0xffffff, 1.0);
  const hemisphereLight = new THREE.HemisphereLight(0x000000, 0x000000, 0.5);
  // Three.js initializes DirectionalLight.target to a fresh Object3D with
  // matrixAutoUpdate=true, matching the live scene setup.
  return {
    moonLight,
    hemisphereLight,
  } as unknown as IGameRenderer;
}

/**
 * Behavior contract for `AtmosphereSystem` as exposed via `ISkyRuntime` /
 * `ICloudRuntime`. These tests guard the seam, not the implementation —
 * future backends (prebaked cubemap, volumetric) must satisfy the same
 * caller-visible contract.
 *
 * As of `skybox-cutover-no-fallbacks`, the constructor installs the
 * analytic Hosek-Wilkie backend with a bootstrap preset, so every test
 * starts with a real lit sky (no NullSkyBackend fallback, no legacy
 * Skybox PNG).
 */
describe('AtmosphereSystem (ISkyRuntime contract)', () => {
  it('returns a non-zero unit-length sun direction by default', () => {
    const system = new AtmosphereSystem();
    const dir = system.getSunDirection(new THREE.Vector3());
    expect(dir.lengthSq()).toBeGreaterThan(0);
    expect(dir.length()).toBeCloseTo(1, 5);
  });

  it('returns non-black sky colors by default (bootstrap preset is live)', () => {
    const system = new AtmosphereSystem();
    const horizon = system.getHorizonColor(new THREE.Color());
    const zenith = system.getZenithColor(new THREE.Color());
    const sun = system.getSunColor(new THREE.Color());

    for (const c of [horizon, zenith, sun]) {
      const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      expect(luma).toBeGreaterThan(0);
    }
  });

  it('sky color along straight-up direction matches the zenith color', () => {
    const system = new AtmosphereSystem();
    const zenith = system.getZenithColor(new THREE.Color());
    const sample = system.getSkyColorAtDirection(new THREE.Vector3(0, 1, 0), new THREE.Color());
    // LUT bin quantisation means we won't hit byte-equal; compare with
    // small tolerance in RGB float space.
    expect(Math.abs(sample.r - zenith.r)).toBeLessThan(0.02);
    expect(Math.abs(sample.g - zenith.g)).toBeLessThan(0.02);
    expect(Math.abs(sample.b - zenith.b)).toBeLessThan(0.02);
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

describe('AtmosphereSystem (renderer coupling)', () => {
  it('drives the moonLight color from the backend sun color when bound to a renderer', () => {
    const system = new AtmosphereSystem();
    const backend: ISkyBackend = {
      update: () => {},
      sample: (_dir, out) => out,
      getSun: (out) => out.setHex(0xff8844),
      getZenith: (out) => out.setHex(0x335588),
      getHorizon: (out) => out.setHex(0x889966),
    };
    system.setBackend(backend);
    const renderer = makeRendererStub();

    system.setRenderer(renderer);

    expect(renderer.moonLight!.color.getHex()).toBe(0xff8844);
  });

  it('positions the moonLight above the origin in the sun direction', () => {
    const system = new AtmosphereSystem();
    const renderer = makeRendererStub();
    system.setRenderer(renderer);

    // Default sun direction is normalize(0, 80, -50); light should sit well
    // above the origin on the same azimuth ray.
    expect(renderer.moonLight!.position.y).toBeGreaterThan(0);
    expect(renderer.moonLight!.position.lengthSq()).toBeGreaterThan(0);
  });

  it('recenters the moonLight shadow follow target on the bound follow object', () => {
    const system = new AtmosphereSystem();
    const renderer = makeRendererStub();
    system.setRenderer(renderer);

    const follow = new THREE.Object3D();
    follow.position.set(120, 5, -40);
    system.setShadowFollowTarget(follow);
    // Trigger re-apply via update().
    system.update(0.016);

    const target = renderer.moonLight!.target.position;
    expect(target.x).toBeCloseTo(120, 3);
    expect(target.z).toBeCloseTo(-40, 3);
  });

  it('drives hemisphere sky color from the backend zenith sample', () => {
    const system = new AtmosphereSystem();
    const renderer = makeRendererStub();

    system.setRenderer(renderer);

    const zenith = system.getZenithColor(new THREE.Color());
    expect(renderer.hemisphereLight!.color.getHex()).toBe(zenith.getHex());
  });

  it('drives hemisphere ground color darker than the backend horizon sample', () => {
    const system = new AtmosphereSystem();
    const renderer = makeRendererStub();

    system.setRenderer(renderer);

    const horizon = new THREE.Color();
    system.getHorizonColor(horizon);
    const ground = renderer.hemisphereLight!.groundColor;

    // Darkened approximation of the horizon: components must be smaller in
    // magnitude than the horizon color, and non-zero for a non-black
    // horizon. This is a behavior assertion (ground is tinted toward but
    // dimmer than horizon) rather than a specific darken constant.
    expect(ground.r).toBeLessThan(horizon.r);
    expect(ground.g).toBeLessThan(horizon.g);
    expect(ground.b).toBeLessThan(horizon.b);
    expect(ground.getHex()).not.toBe(0);
  });

  it('reapplies atmosphere state to the renderer on update()', () => {
    const system = new AtmosphereSystem();
    const renderer = makeRendererStub();
    system.setRenderer(renderer);

    // Swap to a backend with distinctly different colors; the swap alone
    // does not push to the renderer — update() must.
    const backend: ISkyBackend = {
      update: () => {},
      sample: (_dir, out) => out,
      getSun: (out) => out.setHex(0xaabbcc),
      getZenith: (out) => out.setHex(0x112233),
      getHorizon: (out) => out.setHex(0x445566),
    };
    system.setBackend(backend);
    expect(renderer.moonLight!.color.getHex()).not.toBe(0xaabbcc);

    system.update(0.016);
    expect(renderer.moonLight!.color.getHex()).toBe(0xaabbcc);
    expect(renderer.hemisphereLight!.color.getHex()).toBe(0x112233);
  });

  it('leaves moonLight intensity untouched (weather owns intensity)', () => {
    const system = new AtmosphereSystem();
    const renderer = makeRendererStub();
    renderer.moonLight!.intensity = 1.7;

    system.setRenderer(renderer);
    system.update(0.016);

    // AtmosphereSystem drives position/color; weather drives intensity.
    // Verifying that intensity survives the atmosphere pass is the contract
    // that keeps the weather-multiplier ordering valid.
    expect(renderer.moonLight!.intensity).toBe(1.7);
  });
});

/**
 * Behavior contract for the day/night cycle (`atmosphere-day-night-cycle`).
 * Presets carry an optional `todCycle`; when set, the sun direction
 * evolves with simulated time. Presets without a `todCycle` keep the
 * v1 static-sun behaviour. Tests assert observable motion, not internal
 * cycle math or specific elevation constants.
 */
describe('AtmosphereSystem (day/night cycle)', () => {
  it('sun direction is static for a preset with no todCycle (combat120)', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('combat120');
    const before = system.getSunDirection(new THREE.Vector3()).clone();
    // Advance simulated time by a full "day" — without a todCycle the sun
    // must not move.
    system.setSimulationTimeSeconds(1000);
    system.update(0.016);
    const after = system.getSunDirection(new THREE.Vector3());
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(after.z).toBeCloseTo(before.z, 5);
  });

  it('sun direction evolves with simulated time for a cycle preset (ashau)', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('ashau');
    const initial = system.getSunDirection(new THREE.Vector3()).clone();

    // Advance to 1/4 of the day cycle; sun must have moved observably.
    system.setSimulationTimeSeconds(150);
    const later = system.getSunDirection(new THREE.Vector3());

    const dx = later.x - initial.x;
    const dy = later.y - initial.y;
    const dz = later.z - initial.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    expect(distance).toBeGreaterThan(0.1);
    expect(later.length()).toBeCloseTo(1, 5);
  });

  it('sun returns to the preset angle after one full simulated day', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('openfrontier');
    const preset = system.getCurrentPreset()!;
    const dayLen = preset.todCycle!.dayLengthSeconds;
    const start = system.getSunDirection(new THREE.Vector3()).clone();

    // Advance exactly one cycle. Sun must come back to the preset angle.
    system.setSimulationTimeSeconds(dayLen);
    const after = system.getSunDirection(new THREE.Vector3());
    expect(after.x).toBeCloseTo(start.x, 4);
    expect(after.y).toBeCloseTo(start.y, 4);
    expect(after.z).toBeCloseTo(start.z, 4);
  });

  it('sun elevation stays above the analytic sky danger zone across a full day', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('tdm');
    const preset = system.getCurrentPreset()!;
    const dayLen = preset.todCycle!.dayLengthSeconds;

    // Sample 48 points across the day and check sun direction stays sane
    // (no NaN, always unit length, y never drops below a safe floor).
    const minY = Math.sin(-11 * (Math.PI / 180)); // allow a hair below -10deg
    for (let i = 0; i < 48; i++) {
      system.setSimulationTimeSeconds((dayLen * i) / 48);
      const dir = system.getSunDirection(new THREE.Vector3());
      expect(Number.isFinite(dir.x)).toBe(true);
      expect(Number.isFinite(dir.y)).toBe(true);
      expect(Number.isFinite(dir.z)).toBe(true);
      expect(dir.length()).toBeCloseTo(1, 4);
      expect(dir.y).toBeGreaterThanOrEqual(minY);
    }
  });

  it('applyScenarioPreset resets simulated time so the boot frame matches the static angle', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('ashau');
    // Move the clock deep into the day.
    system.setSimulationTimeSeconds(300);
    // Reapply — sun must snap back to the preset's configured static angle.
    system.applyScenarioPreset('ashau');
    expect(system.getSimulationTimeSeconds()).toBe(0);
    const dir = system.getSunDirection(new THREE.Vector3());
    // ashau preset is dawn: low positive y, east-southeast.
    expect(dir.y).toBeGreaterThan(0);
    expect(dir.y).toBeLessThan(0.3);
  });

  it('getSunColor() evolves between dawn-like and noon-like as the cycle advances', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('ashau');
    // Force LUT rebake for dawn state by running update.
    system.update(0.016);
    const dawnSun = system.getSunColor(new THREE.Color());
    const dawnWarmth = dawnSun.r - dawnSun.b;

    // Advance to ~1/4 of the cycle (noon-ish relative to the preset start).
    const dayLen = system.getCurrentPreset()!.todCycle!.dayLengthSeconds;
    system.setSimulationTimeSeconds(dayLen * 0.25);
    system.update(0.016);
    const noonSun = system.getSunColor(new THREE.Color());
    const noonWarmth = noonSun.r - noonSun.b;

    // Sun color must differ observably between the two phases. We expect
    // dawn to be warmer (red-shifted) than the higher-sun phase.
    expect(Math.abs(dawnWarmth - noonWarmth)).toBeGreaterThan(0.01);
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

  const makeAtmosphereWithBackend = (horizonHex: number) => {
    const system = new AtmosphereSystem();
    system.setBackend(makeCustomBackend(horizonHex));
    return system;
  };

  it('fog color tracks the sky horizon color each frame', () => {
    const system = makeAtmosphereWithBackend(0xaabbcc);
    const { renderer, fog } = makeFogStub();
    system.setRenderer(renderer);

    system.update(0.016);

    expect(fog.color.getHex()).toBe(0xaabbcc);
  });

  it('fog color updates when the backend horizon color changes between frames', () => {
    const systemA = makeAtmosphereWithBackend(0x112233);
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
    const system = makeAtmosphereWithBackend(0xff0000);
    const { renderer, fog } = makeFogStub();
    system.setRenderer(renderer);

    system.setFogUnderwaterOverride(true);
    system.update(0.016);

    expect(fog.color.getHex()).toBe(0x003344);
  });

  it('clearing the underwater override restores the sky-driven fog color', () => {
    const system = makeAtmosphereWithBackend(0x4488aa);
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
    const system = makeAtmosphereWithBackend(0x888888);
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
    const system = makeAtmosphereWithBackend(0x808080);
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
    const system = makeAtmosphereWithBackend(0x222222);

    // Should not throw without a renderer (tests and menu phase run
    // before the composer wires the renderer).
    expect(() => system.update(0.016)).not.toThrow();
  });
});
