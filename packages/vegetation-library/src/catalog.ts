// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The catalog: every vegetation descriptor, loaded from the language-neutral JSON
// under ../catalog and validated at module load. Importing this module is the single
// way to enumerate the library; it throws if any descriptor is malformed so a bad
// entry can never reach a consumer.

import { assertCatalog } from './validate';
import type { AssetStatus, VegetationAsset, VegetationTier } from './schema';

import banyanLarge from '../catalog/banyan-large.json';
import banyanStandard from '../catalog/banyan-standard.json';
import elephantGrass from '../catalog/elephant-grass.json';
import fern from '../catalog/fern.json';
import jungleDeadfall from '../catalog/jungle-deadfall.json';
import jungleTree from '../catalog/jungle-tree.json';

const RAW: readonly unknown[] = [jungleTree, banyanLarge, banyanStandard, elephantGrass, fern, jungleDeadfall];

// Validate once at load. Narrows RAW to VegetationAsset[].
assertCatalog(RAW);

/** Every asset in the library, validated. */
export const VEGETATION_CATALOG: readonly VegetationAsset[] = RAW;

const BY_ID = new Map(VEGETATION_CATALOG.map((a) => [a.id, a]));

/** Look up one asset by id, or undefined. */
export function getVegetationAsset(id: string): VegetationAsset | undefined {
  return BY_ID.get(id);
}

/** All asset ids. */
export function vegetationAssetIds(): string[] {
  return [...BY_ID.keys()];
}

/** Filter the catalog by lifecycle status. */
export function vegetationByStatus(status: AssetStatus): VegetationAsset[] {
  return VEGETATION_CATALOG.filter((a) => a.status === status);
}

/** Filter the catalog by canopy tier. */
export function vegetationByTier(tier: VegetationTier): VegetationAsset[] {
  return VEGETATION_CATALOG.filter((a) => a.ecology.tier === tier);
}

/** Assets an engine can adopt right now (status=ready). */
export function readyVegetation(): VegetationAsset[] {
  return vegetationByStatus('ready');
}
