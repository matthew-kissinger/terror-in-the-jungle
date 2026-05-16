/**
 * Behavior tests for `AudioManager`:
 *
 * 1. WorldBuilder `ambientAudioEnabled` wiring (cycle-2026-05-09 R2):
 *    flipping the dev god-mode flag down mutes ambient, flipping it back
 *    up restores it.
 * 2. SFX-defer behavior (cycle-mobile-webgl2-fallback-fix, asset-audio-defer):
 *    `init()` returns once the boot-critical ambient bank is decoded
 *    while the SFX bank decodes in the background, and the SFX pools are
 *    initialized once that background decode lands.
 *
 * Audio-context + sub-module surfaces are stubbed so the test runs in node.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// AudioContext isn't available in node — stub THREE.AudioListener / AudioLoader.
// Each test that exercises bank loading installs a fake on `audioLoader.load`.
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
const initializePoolsSpy = vi.fn();
vi.mock('./AudioPoolManager', () => ({
  AudioPoolManager: class { initializePools = initializePoolsSpy; getAvailableSound = vi.fn(); getHitFeedbackPool = vi.fn().mockReturnValue([]); dispose = vi.fn(); },
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
vi.mock('../../core/StartupTelemetry', () => ({
  markStartup: vi.fn(),
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

describe('AudioManager — SFX bank decode deferred beyond critical path', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;

  // Each load() call is queued here so the test can resolve banks
  // in any order — that lets us observe whether `init()` blocks on
  // the boot-critical bank or on the full bank.
  type PendingLoad = { path: string; resolve: (buf: AudioBuffer) => void };
  let pendingLoads: PendingLoad[];

  const BOOT_CRITICAL_PATHS = new Set([
    'assets/optimized/jungle1.ogg',
    'assets/optimized/jungle2.ogg',
  ]);

  beforeEach(() => {
    pendingLoads = [];
    initializePoolsSpy.mockClear();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).document = (globalThis as any).document ?? {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  function installLoader(manager: any): void {
    manager.audioLoader.load = (path: string, onLoad: (buf: AudioBuffer) => void) => {
      pendingLoads.push({ path, resolve: onLoad });
    };
  }

  function resolveBootCriticalLoads(): void {
    for (const load of pendingLoads) {
      if (BOOT_CRITICAL_PATHS.has(load.path)) {
        load.resolve({} as AudioBuffer);
      }
    }
    pendingLoads = pendingLoads.filter((l) => !BOOT_CRITICAL_PATHS.has(l.path));
  }

  function resolveRemainingLoads(): void {
    for (const load of pendingLoads) load.resolve({} as AudioBuffer);
    pendingLoads = [];
  }

  it('init() resolves once the boot-critical ambient bank lands, without waiting for SFX', async () => {
    const { AudioManager } = await import('./AudioManager');
    const manager: any = new AudioManager(scene, camera);
    installLoader(manager);

    const initPromise = manager.init();

    // Synchronously, only the boot-critical loads have been enqueued —
    // init() is awaiting Promise.all on those and has not yet scheduled
    // the background SFX bank.
    expect(pendingLoads.length).toBe(BOOT_CRITICAL_PATHS.size);
    expect(pendingLoads.every((l) => BOOT_CRITICAL_PATHS.has(l.path))).toBe(true);

    // Resolve ONLY the boot-critical (ambient) loads. If init() awaited
    // the full bank, this would not be enough to let it resolve.
    resolveBootCriticalLoads();

    await initPromise; // must resolve before SFX loads are even enqueued

    // The background SFX decode is in flight after init() resolves.
    expect(pendingLoads.length).toBeGreaterThan(0);
    expect(pendingLoads.every((l) => !BOOT_CRITICAL_PATHS.has(l.path))).toBe(true);
  });

  it('does not initialize SFX pools until the background bank decode completes', async () => {
    const { AudioManager } = await import('./AudioManager');
    const manager: any = new AudioManager(scene, camera);
    installLoader(manager);

    const initPromise = manager.init();
    await Promise.resolve();
    resolveBootCriticalLoads();
    await initPromise;

    // Pools must NOT be initialized while SFX bank is still decoding —
    // otherwise the first shot would find an empty pool.
    expect(initializePoolsSpy).not.toHaveBeenCalled();

    // Drain SFX loads and let the background promise complete.
    resolveRemainingLoads();
    await manager.whenSfxReady();

    expect(initializePoolsSpy).toHaveBeenCalledTimes(1);
  });

  it('whenSfxReady() resolves once the SFX bank decode finishes', async () => {
    const { AudioManager } = await import('./AudioManager');
    const manager: any = new AudioManager(scene, camera);
    installLoader(manager);

    const initPromise = manager.init();
    await Promise.resolve();
    resolveBootCriticalLoads();
    await initPromise;

    let sfxReady = false;
    const readyPromise = manager.whenSfxReady().then(() => { sfxReady = true; });
    await Promise.resolve();
    expect(sfxReady).toBe(false);

    resolveRemainingLoads();
    await readyPromise;
    expect(sfxReady).toBe(true);
  });

  it('whenSfxReady() before init() is a safe no-op', async () => {
    const { AudioManager } = await import('./AudioManager');
    const manager: any = new AudioManager(scene, camera);
    await expect(manager.whenSfxReady()).resolves.toBeUndefined();
  });
});
