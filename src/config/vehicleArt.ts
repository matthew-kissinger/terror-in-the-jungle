// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Kill-switch for the Kiln ground-vehicle art cutover (kiln-war-2026-06).
 *
 * The default `'kiln'` path points the drivable ground vehicles (hero M151/M48
 * + the placement-promoted M35/M113/ZIL) at the new Kiln GLBs; `?vehicleArt=legacy`
 * (or `window.__vehicleArt = 'legacy'`, read at swap/placement time) restores
 * the prior legacy art so a regression can be A/B'd without a redeploy.
 *
 * NOTE: unlike the aircraft/weapon flags, this resolves to `'legacy'` when there
 * is no window (SSR / node tests), so headless vehicle fixtures stay
 * deterministic on the legacy procedural-anchored art. Production (browser)
 * callers get Kiln by default.
 *
 * Single source of truth for the flag: VehicleGlbVisuals re-exports
 * `vehicleArtMode`/`VehicleArtMode` from here for its hero-GLB swap, and
 * WorldFeaturePrefabs uses `pickVehicleArt` to resolve placement model paths.
 */
export type VehicleArtMode = 'kiln' | 'legacy';

export function vehicleArtMode(): VehicleArtMode {
  if (typeof window === 'undefined') return 'legacy';
  const w = window as unknown as { __vehicleArt?: VehicleArtMode };
  if (w.__vehicleArt === 'legacy' || w.__vehicleArt === 'kiln') return w.__vehicleArt;
  try {
    return new URLSearchParams(window.location.search).get('vehicleArt') === 'legacy'
      ? 'legacy'
      : 'kiln';
  } catch {
    return 'kiln';
  }
}

export function isVehicleArtLegacy(): boolean {
  return vehicleArtMode() === 'legacy';
}

/**
 * Pick the Kiln value by default, or the legacy value when the kill-switch is
 * engaged (or in node/SSR). Used at module-init to select GLB paths without
 * threading the flag through every consumer.
 */
export function pickVehicleArt<T>(kiln: T, legacy: T): T {
  return isVehicleArtLegacy() ? legacy : kiln;
}
