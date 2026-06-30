// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { ISkyRuntime } from '../../types/SystemInterfaces';
import {
  SOUNDSCAPE_CONFIG,
  type SoundscapeConfig,
  type SoundscapeOneShotConfig,
} from '../../config/soundscape';

/**
 * A single persistent ambient bed: the underlying looping audio plus the gain
 * it should hold before combat ducking is applied. The ducking system reads
 * `gainBeforeDuck` so it can attenuate each bed without flattening the
 * day/night crossfade or the master volume.
 */
export interface SoundscapeBedHandle {
  sound: THREE.Audio;
  gainBeforeDuck: number;
}

/**
 * Minimal one-shot voice abstraction so a small pool can be reused for the
 * randomized wildlife cues without per-fire allocation.
 */
interface OneShotVoice {
  sound: THREE.Audio;
  busy: boolean;
}

/** Factory seam so unit tests can run without a real WebAudio context. */
export type AudioFactory = () => THREE.Audio;

/**
 * Layered day/night ambient director. Replaces the old `AmbientSoundManager`
 * two-clip sequencer.
 *
 * - Two persistent looping beds (day + night) play simultaneously; their gains
 *   crossfade based on `ISkyRuntime.getSunDirection().y`.
 * - When no sky runtime is injected (AI_SANDBOX / tests / sun-pinned scenarios)
 *   the director degrades to a fixed day-bed selection.
 * - Wildlife one-shots fire from a small pool at randomized intervals.
 * - `update()` is O(1) per frame: it samples one vector, eases one scalar, and
 *   at most starts one pooled one-shot.
 *
 * The director owns the bed gains for base-volume, crossfade weight, and the
 * master (worldbuilder / scene) scalar; combat ducking is layered on top by
 * `AudioDuckingSystem` via the `getActiveBeds()` handles.
 */
export class SoundscapeDirector {
  private readonly listener: THREE.AudioListener;
  private readonly audioBuffers: Map<string, AudioBuffer>;
  private readonly config: SoundscapeConfig;
  private readonly createAudio: AudioFactory;

  private dayBed?: SoundscapeBedHandle;
  private nightBed?: SoundscapeBedHandle;
  private oneShotPool: OneShotVoice[] = [];

  private isPlaying = false;
  /** Crossfade weight toward the DAY bed in [0, 1]. */
  private dayWeight = 1;
  /** Master scalar (0..1) from the worldbuilder mute / scene volume contract. */
  private masterVolume = 1;
  private skyRuntime?: ISkyRuntime;
  private nextOneShotIn = 0;

  private readonly sunDirScratch = new THREE.Vector3();

  constructor(
    listener: THREE.AudioListener,
    audioBuffers: Map<string, AudioBuffer>,
    config: SoundscapeConfig = SOUNDSCAPE_CONFIG,
    createAudio?: AudioFactory,
  ) {
    this.listener = listener;
    this.audioBuffers = audioBuffers;
    this.config = config;
    this.createAudio = createAudio ?? (() => new THREE.Audio(this.listener));
  }

  /**
   * Inject the read-only sky runtime used to drive the day/night crossfade.
   * Optional: passing `undefined` (or never calling this) keeps the director on
   * a fixed day bed, which is the correct degraded behavior for sandbox/test
   * runs and sun-pinned scenarios.
   */
  setSkyRuntime(sky: ISkyRuntime | undefined): void {
    this.skyRuntime = sky;
  }

  /** Start the persistent beds. Idempotent. */
  start(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;

    this.dayWeight = this.sampleTargetDayWeight();
    this.dayBed = this.startBed(this.config.dayBed.key);
    this.nightBed = this.startBed(this.config.nightBed.key);
    this.applyBedGains();
    this.scheduleNextOneShot();
  }

