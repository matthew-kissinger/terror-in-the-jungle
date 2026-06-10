// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gzipSync } from 'zlib';
import {
  fetchBinaryAsset,
  prefetchBinaryAsset,
  takeBinaryAssetPrefetch,
} from './CompressedAssetFetch';

/**
 * Behavior: large /data/ binaries are fetched via the gzip sidecar when the
 * build emitted one (decoded through DecompressionStream), and via the plain
 * asset when the sidecar 404s (dev server) — with identical bytes either way.
 */

const PAYLOAD = new Uint8Array([0x4d, 0x53, 0x45, 0x54, 1, 0, 0, 0, 42, 99, 7, 255]);

function gzResponse(): Response {
  return new Response(new Uint8Array(gzipSync(PAYLOAD)), { status: 200 });
}

function rawResponse(): Response {
  return new Response(PAYLOAD.slice(), { status: 200 });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchBinaryAsset', () => {
  it('prefers the .gz sidecar and returns the decompressed bytes', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('.gz')) return gzResponse();
      throw new Error('plain asset should not be fetched when the sidecar exists');
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const bytes = await fetchBinaryAsset('/data/navmesh/a.bin');
    expect(bytes).not.toBeNull();
    expect(Array.from(bytes!)).toEqual(Array.from(PAYLOAD));
    expect(fetchMock).toHaveBeenCalledWith('/data/navmesh/a.bin.gz');
  });

  it('falls back to the plain asset when the sidecar 404s (dev server)', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('.gz')) return new Response(null, { status: 404 });
      return rawResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const bytes = await fetchBinaryAsset('/data/navmesh/a.bin');
    expect(Array.from(bytes!)).toEqual(Array.from(PAYLOAD));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the plain asset when the sidecar bytes are not gzip', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('.gz')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return rawResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const bytes = await fetchBinaryAsset('/data/navmesh/a.bin');
    expect(Array.from(bytes!)).toEqual(Array.from(PAYLOAD));
  });

  it('returns null when both sidecar and plain asset fail', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 })) as typeof fetch;
    expect(await fetchBinaryAsset('/data/navmesh/missing.bin')).toBeNull();
  });
});

describe('prefetch store', () => {
  it('take consumes a started prefetch exactly once', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('.gz')) return gzResponse();
      return rawResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    prefetchBinaryAsset('/data/navmesh/b.bin');
    prefetchBinaryAsset('/data/navmesh/b.bin'); // idempotent — one download
    const pending = takeBinaryAssetPrefetch('/data/navmesh/b.bin');
    expect(pending).not.toBeNull();
    expect(Array.from((await pending!)!)).toEqual(Array.from(PAYLOAD));
    expect(takeBinaryAssetPrefetch('/data/navmesh/b.bin')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null for a URL that was never prefetched', () => {
    expect(takeBinaryAssetPrefetch('/data/navmesh/never.bin')).toBeNull();
  });
});
