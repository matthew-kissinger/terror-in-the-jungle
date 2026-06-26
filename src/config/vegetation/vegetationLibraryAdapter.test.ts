// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  VEGETATION_ASSET_ROOT,
  vegetationLibraryAttributions,
  vegetationLibraryBillboardAssets,
  vegetationLibraryStaticArchetypes,
} from './vegetationLibraryAdapter';

describe('vegetationLibraryAdapter', () => {
  it('emits a well-formed static archetype for the baked jungle-tree hero', () => {
    const archetypes = vegetationLibraryStaticArchetypes();
    const jungle = archetypes['jungle-tree'];
    expect(jungle).toBeDefined();
    // mesh + baked octa impostor present -> archetype with resolved served paths.
    expect(jungle.modelPath).toBe(`${VEGETATION_ASSET_ROOT}/jungle-tree/jungle-tree.glb`);
    expect(jungle.maps.baseColor).toBe(`${VEGETATION_ASSET_ROOT}/jungle-tree/impostor/atlas.base-color.png`);
    expect(jungle.maps.normal).toContain('impostor/atlas.normal.png');
    expect(jungle.maps.depth).toContain('impostor/atlas.depth.png');
    expect(jungle.columns).toBe(8);
    expect(jungle.rows).toBe(3);
    // promotion comes from the mesh band far edge; demotion sits below it (hysteresis).
    expect(jungle.promotionDistanceMeters).toBe(180);
    expect(jungle.demotionDistanceMeters).toBeLessThan(jungle.promotionDistanceMeters);
    expect(jungle.bounds.radius).toBeGreaterThan(0);
  });

  it('emits archetypes for the baked rubber + teak canopy trees', () => {
    const archetypes = vegetationLibraryStaticArchetypes();
    // mesh-near + freshly BAKED 8x3 octa impostor -> archetype now emitted.
    for (const slug of ['rubber-a', 'rubber-b', 'teak-a', 'teak-b']) {
      const arc = archetypes[slug];
      expect(arc, slug).toBeDefined();
      expect(arc.modelPath).toBe(`${VEGETATION_ASSET_ROOT}/${slug}/${slug}.glb`);
      expect(arc.maps.baseColor).toBe(`${VEGETATION_ASSET_ROOT}/${slug}/impostor/atlas.base-color.png`);
      expect(arc.maps.depth).toContain('impostor/atlas.depth.png');
      expect(arc.columns).toBe(8);
      expect(arc.rows).toBe(3);
      expect(arc.demotionDistanceMeters).toBeLessThan(arc.promotionDistanceMeters);
    }
    // promotion == mesh-band far edge: rubber 150m, teak 160m.
    expect(archetypes['rubber-a'].promotionDistanceMeters).toBe(150);
    expect(archetypes['teak-a'].promotionDistanceMeters).toBe(160);
  });

  it('does NOT emit archetypes for assets whose far representation is only planned', () => {
    const archetypes = vegetationLibraryStaticArchetypes();
    // banyans are shelved; their far impostors are unbaked -> skipped.
    expect(archetypes['banyan-large']).toBeUndefined();
    // mid/ground species are mesh-near + planned billboard/card far (not octa) -> skipped here.
    expect(archetypes['fan-palm']).toBeUndefined();
    expect(archetypes['banana-plant']).toBeUndefined();
  });

  it('returns no billboard assets yet (no card atlases baked)', () => {
    // All ready assets are mesh-near + planned card/billboard far; none baked.
    expect(vegetationLibraryBillboardAssets()).toEqual([]);
  });

  it('surfaces CC-BY credits for attribution-required ready assets', () => {
    const credits = vegetationLibraryAttributions();
    const jungle = credits.find((c) => c.id === 'jungle-tree');
    expect(jungle).toBeDefined();
    expect(jungle!.author).toBe('kobaltsecond');
    expect(jungle!.license).toBe('CC-BY-4.0');
    // CC0 assets (none currently ready) would not require attribution; CC-BY-SA banyans do.
    expect(credits.every((c) => c.license.startsWith('CC-BY'))).toBe(true);
  });
});
