import { afterEach, describe, expect, it } from 'vitest';
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
    const customHorizon = new THREE.Color(0x6a7b84);
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
    expect(system.getHorizonColor(new THREE.Color()).getHex()).toBe(0x6a7b84);
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

  it('drives hemisphere sky color from the backend zenith sample without saturating HDR values', () => {
    const system = new AtmosphereSystem();
    const renderer = makeRendererStub();

    system.setRenderer(renderer);

    const zenith = system.getZenithColor(new THREE.Color());
    const sky = renderer.hemisphereLight!.color;
    expect(sky.b).toBeGreaterThan(sky.r);
    expect(sky.b).toBeGreaterThan(sky.g);
    expect(sky.getHex()).not.toBe(0xffffff);
    expect(sky.r).toBeLessThanOrEqual(zenith.r);
    expect(sky.g).toBeLessThanOrEqual(zenith.g);
    expect(sky.b).toBeLessThanOrEqual(zenith.b);
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

  it('bounds HDR sky samples before using them as renderer fog and hemisphere light colors', () => {
    const system = new AtmosphereSystem();
    const backend: ISkyBackend = {
      update: () => {},
      sample: (_dir, out) => out,
      getSun: (out) => out.setHex(0xffffff),
      getZenith: (out) => out.setRGB(0.8, 1.8, 3.2),
      getHorizon: (out) => out.setRGB(2.0, 2.2, 2.4),
    };
    const renderer = {
      ...makeRendererStub(),
      fog: new THREE.FogExp2(0x000000, 0.001),
    };

    system.setBackend(backend);
    system.setRenderer(renderer);
    system.update(0.016);

    const { color, groundColor } = renderer.hemisphereLight!;
    for (const c of [color, groundColor, renderer.fog.color]) {
      expect(c.r).toBeLessThan(1);
      expect(c.g).toBeLessThan(1);
      expect(c.b).toBeLessThan(1);
    }
    expect(renderer.fog.color.getHex()).not.toBe(0xffffff);
    expect(renderer.hemisphereLight!.groundColor.getHex()).not.toBe(0xffffff);
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
  it('coverage is a number in [0, 1] at boot', () => {
    const system = new AtmosphereSystem();
    const initial = system.getCoverage();
    expect(initial).toBeGreaterThanOrEqual(0);
    expect(initial).toBeLessThanOrEqual(1);
  });

  it('round-trips a normal coverage value', () => {
    const system = new AtmosphereSystem();
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

  it('applyScenarioPreset restores per-scenario baseline coverage', () => {
    const system = new AtmosphereSystem();
    // Temporarily force coverage to 1.0 via the public API.
    system.setCoverage(1.0);
    expect(system.getCoverage()).toBeCloseTo(1.0, 5);

    // Reapplying a preset must reset coverage to that preset's baseline,
    // whatever it is, so different scenarios don't leak their cloud
    // coverage into each other.
    const firstPreset = 'combat120' as const;
    system.applyScenarioPreset(firstPreset);
    const firstBaseline = system.getCoverage();
    expect(firstBaseline).toBeGreaterThanOrEqual(0);
    expect(firstBaseline).toBeLessThanOrEqual(1);

    system.setCoverage(1.0);
    system.applyScenarioPreset(firstPreset);
    expect(system.getCoverage()).toBeCloseTo(firstBaseline, 5);
  });

  it('weather cloud intent raises coverage above the scenario baseline', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('combat120');
    const baseline = system.getCoverage();

    // Scene attach + syncDomePosition are required to trigger the
    // cloud-layer update path that reconciles preset + intent.
    const scene = new THREE.Scene();
    system.attachScene(scene);
    system.syncDomePosition(new THREE.Vector3(0, 5, 0));

    // Simulate a storm weather target.
    system.setCloudCoverageIntent(true, 0.95);
    system.update(0.016);
    expect(system.getCoverage()).toBeGreaterThan(baseline);
    expect(system.getCoverage()).toBeCloseTo(0.95, 5);
  });

  it('clearing the weather cloud intent returns coverage to the scenario baseline', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('combat120');
    const baseline = system.getCoverage();

    const scene = new THREE.Scene();
    system.attachScene(scene);
    system.syncDomePosition(new THREE.Vector3(0, 5, 0));

    system.setCloudCoverageIntent(true, 0.9);
    system.update(0.016);
    expect(system.getCoverage()).toBeCloseTo(0.9, 5);

    system.setCloudCoverageIntent(false, 0);
    system.update(0.016);
    expect(system.getCoverage()).toBeCloseTo(baseline, 5);
  });

  it('weather intent never lowers coverage below the scenario baseline', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('tdm'); // high baseline
    const baseline = system.getCoverage();
    expect(baseline).toBeGreaterThan(0);

    const scene = new THREE.Scene();
    system.attachScene(scene);
    system.syncDomePosition(new THREE.Vector3(0, 5, 0));

    // Request a tiny weather override; baseline must win.
    system.setCloudCoverageIntent(true, 0.05);
    system.update(0.016);
    expect(system.getCoverage()).toBeCloseTo(baseline, 5);
  });

  /**
   * Cross-scenario coverage regression (`cloud-audit-and-polish`). The
   * pre-audit defaults left four of five scenarios invisibly-clouded
   * (coverage ≤ 0.2 with a 3-octave-fbm threshold that filtered them out).
   * After the audit, every scenario must carry a *visible* baseline — the
   * value is a tuning constant, so we assert the shape of the fix (all
   * scenarios non-zero AND above the pre-audit invisible threshold) rather
   * than exact values.
   */
  const ALL_SCENARIOS = ['ashau', 'openfrontier', 'tdm', 'zc', 'combat120'] as const;

  for (const key of ALL_SCENARIOS) {
    it(`applies a visible (non-zero) cloud coverage baseline for '${key}'`, () => {
      const system = new AtmosphereSystem();
      expect(system.applyScenarioPreset(key)).toBe(true);
      const coverage = system.getCoverage();
      expect(coverage).toBeGreaterThan(0);
      // Pre-audit baseline left openfrontier=0.1 and combat120=0.2 reading
      // as empty sky. Assert we're clear of that invisibility floor.
      expect(coverage).toBeGreaterThan(0.2);
      expect(coverage).toBeLessThanOrEqual(1);
    });
  }

  it('preset cloud coverages preserve the intended ordering (clear scenarios < overcast scenarios)', () => {
    // The authored-atmosphere intent: clear-noon scenarios (openfrontier,
    // combat120) carry lighter coverage than overcast scenarios (tdm).
    // Assert the *ordering* rather than specific magnitudes so tuning can
    // shift without tests rotting.
    const system = new AtmosphereSystem();

    system.applyScenarioPreset('openfrontier');
    const openfrontier = system.getCoverage();
    system.applyScenarioPreset('combat120');
    const combat120 = system.getCoverage();
    system.applyScenarioPreset('tdm');
    const tdm = system.getCoverage();

    expect(openfrontier).toBeLessThan(tdm);
    expect(combat120).toBeLessThan(tdm);
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

/**
 * Behavior contract for `fog-density-rebalance` (cycle-2026-04-21): fog
 * density lives alongside the sky preset so density and horizon color
 * track together. These tests assert the caller-visible seam — applying
 * a preset stamps a density onto the bound renderer — without hard-coding
 * the exact density per scenario (those are tuning values).
 */
describe('AtmosphereSystem (preset-driven fog density)', () => {
  const makeFogRenderer = () => {
    const fog: any = { color: new THREE.Color(0x000000), density: 0.999 };
    return { renderer: { fog } as any, fog };
  };

  it('applies the preset fog density onto the bound renderer when a scenario is applied', () => {
    const system = new AtmosphereSystem();
    const { renderer, fog } = makeFogRenderer();
    system.setRenderer(renderer);

    system.applyScenarioPreset('openfrontier');

    // The density should be scenario-driven (not the test stub's 0.999
    // sentinel, and not a generic default); this is the caller-visible
    // contract: preset swap => fog density swap on the renderer.
    expect(fog.density).not.toBe(0.999);
    expect(fog.density).toBeGreaterThan(0);
    expect(fog.density).toBeLessThan(0.04); // below the underwater clamp
  });

  it('different scenarios stamp different fog densities', () => {
    // A Shau (dawn patrol, 21km DEM, 4km draw distance) needs a thinner
    // haze than a short-duration dusk deathmatch so distant mountains
    // stay legible. Assert the *ordering* (ashau < tdm) rather than the
    // exact values — the ordering is the behavior we care about.
    const system = new AtmosphereSystem();
    const { renderer, fog } = makeFogRenderer();
    system.setRenderer(renderer);

    system.applyScenarioPreset('ashau');
    const ashauDensity = fog.density;

    system.applyScenarioPreset('tdm');
    const tdmDensity = fog.density;

    expect(ashauDensity).toBeLessThan(tdmDensity);
  });

  it('does not throw when applyScenarioPreset runs before a renderer is bound', () => {
    const system = new AtmosphereSystem();
    // Menu-phase AtmosphereSystem has no renderer yet; applying a preset
    // must still succeed and return true.
    expect(system.applyScenarioPreset('combat120')).toBe(true);
  });
});

/**
 * Behavior contract for the WorldBuilder `forceTimeOfDay` wiring
 * (cycle-2026-05-09-doc-decomposition-and-wiring, Phase 1 R2). The dev
 * console publishes a [-1, 1] knob on `window.__worldBuilder`; values in
 * [0, 1] pin simulated time to that fraction of the active preset's
 * `todCycle.dayLengthSeconds`. The static-sun fallback (`combat120`) must
 * be unaffected since it has no `todCycle`.
 */
describe('AtmosphereSystem (WorldBuilder forceTimeOfDay wiring)', () => {
  const FULL_WB_STATE = {
    invulnerable: false,
    infiniteAmmo: false,
    noClip: false,
    oneShotKills: false,
    shadowsEnabled: true,
    postProcessEnabled: true,
    hudVisible: true,
    ambientAudioEnabled: true,
    npcTickPaused: false,
    forceTimeOfDay: -1,
    active: true,
  };

  afterEach(() => {
    delete (globalThis as any).window?.__worldBuilder;
  });

  it('snaps simulated time to forceTimeOfDay * dayLengthSeconds when the flag is in [0,1]', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('ashau');
    const dayLen = system.getCurrentPreset()!.todCycle!.dayLengthSeconds;

    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__worldBuilder = { ...FULL_WB_STATE, forceTimeOfDay: 0.5 };

    // Update — wiring should snap simulated time to ~0.5 * dayLen this frame.
    system.update(0.016);
    expect(system.getSimulationTimeSeconds()).toBeCloseTo(0.5 * dayLen, 3);

    // Subsequent frames stay pinned even though natural advance would tick.
    system.update(0.016);
    expect(system.getSimulationTimeSeconds()).toBeCloseTo(0.5 * dayLen, 3);
  });

  it('lets simulated time advance naturally when forceTimeOfDay is -1', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('ashau');

    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__worldBuilder = { ...FULL_WB_STATE, forceTimeOfDay: -1 };

    const before = system.getSimulationTimeSeconds();
    system.update(2.5);
    expect(system.getSimulationTimeSeconds()).toBeGreaterThan(before + 2);
  });

  it('different forceTimeOfDay fractions produce different sun directions', () => {
    const dawn = new AtmosphereSystem();
    dawn.applyScenarioPreset('openfrontier');
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__worldBuilder = { ...FULL_WB_STATE, forceTimeOfDay: 0.0 };
    dawn.update(0.016);
    const dawnDir = dawn.getSunDirection(new THREE.Vector3()).clone();

    const noon = new AtmosphereSystem();
    noon.applyScenarioPreset('openfrontier');
    (globalThis as any).window.__worldBuilder = { ...FULL_WB_STATE, forceTimeOfDay: 0.25 };
    noon.update(0.016);
    const noonDir = noon.getSunDirection(new THREE.Vector3());

    const distance = Math.hypot(noonDir.x - dawnDir.x, noonDir.y - dawnDir.y, noonDir.z - dawnDir.z);
    expect(distance).toBeGreaterThan(0.05);
  });

  it('does not throw on a static-sun preset (no todCycle) when the flag is set', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('combat120');
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.__worldBuilder = { ...FULL_WB_STATE, forceTimeOfDay: 0.5 };

    // combat120 carries no todCycle; flag must be silently ignored.
    expect(() => system.update(0.016)).not.toThrow();
  });
});
