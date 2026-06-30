// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Dense ground-cover LOD archetype: a cheap REAL mesh near the player, a flat
 * INSTANCED alpha card past `meshFarEdgeMeters`, hard-culled at `cullDistanceMeters`.
 *
 * Deliberately distinct from `StaticImpostorArchetype` (one per-instance GLB clone +
 * a multi-frame octahedral atlas, for SPARSE large heroes). A ground card never clones
 * the GLB per instance and never bakes an octahedral atlas: many thousands of fern /
 * taro / rice instances share ONE card geometry + ONE atlas, so the far band costs one
 * draw + one texture instead of one clone each. That is the whole point — the hero path
 * would blow memory at ground-cover densities (0.6-0.8 across several biomes).
 *
 * Built by `vegetationLibraryGroundCards()` (config/vegetation/vegetationLibraryAdapter.ts)
 * from a catalog asset that has BOTH a backed near `mesh` band AND a backed far
 * `groundCard` band. Keyed by slug (== vegetation-library asset id == biome-palette
 * typeId), so an instanced ground-card scatterer drops in by filtering the palette to
 * entries whose typeId is a known ground-card archetype — exactly how GLBHeroScatterer
 * filters to hero archetypes.
 */

export interface GroundCardBounds {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly radius: number;
}

export interface GroundCardMaps {
  readonly baseColor: string;
  readonly normal?: string;
}

export interface VegetationGroundCardArchetype {
  /** == asset id == biome-palette typeId. */
  readonly slug: string;
  /** Served URL of the near GLB mesh (real fronds up close). */
  readonly meshPath: string;
  /** Baked far-card maps (served URLs). */
  readonly card: GroundCardMaps;
  /** Card quad footprint [width, height] in meters at unit scale. */
  readonly cardWorldSize: readonly [number, number];
  /** Near-mesh bounds (from the catalog) for placement / footprint. */
  readonly bounds: GroundCardBounds;
  /** Distance (m) where the near mesh ends and the instanced card begins. */
  readonly meshFarEdgeMeters: number;
  /** Hard cull distance (m): the card is not drawn beyond this. */
  readonly cullDistanceMeters: number;
  /** Card-center anchor above terrain (m): half the card height. */
  readonly yOffset: number;
  readonly tier: 'canopy' | 'midLevel' | 'groundCover';
  /** Ecology scatter density hint 0..1 (engine scales by its own budget). */
  readonly density: number;
  /** Max ground slope (deg) the species tolerates. */
  readonly maxSlopeDeg: number;
}
