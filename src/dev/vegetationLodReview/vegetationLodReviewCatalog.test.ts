// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { StaticImpostorArchetype } from '../../config/staticImpostorArchetypes';
import type { VegetationGroundCardArchetype } from '../../config/vegetation/groundCardArchetypes';
import {
  buildVegetationLodReviewEntries,
  getVegetationLodReviewEntry,
  orderedVegetationLodReviewSlugs,
} from './vegetationLodReviewCatalog';

function staticArc(slug: string): StaticImpostorArchetype {
  return {
    slug,
    modelPath: `/assets/vegetation/${slug}/${slug}.glb`,
    maps: {
      baseColor: `/assets/vegetation/${slug}/impostor/atlas.base-color.png`,
      normal: `/assets/vegetation/${slug}/impostor/atlas.normal.png`,
      depth: `/assets/vegetation/${slug}/impostor/atlas.depth.png`,
    },
    atlasSize: [2048, 768],
    tileSize: [256, 256],
    columns: 8,
    rows: 3,
    azimuthFrames: 8,
    elevationFrames: 3,
    maxTextureSize: 2048,
    planePaddingScale: 1.16,
    bounds: { center: [0, 3, 0], size: [4, 6, 4], radius: 4 },
    promotionDistanceMeters: 80,
    demotionDistanceMeters: 68,
    parallaxStrength: 0.04,
    lightingProfile: 'foliage-card',
  };
}

function groundCard(slug: string): VegetationGroundCardArchetype {
  return {
    slug,
    meshPath: `/assets/vegetation/${slug}/${slug}.glb`,
    card: {
      baseColor: `/assets/vegetation/${slug}/card/atlas.base-color.png`,
      normal: `/assets/vegetation/${slug}/card/atlas.normal.png`,
    },
    cardWorldSize: [3, 2],
    bounds: { center: [0, 1, 0], size: [3, 2, 3], radius: 2 },
    meshFarEdgeMeters: 18,
    cullDistanceMeters: 70,
    yOffset: 1,
    tier: 'groundCover',
    density: 0.5,
    maxSlopeDeg: 20,
  };
}

describe('buildVegetationLodReviewEntries', () => {
  it('includes both hero impostor and ground-card vegetation review targets', () => {
    const entries = buildVegetationLodReviewEntries({
      staticArchetypes: {
        'jungle-tree': staticArc('jungle-tree'),
      },
      groundCards: {
        'understory-fern': groundCard('understory-fern'),
      },
    });

    expect(entries.map((entry) => [entry.slug, entry.kind])).toEqual([
      ['jungle-tree', 'octaImpostor'],
      ['understory-fern', 'groundCard'],
    ]);
    expect(entries[0].staticArchetype?.lightingProfile).toBe('foliage-card');
    expect(entries[1].groundCard?.card.baseColor).toContain('/card/');
  });

  it('orders impostor heroes ahead of dense ground cards and sorts within each family', () => {
    const entries = buildVegetationLodReviewEntries({
      staticArchetypes: {
        teak: staticArc('teak'),
        bamboo: staticArc('bamboo'),
      },
      groundCards: {
        taro: groundCard('taro'),
        fern: groundCard('fern'),
      },
    });

    expect(orderedVegetationLodReviewSlugs(entries)).toEqual(['bamboo', 'teak', 'fern', 'taro']);
  });
});

describe('getVegetationLodReviewEntry', () => {
  it('returns the requested slug, falls back to first only when no slug is provided', () => {
    const entries = buildVegetationLodReviewEntries({
      staticArchetypes: { a: staticArc('a') },
      groundCards: { b: groundCard('b') },
    });

    expect(getVegetationLodReviewEntry('b', entries)?.slug).toBe('b');
    expect(getVegetationLodReviewEntry(null, entries)?.slug).toBe('a');
    expect(getVegetationLodReviewEntry('missing', entries)).toBeNull();
  });
});