  /**
   * Master volume scalar (0..1) — the worldbuilder ambient-mute / scene-volume
   * contract inherited from the old `AmbientSoundManager.setVolume`. Scales
   * every bed while preserving per-bed base volume and the crossfade.
   */
  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.applyBedGains();
  }

  /**
   * Active bed handles for the ducking system. Each carries the gain it should
   * hold before ducking, so combat attenuation multiplies cleanly on top.
   */
  getActiveBeds(): SoundscapeBedHandle[] {
    const beds: SoundscapeBedHandle[] = [];
    if (this.dayBed) beds.push(this.dayBed);
    if (this.nightBed) beds.push(this.nightBed);
    return beds;
  }

  /**
   * Per-frame tick. O(1): sample sun, ease crossfade, maybe fire one one-shot.
   */
  update(deltaTime: number): void {
    if (!this.isPlaying) return;

    const target = this.sampleTargetDayWeight();
    const maxStep = this.config.crossfadeRatePerSecond * Math.max(0, deltaTime);
    const delta = target - this.dayWeight;
    if (Math.abs(delta) <= maxStep) {
      this.dayWeight = target;
    } else {
      this.dayWeight += Math.sign(delta) * maxStep;
    }
    this.applyBedGains();

    this.nextOneShotIn -= Math.max(0, deltaTime);
    if (this.nextOneShotIn <= 0) {
      this.fireOneShot();
      this.scheduleNextOneShot();
    }
  }

  /** Stop beds and pooled one-shots. */
  stop(): void {
    this.isPlaying = false;
    this.stopHandle(this.dayBed);
    this.stopHandle(this.nightBed);
    this.dayBed = undefined;
    this.nightBed = undefined;
    for (const voice of this.oneShotPool) {
      if (voice.sound.isPlaying) voice.sound.stop();
      voice.busy = false;
    }
  }

  dispose(): void {
    this.stop();
    this.oneShotPool = [];
  }

  // --- internals ---

  /** Day-weight the sun currently implies, in [0, 1]. */
  private sampleTargetDayWeight(): number {
    if (!this.skyRuntime) return 1; // degraded: fixed day bed
    const y = this.skyRuntime.getSunDirection(this.sunDirScratch).y;
    const { dayNightMidElevation, crossfadeHalfWidth } = this.config;
    const lo = dayNightMidElevation - crossfadeHalfWidth;
    const hi = dayNightMidElevation + crossfadeHalfWidth;
    if (y <= lo) return 0;
    if (y >= hi) return 1;
    return (y - lo) / (hi - lo);
  }

  private startBed(key: string): SoundscapeBedHandle | undefined {
    const buffer = this.audioBuffers.get(key);
    if (!buffer) return undefined;
    const sound = this.createAudio();
    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setVolume(0);
    sound.play();
    return { sound, gainBeforeDuck: 0 };
  }

  /** Recompute and apply each bed's pre-duck gain. */
  private applyBedGains(): void {
    if (this.dayBed) {
      this.dayBed.gainBeforeDuck = this.config.dayBed.baseVolume * this.dayWeight * this.masterVolume;
      this.dayBed.sound.setVolume(this.dayBed.gainBeforeDuck);
    }
    if (this.nightBed) {
      this.nightBed.gainBeforeDuck =
        this.config.nightBed.baseVolume * (1 - this.dayWeight) * this.masterVolume;
      this.nightBed.sound.setVolume(this.nightBed.gainBeforeDuck);
    }
  }

  private scheduleNextOneShot(): void {
    const { oneShotMinIntervalSeconds: min, oneShotMaxIntervalSeconds: max } = this.config;
    this.nextOneShotIn = min + Math.random() * Math.max(0, max - min);
  }

  private fireOneShot(): void {
    const candidates = this.config.oneShots.filter((o) => this.oneShotMatchesTimeOfDay(o));
    if (candidates.length === 0) return;
    const cue = candidates[Math.floor(Math.random() * candidates.length)];
    const buffer = this.audioBuffers.get(cue.key);
    if (!buffer) return;

    const voice = this.acquireVoice();
    voice.busy = true;
    voice.sound.setBuffer(buffer);
    voice.sound.setLoop(false);
    voice.sound.setVolume(cue.baseVolume * this.masterVolume);
    voice.sound.onEnded = () => {
      voice.busy = false;
    };
    voice.sound.play();
  }

  private oneShotMatchesTimeOfDay(cue: SoundscapeOneShotConfig): boolean {
    if (cue.partOf === 'any') return true;
    const isDay = this.dayWeight >= 0.5;
    return cue.partOf === 'day' ? isDay : !isDay;
  }

  private acquireVoice(): OneShotVoice {
    for (const voice of this.oneShotPool) {
      if (!voice.busy && !voice.sound.isPlaying) return voice;
    }
    const voice: OneShotVoice = { sound: this.createAudio(), busy: false };
    this.oneShotPool.push(voice);
    return voice;
  }

  private stopHandle(handle: SoundscapeBedHandle | undefined): void {
    if (handle && handle.sound.isPlaying) handle.sound.stop();
  }
}
