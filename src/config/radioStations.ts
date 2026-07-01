// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Radio station catalog for the headless `RadioStationSystem`.
 *
 * Each station is a single license-clean music track, lazy-loaded only when the
 * player tunes to it (music is default-OFF, especially on touch, so nothing is
 * fetched at boot). The dial/slot UI (`cycle-2026-06-29-radio-dial-revival`,
 * P3d) presents `RADIO_STATIONS` as the always-available STATIONS category and
 * calls `RadioStationSystem.tuneTo(id)`.
 *
 * Asset note (cycle-2026-06-29-radio-stations-music): the three shipped tracks
 * are genuine **CC BY 4.0** music by Kevin MacLeod (incompetech.com), fetched
 * and re-encoded to Opus stereo ~80 kbps. Full attribution is in
 * `THIRD-PARTY-ASSETS.md` and `docs/asset-provenance/audio-2026-06/`. Swapping a
 * station for a different license-clean track needs no code change beyond this
 * file — keep the same `.ogg` path or update it here. The former "Green Static"
 * ambient-drone station was removed after the 2026-07-01 owner playtest; do not
 * reintroduce static/noise-bed stations without explicit owner approval.
 */

export interface RadioStationConfig {
  /** Stable id used for persistence (`lastStationId`) and the UI slot key. */
  id: string;
  /** Short display label for the dial. */
  label: string;
  /** One-line flavor for the station, shown by the dial UI. */
  description: string;
  /** Public path to the lazily-loaded Opus-in-`.ogg` track. */
  path: string;
  /** Per-track gain trim (0..1) so loud and quiet masters sit at parity. */
  trim: number;
}

export const RADIO_STATIONS: ReadonlyArray<RadioStationConfig> = [
  {
    id: 'firebase-tension',
    label: 'Firebase',
    description: 'Tense combat cues — Volatile Reaction (Kevin MacLeod)',
    path: 'assets/audio/music/station-volatile-reaction.ogg',
    trim: 0.85,
  },
  {
    id: 'rolling-thunder',
    label: 'Thunder',
    description: 'Driving martial score — Five Armies (Kevin MacLeod)',
    path: 'assets/audio/music/station-five-armies.ogg',
    trim: 0.8,
  },
];

/** The default station the dial lands on if there is no persisted choice. */
export const DEFAULT_STATION_ID = RADIO_STATIONS[0].id;

/** localStorage key for the last station the player tuned to. */
export const LAST_STATION_STORAGE_KEY = 'titj-radio-last-station';

export function findStation(id: string | null | undefined): RadioStationConfig | undefined {
  if (!id) return undefined;
  return RADIO_STATIONS.find((s) => s.id === id);
}
