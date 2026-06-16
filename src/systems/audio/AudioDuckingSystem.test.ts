// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AudioDuckingSystem } from './AudioDuckingSystem';

describe('AudioDuckingSystem', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves pre-combat ambient sounds untouched without reading the frame clock', () => {
    const system = new AudioDuckingSystem();
    const ambientSound = makeAmbientSound();
    const nowSpy = vi.spyOn(performance, 'now');

    system.update(1 / 60, [ambientSound]);

    expect(nowSpy).not.toHaveBeenCalled();
    expect(ambientSound.setVolume).not.toHaveBeenCalled();
  });

  it('applies the existing combat ducking fade after a combat sound', () => {
    let now = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const system = new AudioDuckingSystem();
    const ambientSound = makeAmbientSound();

    system.markCombatSound();
    now = 1100;
    system.update(0.15, [ambientSound]);

    expect(nowSpy).toHaveBeenCalledTimes(2);
    expect(ambientSound.setVolume).toHaveBeenCalledWith(0.24);
  });

  it('keeps fading ambient volume back toward base after the combat timeout', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const system = new AudioDuckingSystem();
    const ambientSound = makeAmbientSound();

    system.markCombatSound();
    now = 1100;
    system.update(0.3, [ambientSound]);
    now = 3601;
    system.update(0.15, [ambientSound]);

    expect(ambientSound.setVolume).toHaveBeenLastCalledWith(0.24);
  });
});

function makeAmbientSound(): THREE.Audio {
  return {
    setVolume: vi.fn(),
  } as unknown as THREE.Audio;
}
