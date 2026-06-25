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

  it('does NOT emit archetypes for assets whose far impostor is only planned', () => {
    const archetypes = vegetationLibraryStaticArchetypes();
    // teak/rubber are mesh-near + PLANNED octa (not baked) -> must be skipped.
    expect(archetypes['teak-a']).toBeUndefined();
    expect(archetypes['rubber-a']).toBeUndefined();
    // banyans are shelved but their far impostors are also unbaked -> skipped too.
    expect(archetypes['banyan-large']).toBeUndefined();
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
