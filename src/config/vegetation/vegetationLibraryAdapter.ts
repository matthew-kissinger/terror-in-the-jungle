// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Vegetation-library -> engine adapter seam.
 *
 * This is the ONE file that imports both `@game-field-kits/vegetation-library`
 * (engine-agnostic descriptors) and the engine's config record types. It is PURE
 * config/data transformation: it builds plain config objects and returns them. It
 * does NOT import three, does NOT new up any system, does NOT touch any
 * src/systems/** runtime. The library's "no renderer" invariant is preserved on the
 * engine side by keeping the coupling here, at config-build time.
 *
 * Design + the legacy-AVOID list it follows: docs/rearch/VEGETATION_LIBRARY_INTEGRATION_2026-06-25.md.
 *
 * The functions produce the SAME record shapes the engine already consumes
 * (`StaticImpostorArchetype`, `PixelForgeVegetationAsset`), so once wired, the
 * downstream systems (StaticImpostorSystem, VegetationScatterer, GlobalBillboardSystem)
 * need zero change and the hand-authored literals collapse to id-keyed tuning overrides.
 *
 * Readiness gate is the library's `status` + a backed (non-planned) LOD band — NOT a
 * separate stoplist. We only ever emit from `readyVegetation()`, and only emit a record
 * for a representation kind whose binary actually exists (e.g. a static archetype only
 * when the far octaImpostor is BAKED, not merely planned).
 */

import {
  readyVegetation,
  resolveAsset,
  type Representation,
  type VegetationAsset,
} from '@game-field-kits/vegetation-library';
import type { PixelForgeVegetationAsset } from '../pixelForgeAssets';
import type { StaticImpostorArchetype } from '../staticImpostorArchetypes';
import type { VegetationGroundCardArchetype } from './groundCardArchetypes';

/** Where the consumer serves the vegetation binaries. Vite serves public/ at '/'. */
export const VEGETATION_ASSET_ROOT = '/assets/vegetation';

/** A CC-BY (or other attribution-required) credit the engine must surface. */
export interface VegetationAttributionCredit {
  readonly id: string;
  readonly commonName: string;
  readonly author: string | null;
  readonly url: string | null;
  readonly license: string;
}

// Engine static-impostor atlas defaults (match staticImpostorArchetypes.ts; not exported there).
const ATLAS_SIZE: readonly [number, number] = [2048, 768];
const TILE_SIZE: readonly [number, number] = [256, 256];
const MAX_TEXTURE_SIZE = 2048;
const PLANE_PADDING_SCALE = 1.16;
const DEFAULT_PARALLAX = 0.04;
/** Demotion (mesh comes back) sits this fraction below the promotion boundary (hysteresis). */
const DEMOTION_FRACTION = 0.85;

function nearestBackedRepresentation(asset: VegetationAsset): Representation | null {
  const band = asset.lod.bands.find((b) => b.representationId !== null);
  if (!band) return null;
  return asset.representations.find((r) => r.id === band.representationId) ?? null;
}

function bakedOctaImpostor(asset: VegetationAsset): Representation | null {
  // Only a band that actually references an octaImpostor (not planned) counts as baked.
  const referenced = new Set(asset.lod.bands.map((b) => b.representationId).filter(Boolean));
  return asset.representations.find((r) => r.kind === 'octaImpostor' && referenced.has(r.id)) ?? null;
}

/** Distance (m) at which the mesh band ends and the far band begins. */
function meshBandFarEdge(asset: VegetationAsset): number | null {
  const band = asset.lod.bands.find((b) => {
    const rep = asset.representations.find((r) => r.id === b.representationId);
    return rep?.kind === 'mesh';
  });
  return band?.maxDistanceMeters ?? null;
}

