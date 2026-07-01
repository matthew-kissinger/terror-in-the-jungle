/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behavior tests for `RadioStationSystem`. These assert observable behavior
 * from a caller's perspective — that music is default-OFF (no fetch until
 * enabled), that tuning crossfades between stations, that the decoded-buffer
 * cache stays capped (the core memory-safety guarantee), and that the last
 * station is remembered — rather than internal field names or tuning constants.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RadioStationSystem } from './RadioStationSystem';
import { RADIO_STATIONS, LAST_STATION_STORAGE_KEY } from '../../config/radioStations';
import { AudioDuckingSystem } from './AudioDuckingSystem';

interface FakeAudio {
  setBuffer: ReturnType<typeof vi.fn>;
  setLoop: ReturnType<typeof vi.fn>;
  setVolume: ReturnType<typeof vi.fn>;
  getOutput?: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
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

describe('RadioStationSystem', () => {
  let created: FakeAudio[];
  let factory: () => THREE.Audio;
  let loadCalls: string[];
  let loadTrack: (path: string) => Promise<AudioBuffer>;
  let alternateStation: typeof RADIO_STATIONS[number];

  beforeEach(() => {
    created = [];
    factory = () => {
      const a = makeFakeAudio();
      created.push(a);
      return a as unknown as THREE.Audio;
    };
    loadCalls = [];
    // A fake loader: never touches the network, returns a distinct fake buffer.
    loadTrack = (path: string) => {
      loadCalls.push(path);
      return Promise.resolve({ path } as unknown as AudioBuffer);
    };
    alternateStation = RADIO_STATIONS[RADIO_STATIONS.length - 1];
    localStorage.removeItem(LAST_STATION_STORAGE_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeSystem(opts?: { isTouch?: boolean }): RadioStationSystem {
    // A context-less listener: the system runs on per-voice gain (no real graph).
    const listener = {} as THREE.AudioListener;
    return new RadioStationSystem(listener, loadTrack, { createAudio: factory, ...opts });
  }

  it('is default-OFF and fetches nothing until music is enabled', async () => {
    const radio = makeSystem();
    expect(radio.isEnabled()).toBe(false);

    // Tuning while disabled records the choice but must not fetch or play.
    await radio.tuneTo(RADIO_STATIONS[1].id);
    expect(loadCalls).toEqual([]);
    expect(created.every((a) => !a.isPlaying)).toBe(true);
  });

  it('starts playing the selected station once enabled', async () => {
    const radio = makeSystem();
    radio.setEnabled(true);
    await flush();

    expect(loadCalls.length).toBeGreaterThan(0);
    const playing = created.find((a) => a.isPlaying);
    expect(playing).toBeDefined();
    expect(playing?.setLoop).toHaveBeenCalledWith(true);
    // It ramps up to audible over the crossfade rather than snapping on.
    for (let i = 0; i < 40; i++) radio.update(0.1);
    expect(playing!.volume).toBeGreaterThan(0);
  });

  it('crossfades to the new station: outgoing fades down while incoming rises', async () => {
    const radio = makeSystem();
    radio.setEnabled(true);
    await flush();
    for (let i = 0; i < 40; i++) radio.update(0.1); // first station reaches full gain

    const first = created.find((a) => a.isPlaying)!;
    const firstVolBefore = first.volume;
    expect(firstVolBefore).toBeGreaterThan(0);

    await radio.tuneTo(alternateStation.id);
    await flush();

    // A second voice is now rising from silence.
    const second = created.find((a) => a.isPlaying && a !== first)!;
    expect(second).toBeDefined();

    // One short frame must not complete the crossfade: incoming still climbing,
    // outgoing still audible (eased, not snapped).
    radio.update(0.1);
    expect(second.volume).toBeGreaterThan(0);
    expect(second.volume).toBeLessThan(alternateStation.trim);
    expect(first.volume).toBeGreaterThan(0);

    // Given enough time the crossfade completes and the old voice is silenced.
    for (let i = 0; i < 40; i++) radio.update(0.1);
    expect(first.isPlaying).toBe(false);
    expect(second.volume).toBeCloseTo(alternateStation.trim, 5);
  });

  it('holds at most 2 decoded buffers after tuning across every station', async () => {
    const radio = makeSystem();
    radio.setEnabled(true);
    await flush();

    // Tune across all stations (more than the cap), settling the crossfade each
    // time so eviction can run.
    for (let pass = 0; pass < 2; pass++) {
      for (const station of RADIO_STATIONS) {
        await radio.tuneTo(station.id);
        await flush();
        for (let i = 0; i < 40; i++) radio.update(0.1);
        expect(radio.getCachedBufferCount()).toBeLessThanOrEqual(2);
      }
    }
    expect(radio.getCachedBufferCount()).toBeLessThanOrEqual(2);
  });

  it('keeps only a single decoded buffer on touch (hard-cut)', async () => {
    const radio = makeSystem({ isTouch: true });
    radio.setEnabled(true);
    await flush();

    for (const station of RADIO_STATIONS) {
      await radio.tuneTo(station.id);
      await flush();
      radio.update(0.1);
      expect(radio.getCachedBufferCount()).toBeLessThanOrEqual(1);
    }
  });

  it('remembers the last tuned station across a new session', async () => {
    const radio = makeSystem();
    radio.setEnabled(true);
    await flush();
    await radio.tuneTo(alternateStation.id);
    await flush();

    // A fresh system (new session) preselects the persisted station.
    const next = makeSystem();
    expect(next.getSelectedStationId()).toBe(alternateStation.id);
  });

  it('silences the music voices when disabled again', async () => {
    const radio = makeSystem();
    radio.setEnabled(true);
    await flush();
    expect(created.some((a) => a.isPlaying)).toBe(true);

    radio.setEnabled(false);
    expect(created.every((a) => !a.isPlaying)).toBe(true);
  });

  it('exposes no music bed for ducking while music is disabled', async () => {
    const radio = makeSystem();
    // Disabled: the entire music-duck path stays off the table.
    expect(radio.getActiveMusicBed()).toBeNull();

    radio.setEnabled(true);
    await flush();
    expect(radio.getActiveMusicBed()).not.toBeNull();
  });

  it('lets the ducking system attenuate the active radio bed during combat', async () => {
    const radio = makeSystem();
    radio.setEnabled(true);
    await flush();
    for (let i = 0; i < 40; i++) radio.update(0.1); // settle at full gain

    const bed = radio.getActiveMusicBed()!;
    const fullGain = bed.gainBeforeDuck;
    expect(fullGain).toBeGreaterThan(0);

    const ducking = new AudioDuckingSystem();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    ducking.markCombatSound();
    now = 1100;
    ducking.update(0.2, [], bed);

    const applied = (bed.sound as unknown as FakeAudio).volume;
    expect(applied).toBeGreaterThan(0);
    expect(applied).toBeLessThan(fullGain);
  });

  it('scales the music down with the music volume setting', async () => {
    const radio = makeSystem();
    radio.setEnabled(true);
    await flush();
    for (let i = 0; i < 40; i++) radio.update(0.1);

    const voice = created.find((a) => a.isPlaying)!;
    const loud = voice.volume;
    radio.setMusicVolume(0.25);
    const quiet = voice.volume;
    expect(quiet).toBeLessThan(loud);

    radio.setMusicVolume(0);
    expect(voice.volume).toBe(0);
  });
});

/** Drain the microtask queue so awaited decode promises settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
