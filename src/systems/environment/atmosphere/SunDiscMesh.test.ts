// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  SunDiscMesh,
  SUN_DISC_MAX_SINE_FREQUENCY,
  SUN_DISC_SINE_FREQ,
  computeSunDiscSurfaceTerms,
} from './SunDiscMesh';

/**
 * Behaviour contract for the additive HDR sun-disc sprite. We assert what
 * callers observe — visibility, world placement, tonemap-bypassed additive
 * material flags, and SDS-style ownership metadata — not the internal radial
 * shader expression or a specific HDR peak constant.
 */
describe('SunDiscMesh', () => {
  const DOME_RADIUS = 500;

  it('hides the sprite when the sun is below the horizon', () => {
    const disc = new SunDiscMesh(DOME_RADIUS, { enabled: true });
    const camera = new THREE.Vector3(0, 0, 0);
    const subHorizonSun = new THREE.Vector3(0.7, -0.4, 0.5).normalize();
    const sunColor = new THREE.Color(1, 0.9, 0.7);

    disc.update(camera, subHorizonSun, sunColor);

    expect(disc.getMesh().visible).toBe(false);
  });

  it('shows the sprite when the sun is above the horizon by default', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);
    const camera = new THREE.Vector3(0, 0, 0);
    const noonSun = new THREE.Vector3(0.3, 0.9, 0.3).normalize();
    const sunColor = new THREE.Color(1, 1, 1);

    disc.update(camera, noonSun, sunColor);

    expect(disc.getMesh().visible).toBe(true);
  });

  it('positions the sprite at sunDirection x dome-radius x (just inside the dome), anchored to the camera', () => {
    const disc = new SunDiscMesh(DOME_RADIUS, { enabled: true });
    const camera = new THREE.Vector3(123, 50, -77);
    const sunDir = new THREE.Vector3(0.4, 0.8, 0.45).normalize();
    const sunColor = new THREE.Color(1, 1, 1);

    disc.update(camera, sunDir, sunColor);

    const pos = disc.getMesh().position;
    // Direction from camera to sprite must match the sun unit vector.
    const dx = pos.x - camera.x;
    const dy = pos.y - camera.y;
    const dz = pos.z - camera.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Distance is slightly less than dome radius — the sprite sits
    // just inside the dome so the additive blend reads on top of the
    // sky-dome paint. Anything ~within 1% of the dome radius is right.
    expect(distance).toBeGreaterThan(DOME_RADIUS * 0.9);
    expect(distance).toBeLessThan(DOME_RADIUS);
    // Unit-direction from camera matches the supplied sun vector.
    expect(dx / distance).toBeCloseTo(sunDir.x, 3);
    expect(dy / distance).toBeCloseTo(sunDir.y, 3);
    expect(dz / distance).toBeCloseTo(sunDir.z, 3);
  });

  it('uses tonemap-bypassed additive blending and depth testing for ridge occlusion', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);
    const material = disc.getMaterial();

    // Tonemap bypass keeps the hot body from collapsing into a dull LDR spot.
    expect(material.toneMapped).toBe(false);
    expect(material.transparent).toBe(true);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    // Depth flags: the body does not write depth, but it must depth-test so
    // terrain can occlude it instead of letting light bleed through ridges.
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(true);
  });

  it('keeps the explicit WebGL fallback on the bounded hot-body path', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);

    disc.setRendererBackend('webgl');
    const material = disc.getMaterial();

    expect(material.name).toBe('SunDiscWebGL');
    expect(material.blending).toBe(THREE.NormalBlending);
    expect(material.toneMapped).toBe(false);
    expect(material.depthTest).toBe(true);
  });

  it('records that the mesh owns only the hot body while the dome owns atmospheric glow', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);
    const material = disc.getMaterial() as THREE.Material & {
      userData: {
        sunDiscOwnership?: { owns?: string; skyOwns?: string };
        sunDiscShape?: {
          bodyRadius?: number;
          bodyFeather?: number;
          hotCoreRadius?: number;
          hotCoreFeather?: number;
          ownershipTuning?: string;
        };
      };
    };

    expect(material.userData.sunDiscOwnership?.owns).toBe('disc-body-only');
    expect(material.userData.sunDiscOwnership?.skyOwns).toBe(
      'atmospheric-glow-and-horizon-scatter',
    );
    expect(material.userData.sunDiscShape?.hotCoreRadius).toBeLessThan(
      material.userData.sunDiscShape?.bodyRadius ?? 0,
    );
    expect(material.userData.sunDiscShape?.hotCoreFeather).toBeGreaterThan(
      material.userData.sunDiscShape?.hotCoreRadius ?? 0,
    );
  });

  it('keeps the hot center broad enough to read as fire instead of a pin in a dull sphere', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);
    const material = disc.getMaterial() as THREE.Material & {
      userData: {
        sunDiscShape?: {
          bodyRadius?: number;
          bodyFeather?: number;
          hotCoreRadius?: number;
          hotCoreFeather?: number;
          ownershipTuning?: string;
        };
      };
    };
    const shape = material.userData.sunDiscShape;

    expect(shape?.ownershipTuning).toBe('large-hot-core-fractured-amber-shell');
    expect(shape?.hotCoreRadius ?? 0).toBeGreaterThan((shape?.bodyRadius ?? 1) * 0.85);
    expect(shape?.bodyFeather ?? 1).toBeLessThan((shape?.bodyRadius ?? 0) * 1.35);
  });

  it('returns the same mesh handle so AtmosphereSystem can attach it once', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);
    const a = disc.getMesh();
    const b = disc.getMesh();
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(THREE.Mesh);
    expect(a.name).toBe('SunDiscSprite');
  });

  it('starts hidden until update() decides whether the sun is above the horizon', () => {
    // Important: a sub-horizon scenario booted by a preset that never
    // ticks `update` should not flash a bright disc on the first frame.
    const disc = new SunDiscMesh(DOME_RADIUS);
    expect(disc.getMesh().visible).toBe(false);
  });

  // --- Surface-texture band-limit (CPU mirror of the shared TSL/GLSL terms) ---
  //
  // Owner playtest 2026-06-28: the disc read as an "LED-dot lattice" because the
  // plasma/filament/granule sine terms stacked frequencies up to ~x317 over the
  // disc UV, which aliases into a regular dot grid at render resolution. These
  // tests pin the band-limit on the CPU mirror — the same coefficients the
  // shaders inject — so the disc keeps surface mottling without the lattice.
  describe('surface-texture band-limit (no dot lattice)', () => {
    // The historical max coefficient that produced the visible lattice; the cap
    // must stay well below this so the terms can no longer alias into a grid.
    const LATTICE_FREQUENCY = 317;

    it('caps every sine coefficient at the band-limit, well below the lattice frequency', () => {
      expect(SUN_DISC_MAX_SINE_FREQUENCY).toBeLessThan(LATTICE_FREQUENCY * 0.5);

      const coefficients = Object.values(SUN_DISC_SINE_FREQ);
      expect(coefficients.length).toBeGreaterThan(0);
      for (const coeff of coefficients) {
        expect(Math.abs(coeff)).toBeLessThanOrEqual(SUN_DISC_MAX_SINE_FREQUENCY);
      }
    });

    it('produces low-frequency mottling: terms stay smooth across one render texel', () => {
      // Sample the CPU mirror across a small UV step (~ one texel of the 128px
      // fallback over the disc body). A band-limited field changes only gently
      // texel-to-texel; the old x317 terms swung the full 0..1 range, which is
      // exactly the per-pixel flip that read as a dot grid.
      const step = 1 / 128; // one texel in centered-UV units
      let maxDelta = 0;
      for (let i = 0; i < 64; i += 1) {
        const cx = -0.3 + (i / 64) * 0.6;
        const cy = 0.07;
        const a = computeSunDiscSurfaceTerms(cx, cy);
        const b = computeSunDiscSurfaceTerms(cx + step, cy);
        maxDelta = Math.max(
          maxDelta,
          Math.abs(a.plasma - b.plasma),
          Math.abs(a.filament - b.filament),
          Math.abs(a.granule - b.granule),
        );
      }
      // A full 0..1 flip across one texel is the lattice signature. Stay well
      // under that — band-limited terms vary only a fraction per texel.
      expect(maxDelta).toBeLessThan(0.5);
    });

    it('keeps all three surface terms in the 0..1 range', () => {
      for (let i = 0; i < 50; i += 1) {
        const cx = -0.4 + (i / 50) * 0.8;
        const cy = -0.25 + (i / 50) * 0.5;
        const { plasma, filament, granule } = computeSunDiscSurfaceTerms(cx, cy);
        for (const v of [plasma, filament, granule]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    });

    it('keeps a warm, hot core: the disc center is bright and warmer in red than blue', () => {
      // The fallback DataTexture is the CPU render of the disc. Its center pixel
      // is the hot core — it must stay bright and warm (red-dominant), not get
      // flattened by the band-limit.
      const disc = new SunDiscMesh(DOME_RADIUS);
      const material = disc.getMaterial() as THREE.Material & {
        userData: { sunDiscFallbackTexture?: THREE.DataTexture };
      };
      const texture = material.userData.sunDiscFallbackTexture;
      expect(texture).toBeDefined();

      const size = texture!.image.width as number;
      const data = texture!.image.data as Uint8Array;
      const cx = Math.floor(size / 2);
      const cy = Math.floor(size / 2);
      const i = (cy * size + cx) * 4;
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      const alpha = data[i + 3];

      // Hot core reads as a bright, warm body, not a dull/transparent spot.
      expect(red).toBeGreaterThan(200);
      expect(red).toBeGreaterThan(blue);
      expect(alpha).toBeGreaterThan(120);
      expect(green).toBeGreaterThan(blue * 0.5);

      disc.dispose();
    });
  });

  it('dispose() releases material + geometry resources', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);
    // No throw is the smoke check; calling twice would over-dispose so
    // we only assert that a fresh dispose call is safe.
    expect(() => disc.dispose()).not.toThrow();
  });

  it('defaults to enabled — sprite shows for an above-horizon sun', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);
    const camera = new THREE.Vector3(0, 0, 0);
    const noonSun = new THREE.Vector3(0.3, 0.9, 0.3).normalize();
    const sunColor = new THREE.Color(1, 1, 1);

    disc.update(camera, noonSun, sunColor);

    expect(disc.isEnabled()).toBe(true);
    expect(disc.getMesh().visible).toBe(true);
  });

  it('setEnabled(true) re-enables the horizon-gated path; setEnabled(false) hides the sprite immediately', () => {
    const disc = new SunDiscMesh(DOME_RADIUS, { enabled: false });
    const camera = new THREE.Vector3(0, 0, 0);
    const noonSun = new THREE.Vector3(0.3, 0.9, 0.3).normalize();
    const sunColor = new THREE.Color(1, 1, 1);

    // Explicitly disabled — even after update() the sprite stays hidden.
    disc.update(camera, noonSun, sunColor);
    expect(disc.getMesh().visible).toBe(false);

    // Enable → next update shows the sprite for an above-horizon sun.
    disc.setEnabled(true);
    expect(disc.isEnabled()).toBe(true);
    disc.update(camera, noonSun, sunColor);
    expect(disc.getMesh().visible).toBe(true);

    // Disable mid-frame → sprite hides immediately (no one-frame leak).
    disc.setEnabled(false);
    expect(disc.getMesh().visible).toBe(false);
  });
});
