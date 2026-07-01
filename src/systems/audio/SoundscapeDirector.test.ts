// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behavior tests for `SoundscapeDirector`. These assert observable mix
 * behavior (which bed is louder, that the crossfade eases rather than snaps,
 * that the master scalar silences the mix, that disabled one-shots stay silent)
 * rather than any tuning constant or internal state name.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { ISkyRuntime } from '../../types/SystemInterfaces';
import { SoundscapeDirector } from './SoundscapeDirector';
import { SOUNDSCAPE_CONFIG } from '../../config/soundscape';
import type { SoundscapeConfig } from '../../config/soundscape';

interface FakeAudio {
  setBuffer: ReturnType<typeof vi.fn>;
  setLoop: ReturnType<typeof vi.fn>;
  setVolume: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onEnded?: () => void;
  isPlaying: boolean;
  volume: number;
}

function makeFakeAudio(): FakeAudio {
  const audio: FakeAudio = {
    setBuffer: vi.fn(),
    setLoop: vi.fn(),
    setVolume: vi.fn((v: number) => {
      audio.volume = v;
    }),
    play: vi.fn(() => {
      audio.isPlaying = true;
    }),
    stop: vi.fn(() => {
      audio.isPlaying = false;
    }),
    isPlaying: false,
    volume: 0,
  };
  return audio;
}

/** A sky stub whose sun elevation we can move between calls. */
function makeSky(sunY: { value: number }): ISkyRuntime {
  return {
    getSunDirection: (out: THREE.Vector3) => out.set(0, sunY.value, 0),
    getSunColor: (out: THREE.Color) => out,
    getSkyColorAtDirection: (_dir: THREE.Vector3, out: THREE.Color) => out,
    getZenithColor: (out: THREE.Color) => out,
    getHorizonColor: (out: THREE.Color) => out,
  };
}

const TEST_SOUNDSCAPE_CONFIG: SoundscapeConfig = {
  ...SOUNDSCAPE_CONFIG,
  enabled: true,
};

