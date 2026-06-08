// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
    // Behavior contract: the dome mesh has a sky material attached. The
    // concrete material class shifted from `MeshBasicMaterial` (LUT-bake
    // dome) to `MeshBasicNodeMaterial` (TSL per-fragment Preetham, default
    // mode after cycle `tsl-preetham-fragment-port`); both render the
    // dome, and the test cares that ONE is present, not which.
    const mat = (skyMesh as THREE.Mesh).material as THREE.Material;
    expect(mat).toBeDefined();
    expect(mat.side).toBe(THREE.BackSide);
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

  it('deep-night sampled sky stays cool and visibly above black', () => {
    const backend = new HosekWilkieSkyBackend();
    backend.applyPreset(SCENARIO_ATMOSPHERE_PRESETS.openfrontier);
    const elevationRad = (-15 * Math.PI) / 180;
    const sun = new THREE.Vector3(Math.cos(elevationRad), Math.sin(elevationRad), 0).normalize();
    backend.update(0.016, sun);

    const zenith = backend.getZenith(new THREE.Color());
    const horizon = backend.getHorizon(new THREE.Color());
    for (const color of [zenith, horizon]) {
      const luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
      expect(luma).toBeGreaterThan(0.005);
      expect(color.b).toBeGreaterThan(color.r);
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

  it('continuous sun motion does not refresh the sky texture every LUT rebake', () => {
    // Simulates a 4.5s window of todCycle-style continuous sun sweep at
    // ~0.6deg/sec. Without the refresh-cadence gate this would mark the
    // texture dirty every ~0.83s (5-6 fires); with the gate the timer
    // caps the expensive 8192-pixel composite at the refresh cadence
    // (2 s) so it runs at most a small number of times in the window.
    const backend = new HosekWilkieSkyBackend();
    backend.applyPreset(SCENARIO_ATMOSPHERE_PRESETS.ashau);
    backend.resetRefreshStatsForDebug();

    const totalSeconds = 4.5;
    const dt = 1 / 60;
    const azimuthRatePerSec = (0.6 * Math.PI) / 180;
    const startAzimuth = SCENARIO_ATMOSPHERE_PRESETS.ashau.sunAzimuthRad;
    const elevation = SCENARIO_ATMOSPHERE_PRESETS.ashau.sunElevationRad;
    const cosE = Math.cos(elevation);
    const sinE = Math.sin(elevation);
    const sun = new THREE.Vector3();
    let elapsed = 0;
    while (elapsed < totalSeconds) {
      elapsed += dt;
      const az = startAzimuth + azimuthRatePerSec * elapsed;
      sun.set(cosE * Math.cos(az), sinE, cosE * Math.sin(az)).normalize();
      backend.update(dt, sun);
    }

    const stats = backend.getRefreshStatsForDebug();
    // Cadence ceiling: at most ceil(window / refreshSeconds) fires.
    // Window 4.5s and refresh cadence 2s permits up to 3.
    expect(stats.fireCount).toBeLessThanOrEqual(3);
  });

  it('stretching the refresh cadence reduces sky-texture fire rate over a fixed window', () => {
    // Behavior contract for `setRefreshCadenceSeconds`. Drive identical
    // continuous sun motion under two cadences and assert the longer
    // cadence fires the expensive composite strictly less often. This is
    // the load-bearing mobile knob (cycle-mobile-webgl2-fallback-fix) — we
    // assert the observable reduction, not the specific cadence constant.
    function fireCountForCadence(seconds: number): number {
      const backend = new HosekWilkieSkyBackend();
      backend.applyPreset(SCENARIO_ATMOSPHERE_PRESETS.ashau);
      backend.setRefreshCadenceSeconds(seconds);
      backend.resetRefreshStatsForDebug();

      const totalSeconds = 16;
      const dt = 1 / 60;
      const azimuthRatePerSec = (0.6 * Math.PI) / 180;
      const startAzimuth = SCENARIO_ATMOSPHERE_PRESETS.ashau.sunAzimuthRad;
      const elevation = SCENARIO_ATMOSPHERE_PRESETS.ashau.sunElevationRad;
      const cosE = Math.cos(elevation);
      const sinE = Math.sin(elevation);
      const sun = new THREE.Vector3();
      let elapsed = 0;
      while (elapsed < totalSeconds) {
        elapsed += dt;
        const az = startAzimuth + azimuthRatePerSec * elapsed;
        sun.set(cosE * Math.cos(az), sinE, cosE * Math.sin(az)).normalize();
        backend.update(dt, sun);
      }
      return backend.getRefreshStatsForDebug().fireCount;
    }

    const fastCadenceFires = fireCountForCadence(2);
    const slowCadenceFires = fireCountForCadence(8);
    // 4x cadence stretch should cut fire count roughly 4x; assert the
    // observable direction (strictly fewer) plus a sane lower bound.
    expect(slowCadenceFires).toBeLessThan(fastCadenceFires);
    expect(slowCadenceFires).toBeLessThanOrEqual(Math.ceil(fastCadenceFires / 2));
  });

  it('ignores non-finite or non-positive refresh cadence overrides', () => {
    // Defensive contract: callers that compute the cadence from a config
    // path can hand us garbage during mode-switches. The backend must keep
    // a sane cadence rather than disable the gate.
    const backend = new HosekWilkieSkyBackend();
    const before = backend.getRefreshCadenceSeconds();
    backend.setRefreshCadenceSeconds(Number.NaN);
    backend.setRefreshCadenceSeconds(0);
    backend.setRefreshCadenceSeconds(-1);
    expect(backend.getRefreshCadenceSeconds()).toBe(before);
  });
});

/**
 * Behavior contract for the elevation-keyed sun↔moon color blend
 * (`night-red-fix`). Before this fix, sub-horizon sun directions produced
 * a pure-red `sunColor` because the long-optical-path Fex transmittance
 * annihilates green and blue while red survives — the peak-normalisation
 * then locked that to (1, 0, 0). The fix blends toward cool moonlight
 * across a civil-twilight band so the night hemisphere reads moonlit
 * rather than blood-red. See
 * `docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md` Section 1
 * observation 2 + Section 3 last paragraph.
 */
describe('HosekWilkieSkyBackend (night-red elevation blend)', () => {
  function bakeAt(elevationDeg: number): THREE.Color {
    const backend = new HosekWilkieSkyBackend();
    // Use a sane mid-turbidity preset so the Fex math runs normally
    // through `computeTransmittance`. Sub-horizon `sunDirection` is the
    // load-bearing input — we drive it through `update()` directly so
    // the LUT bakes against the requested elevation rather than the
    // preset's stored elevation.
    backend.applyPreset(SCENARIO_ATMOSPHERE_PRESETS.openfrontier);
    const elevationRad = (elevationDeg * Math.PI) / 180;
    const sun = new THREE.Vector3(Math.cos(elevationRad), Math.sin(elevationRad), 0).normalize();
    backend.update(0.016, sun);
    return backend.getSun(new THREE.Color());
  }

  it('deep-night sun direction (-10°) bakes a cool moonlight color, not red bleed', () => {
    // Pre-fix: peak-normalised Fex returned roughly (1, ~0, ~0) — pure
    // red. Post-fix: at -10° the elevation-keyed blend pulls the color
    // fully to MOON_COLOR so the result reads cool (blue dominant, no
    // red dominance). The spike memo line 151 specifies MOON_COLOR
    // ≈ (0.18, 0.20, 0.30) and line 175 expresses the regression
    // criterion as "NOT red-dominant"; we assert that observable
    // outcome (r is the smallest channel) rather than a tighter
    // fractional bound that would constrain the exact MOON_COLOR
    // chromaticity at the constant level.
    const sun = bakeAt(-10);
    expect(sun.r).toBeLessThan(sun.g);
    expect(sun.r).toBeLessThan(sun.b);
    // And specifically: the blue channel dominates a cool moonlight
    // result, so b > g > r is the expected ordering.
    expect(sun.b).toBeGreaterThan(sun.g);
  });

  it('vibe-band sun direction (-5°) is warmer than deep night (-10°)', () => {
    // The civil-twilight band (-2° to -8°) is the "vibe" zone where
    // sub-horizon Fex warmth still bleeds through partially. The blend
    // is smooth across the band, so a vibe-band sample must be measurably
    // warmer (more red-shifted relative to blue) than a deep-night
    // sample where the blend is fully moon-cool. We assert the relative
    // warmth-gradient rather than an absolute "r > g > b" ordering
    // because the Fex extinction at -5° is heavy enough that even a
    // partial moon-blend can flip the ordering of the residual green
    // and blue channels — what matters for the player-visible result
    // is the smooth warmth gradient across the band, not the exact
    // channel ordering of a single sample.
    const vibe = bakeAt(-5);
    const night = bakeAt(-10);
    const vibeWarmth = vibe.r - vibe.b;
    const nightWarmth = night.r - night.b;
    expect(vibeWarmth).toBeGreaterThan(nightWarmth);
    expect(vibe.r).toBeGreaterThan(0.3);
  });

  it('above-horizon sun directions are unchanged by the moon blend (preserves daytime behaviour)', () => {
    // The blend is gated on civil-twilight elevations only. At any
    // elevation above -2°, t = 0 so the sun color is the raw
    // peak-normalised Fex (the existing daytime behaviour). We assert
    // the existing "low-sun warmer than noon" contract still holds.
    const noon = bakeAt(60);
    const dawn = bakeAt(5);
    expect(dawn.r - dawn.b).toBeGreaterThan(noon.r - noon.b);
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

  it('tracks a coarse world and altitude anchor for sky-dome cloud features', () => {
    const backend = new HosekWilkieSkyBackend();
    backend.setCloudCoverage(0.5);

    backend.setCloudWorldAnchor(new THREE.Vector3(120, 40, -80));
    const first = backend.getCloudAnchorDebug();
    backend.setCloudWorldAnchor(new THREE.Vector3(124, 42, -76));
    const withinThreshold = backend.getCloudAnchorDebug();
    backend.setCloudWorldAnchor(new THREE.Vector3(180, 40, -20));
    const moved = backend.getCloudAnchorDebug();

    expect(first.model).toBe('camera-followed-dome-world-altitude-clouds');
    expect(first.deckAltitudeMeters).toBeGreaterThan(1000);
    expect(first.maxTraceMeters).toBeGreaterThan(first.deckAltitudeMeters);
    expect(first.horizonFadeStartY).toBeGreaterThan(0);
    expect(first.horizonFadeFullY).toBeGreaterThan(first.horizonFadeStartY);
    expect(withinThreshold.anchorX).toBe(first.anchorX);
    expect(withinThreshold.anchorZ).toBe(first.anchorZ);
    expect(moved.anchorX).toBe(180);
    expect(moved.anchorZ).toBe(-20);
  });

  it('samples clouds from direction/world position rather than texture U seams', () => {
    const backend = new HosekWilkieSkyBackend();
    backend.setCloudCoverage(1);
    backend.setCloudFeatureScaleMeters(1400);
    backend.setCloudWorldAnchor(new THREE.Vector3(120, 40, -80));

    const rightOfWrap = new THREE.Vector3(1, 0.35, 0.002).normalize();
    const leftOfWrap = new THREE.Vector3(1, 0.35, -0.002).normalize();
    const rightMask = backend.sampleCloudMaskForDebug(rightOfWrap);
    const leftMask = backend.sampleCloudMaskForDebug(leftOfWrap);

    expect(Number.isFinite(rightMask)).toBe(true);
    expect(Number.isFinite(leftMask)).toBe(true);
    expect(rightMask).toBeGreaterThanOrEqual(0);
    expect(rightMask).toBeLessThanOrEqual(1);
    expect(leftMask).toBeGreaterThanOrEqual(0);
    expect(leftMask).toBeLessThanOrEqual(1);
    expect(Math.abs(rightMask - leftMask)).toBeLessThan(0.08);
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