/**
 * Catalog-derived static-impostor archetypes (Path B). One per ready asset that has BOTH a
 * near `mesh` AND a BAKED far `octaImpostor` (planned-but-unbaked assets are intentionally
 * skipped — they place as a plain GLB until baked). Keyed by slug, mergeable into
 * STATIC_IMPOSTOR_ARCHETYPES.
 */
export function vegetationLibraryStaticArchetypes(
  assets: readonly VegetationAsset[] = readyVegetation(),
): Record<string, StaticImpostorArchetype> {
  const out: Record<string, StaticImpostorArchetype> = {};
  for (const asset of assets) {
    const resolved = resolveAsset(VEGETATION_ASSET_ROOT, asset);
    const near = nearestBackedRepresentation(resolved);
    const octa = bakedOctaImpostor(resolved);
    if (!near || near.kind !== 'mesh' || !octa || octa.kind !== 'octaImpostor') continue;

    const promotion = meshBandFarEdge(resolved) ?? 180;
    const octaBand = bandWithRepKind(resolved, 'octaImpostor')?.band;
    out[asset.id] = {
      slug: asset.id,
      modelPath: near.path,
      maps: {
        baseColor: octa.baseColorPath,
        normal: octa.normalPath,
        depth: octa.depthPath ?? octa.normalPath,
      },
      atlasSize: ATLAS_SIZE,
      tileSize: TILE_SIZE,
      columns: octa.columns,
      rows: octa.rows,
      azimuthFrames: octa.columns,
      elevationFrames: octa.rows,
      maxTextureSize: MAX_TEXTURE_SIZE,
      planePaddingScale: PLANE_PADDING_SCALE,
      bounds: { center: near.bounds.center, size: near.bounds.size, radius: near.bounds.radius },
      promotionDistanceMeters: promotion,
      demotionDistanceMeters: Math.round(promotion * DEMOTION_FRACTION),
      ...(octaBand?.maxDistanceMeters !== null && octaBand?.maxDistanceMeters !== undefined
        ? { cullDistanceMeters: octaBand.maxDistanceMeters }
        : {}),
      parallaxStrength: DEFAULT_PARALLAX,
      ...(octa.materialTuning ? { materialTuning: octa.materialTuning } : {}),
      lightingProfile: 'foliage-card',
    };
  }
  return out;
}

/** The band (for distances) whose backed representation is of `kind`, or null. */
function bandWithRepKind(asset: VegetationAsset, kind: Representation['kind']) {
  for (const band of asset.lod.bands) {
    if (band.representationId === null) continue;
    const rep = asset.representations.find((r) => r.id === band.representationId);
    if (rep?.kind === kind) return { band, rep };
  }
  return null;
}

/**
 * Catalog-derived dense ground-cover archetypes (mesh-near + INSTANCED card-far).
 *
 * One per ready asset that has BOTH a backed near `mesh` band AND a backed far
 * `groundCard` band (e.g. understory-fern, taro-elephant-ear, rice-paddy after their
 * cards are baked by `scripts/bake-veg-card.mjs`). Keyed by slug, so an instanced
 * ground-card scatterer drops in by filtering a biome palette to entries whose typeId
 * is a known ground-card archetype.
 *
 * Deliberately SEPARATE from `vegetationLibraryStaticArchetypes()`: that feeds the
 * GLBHeroScatterer, which keeps one full GLB clone per instance — fine for sparse
 * heroes, a memory blowup at ground-cover densities. Ground cards never reach the hero
 * path; they are their own cheap instanced representation.
 */
