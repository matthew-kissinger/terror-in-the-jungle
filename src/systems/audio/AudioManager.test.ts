/**
 * Behavior tests for `AudioManager` focused on the WorldBuilder
 * `ambientAudioEnabled` wiring (cycle-2026-05-09-doc-decomposition-and-wiring,
 * Phase 1 R2). Asserts the observable seam: flipping the dev god-mode flag
 * down mutes the ambient layer and flipping it back up restores it. The
 * audio-context + sub-module surfaces are stubbed so the test runs in node.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// AudioContext isn't available in node — stub THREE.AudioListener / AudioLoader.
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockAudioListener {
    context = { state: 'running', resume: vi.fn() };
    setMasterVolume = vi.fn();
    getMasterVolume = vi.fn().mockReturnValue(1);
  }
  class MockAudioLoader { load = vi.fn(); }
  return {
    ...actual,
    AudioListener: MockAudioListener as unknown as typeof actual.AudioListener,
    AudioLoader: MockAudioLoader as unknown as typeof actual.AudioLoader,
  };
});

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./AudioPoolManager', () => ({
  AudioPoolManager: class { initializePools = vi.fn(); getAvailableSound = vi.fn(); getHitFeedbackPool = vi.fn().mockReturnValue([]); dispose = vi.fn(); },
}));
vi.mock('./AudioDuckingSystem', () => ({
  AudioDuckingSystem: class { update = vi.fn(); },
}));
const setVolumeSpy = vi.fn();
vi.mock('./AmbientSoundManager', () => ({
  AmbientSoundManager: class { start = vi.fn(); setVolume = setVolumeSpy; getAmbientSounds = vi.fn().mockReturnValue([]); dispose = vi.fn(); },
}));
vi.mock('./AudioWeaponSounds', () => ({ AudioWeaponSounds: class {} }));
vi.mock('../../core/GameEventBus', () => ({
  GameEventBus: { subscribe: vi.fn().mockReturnValue(() => {}) },
}));

import { AudioManager } from './AudioManager';

const WB_STATE = {
  invulnerable: false, infiniteAmmo: false, noClip: false, oneShotKills: false,
  shadowsEnabled: true, postProcessEnabled: true, hudVisible: true,
  ambientAudioEnabled: true, npcTickPaused: false, forceTimeOfDay: -1, active: true,
};

describe('AudioManager — WorldBuilder ambientAudioEnabled wiring', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;

  beforeEach(() => {
    setVolumeSpy.mockClear();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).document = (globalThis as any).document ?? {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    delete (globalThis as any).window?.__worldBuilder;
  });

  it('mutes ambient on first update after the flag flips false', () => {
    (globalThis as any).window.__worldBuilder = { ...WB_STATE, ambientAudioEnabled: false };
    new AudioManager(scene, camera).update(0.016);
    expect(setVolumeSpy).toHaveBeenCalledWith(0);
  });

  it('restores ambient on first update after the flag flips back true', () => {
    (globalThis as any).window.__worldBuilder = { ...WB_STATE, ambientAudioEnabled: false };
    const manager = new AudioManager(scene, camera);
    manager.update(0.016);
    expect(setVolumeSpy).toHaveBeenLastCalledWith(0);

    (globalThis as any).window.__worldBuilder = { ...WB_STATE, ambientAudioEnabled: true };
    manager.update(0.016);
    expect(setVolumeSpy).toHaveBeenLastCalledWith(1);
  });

  it('does not call setVolume every tick when the flag is steady', () => {
    (globalThis as any).window.__worldBuilder = { ...WB_STATE, ambientAudioEnabled: false };
    const manager = new AudioManager(scene, camera);
    manager.update(0.016);
    setVolumeSpy.mockClear();
    for (let i = 0; i < 5; i++) manager.update(0.016);
    expect(setVolumeSpy).not.toHaveBeenCalled();
  });

  it('does not touch ambient volume when no WorldBuilder state is published', () => {
    delete (globalThis as any).window.__worldBuilder;
    new AudioManager(scene, camera).update(0.016);
    expect(setVolumeSpy).not.toHaveBeenCalled();
  });
});
