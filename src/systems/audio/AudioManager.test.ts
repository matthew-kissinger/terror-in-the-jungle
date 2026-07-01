// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
  class MockAudioListener extends actual.Object3D {
    context = { state: 'running', resume: vi.fn() };
    setMasterVolume = vi.fn();
    getMasterVolume = vi.fn().mockReturnValue(1);
  }
  class MockAudioLoader { load = vi.fn(); }
  class MockAudio extends actual.Object3D {
    setBuffer = vi.fn();
    setVolume = vi.fn();
    setPlaybackRate = vi.fn();
    play = vi.fn();
  }
  class MockPositionalAudio extends MockAudio {
    setRefDistance = vi.fn();
    setMaxDistance = vi.fn();
    setRolloffFactor = vi.fn();
  }
  return {
    ...actual,
    AudioListener: MockAudioListener as unknown as typeof actual.AudioListener,
    AudioLoader: MockAudioLoader as unknown as typeof actual.AudioLoader,
    Audio: MockAudio as unknown as typeof actual.Audio,
    PositionalAudio: MockPositionalAudio as unknown as typeof actual.PositionalAudio,
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
vi.mock('./SoundscapeDirector', () => ({
  SoundscapeDirector: class {
    start = vi.fn();
    setVolume = setVolumeSpy;
    setSkyRuntime = vi.fn();
    update = vi.fn();
    getActiveBeds = vi.fn().mockReturnValue([]);
    dispose = vi.fn();
  },
}));
vi.mock('./AudioWeaponSounds', () => ({ AudioWeaponSounds: class {} }));
// Radio is its own system (covered by RadioStationSystem.test.ts); here we only
// assert AudioManager routes the music controls through it. Capture the spies on
// the constructed instance so a test can observe the routing.
const radioSpies = {
  setEnabled: vi.fn(),
  setMusicVolume: vi.fn(),
  tuneTo: vi.fn().mockResolvedValue(undefined),
  getSelectedStationId: vi.fn().mockReturnValue('firebase-tension'),
  getActiveMusicBed: vi.fn().mockReturnValue(null),
  update: vi.fn(),
  dispose: vi.fn(),
};
vi.mock('./RadioStationSystem', () => ({
  RadioStationSystem: class {
    setEnabled = radioSpies.setEnabled;
    setMusicVolume = radioSpies.setMusicVolume;
    tuneTo = radioSpies.tuneTo;
    getSelectedStationId = radioSpies.getSelectedStationId;
    getActiveMusicBed = radioSpies.getActiveMusicBed;
    update = radioSpies.update;
    dispose = radioSpies.dispose;
  },
}));
vi.mock('../../utils/DeviceDetector', () => ({
  shouldUseTouchControls: vi.fn().mockReturnValue(false),
}));
const gameEventBusMock = vi.hoisted(() => {
  const subscriptions: Array<{ type: string; callback: (event: any) => void }> = [];
  return {
    subscriptions,
    subscribe: vi.fn((type: string, callback: (event: any) => void) => {
      subscriptions.push({ type, callback });
      return vi.fn();
    }),
  };
});
vi.mock('../../core/GameEventBus', () => ({
  GameEventBus: { subscribe: gameEventBusMock.subscribe },
}));
vi.mock('../../core/StartupTelemetry', () => ({
  markStartup: vi.fn(),
}));

import { AudioManager } from './AudioManager';
import { Faction } from '../combat/types';
import { SOUNDSCAPE_CONFIG } from '../../config/soundscape';
import { AUDIO_VARIANT_SETS, SOUND_CONFIGS } from '../../config/audio';

beforeEach(() => {
  gameEventBusMock.subscriptions.length = 0;
  gameEventBusMock.subscribe.mockClear();
});

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

  const BOOT_CRITICAL_PATHS = new Set(
    SOUNDSCAPE_CONFIG.enabled
      ? [SOUNDSCAPE_CONFIG.dayBed.path, SOUNDSCAPE_CONFIG.nightBed.path]
      : [],
  );

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

    if (BOOT_CRITICAL_PATHS.size > 0) {
      // Synchronously, only the boot-critical loads have been enqueued —
      // init() is awaiting Promise.all on those and has not yet scheduled
      // the background SFX bank.
      expect(pendingLoads.length).toBe(BOOT_CRITICAL_PATHS.size);
      expect(pendingLoads.every((l) => BOOT_CRITICAL_PATHS.has(l.path))).toBe(true);

      // Resolve ONLY the boot-critical (ambient) loads. If init() awaited
      // the full bank, this would not be enough to let it resolve.
      resolveBootCriticalLoads();
    }

    await initPromise;

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

describe('AudioManager — radio music routes through the radio system', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;

  beforeEach(() => {
    radioSpies.setEnabled.mockClear();
    radioSpies.setMusicVolume.mockClear();
    radioSpies.tuneTo.mockClear();
    radioSpies.getActiveMusicBed.mockClear();
    radioSpies.update.mockClear();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).document = (globalThis as any).document ?? {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  it('does not enable music until asked (default-OFF)', () => {
    new AudioManager(scene, camera);
    expect(radioSpies.setEnabled).not.toHaveBeenCalledWith(true);
  });

  it('enabling music and tuning a station reaches the radio system', () => {
    const manager = new AudioManager(scene, camera);
    manager.setMusicEnabled(true);
    expect(radioSpies.setEnabled).toHaveBeenCalledWith(true);

    manager.tuneRadioStation('rolling-thunder');
    expect(radioSpies.tuneTo).toHaveBeenCalledWith('rolling-thunder');
  });

  it('forwards the music volume to the radio system', () => {
    const manager = new AudioManager(scene, camera);
    manager.setMusicVolume(0.4);
    expect(radioSpies.setMusicVolume).toHaveBeenCalledWith(0.4);
  });

  it('feeds the active radio bed into ducking each update', () => {
    const manager = new AudioManager(scene, camera);
    manager.update(0.016);
    expect(radioSpies.update).toHaveBeenCalled();
    expect(radioSpies.getActiveMusicBed).toHaveBeenCalled();
  });
});

describe('AudioManager — zone capture audio proximity', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).document = (globalThis as any).document ?? {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  function zoneCaptureSubscription(): (event: {
    zoneId: string;
    zoneName: string;
    faction: Faction;
    position: THREE.Vector3;
    radius: number;
  }) => void {
    const subscription = gameEventBusMock.subscriptions.find((s) => s.type === 'zone_captured');
    expect(subscription).toBeDefined();
    return subscription!.callback;
  }

  it('plays capture audio from the objective position when the player is near the objective', async () => {
    camera.position.set(16, 1.6, 0);
    const manager = new AudioManager(scene, camera);
    const playSpy = vi.spyOn(manager, 'playVariantSet').mockImplementation(() => {});

    await manager.init();
    const position = new THREE.Vector3(0, 0, 0);
    zoneCaptureSubscription()({
      zoneId: 'alpha',
      zoneName: 'Alpha',
      faction: Faction.US,
      position,
      radius: 18,
    });

    expect(playSpy).toHaveBeenCalledWith('zoneCapturedLocal', position, 0.6);
  });

  it('does not play capture audio for distant objective captures', async () => {
    camera.position.set(200, 1.6, 0);
    const manager = new AudioManager(scene, camera);
    const playSpy = vi.spyOn(manager, 'play').mockImplementation(() => {});

    await manager.init();
    zoneCaptureSubscription()({
      zoneId: 'bravo',
      zoneName: 'Bravo',
      faction: Faction.US,
      position: new THREE.Vector3(0, 0, 0),
      radius: 18,
    });

    expect(playSpy).not.toHaveBeenCalled();
  });
});

describe('AudioManager — approved objective/capture variant pools', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).document = (globalThis as any).document ?? {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('promotes exactly five local objective and capture variants', () => {
    expect(AUDIO_VARIANT_SETS.objectiveCompleteLocal).toHaveLength(5);
    expect(AUDIO_VARIANT_SETS.zoneCapturedLocal).toHaveLength(5);
    for (const key of AUDIO_VARIANT_SETS.objectiveCompleteLocal) {
      expect(SOUND_CONFIGS[key]?.path).toMatch(/^assets\/optimized\/objectiveCompleteLocal\d{2}\.ogg$/);
    }
    for (const key of AUDIO_VARIANT_SETS.zoneCapturedLocal) {
      expect(SOUND_CONFIGS[key]?.path).toMatch(/^assets\/optimized\/zoneCapturedLocal\d{2}\.ogg$/);
      expect(SOUND_CONFIGS[key]?.path).not.toContain('capture-confirmation-alt-v2.ogg');
    }
  });

  it('plays a variant set without immediately repeating the prior selected clip', () => {
    const manager = new AudioManager(scene, camera);
    const playSpy = vi.spyOn(manager, 'play').mockImplementation(() => {});
    vi.spyOn(Math, 'random').mockReturnValue(0);

    manager.playVariantSet('zoneCapturedLocal', new THREE.Vector3(1, 0, 2), 0.5);
    manager.playVariantSet('zoneCapturedLocal', new THREE.Vector3(1, 0, 2), 0.5);

    expect(playSpy).toHaveBeenNthCalledWith(1, 'zoneCapturedLocal01', expect.any(THREE.Vector3), 0.5);
    expect(playSpy).toHaveBeenNthCalledWith(2, 'zoneCapturedLocal02', expect.any(THREE.Vector3), 0.5);
  });
});