export function vegetationLibraryGroundCards(
  assets: readonly VegetationAsset[] = readyVegetation(),
): Record<string, VegetationGroundCardArchetype> {
  const out: Record<string, VegetationGroundCardArchetype> = {};
  for (const asset of assets) {
    const resolved = resolveAsset(VEGETATION_ASSET_ROOT, asset);
    const meshHit = bandWithRepKind(resolved, 'mesh');
    const cardHit = bandWithRepKind(resolved, 'groundCard');
    if (!meshHit || meshHit.rep.kind !== 'mesh' || !cardHit || cardHit.rep.kind !== 'groundCard') {
      continue;
    }

    const meshFarEdge = meshHit.band.maxDistanceMeters ?? 20;
    const cull = cardHit.band.maxDistanceMeters ?? meshFarEdge * 3;
    const cardWorldSize = cardHit.rep.worldSize;
    out[asset.id] = {
      slug: asset.id,
      meshPath: meshHit.rep.path,
      card: {
        baseColor: cardHit.rep.baseColorPath,
        normal: cardHit.rep.normalPath,
      },
      cardWorldSize,
      bounds: {
        center: meshHit.rep.bounds.center,
        size: meshHit.rep.bounds.size,
        radius: meshHit.rep.bounds.radius,
      },
      meshFarEdgeMeters: meshFarEdge,
      cullDistanceMeters: cull,
      yOffset: cardWorldSize[1] * 0.5,
      tier: asset.ecology.tier,
      density: asset.ecology.density ?? 0.5,
      maxSlopeDeg: asset.ecology.slopeRangeDeg?.[1] ?? 30,
    };
  }
  return out;
}

function tilesXOf(n: number): 4 | 8 {
  return n >= 8 ? 8 : 4;
}
function tilesYOf(n: number): 2 | 4 {
  return n >= 4 ? 4 : 2;
}
function tileSizeOf(n: number): 256 | 512 {
  return n >= 512 ? 512 : 256;
}
function atlasProfileOf(tier: VegetationAsset['ecology']['tier']): PixelForgeVegetationAsset['atlasProfile'] {
  return tier === 'groundCover' ? 'ground-compact' : tier === 'canopy' ? 'canopy-balanced' : 'mid-balanced';
}

/**
 * Catalog-derived billboard assets (Path A). One per ready asset whose nearest backed
 * representation is a `billboardAtlas` (or `groundCard`, emitted as a single-tile billboard).
 * Currently returns the assets that have BAKED card atlases; assets still on `mesh-near +
 * planned billboard/card-far` are skipped until their card is baked (Strategy A Phase 3).
 */
export function vegetationLibraryBillboardAssets(
  assets: readonly VegetationAsset[] = readyVegetation(),
): PixelForgeVegetationAsset[] {
  const out: PixelForgeVegetationAsset[] = [];
  for (const asset of assets) {
    const resolved = resolveAsset(VEGETATION_ASSET_ROOT, asset);
    const near = nearestBackedRepresentation(resolved);
    if (!near || near.kind !== 'billboardAtlas') continue;
    out.push({
      id: asset.id,
      textureName: `Vegetation.${asset.id}.color`,
      normalTextureName: `Vegetation.${asset.id}.normal`,
      colorFile: near.path,
      normalFile: near.normalPath ?? near.path,
      sourceMetaFile: near.path.replace(/\.[^.]+$/, '.json'),
      tier: asset.ecology.tier,
      atlasProfile: atlasProfileOf(asset.ecology.tier),
      shaderProfile: asset.ecology.tier === 'canopy' ? 'normal-lit' : 'hemisphere',
      tilesX: tilesXOf(near.tilesX),
      tilesY: tilesYOf(near.tilesY),
      tileSize: tileSizeOf(near.tileSize),
      worldSize: near.worldSize[0],
      yOffset: near.yOffset ?? 0,
      variant: 'library',
    });
  }
  return out;
}

/** CC-BY (and other attribution-required) credits for every ready asset that needs one. */
export function vegetationLibraryAttributions(
  assets: readonly VegetationAsset[] = readyVegetation(),
): VegetationAttributionCredit[] {
  return assets
    .filter((a) => a.provenance.attributionRequired)
    .map((a) => ({
      id: a.id,
      commonName: a.commonName,
      author: a.provenance.author,
      url: a.provenance.url,
      license: a.provenance.license,
    }));
}
