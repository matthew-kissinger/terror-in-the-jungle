// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Asset-gallery mode entry guard.
 *
 * Activated by `?mode=asset-gallery`. When active, bootstrap skips the normal
 * GameEngine wire-up and runs the isolated war-asset review surface instead, so
 * the owner can inspect every cataloged GLB (orientation, scale vs a 1.8m human
 * reference, materials, grafted rig joints) without booting combat, AI,
 * terrain, atmosphere, audio, HUD, or vehicles.
 *
 * Like the other dev routes the guard + dynamic scene import live inside an
 * `import.meta.env.DEV` block in bootstrap, so Vite dead-code-eliminates the
 * whole path from retail bundles. See docs/tasks/asset-gallery-route.md.
 */

const ASSET_GALLERY_MODE_PARAM = 'mode';
const ASSET_GALLERY_MODE_VALUE = 'asset-gallery';

export function isAssetGalleryMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get(ASSET_GALLERY_MODE_PARAM) === ASSET_GALLERY_MODE_VALUE;
}

/** Read the `?slug=` deep-link target, if present. */
export function getAssetGallerySlugParam(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const slug = new URLSearchParams(window.location.search).get('slug');
  return slug && slug.length > 0 ? slug : null;
}
