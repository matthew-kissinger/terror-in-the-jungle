// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behavior tests for the gallery view-model derivation. These assert the
 * observable contract the UI depends on — every cataloged asset is reachable,
 * REJECT assets stay visible but are marked unloadable, ground vehicles point
 * their forward gizmo the opposite way — without enshrining exact catalog
 * counts (which grow as the importer re-rolls assets).
 */

import { describe, expect, it } from 'vitest';
import {
  buildGalleryGroups,
  orderedGallerySlugs,
  isLoadableEntry,
  forwardSign,
  budgetReason,
} from './galleryCatalog';
import { warAssetCatalog, type WarAssetEntry } from '../../config/generated/warAssetCatalog';

function entry(partial: Partial<WarAssetEntry> & Pick<WarAssetEntry, 'slug' | 'class'>): WarAssetEntry {
  return {
    path: `${partial.class}/${partial.slug}.glb`,
    forward: 'pos-z',
    dims: [1, 1, 1],
    tris: 100,
    sizeKB: 10,
    materials: 1,
    minY: 0,
    budgetStatus: 'PASS',
    action: 'new',
    ...partial,
  };
}

describe('buildGalleryGroups', () => {
  it('includes every cataloged asset exactly once', () => {
    const groups = buildGalleryGroups();
    const grouped = groups.flatMap((group) => group.entries.map((e) => e.slug)).sort();
    const all = Object.keys(warAssetCatalog).sort();
    expect(grouped).toEqual(all);
  });

  it('keeps REJECT assets in their group rather than dropping them', () => {
    const rejects = Object.values(warAssetCatalog).filter((e) => e.budgetStatus === 'REJECT');
    expect(rejects.length).toBeGreaterThan(0);
    const grouped = new Set(buildGalleryGroups().flatMap((g) => g.entries.map((e) => e.slug)));
    for (const reject of rejects) {
      expect(grouped.has(reject.slug)).toBe(true);
    }
  });

  it('orders weapons ahead of buildings and sorts entries within a class', () => {
    const fixture: Record<string, WarAssetEntry> = {
      villa: entry({ slug: 'villa', class: 'buildings' }),
      ak: entry({ slug: 'ak', class: 'weapons' }),
      church: entry({ slug: 'church', class: 'buildings' }),
      m16: entry({ slug: 'm16', class: 'weapons' }),
    };
    const groups = buildGalleryGroups(fixture);
    expect(groups.map((g) => g.className)).toEqual(['weapons', 'buildings']);
    expect(groups[0].entries.map((e) => e.slug)).toEqual(['ak', 'm16']);
    expect(groups[1].entries.map((e) => e.slug)).toEqual(['church', 'villa']);
  });
});

describe('orderedGallerySlugs', () => {
  it('matches the flattened grouped order', () => {
    const groups = buildGalleryGroups();
    const expected = groups.flatMap((g) => g.entries.map((e) => e.slug));
    expect(orderedGallerySlugs()).toEqual(expected);
  });
});

describe('isLoadableEntry', () => {
  it('treats REJECT as unloadable and everything else as loadable', () => {
    expect(isLoadableEntry(entry({ slug: 'x', class: 'structures', budgetStatus: 'REJECT' }))).toBe(false);
    expect(isLoadableEntry(entry({ slug: 'y', class: 'structures', budgetStatus: 'EXCEPTION' }))).toBe(true);
    expect(isLoadableEntry(entry({ slug: 'z', class: 'structures', budgetStatus: 'PASS' }))).toBe(true);
  });
});

describe('forwardSign', () => {
  it('points ground vehicles the opposite way from everything else', () => {
    expect(forwardSign(entry({ slug: 'jeep', class: 'ground', forward: 'neg-z' }))).toBe(-1);
    expect(forwardSign(entry({ slug: 'huey', class: 'aircraft', forward: 'pos-z' }))).toBe(1);
  });
});

describe('budgetReason', () => {
  it('flags REJECT and EXCEPTION distinctly and stays quiet for PASS', () => {
    expect(budgetReason(entry({ slug: 'a', class: 'structures', budgetStatus: 'REJECT' }))).toContain('REJECT');
    expect(budgetReason(entry({ slug: 'b', class: 'structures', budgetStatus: 'EXCEPTION' }))).toContain('EXCEPTION');
    expect(budgetReason(entry({ slug: 'c', class: 'structures', budgetStatus: 'PASS' }))).toBe('within budget');
  });
});
