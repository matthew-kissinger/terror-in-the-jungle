// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  VEGETATION_ASSET_ROOT,
  vegetationLibraryAttributions,
  vegetationLibraryBillboardAssets,
  vegetationLibraryGroundCards,
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
    expect(jungle.lightingProfile).toBe('foliage-card');
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
      expect(arc.lightingProfile).toBe('foliage-card');
      expect(arc.demotionDistanceMeters).toBeLessThan(arc.promotionDistanceMeters);
    }
    // promotion == mesh-band far edge: rubber 150m, teak 160m.
    expect(archetypes['rubber-a'].promotionDistanceMeters).toBe(150);
    expect(archetypes['teak-a'].promotionDistanceMeters).toBe(160);
  });

  it('emits archetypes for the promoted fan-palm + bamboo-grove mid heroes', () => {
    const archetypes = vegetationLibraryStaticArchetypes();
    expect(archetypes['fan-palm']).toBeDefined();
    expect(archetypes['bamboo-grove']).toBeDefined();
    // Short mesh ranges: understory reads flat sooner than canopy.
    expect(archetypes['fan-palm'].promotionDistanceMeters).toBe(70);
    expect(archetypes['bamboo-grove'].promotionDistanceMeters).toBe(100);
    expect(archetypes['fan-palm'].maps.baseColor).toContain('fan-palm/impostor/atlas.base-color.png');
  });

  it('does NOT emit archetypes for assets whose far representation is only planned', () => {
    const archetypes = vegetationLibraryStaticArchetypes();
    // banyans are shelved; their far impostors are unbaked -> skipped.
    expect(archetypes['banyan-large']).toBeUndefined();
    // banana-plant's far rep is a baked groundCard (not an octa impostor), so it never
    // reaches the static (per-clone hero) archetype path either.
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

describe('vegetationLibraryGroundCards', () => {
  it('emits mesh-near + baked-card-far archetypes for the dense ground-cover species', () => {
    const cards = vegetationLibraryGroundCards();
    for (const slug of ['understory-fern', 'taro-elephant-ear', 'rice-paddy']) {
      const card = cards[slug];
      expect(card, slug).toBeDefined();
      // Near mesh + far card both resolve to served public/ urls.
      expect(card.meshPath).toBe(`${VEGETATION_ASSET_ROOT}/${slug}/${slug}.glb`);
      expect(card.card.baseColor).toBe(`${VEGETATION_ASSET_ROOT}/${slug}/card/atlas.base-color.png`);
      expect(card.card.normal).toContain('card/atlas.normal.png');
      // The card is hard-culled past the near mesh band (LOD makes sense).
      expect(card.cullDistanceMeters).toBeGreaterThan(card.meshFarEdgeMeters);
      // Footprint + ground anchor are sane.
      expect(card.cardWorldSize[0]).toBeGreaterThan(0);
      expect(card.cardWorldSize[1]).toBeGreaterThan(0);
      expect(card.yOffset).toBeCloseTo(card.cardWorldSize[1] * 0.5, 5);
      expect(card.bounds.radius).toBeGreaterThan(0);
      expect(card.maxSlopeDeg).toBeGreaterThan(0);
    }
  });

  it('emits the freshly baked banana-plant ground card (mesh-near + card-far)', () => {
    const cards = vegetationLibraryGroundCards();
    const banana = cards['banana-plant'];
    expect(banana).toBeDefined();
    expect(banana.meshPath).toBe(`${VEGETATION_ASSET_ROOT}/banana-plant/banana-plant.glb`);
    expect(banana.card.baseColor).toBe(`${VEGETATION_ASSET_ROOT}/banana-plant/card/atlas.base-color.png`);
    expect(banana.card.normal).toContain('banana-plant/card/atlas.normal.png');
    // Catalog LOD: real mesh 0-30m, baked alpha card 30-70m (hard-culled).
    expect(banana.meshFarEdgeMeters).toBe(30);
    expect(banana.cullDistanceMeters).toBe(70);
    expect(banana.cullDistanceMeters).toBeGreaterThan(banana.meshFarEdgeMeters);
    // Footprint + ground anchor sane; slope cap from the catalog ecology.
    expect(banana.cardWorldSize[0]).toBeGreaterThan(0);
    expect(banana.cardWorldSize[1]).toBeGreaterThan(0);
    expect(banana.yOffset).toBeCloseTo(banana.cardWorldSize[1] * 0.5, 5);
    expect(banana.maxSlopeDeg).toBe(25);
  });

  it('matches the catalog LOD band distances (fern 14->40, taro 28->65, rice 25->50)', () => {
    const cards = vegetationLibraryGroundCards();
    expect(cards['understory-fern'].meshFarEdgeMeters).toBe(14);
    expect(cards['understory-fern'].cullDistanceMeters).toBe(40);
    expect(cards['taro-elephant-ear'].meshFarEdgeMeters).toBe(28);
    expect(cards['taro-elephant-ear'].cullDistanceMeters).toBe(65);
    expect(cards['rice-paddy'].meshFarEdgeMeters).toBe(25);
    expect(cards['rice-paddy'].cullDistanceMeters).toBe(50);
  });

  it('keeps ground cards OFF the per-clone hero (static-impostor) path', () => {
    // Dense ground cover must never reach vegetationLibraryStaticArchetypes() — that
    // feeds the GLBHeroScatterer, which keeps one GLB clone per instance.
    const archetypes = vegetationLibraryStaticArchetypes();
    const cards = vegetationLibraryGroundCards();
    for (const slug of Object.keys(cards)) {
      expect(archetypes[slug], slug).toBeUndefined();
    }
    // ...and ground cards never leak into the billboard seam either.
    expect(vegetationLibraryBillboardAssets()).toEqual([]);
  });
});
