// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Fetch helpers for the large static binaries under `/data/` (pre-baked
 * navmeshes, heightmaps).
 *
 * Cloudflare only auto-compresses whitelisted content types; `.bin`/`.f32`
 * (application/octet-stream) ship raw, so A Shau's cold load paid ~40MB of
 * uncompressed transfer. The build emits gzip sidecars next to each asset
 * (`scripts/compress-data-assets.ts`; navmesh 19.4MB → ~6.1MB wire), and this
 * helper prefers `<asset>.gz` decoded through DecompressionStream, falling
 * back to the plain asset when the sidecar is missing (dev server) or the
 * browser lacks DecompressionStream.
 */
export async function fetchBinaryAsset(assetUrl: string): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'function') {
    try {
      const gz = await fetch(`${assetUrl}.gz`);
      if (gz.ok && gz.body) {
        const buffer = await new Response(
          gz.body.pipeThrough(new DecompressionStream('gzip')),
        ).arrayBuffer();
        return new Uint8Array(buffer);
      }
    } catch {
      // Sidecar missing or undecodable — fall through to the plain asset.
    }
  }
  const response = await fetch(assetUrl);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

const pendingPrefetches = new Map<string, Promise<Uint8Array | null>>();

/**
 * Start downloading an asset without awaiting it, so e.g. the navmesh wire
 * transfer overlaps the DEM transfer during mode startup instead of running
 * serially after it. Idempotent per URL.
 */
export function prefetchBinaryAsset(assetUrl: string): void {
  if (!pendingPrefetches.has(assetUrl)) {
    pendingPrefetches.set(assetUrl, fetchBinaryAsset(assetUrl).catch(() => null));
  }
}

/**
 * Consume a pending prefetch for this URL, or null if none was started
 * (caller then fetches directly). One-shot: the entry is removed so a
 * later reload of the same mode fetches fresh.
 */
export function takeBinaryAssetPrefetch(assetUrl: string): Promise<Uint8Array | null> | null {
  const pending = pendingPrefetches.get(assetUrl) ?? null;
  pendingPrefetches.delete(assetUrl);
  return pending;
}
