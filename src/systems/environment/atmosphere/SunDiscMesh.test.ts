import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SunDiscMesh } from './SunDiscMesh';

/**
 * Behaviour contract for the additive HDR sun-disc sprite. We assert
 * what callers observe — visibility, world placement, tonemap-bypassed
 * additive material flags — not the internal radial-gradient pixel
 * values or the specific HDR peak constant. Implementation-mirror tests
 * against the multiplier would break the moment the sky bake path
 * changes (e.g. when `sky-hdr-bake-restore` lands the half-float upload
 * and the disc multiplier is retuned to match), which is the failure
 * mode `docs/TESTING.md` exists to prevent.
 */
describe('SunDiscMesh', () => {
  const DOME_RADIUS = 500;

  it('hides the sprite when the sun is below the horizon', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);
    const camera = new THREE.Vector3(0, 0, 0);
    const subHorizonSun = new THREE.Vector3(0.7, -0.4, 0.5).normalize();
    const sunColor = new THREE.Color(1, 0.9, 0.7);

    disc.update(camera, subHorizonSun, sunColor);

    expect(disc.getMesh().visible).toBe(false);
  });

  it('shows the sprite when the sun is above the horizon', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);
    const camera = new THREE.Vector3(0, 0, 0);
    const noonSun = new THREE.Vector3(0.3, 0.9, 0.3).normalize();
    const sunColor = new THREE.Color(1, 1, 1);

    disc.update(camera, noonSun, sunColor);

    expect(disc.getMesh().visible).toBe(true);
  });

  it('positions the sprite at sunDirection x dome-radius x (just inside the dome), anchored to the camera', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);
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

  it('uses tonemap-bypassed additive blending so the HDR pearl reads at full radiance', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);
    const material = disc.getMaterial();

    // Tonemap bypass: the dome path uses MeshBasicMaterial with default
    // toneMapped=true and that is the documented cause of the bland
    // post-merge sun. The disc must opt out so ACES does not crush the
    // HDR pearl back into LDR before it reaches the screen.
    expect(material.toneMapped).toBe(false);
    expect(material.transparent).toBe(true);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    // Depth flags: the disc must not write to the depth buffer (so it
    // never occludes terrain that subsequently renders against it) and
    // must not depth-test against the dome's `renderOrder = -1` paint.
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(false);
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

  it('dispose() releases material + geometry resources', () => {
    const disc = new SunDiscMesh(DOME_RADIUS);
    // No throw is the smoke check; calling twice would over-dispose so
    // we only assert that a fresh dispose call is safe.
    expect(() => disc.dispose()).not.toThrow();
  });
});
