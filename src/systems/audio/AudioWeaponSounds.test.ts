// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Logger } from '../../utils/Logger';
import type { AudioDuckingSystem } from './AudioDuckingSystem';
import type { AudioPoolManager } from './AudioPoolManager';
import { AudioWeaponSounds } from './AudioWeaponSounds';

vi.mock('../../utils/Logger', () => ({
  Logger: {
    warn: vi.fn(),
  },
}));

describe('AudioWeaponSounds', () => {
  let sound: THREE.Audio;
  let positionalDeathSounds: THREE.PositionalAudio[];
  let poolManager: AudioPoolManager;
  let weaponSounds: AudioWeaponSounds;

  beforeEach(() => {
    sound = {
      isPlaying: false,
      setVolume: vi.fn(),
      setPlaybackRate: vi.fn(),
      play: vi.fn(),
    } as unknown as THREE.Audio;
    positionalDeathSounds = [
      makePositionalSound('ally0'),
      makePositionalSound('enemy1'),
      makePositionalSound('ally2'),
      makePositionalSound('enemy3'),
    ];

    poolManager = {
      getBulletWhizPool: vi.fn(() => [sound]),
      getDeathSoundPool: vi.fn(() => positionalDeathSounds),
      getAvailableSound: vi.fn((pool: THREE.Audio[]) => pool[0] ?? null),
      getAvailablePositionalSound: vi.fn((pool: THREE.PositionalAudio[]) => pool[0] ?? null),
    } as unknown as AudioPoolManager;

    weaponSounds = new AudioWeaponSounds(
      new THREE.Scene(),
      {} as THREE.AudioListener,
      poolManager,
      { markCombatSound: vi.fn() } as unknown as AudioDuckingSystem,
    );

    vi.mocked(Logger.warn).mockClear();
  });

  it('rejects far bullet whiz candidates without computing exact distance', () => {
    const bulletPosition = new THREE.Vector3(4, 0, 0);
    const playerPosition = new THREE.Vector3(0, 0, 0);
    const distanceTo = vi.spyOn(bulletPosition, 'distanceTo');

    weaponSounds.playBulletWhizSound(bulletPosition, playerPosition);

    expect(distanceTo).not.toHaveBeenCalled();
    expect(poolManager.getBulletWhizPool).not.toHaveBeenCalled();
    expect(sound.play).not.toHaveBeenCalled();
  });

  it('preserves the exact 3m boundary and proximity volume', () => {
    weaponSounds.playBulletWhizSound(
      new THREE.Vector3(3, 0, 0),
      new THREE.Vector3(0, 0, 0),
    );

    expect(poolManager.getBulletWhizPool).toHaveBeenCalledTimes(1);
    expect(poolManager.getAvailableSound).toHaveBeenCalledTimes(1);
    expect(sound.setVolume).toHaveBeenCalledWith(0);
    expect(sound.setPlaybackRate).toHaveBeenCalledTimes(1);
    expect(sound.play).toHaveBeenCalledTimes(1);
  });

  it('keeps missing bullet-whiz asset warnings one-shot', () => {
    vi.mocked(poolManager.getAvailableSound).mockReturnValue(null);

    weaponSounds.playBulletWhizSound(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
    );
    weaponSounds.playBulletWhizSound(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
    );

    expect(Logger.warn).toHaveBeenCalledTimes(1);
    expect(Logger.warn).toHaveBeenCalledWith('audio', 'Missing optional bulletWhiz asset; near-miss SFX disabled');
  });

  it('reuses a parity scratch pool for ally and enemy death sounds', () => {
    const passedPoolRefs: THREE.PositionalAudio[][] = [];
    const passedPoolIds: string[][] = [];
    vi.mocked(poolManager.getAvailablePositionalSound).mockImplementation((pool: THREE.PositionalAudio[]) => {
      passedPoolRefs.push(pool);
      passedPoolIds.push(pool.map((entry) => String(entry.userData.id)));
      return pool[0] ?? null;
    });

    weaponSounds.playDeathSound(new THREE.Vector3(1, 2, 3), true);
    weaponSounds.playDeathSound(new THREE.Vector3(4, 5, 6), false);

    expect(passedPoolRefs).toHaveLength(2);
    expect(passedPoolRefs[0]).toBe(passedPoolRefs[1]);
    expect(passedPoolIds).toEqual([
      ['ally0', 'ally2'],
      ['enemy1', 'enemy3'],
    ]);
    expect(positionalDeathSounds[0].play).toHaveBeenCalledTimes(1);
    expect(positionalDeathSounds[1].play).toHaveBeenCalledTimes(1);
  });
});

function makePositionalSound(id: string): THREE.PositionalAudio {
  const sound = new THREE.Object3D() as THREE.PositionalAudio;
  sound.userData.id = id;
  sound.isPlaying = false;
  sound.play = vi.fn();
  sound.stop = vi.fn();
  return sound;
}
