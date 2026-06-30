// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Dev-only vegetation LOD review route guard.
 *
 * Activated by `?mode=vegetation-lod-review`. Bootstrap keeps this behind the
 * existing `import.meta.env.DEV` block, so the route and its WebGPU review scene
 * are dead-code-eliminated from retail builds.
 */

const MODE_PARAM = 'mode';
const MODE_VALUE = 'vegetation-lod-review';
const ASSET_PARAM = 'asset';
const STAGE_PARAM = 'stage';

export function isVegetationLodReviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get(MODE_PARAM) === MODE_VALUE;
}

export function getVegetationLodReviewAssetParam(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get(ASSET_PARAM);
  return value && value.length > 0 ? value : null;
}

export function getVegetationLodReviewStageParam(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get(STAGE_PARAM);
  return value && value.length > 0 ? value : null;
}
