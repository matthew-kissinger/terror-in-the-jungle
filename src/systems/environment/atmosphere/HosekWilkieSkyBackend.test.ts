import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AtmosphereSystem } from '../AtmosphereSystem';
import { HosekWilkieSkyBackend } from './HosekWilkieSkyBackend';
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

/**
 * Behavior contract for the LUT-rebake amortisation
 * (`atmosphere-day-night-cycle`). A sub-threshold sun-direction change
 * reuses the previously baked horizon/zenith/sun colors; a supra-threshold
 * move triggers a fresh bake visible in the output colors. We assert the
 * observable outcome — same colors for tiny moves, different colors for
 * big moves — rather than the internal threshold constant.
 */
describe('HosekWilkieSkyBackend (LUT rebake threshold)', () => {
  it('reuses cached colors when sun direction changes by a tiny fraction of a degree', () => {
    const backend = new HosekWilkieSkyBackend();
    backend.applyPreset(SCENARIO_ATMOSPHERE_PRESETS.openfrontier);

    const sun = new THREE.Vector3(0.3, 0.8, 0.5).normalize();
    backend.update(0.016, sun);
    const horizonA = backend.getHorizon(new THREE.Color());
    const sunColorA = backend.getSun(new THREE.Color());

    // Nudge by ~0.05deg (well below the 0.5deg threshold). Must not rebake.
    const tinyDelta = 0.05 * (Math.PI / 180);
    const sunSlight = new THREE.Vector3(
      sun.x + Math.sin(tinyDelta) * 0.1,
      sun.y,
      sun.z
    ).normalize();
    backend.update(0.016, sunSlight);
    const horizonB = backend.getHorizon(new THREE.Color());
    const sunColorB = backend.getSun(new THREE.Color());

    // Cached values must be identical (byte-exact) — same LUT contents.
    expect(horizonB.r).toBe(horizonA.r);
    expect(horizonB.g).toBe(horizonA.g);
    expect(horizonB.b).toBe(horizonA.b);
    expect(sunColorB.r).toBe(sunColorA.r);
    expect(sunColorB.g).toBe(sunColorA.g);
    expect(sunColorB.b).toBe(sunColorA.b);
  });

  it('rebakes the LUT when sun direction moves beyond the threshold', () => {
    const backend = new HosekWilkieSkyBackend();
    backend.applyPreset(SCENARIO_ATMOSPHERE_PRESETS.ashau);

    const sunHigh = new THREE.Vector3(0.3, 0.8, 0.5).normalize();
    backend.update(0.016, sunHigh);
    const horizonHigh = backend.getHorizon(new THREE.Color()).clone();

    // Move the sun by ~30deg — well above any reasonable threshold.
    const sunLow = new THREE.Vector3(0.8, 0.05, 0.5).normalize();
    backend.update(0.016, sunLow);
    const horizonLow = backend.getHorizon(new THREE.Color());

    // Horizon color must shift observably — a low sun reddens / dims the
    // horizon ring versus a high sun.
    const dr = horizonHigh.r - horizonLow.r;
    const dg = horizonHigh.g - horizonLow.g;
    const db = horizonHigh.b - horizonLow.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    expect(distance).toBeGreaterThan(0.01);
  });
});

describe('HosekWilkieSkyBackend (sky-integrated cloud coverage)', () => {
  it('clamps cloud coverage for the sky-dome cloud pass', () => {
    const backend = new HosekWilkieSkyBackend();

    backend.setCloudCoverage(-1);
    expect(backend.getCloudCoverage()).toBe(0);

    backend.setCloudCoverage(2);
    expect(backend.getCloudCoverage()).toBe(1);
  });

  it('accepts and resets cloud feature scale without invalidating sky samples', () => {
    const backend = new HosekWilkieSkyBackend();
    backend.applyPreset(SCENARIO_ATMOSPHERE_PRESETS.openfrontier);

    backend.setCloudFeatureScaleMeters(1400);
    backend.resetCloudFeatureScale();
    backend.update(0.016, new THREE.Vector3(0.3, 0.8, 0.4).normalize());

    const zenith = backend.getZenith(new THREE.Color());
    expect(Number.isFinite(zenith.r)).toBe(true);
    expect(Number.isFinite(zenith.g)).toBe(true);
    expect(Number.isFinite(zenith.b)).toBe(true);
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
