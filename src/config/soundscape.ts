// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Soundscape configuration for the layered day/night ambient director.
 *
 * Replaces the old two-clip `jungle1`/`jungle2` sequencer. The director keeps
 * two persistent looping beds (day + night) and crossfades between them based
 * on the sun elevation reported by `ISkyRuntime`. Wildlife one-shots are fired
 * from a small pool at randomized intervals on top of the active bed.
 *
 * Asset note (cycle-2026-06-29-soundscape-loop-replacement): the shipped `.ogg`
 * files under `public/assets/audio/ambient/` are FIRST-PARTY placeholder beds
 * synthesized for this cycle (the cited Freesound CC-BY/CC0 beds could not be
 * fetched without account credentials). Production-quality field recordings are
 * an owner-sourcing follow-up; the architecture here is bed-agnostic, so
 * swapping the files needs no code change. See
 * `docs/asset-provenance/audio-2026-06/`.
 */

export interface SoundscapeBedConfig {
  /** Asset key (also the load key registered with the audio bank). */
  key: string;
  /** Public path to the looping `.ogg` bed. */
  path: string;
  /** Steady-state gain for this bed at full crossfade weight (0..1). */
  baseVolume: number;
}

export interface SoundscapeOneShotConfig {
  key: string;
  path: string;
  /** Gain applied when the one-shot fires (0..1). */
  baseVolume: number;
  /**
   * Which bed this wildlife cue belongs to. `'day'` cues only fire while the
   * day bed dominates; `'night'` only at night; `'any'` fires regardless.
   */
  partOf: 'day' | 'night' | 'any';
}

export interface SoundscapeConfig {
  dayBed: SoundscapeBedConfig;
  nightBed: SoundscapeBedConfig;
  oneShots: SoundscapeOneShotConfig[];
  /**
   * Sun-elevation (`getSunDirection().y`) at the day/night midpoint. Above this
   * the day bed dominates; below it the night bed does. The crossfade is a
   * smooth ramp across `[mid - halfWidth, mid + halfWidth]`.
   */
  dayNightMidElevation: number;
  /** Half-width of the crossfade ramp in sun-elevation units. */
  crossfadeHalfWidth: number;
  /** Per-second crossfade easing rate toward the sun-driven target weight. */
  crossfadeRatePerSecond: number;
  /** Minimum seconds between wildlife one-shots. */
  oneShotMinIntervalSeconds: number;
  /** Maximum seconds between wildlife one-shots. */
  oneShotMaxIntervalSeconds: number;
}

export const SOUNDSCAPE_CONFIG: SoundscapeConfig = {
  dayBed: {
    key: 'ambientDay',
    path: 'assets/audio/ambient/jungle-day.ogg',
    baseVolume: 0.32,
  },
  nightBed: {
    key: 'ambientNight',
    path: 'assets/audio/ambient/jungle-night.ogg',
    baseVolume: 0.28,
  },
  oneShots: [
    { key: 'wildlifeBird', path: 'assets/audio/ambient/wildlife-bird.ogg', baseVolume: 0.4, partOf: 'day' },
    { key: 'wildlifeCall', path: 'assets/audio/ambient/wildlife-call.ogg', baseVolume: 0.35, partOf: 'any' },
  ],
  dayNightMidElevation: 0.0,
  crossfadeHalfWidth: 0.12,
  crossfadeRatePerSecond: 0.5,
  oneShotMinIntervalSeconds: 6,
  oneShotMaxIntervalSeconds: 16,
};

/** Asset keys the soundscape needs decoded before `start()` can mix. */
export function soundscapeBedKeys(config: SoundscapeConfig = SOUNDSCAPE_CONFIG): string[] {
  return [config.dayBed.key, config.nightBed.key];
}
