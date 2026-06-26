// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Kill-switch for the Kiln aircraft-art cutover (kiln-war-2026-06).
 *
 * The default `'kiln'` path points the helicopter + fixed-wing fleet at the new
 * Kiln GLBs (and re-bands the dims-coupled tuning to their measured catalog
 * dims). The opt-out `'legacy'` path restores the prior cycle-2026-06-11 repaint
 * keys/slugs so a regression can be A/B'd without a redeploy.
 *
 * Mirrors the vegetation flags (`groundCardsEnabled` / `heroScatterEnabled` in
 * TerrainVegetationRuntime): read at module-init from `window.__aircraftArt`
 * (set before boot, e.g. via the console + reload) or the `?aircraftArt=legacy`
 * URL param. With no window (SSR / node tests) the default Kiln art is used, so
 * unit tests exercise the shipped art.
 *
 * NOTE: a couple of Kiln airframes are deliberately HELD on legacy art at their
 * call sites regardless of this flag because their Kiln GLBs are scale-defective
 * (UH-1C gunship ~6.28 m vs ~13.86 m; B-52D ~21 m vs the true-scale ~47.85 m
 * legacy). Those holds live in the consumers, not here.
 */
export type AircraftArtMode = 'kiln' | 'legacy';

export function aircraftArtMode(): AircraftArtMode {
  if (typeof window === 'undefined') return 'kiln';
  const w = window as unknown as { __aircraftArt?: string };
  if (w.__aircraftArt === 'legacy') return 'legacy';
  if (w.__aircraftArt === 'kiln') return 'kiln';
  try {
    return new URLSearchParams(window.location.search).get('aircraftArt') === 'legacy'
      ? 'legacy'
      : 'kiln';
  } catch {
    return 'kiln';
  }
}

export function isAircraftArtLegacy(): boolean {
  return aircraftArtMode() === 'legacy';
}

/**
 * Pick the Kiln value by default, or the legacy value when the kill-switch is
 * engaged. Used at module-init to select model keys / catalog slugs without
 * threading the flag through every consumer.
 */
export function pickAircraftArt<T>(kiln: T, legacy: T): T {
  return isAircraftArtLegacy() ? legacy : kiln;
}
