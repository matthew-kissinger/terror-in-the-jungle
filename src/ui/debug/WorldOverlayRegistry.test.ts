import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WorldOverlayRegistry, type WorldOverlay } from './WorldOverlayRegistry';

function makeOverlay(id: string, defaultVisible = false) {
  const marker = new THREE.Group();
  marker.name = `overlay-${id}`;
  const state = {
    id, label: id, defaultVisible,
    mounts: 0, unmounts: 0, updates: 0,
    mount(group: THREE.Group) { state.mounts++; group.add(marker); },
    unmount() { state.unmounts++; if (marker.parent) marker.parent.remove(marker); },
    update() { state.updates++; },
  } satisfies WorldOverlay & { mounts: number; unmounts: number; updates: number };
  return state;
}

describe('WorldOverlayRegistry', () => {
  it('register does not mount until toggled on (lazy allocation)', () => {
    const scene = new THREE.Scene();
    const reg = new WorldOverlayRegistry(scene);
    const o = makeOverlay('a');
    reg.register(o);
    expect(o.mounts).toBe(0);
    reg.toggleOverlay('a');
    expect(o.mounts).toBe(1);
    expect(reg.getGroup().children.length).toBeGreaterThan(0);
    reg.dispose();
  });

  it('toggle off unmounts overlay subtree so it does not stay in the scene graph', () => {
    const scene = new THREE.Scene();
    const reg = new WorldOverlayRegistry(scene);
    const o = makeOverlay('a');
    reg.register(o);
    reg.toggleOverlay('a');
    reg.toggleOverlay('a');
    expect(o.unmounts).toBe(1);
    expect(reg.getGroup().children.length).toBe(0);
    reg.dispose();
  });

  it('master toggle hides the group without unmounting overlays', () => {
    const scene = new THREE.Scene();
    const reg = new WorldOverlayRegistry(scene);
    const o = makeOverlay('a');
    reg.register(o);
    reg.toggleOverlay('a');
    reg.toggleAll();
    expect(reg.isMasterVisible()).toBe(false);
    expect(o.unmounts).toBe(0);
    expect(reg.getGroup().visible).toBe(false);
    reg.dispose();
  });

  it('update fans out only to visible overlays when master is on', () => {
    const scene = new THREE.Scene();
    const reg = new WorldOverlayRegistry(scene);
    const a = makeOverlay('a');
    const b = makeOverlay('b');
    reg.register(a);
    reg.register(b);
    reg.toggleOverlay('a');
    reg.update(0.016);
    expect(a.updates).toBe(1);
    expect(b.updates).toBe(0);
    reg.setMasterVisible(false);
    reg.update(0.016);
    expect(a.updates).toBe(1);
    reg.dispose();
  });

  it('dispose unmounts visible overlays and detaches the shared group', () => {
    const scene = new THREE.Scene();
    const reg = new WorldOverlayRegistry(scene);
    const a = makeOverlay('a');
    reg.register(a);
    reg.toggleOverlay('a');
    reg.dispose();
    expect(a.unmounts).toBe(1);
    expect(scene.children.some((c) => c.name === 'WorldOverlayRegistry')).toBe(false);
  });

  it('duplicate registration throws', () => {
    const scene = new THREE.Scene();
    const reg = new WorldOverlayRegistry(scene);
    reg.register(makeOverlay('dup'));
    expect(() => reg.register(makeOverlay('dup'))).toThrow();
    reg.dispose();
  });
});
