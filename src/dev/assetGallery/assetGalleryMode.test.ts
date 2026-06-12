/**
 * @vitest-environment jsdom
 *
 * Behavior tests for the asset-gallery URL guard. The gallery is a dev-only
 * review surface, so the guard should only accept its explicit mode value, and
 * the slug deep-link should round-trip the requested asset.
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { afterEach, describe, expect, it } from 'vitest';
import { isAssetGalleryMode, getAssetGallerySlugParam } from './assetGalleryMode';

const originalHref = window.location.href;

function setSearch(search: string): void {
  window.history.replaceState(null, '', `/${search}`);
}

afterEach(() => {
  window.history.replaceState(null, '', originalHref);
});

describe('isAssetGalleryMode', () => {
  it('returns true when ?mode=asset-gallery is present', () => {
    setSearch('?mode=asset-gallery');
    expect(isAssetGalleryMode()).toBe(true);
  });

  it('returns false when no mode param is present', () => {
    setSearch('');
    expect(isAssetGalleryMode()).toBe(false);
  });

  it('returns false for unrelated mode values', () => {
    setSearch('?mode=gun-range');
    expect(isAssetGalleryMode()).toBe(false);
  });
});

describe('getAssetGallerySlugParam', () => {
  it('returns the requested slug when present', () => {
    setSearch('?mode=asset-gallery&slug=uh1-huey');
    expect(getAssetGallerySlugParam()).toBe('uh1-huey');
  });

  it('returns null when no slug is provided', () => {
    setSearch('?mode=asset-gallery');
    expect(getAssetGallerySlugParam()).toBeNull();
  });
});
