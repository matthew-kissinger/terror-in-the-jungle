import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AtmosphereSystem } from '../AtmosphereSystem';
import { SCENARIO_ATMOSPHERE_PRESETS } from './ScenarioAtmospherePresets';

/**
 * Behavior contract for the analytic sky backend exposed via the
 * `ISkyRuntime` surface that fog / hemisphere readers consume. We test
 * what callers see (sun warms at low elevation, zenith deepens at noon,
 * analytic sky is installed on construction), not the specific
 * Preetham/HW math. Implementation-mirror tests against scattering
 * constants would die the moment we swap in true Hosek-Wilkie
 * coefficients in a future cycle, which is exactly what
 * `docs/TESTING.md` says to avoid.
 */
describe('HosekWilkieSkyBackend (via AtmosphereSystem)', () => {
  it('attaches the dome mesh to a bound scene', () => {
    const scene = new THREE.Scene();
    const system = new AtmosphereSystem();
    system.attachScene(scene);
    const skyMesh = scene.children.find((c) => c.name === 'HosekWilkieSkyDome');
    expect(skyMesh).toBeDefined();
  });

  it('reapplies the same preset cleanly without duplicating the dome', () => {
    const scene = new THREE.Scene();
    const system = new AtmosphereSystem();
    system.attachScene(scene);
    system.applyScenarioPreset('openfrontier');
    system.applyScenarioPreset('openfrontier');
    const skyMeshes = scene.children.filter((c) => c.name === 'HosekWilkieSkyDome');
    expect(skyMeshes.length).toBe(1);
  });

  it('sun direction follows the active preset', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('ashau');
    const dir = system.getSunDirection(new THREE.Vector3());
    const ashauPreset = SCENARIO_ATMOSPHERE_PRESETS.ashau;
    // dawn = low elevation; sun.y should be small and positive.
    expect(dir.y).toBeGreaterThan(0);
    expect(dir.y).toBeLessThan(0.3);
    expect(dir.length()).toBeCloseTo(1, 5);
    // azimuth is the chosen east-southeast direction (not behind the camera).
    expect(Math.atan2(dir.z, dir.x)).toBeCloseTo(ashauPreset.sunAzimuthRad, 2);
  });

  it('produces a non-zero sun color (sun never disappears entirely under any preset)', () => {
    const system = new AtmosphereSystem();
    const out = new THREE.Color();
    for (const key of Object.keys(SCENARIO_ATMOSPHERE_PRESETS) as Array<keyof typeof SCENARIO_ATMOSPHERE_PRESETS>) {
      system.applyScenarioPreset(key);
      const sun = system.getSunColor(out);
      const luma = 0.2126 * sun.r + 0.7152 * sun.g + 0.0722 * sun.b;
      expect(luma).toBeGreaterThan(0);
    }
  });

  it('low-sun preset (dawn) produces a warmer sun than the noon preset', () => {
    const system = new AtmosphereSystem();

    system.applyScenarioPreset('openfrontier');
    const noonSun = system.getSunColor(new THREE.Color());
    const noonWarmth = noonSun.r - noonSun.b;

    system.applyScenarioPreset('ashau');
    const dawnSun = system.getSunColor(new THREE.Color());
    const dawnWarmth = dawnSun.r - dawnSun.b;

    // Warmth = red minus blue. Dawn should be more red-shifted than noon.
    expect(dawnWarmth).toBeGreaterThan(noonWarmth);
  });

  it('noon zenith reads bluer than dawn zenith', () => {
    const system = new AtmosphereSystem();

    system.applyScenarioPreset('openfrontier');
    const noonZenith = system.getZenithColor(new THREE.Color());

    system.applyScenarioPreset('ashau');
    const dawnZenith = system.getZenithColor(new THREE.Color());

    // "Bluer" = blue dominates more relative to red. At noon the sun is
    // high so multi-scattering deepens the zenith blue; at dawn the
    // zenith picks up a warmer wash.
    const noonBlueness = noonZenith.b - noonZenith.r;
    const dawnBlueness = dawnZenith.b - dawnZenith.r;
    expect(noonBlueness).toBeGreaterThan(dawnBlueness);
  });

  it('sky color sampled straight up matches the zenith color', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('openfrontier');
    const zenith = system.getZenithColor(new THREE.Color());
    const sample = system.getSkyColorAtDirection(new THREE.Vector3(0, 1, 0), new THREE.Color());
    // LUT-bin quantisation means we won't hit byte-equal, so compare in RGB
    // float space with a small tolerance.
    expect(Math.abs(sample.r - zenith.r)).toBeLessThan(0.02);
    expect(Math.abs(sample.g - zenith.g)).toBeLessThan(0.02);
    expect(Math.abs(sample.b - zenith.b)).toBeLessThan(0.02);
  });

  it('horizon ring averages to a different color than zenith (sky has a real gradient)', () => {
    const system = new AtmosphereSystem();
    system.applyScenarioPreset('openfrontier');
    const zenith = system.getZenithColor(new THREE.Color());
    const horizon = system.getHorizonColor(new THREE.Color());
    const dr = zenith.r - horizon.r;
    const dg = zenith.g - horizon.g;
    const db = zenith.b - horizon.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    expect(distance).toBeGreaterThan(0.02);
  });

  it('produces no NaN / Inf in any color channel for any preset', () => {
    const system = new AtmosphereSystem();
    const out = new THREE.Color();
    for (const key of Object.keys(SCENARIO_ATMOSPHERE_PRESETS) as Array<keyof typeof SCENARIO_ATMOSPHERE_PRESETS>) {
      system.applyScenarioPreset(key);
      const sun = system.getSunColor(out.clone());
      const zen = system.getZenithColor(out.clone());
      const hor = system.getHorizonColor(out.clone());
      for (const c of [sun, zen, hor]) {
        expect(Number.isFinite(c.r)).toBe(true);
        expect(Number.isFinite(c.g)).toBe(true);
        expect(Number.isFinite(c.b)).toBe(true);
      }
    }
  });

  it('syncDomePosition glues the dome to an arbitrary camera position', () => {
    const scene = new THREE.Scene();
    const system = new AtmosphereSystem();
    system.attachScene(scene);
    system.syncDomePosition(new THREE.Vector3(123, 456, -789));
    const dome = scene.children.find((c) => c.name === 'HosekWilkieSkyDome');
    expect(dome).toBeDefined();
    expect(dome!.position.x).toBe(123);
    expect(dome!.position.y).toBe(456);
    expect(dome!.position.z).toBe(-789);
  });

  it('renders a lit analytic sky on construction with no preset call required', () => {
    // The constructor applies a bootstrap preset so the very first frame
    // gets a real sky. No legacy Skybox PNG, no NullSkyBackend flat color.
    const system = new AtmosphereSystem();
    const zenith = system.getZenithColor(new THREE.Color());
    const horizon = system.getHorizonColor(new THREE.Color());
    const sun = system.getSunColor(new THREE.Color());
    for (const c of [zenith, horizon, sun]) {
      const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      expect(luma).toBeGreaterThan(0);
    }
    // The sky must have a real vertical gradient: zenith differs from
    // horizon (analytic, not a constant fallback).
    const dr = zenith.r - horizon.r;
    const dg = zenith.g - horizon.g;
    const db = zenith.b - horizon.b;
    expect(Math.sqrt(dr * dr + dg * dg + db * db)).toBeGreaterThan(0.02);
  });
});

describe('ScenarioAtmospherePresets', () => {
  it('every preset has a non-zero sun-elevation in [0, pi/2] (no sub-horizon presets)', () => {
    for (const preset of Object.values(SCENARIO_ATMOSPHERE_PRESETS)) {
      expect(preset.sunElevationRad).toBeGreaterThan(0);
      expect(preset.sunElevationRad).toBeLessThan(Math.PI / 2);
    }
  });

  it('every preset has a turbidity in a sensible atmospheric range', () => {
    for (const preset of Object.values(SCENARIO_ATMOSPHERE_PRESETS)) {
      // Hosek-Wilkie / Preetham both get unstable below 1 or above 10.
      expect(preset.turbidity).toBeGreaterThanOrEqual(1);
      expect(preset.turbidity).toBeLessThanOrEqual(10);
    }
  });
});
