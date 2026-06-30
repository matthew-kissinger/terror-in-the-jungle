// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AudioDuckingSystem } from './AudioDuckingSystem';
import type { SoundscapeBedHandle } from './SoundscapeDirector';

describe('AudioDuckingSystem', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves ambient beds untouched before any combat sound', () => {
    const system = new AudioDuckingSystem();
    const bed = makeBed(0.3);
    const nowSpy = vi.spyOn(performance, 'now');

    system.update(1 / 60, [bed]);

    expect(nowSpy).not.toHaveBeenCalled();
    expect(bed.sound.setVolume).not.toHaveBeenCalled();
  });

  it('attenuates ambient beds below their pre-duck gain during combat', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const system = new AudioDuckingSystem();
    const bed = makeBed(0.3);

    system.markCombatSound();
    now = 1100;
    system.update(0.15, [bed]);

    const applied = lastVolume(bed.sound);
    expect(applied).toBeGreaterThan(0);
    expect(applied).toBeLessThan(bed.gainBeforeDuck);
  });

  it('ducks every bed by the same factor, preserving the day/night mix ratio', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const system = new AudioDuckingSystem();
    const dayBed = makeBed(0.4);
    const nightBed = makeBed(0.1);

    system.markCombatSound();
    now = 1100;
    system.update(0.2, [dayBed, nightBed]);

    const dayApplied = lastVolume(dayBed.sound);
    const nightApplied = lastVolume(nightBed.sound);
    // Both scaled by the same duck factor -> ratio matches the pre-duck ratio.
    expect(dayApplied / nightApplied).toBeCloseTo(
      dayBed.gainBeforeDuck / nightBed.gainBeforeDuck,
      5,
    );
  });

  it('returns ambient beds toward full gain after combat stops', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const system = new AudioDuckingSystem();
    const bed = makeBed(0.3);

    system.markCombatSound();
    now = 1100;
    system.update(0.3, [bed]); // ducked
    const ducked = lastVolume(bed.sound);

    now = 6000;
    for (let i = 0; i < 20; i++) system.update(0.1, [bed]); // long after timeout
    const recovered = lastVolume(bed.sound);

    expect(recovered).toBeGreaterThan(ducked);
    expect(recovered).toBeCloseTo(bed.gainBeforeDuck, 5);
  });
});

function makeBed(gainBeforeDuck: number): SoundscapeBedHandle {
  return {
    gainBeforeDuck,
    sound: { setVolume: vi.fn() } as unknown as THREE.Audio,
  };
}

function lastVolume(sound: THREE.Audio): number {
  const mock = sound.setVolume as unknown as { mock: { calls: number[][] } };
  const calls = mock.mock.calls;
  return calls[calls.length - 1][0];
}
