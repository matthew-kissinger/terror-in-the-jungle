// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../effects/SmokeCloudSystem', () => ({
  spawnSmokeCloud: vi.fn(),
}));

import { GameEventBus } from '../../core/GameEventBus';
import { SmokeMarkerSystem } from './SmokeMarkerSystem';
import { spawnSmokeCloud } from '../effects/SmokeCloudSystem';

function terrain() {
  return {
    getEffectiveHeightAt: () => 0,
    getHeightAt: () => 0,
  } as any;
}

describe('SmokeMarkerSystem', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.7, 0);
    camera.lookAt(0, 1.4, -10);
    vi.mocked(spawnSmokeCloud).mockClear();
  });

  it('maps charge power to a farther smoke-marker throw velocity', () => {
    const direction = new THREE.Vector3(0, 0, -1);
    const low = SmokeMarkerSystem.computeThrowVelocity(direction, 0.3, new THREE.Vector3());
    const high = SmokeMarkerSystem.computeThrowVelocity(direction, 1.0, new THREE.Vector3());
    expect(high.length()).toBeGreaterThan(low.length());
    expect(high.y).toBeGreaterThan(low.y);
  });

  it('cancels an equipped marker without leaving charge state', () => {
    const system = new SmokeMarkerSystem(scene, camera, terrain());
    const endHook = vi.fn();
    system.setThrowModeEndHook(endHook);
    system.beginThrowMode();
    expect(system.beginCharge()).toBe(true);
    expect(system.cancelThrowMode()).toBe(true);
    expect(system.isHandlingInput()).toBe(false);
    expect(system.getActiveMark()).toBeNull();
    expect(endHook).toHaveBeenCalledWith('cancelled');
  });

  it('settles the thrown canister, starts smoke, and records a target mark', () => {
    const system = new SmokeMarkerSystem(scene, camera, terrain());
    const emitSpy = vi.spyOn(GameEventBus, 'emit');
    const endHook = vi.fn();
    system.setThrowModeEndHook(endHook);

    system.beginThrowMode();
    system.beginCharge();
    system.update(1.0);
    expect(system.releaseThrow()).toBe(true);
    expect(endHook).toHaveBeenCalledWith('thrown');

    for (let i = 0; i < 240 && !system.getActiveMark(); i++) {
      system.update(1 / 60);
    }

    const mark = system.getActiveMark();
    expect(mark).not.toBeNull();
    expect(mark?.kind).toBe('smoke-marker');
    expect(spawnSmokeCloud).toHaveBeenCalledWith(expect.any(THREE.Vector3));
    expect(emitSpy).toHaveBeenCalledWith('target_mark_set', expect.objectContaining({
      mark: expect.objectContaining({ kind: 'smoke-marker' }),
    }));
  });
});
