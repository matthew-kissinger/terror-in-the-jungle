// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Weapon art kill-switch (asset-gameplay-integration / weapons domain).
 *
 * Selects the Kiln gen-2 repaint weapon GLBs (default) versus the legacy
 * first-gen GLBs across all three weapon surfaces that share node vocabularies:
 *   - the first-person rig (WeaponRigManager) reads it at init();
 *   - the held NPC close models (PixelForgeNpcRuntime) bind it at module load;
 *   - the armory preview (ArmoryPreviewConfig) binds it at module load.
 *
 * Opt out of the new art with `?weaponArt=legacy` in the URL (honoured by every
 * surface, since the query string is present from the first navigation) or
 * `window.__weaponArt = 'legacy'` set before the modules evaluate / before the
 * rig init() runs. No window (SSR / node tests) defaults to 'kiln', the shipped
 * art. Mirrors the vegetation ground-card kill-switch in
 * TerrainVegetationRuntime (`__vegGroundCards`).
 */
export type WeaponArtMode = 'kiln' | 'legacy';

export function getWeaponArtMode(): WeaponArtMode {
  if (typeof window === 'undefined') return 'kiln';
  const w = window as unknown as { __weaponArt?: WeaponArtMode };
  if (w.__weaponArt === 'legacy' || w.__weaponArt === 'kiln') return w.__weaponArt;
  try {
    return new URLSearchParams(window.location.search).get('weaponArt') === 'legacy'
      ? 'legacy'
      : 'kiln';
  } catch {
    return 'kiln';
  }
}
