// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import {
  RADIO_STATIONS,
  DEFAULT_STATION_ID,
  LAST_STATION_STORAGE_KEY,
  findStation,
  type RadioStationConfig,
} from '../../config/radioStations';
import { Logger } from '../../utils/Logger';
import type { SoundscapeBedHandle } from './SoundscapeDirector';

/**
 * Loads and decodes a station track to an `AudioBuffer`. Injectable so unit
 * tests never touch the network or a real decoder, and so the production path
 * can lazy-fetch only when the player tunes in.
 */
export type TrackLoader = (path: string) => Promise<AudioBuffer>;

/** Factory seam so tests can run without a real WebAudio graph. */
export type RadioAudioFactory = () => THREE.Audio;

interface StationVoice {
  sound: THREE.Audio;
  /** Target gain this voice is fading toward (post-trim, pre-master). */
  targetGain: number;
  /** Current eased gain. */
  gain: number;
  /** Station currently bound to this voice, if any. */
  stationId: string | null;
}

const CROSSFADE_SECONDS = 1.5;
const DEFAULT_CACHE_CAP = 2;
const TOUCH_CACHE_CAP = 1;

/**
 * Headless radio-station playback. Owns a music signal path that is fully
 * independent of the ambient soundscape and SFX: a dedicated `GainNode` master
 * fed by two `THREE.Audio` voices that crossfade when the player tunes.
 *
 * Contract highlights:
 * - **Default OFF.** Nothing is fetched or decoded until `setEnabled(true)` and
 *   a tune. On touch this matters most (no cellular auto-download).
 * - **Lazy decode + capped cache.** Each decoded track is large (~tens of MB),
 *   so at most `DEFAULT_CACHE_CAP` (2) decoded buffers are retained — and only
 *   `TOUCH_CACHE_CAP` (1, hard-cut) on touch. Tuning evicts the
 *   least-recently-used buffer beyond the cap.
 * - **1.5 s crossfade** between the outgoing and incoming station.
 * - **Persistence.** The last tuned station id is stored in localStorage and
 *   restored on the next session (without auto-playing while disabled).
 *
 * Combat ducking is layered on top by `AudioDuckingSystem`, but only while
 * music is enabled — see `getActiveMusicBed()`.
 */
export class RadioStationSystem {
  private readonly listener: THREE.AudioListener;
  private readonly loadTrack: TrackLoader;
  private readonly createAudio: RadioAudioFactory;
  private readonly cacheCap: number;

  private musicGain: GainNode | null = null;

  private voices: StationVoice[] = [];
  /** LRU-ordered decoded-buffer cache (oldest first). */
  private buffers: Map<string, AudioBuffer> = new Map();
  /** In-flight decode promises, so concurrent tunes to the same id share work. */
  private pending: Map<string, Promise<AudioBuffer | undefined>> = new Map();

  private enabled = false;
  private musicVolume = 1;
  private masterScalar = 1;
  private currentStationId: string | null = null;

  constructor(
    listener: THREE.AudioListener,
    loadTrack: TrackLoader,
    options?: { createAudio?: RadioAudioFactory; isTouch?: boolean },
  ) {
    this.listener = listener;
    this.loadTrack = loadTrack;
    this.createAudio = options?.createAudio ?? (() => new THREE.Audio(this.listener));
    this.cacheCap = options?.isTouch ? TOUCH_CACHE_CAP : DEFAULT_CACHE_CAP;
    this.currentStationId = this.readPersistedStationId();
    // Establish the dedicated music bus up front so the music path is provably
    // independent of the ambient/SFX graph (best-effort; a context-less test
    // listener simply runs without the node and relies on per-voice gain).
    this.ensureMusicGain();
  }

  /** The station id the dial should preselect (persisted or default). */
  getSelectedStationId(): string {
    return this.currentStationId ?? DEFAULT_STATION_ID;
  }

