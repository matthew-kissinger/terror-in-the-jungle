// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Pure view-model derivation for the asset gallery.
 *
 * Turns the generated `warAssetCatalog` (a flat slug → entry record) into the
 * class-grouped, sorted, REJECT-aware shape the gallery UI renders. No Three.js,
 * no DOM, no side effects — so it is exercised as an L1 behavior test.
 */

import { warAssetCatalog, type WarAssetEntry } from '../../config/generated/warAssetCatalog';

export interface GalleryGroup {
  readonly className: string;
  readonly entries: readonly WarAssetEntry[];
}

/** Stable class ordering: gameplay families first, then scenery, then misc. */
const CLASS_ORDER: readonly string[] = [
  'weapons',
  'aircraft',
  'ground',
  'boats',
  'structures',
  'buildings',
  'animals',
  'props',
];

function classRank(className: string): number {
  const index = CLASS_ORDER.indexOf(className);
  return index === -1 ? CLASS_ORDER.length : index;
}

/**
 * Group every catalog entry by class, ordering classes by CLASS_ORDER and
 * entries alphabetically by slug within each class. REJECT assets are included
 * (the gallery still lists them with the flag + reason; it just does not load
 * the GLB), per the task brief.
 */
export function buildGalleryGroups(
  catalog: Record<string, WarAssetEntry> = warAssetCatalog,
): GalleryGroup[] {
  const byClass = new Map<string, WarAssetEntry[]>();
  for (const entry of Object.values(catalog)) {
    const bucket = byClass.get(entry.class);
    if (bucket) {
      bucket.push(entry);
    } else {
      byClass.set(entry.class, [entry]);
    }
  }

  const groups: GalleryGroup[] = [];
  for (const [className, entries] of byClass) {
    entries.sort((a, b) => a.slug.localeCompare(b.slug));
    groups.push({ className, entries });
  }
  groups.sort((a, b) => {
    const rankDelta = classRank(a.className) - classRank(b.className);
    return rankDelta !== 0 ? rankDelta : a.className.localeCompare(b.className);
  });
  return groups;
}

/** Flat, render-ordered slug list (matches the grouped UI order). */
export function orderedGallerySlugs(
  catalog: Record<string, WarAssetEntry> = warAssetCatalog,
): string[] {
  return buildGalleryGroups(catalog).flatMap((group) => group.entries.map((entry) => entry.slug));
}

/**
 * REJECT assets are listed but their GLB is not loaded (they may live at a
 * package path the engine never imported). Everything else loads from
 * public/models/.
 */
export function isLoadableEntry(entry: WarAssetEntry): boolean {
  return entry.budgetStatus !== 'REJECT';
}

/** +1 for pos-z forward, -1 for neg-z (ground vehicles). Drives the gizmo arrow. */
export function forwardSign(entry: WarAssetEntry): 1 | -1 {
  return entry.forward === 'neg-z' ? -1 : 1;
}

/** Human-readable one-liner explaining why an asset is flagged, for the chip. */
export function budgetReason(entry: WarAssetEntry): string {
  if (entry.budgetStatus === 'PASS') return 'within budget';
  if (entry.budgetStatus === 'REJECT') {
    return `REJECT — ${entry.tris.toLocaleString()} tris / ${entry.sizeKB}KB exceeds the placement budget; old GLB kept, re-roll requested`;
  }
  return `EXCEPTION — ${entry.tris.toLocaleString()} tris / ${entry.sizeKB}KB over the soft budget, shipped with an acceptance note`;
}
