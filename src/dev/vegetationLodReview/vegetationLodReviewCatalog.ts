// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Pure catalog/view-model derivation for the vegetation LOD review route.
 *
 * The route compares the accepted source GLB against the far representation the
 * runtime actually uses: octahedral static impostors for sparse heroes, and
 * baked ground cards for dense cover. Keeping this pure lets the behavior tests
 * verify the review surface covers every currently emitted vegetation LOD asset
 * without depending on Three.js, DOM, or a live renderer.
 */

import type { StaticImpostorArchetype } from '../../config/staticImpostorArchetypes';
import type { VegetationGroundCardArchetype } from '../../config/vegetation/groundCardArchetypes';
import {
  vegetationLibraryGroundCards,
  vegetationLibraryStaticArchetypes,
} from '../../config/vegetation/vegetationLibraryAdapter';

export type VegetationLodReviewKind = 'octaImpostor' | 'groundCard';

export interface VegetationLodReviewEntry {
  readonly slug: string;
  readonly kind: VegetationLodReviewKind;
  readonly meshPath: string;
  readonly sourceLabel: string;
  readonly farLabel: string;
  readonly staticArchetype?: StaticImpostorArchetype;
  readonly groundCard?: VegetationGroundCardArchetype;
}

export interface VegetationLodReviewSources {
  readonly staticArchetypes?: Readonly<Record<string, StaticImpostorArchetype>>;
  readonly groundCards?: Readonly<Record<string, VegetationGroundCardArchetype>>;
}

export function buildVegetationLodReviewEntries(
  sources: VegetationLodReviewSources = {},
): VegetationLodReviewEntry[] {
  const staticArchetypes = sources.staticArchetypes ?? vegetationLibraryStaticArchetypes();
  const groundCards = sources.groundCards ?? vegetationLibraryGroundCards();
  const entries: VegetationLodReviewEntry[] = [];

  for (const archetype of Object.values(staticArchetypes)) {
    entries.push({
      slug: archetype.slug,
      kind: 'octaImpostor',
      meshPath: archetype.modelPath,
      sourceLabel: 'source GLB',
      farLabel: 'static impostor',
      staticArchetype: archetype,
    });
  }

  for (const card of Object.values(groundCards)) {
    entries.push({
      slug: card.slug,
      kind: 'groundCard',
      meshPath: card.meshPath,
      sourceLabel: 'source GLB',
      farLabel: 'ground card',
      groundCard: card,
    });
  }

  entries.sort((a, b) => {
    const kindDelta = kindRank(a.kind) - kindRank(b.kind);
    return kindDelta !== 0 ? kindDelta : a.slug.localeCompare(b.slug);
  });
  return entries;
}

export function getVegetationLodReviewEntry(
  slug: string | null | undefined,
  entries = buildVegetationLodReviewEntries(),
): VegetationLodReviewEntry | null {
  if (!slug) return entries[0] ?? null;
  return entries.find((entry) => entry.slug === slug) ?? null;
}

export function orderedVegetationLodReviewSlugs(
  entries = buildVegetationLodReviewEntries(),
): string[] {
  return entries.map((entry) => entry.slug);
}

function kindRank(kind: VegetationLodReviewKind): number {
  return kind === 'octaImpostor' ? 0 : 1;
}