  /** Available stations, for the dial UI. */
  getStations(): ReadonlyArray<RadioStationConfig> {
    return RADIO_STATIONS;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Turn music on/off. Default OFF. Enabling tunes to the selected station;
   * disabling silences and releases the voices (cache is kept so a re-enable is
   * cheap, but nothing plays). No network happens until this is true.
   */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      void this.tuneTo(this.getSelectedStationId());
    } else {
      for (const voice of this.voices) {
        voice.targetGain = 0;
        voice.gain = 0;
        if (voice.sound.isPlaying) voice.sound.stop();
        voice.stationId = null;
        this.applyVoiceVolume(voice);
      }
    }
  }

  /** Player-facing music volume (0..1). Persisted by the settings layer. */
  setMusicVolume(volume: number): void {
    this.musicVolume = clamp01(volume);
    this.applyAllVoiceVolumes();
  }

  /**
   * Master scalar (0..1) inherited from the worldbuilder mute / pause contract,
   * mirroring how the soundscape master scalar works.
   */
  setMasterScalar(scalar: number): void {
    this.masterScalar = clamp01(scalar);
    this.applyAllVoiceVolumes();
  }

  /**
   * Tune to a station. Persists the choice and (when enabled) lazily decodes the
   * track and crossfades from the current station. While disabled this only
   * records the selection — no fetch, no playback.
   */
  async tuneTo(stationId: string): Promise<void> {
    const station = findStation(stationId);
    if (!station) {
      Logger.warn('Radio', `Unknown station: ${stationId}`);
      return;
    }
    this.currentStationId = station.id;
    this.persistStationId(station.id);

    if (!this.enabled) return;

    const buffer = await this.acquireBuffer(station);
    if (!buffer) return;
    // A later tune may have superseded this one while we awaited the decode.
    if (this.currentStationId !== station.id) return;

    this.crossfadeTo(station, buffer);
  }

  /**
   * The active music bed for combat ducking, or `null` when music is disabled or
   * silent. Shape matches `SoundscapeBedHandle` so `AudioDuckingSystem` ducks it
   * by the same path as the ambient beds (`setVolume(gainBeforeDuck * duck)`).
   * Returning `null` while disabled keeps the entire duck path off the table.
   */
  getActiveMusicBed(): SoundscapeBedHandle | null {
    if (!this.enabled) return null;
    const voice = this.voices.find((v) => v.stationId && v.targetGain > 0);
    if (!voice) return null;
    return { sound: voice.sound, gainBeforeDuck: this.voiceBaseGain(voice) };
  }

  /** Per-frame ease of the crossfade gains. O(1) over the two voices. */
  update(deltaTime: number): void {
    if (!this.enabled) return;
    const step = deltaTime / CROSSFADE_SECONDS;
    let anyMoving = false;
    for (const voice of this.voices) {
      if (voice.gain === voice.targetGain) continue;
      anyMoving = true;
      const delta = voice.targetGain - voice.gain;
      if (Math.abs(delta) <= step) {
        voice.gain = voice.targetGain;
        if (voice.gain === 0 && voice.sound.isPlaying) {
          voice.sound.stop();
          voice.stationId = null;
        }
      } else {
        voice.gain += Math.sign(delta) * step;
      }
      this.applyVoiceVolume(voice);
    }
    if (anyMoving) this.applyAllVoiceVolumes();
  }

  /** Number of decoded buffers currently retained (cache-cap probe / test seam). */
  getCachedBufferCount(): number {
    return this.buffers.size;
  }

  dispose(): void {
    for (const voice of this.voices) {
      if (voice.sound.isPlaying) voice.sound.stop();
    }
    this.voices = [];
    this.buffers.clear();
    this.pending.clear();
    this.musicGain = null;
  }

  // --- internals ---

  private crossfadeTo(station: RadioStationConfig, buffer: AudioBuffer): void {
    // If this station is already the rising voice, nothing to do.
    const rising = this.voices.find((v) => v.stationId === station.id && v.targetGain > 0);
    if (rising) return;

    // Touch hard-cut: only one decoded buffer is allowed, so we cannot keep an
    // outgoing track audible during a crossfade. Stop every voice immediately
    // and release the previous station's buffer before starting the new one.
    const hardCut = this.cacheCap <= TOUCH_CACHE_CAP;

    for (const voice of this.voices) {
      if (hardCut) {
        if (voice.sound.isPlaying) voice.sound.stop();
        voice.targetGain = 0;
        voice.gain = 0;
        voice.stationId = null;
      } else if (voice.targetGain > 0) {
        // Desktop: fade out the outgoing voice for a smooth 1.5 s crossfade.
        voice.targetGain = 0;
      }
    }
    if (hardCut) this.evictAllExcept(station.id);

    const voice = this.acquireFreeVoice();
    voice.stationId = station.id;
    voice.targetGain = station.trim;
    voice.gain = hardCut ? station.trim : 0;
    voice.sound.setBuffer(buffer);
    voice.sound.setLoop(true);
    this.applyVoiceVolume(voice);
    if (!voice.sound.isPlaying) voice.sound.play();
  }

  /** Drop every cached buffer except `keepId` (touch hard-cut to a single buffer). */
  private evictAllExcept(keepId: string): void {
    for (const id of [...this.buffers.keys()]) {
      if (id !== keepId) this.buffers.delete(id);
    }
  }

  /** A voice not currently rising (reuse an idle one before allocating). */
  private acquireFreeVoice(): StationVoice {
    for (const voice of this.voices) {
      if (voice.targetGain === 0 && voice.gain === 0) {
        if (voice.sound.isPlaying) voice.sound.stop();
        return voice;
      }
    }
    // Two voices is enough for a single crossfade; cap allocation there.
    if (this.voices.length < 2) {
      const sound = this.createAudio();
      this.routeVoiceThroughMusicBus(sound);
      const voice: StationVoice = {
        sound,
        targetGain: 0,
        gain: 0,
        stationId: null,
      };
      this.voices.push(voice);
      return voice;
    }
    // Both voices busy mid-crossfade: reuse the quieter one.
    const quietest = this.voices.reduce((a, b) => (a.gain <= b.gain ? a : b));
    if (quietest.sound.isPlaying) quietest.sound.stop();
    return quietest;
  }

  /**
   * Return the decoded buffer for a station, decoding lazily and enforcing the
   * cache cap (LRU eviction). Touch caps at a single buffer (hard-cut).
   */
  private async acquireBuffer(station: RadioStationConfig): Promise<AudioBuffer | undefined> {
    const cached = this.buffers.get(station.id);
    if (cached) {
      this.touch(station.id, cached);
      return cached;
    }
    const inFlight = this.pending.get(station.id);
    if (inFlight) return inFlight;

    const promise = this.loadTrack(station.path)
      .then((buffer) => {
        this.pending.delete(station.id);
        if (buffer) this.touch(station.id, buffer);
        return buffer;
      })
      .catch((err) => {
        this.pending.delete(station.id);
        Logger.warn('Radio', `Failed to load station ${station.id}: ${String(err)}`);
        return undefined;
      });
    this.pending.set(station.id, promise);
    return promise;
  }

  /** Insert/refresh a buffer as most-recently-used and evict beyond the cap. */
  private touch(stationId: string, buffer: AudioBuffer): void {
    this.buffers.delete(stationId);
    this.buffers.set(stationId, buffer);
    while (this.buffers.size > this.cacheCap) {
      const oldest = this.buffers.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      // Never evict a buffer that a rising voice still needs.
      if (this.isStationRising(oldest) && this.buffers.size <= this.cacheCap + 1) break;
      this.buffers.delete(oldest);
    }
  }

  private isStationRising(stationId: string): boolean {
    return this.voices.some((v) => v.stationId === stationId && v.targetGain > 0);
  }

  /**
   * Pre-duck gain a voice contributes to the master bus (crossfade gain folded
   * with the music-bus scalar so combat ducking can attenuate it cleanly).
   */
  private voiceBaseGain(voice: StationVoice): number {
    return voice.gain * this.musicBusScalar();
  }

  /** Music-bus scalar shared by all voices (player volume * master, no duck). */
  private musicBusScalar(): number {
    return this.musicVolume * this.masterScalar;
  }

  private applyVoiceVolume(voice: StationVoice): void {
    voice.sound.setVolume(this.voiceBaseGain(voice));
  }

  private applyAllVoiceVolumes(): void {
    // Mirror the bus scalar onto the real GainNode (when present) so the music
    // path stays a single, separately-controllable bus; per-voice setVolume
    // carries the crossfade so the fake-audio test seam observes it directly.
    const bus = this.musicGain;
    if (bus) bus.gain.value = this.musicBusScalar();
    for (const voice of this.voices) this.applyVoiceVolume(voice);
  }

  private readPersistedStationId(): string | null {
    try {
      if (typeof localStorage !== 'undefined') {
        const id = localStorage.getItem(LAST_STATION_STORAGE_KEY);
        if (id && findStation(id)) return id;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private persistStationId(id: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_STATION_STORAGE_KEY, id);
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Lazily create the dedicated music master `GainNode` and connect it to the
   * listener input, so the radio runs on its own bus separate from ambient/SFX.
   * Returns `null` for a context-less test listener (graph routing is skipped;
   * per-voice gain still drives the crossfade).
   */
  private ensureMusicGain(): GainNode | null {
    if (this.musicGain) return this.musicGain;
    const ctx = this.listener.context as AudioContext | undefined;
    const listenerInput = this.listener.getInput?.();
    if (!ctx || typeof ctx.createGain !== 'function' || !listenerInput) return null;
    const gain = ctx.createGain();
    gain.gain.value = this.musicBusScalar();
    gain.connect(listenerInput);
    this.musicGain = gain;
    return gain;
  }

  /** Splice a voice's output into the music bus instead of straight to listener. */
  private routeVoiceThroughMusicBus(sound: THREE.Audio): void {
    const bus = this.ensureMusicGain();
    if (!bus) return;
    const sourceGain = sound.getOutput?.();
    if (!sourceGain) return;
    try {
      sourceGain.disconnect();
      sourceGain.connect(bus);
    } catch {
      /* routing best-effort; a degraded graph still plays via default wiring */
    }
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
