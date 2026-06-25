// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Engine-agnostic path resolution. Descriptors store ROOT-RELATIVE logical paths
// (e.g. 'vegetation/banyan/banyan-large-textured.glb'). A consumer supplies its own
// asset root — for TIJ (Vite) that is the served root '/' so the resolved url is
// '/vegetation/...'; another engine might pass an absolute filesystem dir or a CDN
// base. This module does string joining only: no fs, no fetch, no three.

import type { MaterialBucket, Representation, VegetationAsset } from './schema';

/** Join an asset root and a logical path into a single url/path, normalizing slashes. */
export function resolveAssetPath(assetRoot: string, logicalPath: string): string {
  const root = assetRoot.replace(/\/+$/, '');
  const rel = logicalPath.replace(/^\/+/, '');
  return root.length ? `${root}/${rel}` : `/${rel}`;
}

function resolveMaps(assetRoot: string, maps: Record<string, string | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(maps)) out[k] = v ? resolveAssetPath(assetRoot, v) : v;
  return out;
}

/** Return a deep copy of a representation with every logical path resolved against the root. */
export function resolveRepresentation(assetRoot: string, rep: Representation): Representation {
  switch (rep.kind) {
    case 'mesh':
      return { ...rep, path: resolveAssetPath(assetRoot, rep.path) };
    case 'billboardAtlas':
      return {
        ...rep,
        path: resolveAssetPath(assetRoot, rep.path),
        normalPath: rep.normalPath ? resolveAssetPath(assetRoot, rep.normalPath) : undefined,
      };
    case 'octaImpostor':
      return {
        ...rep,
        baseColorPath: resolveAssetPath(assetRoot, rep.baseColorPath),
        normalPath: resolveAssetPath(assetRoot, rep.normalPath),
        depthPath: rep.depthPath ? resolveAssetPath(assetRoot, rep.depthPath) : undefined,
      };
    case 'groundCard':
      return {
        ...rep,
        baseColorPath: resolveAssetPath(assetRoot, rep.baseColorPath),
        opacityPath: rep.opacityPath ? resolveAssetPath(assetRoot, rep.opacityPath) : undefined,
        normalPath: rep.normalPath ? resolveAssetPath(assetRoot, rep.normalPath) : undefined,
      };
  }
}

/** Return a copy of a material bucket with its map paths resolved. */
export function resolveMaterialBucket(assetRoot: string, bucket: MaterialBucket): MaterialBucket {
  return { ...bucket, maps: resolveMaps(assetRoot, bucket.maps) };
}

/**
 * Return a deep copy of an asset with every logical path (representations + material
 * buckets) resolved against `assetRoot`. The descriptor itself is left untouched.
 */
export function resolveAsset(assetRoot: string, asset: VegetationAsset): VegetationAsset {
  return {
    ...asset,
    materialBuckets: asset.materialBuckets.map((b) => resolveMaterialBucket(assetRoot, b)),
    representations: asset.representations.map((r) => resolveRepresentation(assetRoot, r)),
  };
}

/** Find the representation a given distance (meters) resolves to, walking the lod chain. */
export function representationForDistance(asset: VegetationAsset, distanceMeters: number): Representation | null {
  for (const band of asset.lod.bands) {
    const within = distanceMeters >= band.minDistanceMeters && (band.maxDistanceMeters === null || distanceMeters < band.maxDistanceMeters);
    if (!within) continue;
    if (band.representationId === null) return null; // planned-not-baked band
    return asset.representations.find((r) => r.id === band.representationId) ?? null;
  }
  return null;
}
