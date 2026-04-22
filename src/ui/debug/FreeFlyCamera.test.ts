/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FreeFlyCamera, type FreeFlyInput } from './FreeFlyCamera';

function defaultInput(overrides: Partial<FreeFlyInput> = {}): FreeFlyInput {
  return {
    forward: false, back: false, left: false, right: false,
    up: false, down: false, fast: false, slow: false,
    ...overrides,
  };
}

describe('FreeFlyCamera', () => {
  it('starts inactive and exposes its own THREE.PerspectiveCamera', () => {
    const ff = new FreeFlyCamera();
    expect(ff.isActive()).toBe(false);
    expect(ff.getCamera()).toBeInstanceOf(THREE.PerspectiveCamera);
  });

  it('activate() copies pose from the source camera', () => {
    const source = new THREE.PerspectiveCamera(60, 1.5, 0.1, 2000);
    source.position.set(10, 20, 30);
    source.lookAt(0, 20, 0);
    const ff = new FreeFlyCamera();
    ff.activate(source);
    expect(ff.isActive()).toBe(true);
    expect(ff.getCamera().position.x).toBeCloseTo(10);
    expect(ff.getCamera().position.y).toBeCloseTo(20);
    expect(ff.getCamera().position.z).toBeCloseTo(30);
  });

  it('WASD forward translates the camera along its forward direction', () => {
    const source = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    source.position.set(0, 0, 0);
    source.lookAt(0, 0, -1);  // facing -Z
    const ff = new FreeFlyCamera();
    ff.activate(source);
    const before = ff.getCamera().position.clone();
    ff.update(0.1, defaultInput({ forward: true }));
    const after = ff.getCamera().position.clone();
    // Moved along -Z (forward).
    expect(after.z).toBeLessThan(before.z);
  });

  it('Shift modifier makes translation faster than the same interval without it', () => {
    const make = () => {
      const s = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
      s.position.set(0, 0, 0);
      s.lookAt(0, 0, -1);
      const ff = new FreeFlyCamera();
      ff.activate(s);
      return ff;
    };
    const slow = make();
    const fast = make();
    slow.update(0.1, defaultInput({ forward: true }));
    fast.update(0.1, defaultInput({ forward: true, fast: true }));
    expect(Math.abs(fast.getCamera().position.z)).toBeGreaterThan(Math.abs(slow.getCamera().position.z));
  });

  it('Q moves down, E moves up', () => {
    const source = new THREE.PerspectiveCamera();
    source.position.set(0, 100, 0);
    const ff = new FreeFlyCamera();
    ff.activate(source);
    ff.update(0.1, defaultInput({ down: true })); // Q
    expect(ff.getCamera().position.y).toBeLessThan(100);
    const up = new FreeFlyCamera();
    up.activate(source);
    up.update(0.1, defaultInput({ up: true })); // E
    expect(up.getCamera().position.y).toBeGreaterThan(100);
  });

  it('deactivate() clears active state without mutating the source camera', () => {
    const source = new THREE.PerspectiveCamera();
    source.position.set(5, 6, 7);
    const originalSource = source.position.clone();
    const ff = new FreeFlyCamera();
    ff.activate(source);
    ff.update(0.5, defaultInput({ forward: true, fast: true }));
    ff.deactivate();
    expect(ff.isActive()).toBe(false);
    // Source camera must be untouched — that's how the player view snaps back.
    expect(source.position.equals(originalSource)).toBe(true);
  });

  it('mouse delta yaws the camera', () => {
    const source = new THREE.PerspectiveCamera();
    const ff = new FreeFlyCamera();
    ff.activate(source);
    const beforeQuat = ff.getCamera().quaternion.clone();
    ff.applyMouseDelta(100, 0);
    ff.update(0, defaultInput());
    expect(ff.getCamera().quaternion.equals(beforeQuat)).toBe(false);
  });

  it('follow target drives camera position toward the target on update', () => {
    const source = new THREE.PerspectiveCamera();
    source.position.set(0, 0, 0);
    const ff = new FreeFlyCamera();
    ff.activate(source);
    const targetPos = new THREE.Vector3(100, 10, 200);
    ff.setFollowTarget({
      getPosition: (tgt) => { tgt.copy(targetPos); return tgt; },
    });
    ff.update(0.016, defaultInput());
    const cp = ff.getCamera().position;
    // Should be near the target (within follow distance + height).
    expect(cp.distanceTo(targetPos)).toBeLessThan(20);
    expect(cp.y).toBeGreaterThan(targetPos.y);
  });

  it('follow drops when the target returns null (despawned)', () => {
    const source = new THREE.PerspectiveCamera();
    const ff = new FreeFlyCamera();
    ff.activate(source);
    ff.setFollowTarget({ getPosition: () => null });
    expect(ff.hasFollowTarget()).toBe(true);
    ff.update(0.016, defaultInput());
    expect(ff.hasFollowTarget()).toBe(false);
  });
});
