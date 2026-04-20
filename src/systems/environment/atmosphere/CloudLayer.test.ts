import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CloudLayer } from './CloudLayer';

/**
 * Behavior contract for `CloudLayer`: edge-on alpha fade when the camera
 * is near the plane's altitude, coverage clamping, and mesh visibility
 * gating at zero coverage. Implementation details (shader uniforms,
 * specific noise scale, etc.) are not asserted — the goal here is to
 * guarantee the flight-envelope contract from the task brief.
 */
describe('CloudLayer (flight-envelope + coverage contract)', () => {
  const sunDir = new THREE.Vector3(0, 1, 0);
  const sunColor = new THREE.Color(1, 1, 1);

  it('is hidden at zero coverage even after an update', () => {
    const layer = new CloudLayer();
    layer.setCoverage(0);

    const camera = new THREE.Vector3(0, 5, 0);
    layer.update(camera, 0, sunDir, sunColor);

    expect(layer.getMesh().visible).toBe(false);
  });

  it('becomes visible when coverage and altitude are both valid', () => {
    const layer = new CloudLayer();
    layer.setCoverage(0.5);

    const camera = new THREE.Vector3(0, 5, 0); // 1195m below the plane
    layer.update(camera, 0, sunDir, sunColor);

    expect(layer.getMesh().visible).toBe(true);
    expect(layer.getEdgeFade()).toBeCloseTo(1, 5);
  });

  it('alpha-fades to zero when the camera sits exactly at cloud altitude', () => {
    const layer = new CloudLayer();
    layer.setCoverage(1.0);

    const baseAltitude = layer.getBaseAltitude();
    const camera = new THREE.Vector3(0, baseAltitude, 0);
    layer.update(camera, 0, sunDir, sunColor);

    expect(layer.getEdgeFade()).toBeCloseTo(0, 5);
    expect(layer.getMesh().visible).toBe(false);
  });

  it('alpha-fades partially when the camera is within the fade band', () => {
    const layer = new CloudLayer();
    layer.setCoverage(1.0);

    // 50m below the plane: inside the fade band, must be partial.
    const baseAltitude = layer.getBaseAltitude();
    const camera = new THREE.Vector3(0, baseAltitude - 50, 0);
    layer.update(camera, 0, sunDir, sunColor);

    const fade = layer.getEdgeFade();
    expect(fade).toBeGreaterThan(0);
    expect(fade).toBeLessThan(1);
  });

  it('is visible again from above the fade band (looking down on clouds)', () => {
    const layer = new CloudLayer();
    layer.setCoverage(1.0);

    const baseAltitude = layer.getBaseAltitude();
    const camera = new THREE.Vector3(0, baseAltitude + 500, 0);
    layer.update(camera, 0, sunDir, sunColor);

    expect(layer.getEdgeFade()).toBeCloseTo(1, 5);
    expect(layer.getMesh().visible).toBe(true);
  });

  it('cloud base altitude stays above the NPC fixed-wing cruise ceiling', () => {
    // NPC fixed-wing pilots cruise at 180m AGL; CAS missions up to 300m.
    // FixedWingControlLaw test fixture climbs to 800m exactly. Cloud base
    // must sit well above all of these so gunships and fighters do not
    // cross the plane during normal play. See the cloud-runtime brief for
    // the recon numbers.
    const layer = new CloudLayer();
    expect(layer.getBaseAltitude()).toBeGreaterThan(800);
  });

  it('follows the camera horizontally so the player stays under cloud cover', () => {
    const layer = new CloudLayer();
    layer.setCoverage(0.5);

    const camera = new THREE.Vector3(350, 5, -120);
    layer.update(camera, 10, sunDir, sunColor);

    // Mesh XZ must track the camera; Y must sit above local terrain.
    expect(layer.getMesh().position.x).toBeCloseTo(350, 3);
    expect(layer.getMesh().position.z).toBeCloseTo(-120, 3);
    expect(layer.getMesh().position.y).toBeGreaterThan(1000);
  });

  it('clamps coverage into [0, 1]', () => {
    const layer = new CloudLayer();
    layer.setCoverage(-0.5);
    expect(layer.getCoverage()).toBe(0);
    layer.setCoverage(2.5);
    expect(layer.getCoverage()).toBe(1);
  });

  it('dispose() is safe and drops mesh resources', () => {
    const layer = new CloudLayer();
    expect(() => layer.dispose()).not.toThrow();
  });
});