describe('SoundscapeDirector', () => {
  let created: FakeAudio[];
  let buffers: Map<string, AudioBuffer>;
  let factory: () => THREE.Audio;

  beforeEach(() => {
    created = [];
    factory = () => {
      const a = makeFakeAudio();
      created.push(a);
      return a as unknown as THREE.Audio;
    };
    buffers = new Map<string, AudioBuffer>();
    // All soundscape keys decode to a non-null buffer.
    buffers.set(TEST_SOUNDSCAPE_CONFIG.dayBed.key, {} as AudioBuffer);
    buffers.set(TEST_SOUNDSCAPE_CONFIG.nightBed.key, {} as AudioBuffer);
    for (const o of TEST_SOUNDSCAPE_CONFIG.oneShots) buffers.set(o.key, {} as AudioBuffer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeDirector(sky?: ISkyRuntime): {
    director: SoundscapeDirector;
    beds: () => { day: FakeAudio; night: FakeAudio };
  } {
    const listener = {} as THREE.AudioListener;
    const director = new SoundscapeDirector(listener, buffers, TEST_SOUNDSCAPE_CONFIG, factory);
    if (sky) director.setSkyRuntime(sky);
    // After start() the first two created audios are the day + night beds.
    const beds = () => ({ day: created[0], night: created[1] });
    return { director, beds };
  }

  it('starts both beds looping and playing', () => {
    const { director, beds } = makeDirector();
    director.start();
    const { day, night } = beds();
    expect(day.setLoop).toHaveBeenCalledWith(true);
    expect(night.setLoop).toHaveBeenCalledWith(true);
    expect(day.isPlaying).toBe(true);
    expect(night.isPlaying).toBe(true);
  });

  it('favors the day bed when the sun is high', () => {
    const sunY = { value: 0.8 };
    const { director, beds } = makeDirector(makeSky(sunY));
    director.start();
    const { day, night } = beds();
    expect(day.volume).toBeGreaterThan(night.volume);
    expect(night.volume).toBe(0);
  });

  it('favors the night bed when the sun is below the horizon', () => {
    const sunY = { value: -0.8 };
    const { director, beds } = makeDirector(makeSky(sunY));
    director.start();
    const { day, night } = beds();
    expect(night.volume).toBeGreaterThan(day.volume);
    expect(day.volume).toBe(0);
  });

  it('degrades to the day bed when no sky runtime is injected', () => {
    const { director, beds } = makeDirector(); // no sky
    director.start();
    const { day, night } = beds();
    expect(day.volume).toBeGreaterThan(0);
    expect(night.volume).toBe(0);
  });

  it('eases the crossfade over time rather than snapping when the sun sets', () => {
    const sunY = { value: 0.8 }; // start at day
    const { director, beds } = makeDirector(makeSky(sunY));
    director.start();
    const { day, night } = beds();
    expect(day.volume).toBeGreaterThan(0);
    expect(night.volume).toBe(0);

    // Sun drops below the horizon; a single short frame must not fully cross.
    sunY.value = -0.8;
    director.update(0.05);
    expect(day.volume).toBeGreaterThan(0); // still fading down, not zeroed instantly

    // Given enough simulated time it fully crosses to night.
    for (let i = 0; i < 200; i++) director.update(0.1);
    expect(night.volume).toBeGreaterThan(day.volume);
    expect(day.volume).toBe(0);
  });

  it('silences the whole mix at master volume 0 and restores the ratio at 1', () => {
    const { director, beds } = makeDirector(makeSky({ value: 0.0 })); // mid: both beds audible
    director.start();
    const { day, night } = beds();
    const dayAtFull = day.volume;
    const nightAtFull = night.volume;
    expect(dayAtFull).toBeGreaterThan(0);
    expect(nightAtFull).toBeGreaterThan(0);

    director.setVolume(0);
    expect(day.volume).toBe(0);
    expect(night.volume).toBe(0);

    director.setVolume(1);
    expect(day.volume).toBeCloseTo(dayAtFull, 6);
    expect(night.volume).toBeCloseTo(nightAtFull, 6);
  });

  it('reports active beds with the gain held before ducking', () => {
    const { director, beds } = makeDirector(makeSky({ value: 0.8 }));
    director.start();
    const { day } = beds();
    const active = director.getActiveBeds();
    expect(active.length).toBe(2);
    const dayHandle = active.find((b) => (b.sound as unknown as FakeAudio) === day);
    expect(dayHandle?.gainBeforeDuck).toBeCloseTo(day.volume, 6);
  });

  it('does not fire ambient one-shots when the config has none', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // deterministic: min interval, first cue
    const { director } = makeDirector(makeSky({ value: 0.8 }));
    director.start();
    const beforeCount = created.length;

    // Advance well past the configured maximum interval.
    director.update(TEST_SOUNDSCAPE_CONFIG.oneShotMaxIntervalSeconds + 1);

    expect(created.length).toBe(beforeCount);
  });

  it('stops all beds on stop()', () => {
    const { director, beds } = makeDirector(makeSky({ value: 0.5 }));
    director.start();
    const { day, night } = beds();
    director.stop();
    expect(day.isPlaying).toBe(false);
    expect(night.isPlaying).toBe(false);
  });

  it('is a no-op when started without decoded buffers', () => {
    const empty = new Map<string, AudioBuffer>();
    const listener = {} as THREE.AudioListener;
    const director = new SoundscapeDirector(listener, empty, TEST_SOUNDSCAPE_CONFIG, factory);
    director.start();
    director.update(0.016);
    // No beds could be created, but the director must not throw and reports none.
    expect(director.getActiveBeds().length).toBe(0);
  });

  it('does not start the owner-rejected default background layer', () => {
    const listener = {} as THREE.AudioListener;
    const director = new SoundscapeDirector(listener, buffers, SOUNDSCAPE_CONFIG, factory);
    director.start();
    director.update(60);
    expect(created.length).toBe(0);
    expect(director.getActiveBeds()).toEqual([]);
  });
});
