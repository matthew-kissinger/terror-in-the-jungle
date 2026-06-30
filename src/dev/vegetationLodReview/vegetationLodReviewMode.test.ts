/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, describe, expect, it } from 'vitest';
import {
  getVegetationLodReviewAssetParam,
  getVegetationLodReviewStageParam,
  isVegetationLodReviewMode,
} from './vegetationLodReviewMode';

function setSearch(search: string): void {
  window.history.replaceState(null, '', search.length > 0 ? `/${search}` : '/');
}

const originalHref = window.location.href;

afterEach(() => {
  window.history.replaceState(null, '', originalHref);
});

describe('isVegetationLodReviewMode', () => {
  it('activates only for the vegetation LOD review mode param', () => {
    setSearch('?mode=vegetation-lod-review');
    expect(isVegetationLodReviewMode()).toBe(true);

    setSearch('?mode=asset-gallery');
    expect(isVegetationLodReviewMode()).toBe(false);
  });
});

describe('vegetation LOD review params', () => {
  it('reads optional deep-link asset and lighting stage values', () => {
    setSearch('?mode=vegetation-lod-review&asset=jungle-tree&stage=humid-fog');

    expect(getVegetationLodReviewAssetParam()).toBe('jungle-tree');
    expect(getVegetationLodReviewStageParam()).toBe('humid-fog');
  });
});
