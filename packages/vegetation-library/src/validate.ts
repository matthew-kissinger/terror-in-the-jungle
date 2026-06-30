// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Runtime validation for vegetation descriptors. Descriptors are authored as JSON
// (language-neutral, portable), so they are not type-checked at author time. This
// validator is the gate: `assertVegetationAsset` throws on a malformed descriptor so
// a bad catalog entry fails loudly at load, not silently at render.

import type {
  AssetLicense,
  AssetStatus,
  LodBand,
  MaterialBlend,
  Representation,
  RepresentationKind,
  VegetationAsset,
  VegetationTier,
} from './schema';

const LICENSES: ReadonlySet<AssetLicense> = new Set<AssetLicense>([
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'MIT',
  'AGPL-3.0-or-later',
]);
const TIERS: ReadonlySet<VegetationTier> = new Set<VegetationTier>(['canopy', 'midLevel', 'groundCover']);
const STATUSES: ReadonlySet<AssetStatus> = new Set<AssetStatus>(['ready', 'sourceStaged', 'pending']);
const BLENDS: ReadonlySet<MaterialBlend> = new Set<MaterialBlend>(['opaque', 'alphaClip', 'alphaBlend']);
const KINDS: ReadonlySet<RepresentationKind> = new Set<RepresentationKind>([
  'mesh',
  'billboardAtlas',
  'octaImpostor',
  'groundCard',
]);

function fail(id: string, msg: string): never {
  throw new Error(`vegetation-library: invalid asset '${id}': ${msg}`);
}

function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number');
}

function checkOptionalFiniteRange(
  id: string,
  label: string,
  value: unknown,
  min: number,
  max: number,
): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(id, `${label} must be a finite number in [${min}, ${max}]`);
  }
}

function checkRepresentation(id: string, r: Representation): void {
  if (!isStr(r.id)) fail(id, `representation of kind '${r.kind}' missing id`);
  switch (r.kind) {
    case 'mesh':
      if (!isStr(r.path)) fail(id, `mesh '${r.id}' path missing`);
      if (typeof r.tris !== 'number') fail(id, `mesh '${r.id}' tris missing`);
      if (!Array.isArray(r.materialBuckets)) fail(id, `mesh '${r.id}' materialBuckets missing`);
      if (!r.bounds || !isVec3(r.bounds.center) || !isVec3(r.bounds.size)) fail(id, `mesh '${r.id}' bounds malformed`);
      break;
    case 'billboardAtlas':
      if (!isStr(r.path)) fail(id, `billboardAtlas '${r.id}' path missing`);
      if (typeof r.tilesX !== 'number' || typeof r.tilesY !== 'number') fail(id, `billboardAtlas '${r.id}' tiles missing`);
      if (r.projection !== 'lat-lon' && r.projection !== 'single') fail(id, `billboardAtlas '${r.id}' projection invalid`);
      break;
    case 'octaImpostor':
      if (!isStr(r.baseColorPath) || !isStr(r.normalPath)) fail(id, `octaImpostor '${r.id}' maps missing`);
      if (typeof r.columns !== 'number' || typeof r.rows !== 'number') fail(id, `octaImpostor '${r.id}' grid missing`);
      if (r.materialTuning) {
        checkOptionalFiniteRange(id, `octaImpostor '${r.id}' materialTuning.fogStrength`, r.materialTuning.fogStrength, 0, 1.5);
        checkOptionalFiniteRange(id, `octaImpostor '${r.id}' materialTuning.foliageExposureScale`, r.materialTuning.foliageExposureScale, 0, 2);
        checkOptionalFiniteRange(id, `octaImpostor '${r.id}' materialTuning.foliageColorGamma`, r.materialTuning.foliageColorGamma, 0.6, 2.5);
        checkOptionalFiniteRange(id, `octaImpostor '${r.id}' materialTuning.foliageSaturation`, r.materialTuning.foliageSaturation, 0, 1.25);
        checkOptionalFiniteRange(id, `octaImpostor '${r.id}' materialTuning.azimuthBlendBand`, r.materialTuning.azimuthBlendBand, 0.05, 1);
      }
      break;
    case 'groundCard':
      if (!isStr(r.baseColorPath)) fail(id, `groundCard '${r.id}' baseColorPath missing`);
      break;
    default:
      fail(id, `unknown representation kind '${(r as { kind?: string }).kind}'`);
  }
}

function checkLod(id: string, asset: Partial<VegetationAsset>, repIds: ReadonlySet<string>): void {
  const lod = asset.lod;
  if (!lod || !isStr(lod.label) || !Array.isArray(lod.bands)) fail(id, 'lod must be {label, bands[]}');
  if (asset.status === 'ready' && lod.bands.length === 0) fail(id, 'status=ready but lod has no bands');

  let prevMax = 0;
  let plannedSeen = false;
  lod.bands.forEach((b: LodBand, i: number) => {
    if (typeof b.minDistanceMeters !== 'number') fail(id, `lod band ${i} minDistanceMeters missing`);
    if (b.maxDistanceMeters !== null && typeof b.maxDistanceMeters !== 'number') {
      fail(id, `lod band ${i} maxDistanceMeters must be number or null`);
    }
    // Bands are ordered near->far and contiguous: band i starts where i-1 ended.
    if (i === 0 && b.minDistanceMeters !== 0) fail(id, 'first lod band must start at 0m');
    if (i > 0 && b.minDistanceMeters !== prevMax) {
      fail(id, `lod band ${i} starts at ${b.minDistanceMeters}m but previous ended at ${prevMax}m (must be contiguous)`);
    }
    if (b.maxDistanceMeters !== null && b.maxDistanceMeters <= b.minDistanceMeters) {
      fail(id, `lod band ${i} max <= min`);
    }
    if (i < lod.bands.length - 1 && b.maxDistanceMeters === null) {
      fail(id, `only the last lod band may be unbounded (band ${i} has null max)`);
    }
    if (i === lod.bands.length - 1 && b.maxDistanceMeters !== null) {
      // Allowed, but the farthest band is usually unbounded; not an error.
    }
    // Reference integrity: a band either names an existing representation or is planned.
    if (b.representationId === null) {
      plannedSeen = true;
      if (b.plannedKind && !KINDS.has(b.plannedKind)) fail(id, `lod band ${i} plannedKind invalid`);
    } else if (!isStr(b.representationId)) {
      fail(id, `lod band ${i} representationId must be a string or null`);
    } else if (!repIds.has(b.representationId)) {
      fail(id, `lod band ${i} references unknown representation '${b.representationId}'`);
    }
    prevMax = b.maxDistanceMeters ?? prevMax;
  });

  // A `ready` asset must have at least its nearest band backed by a real representation.
  if (asset.status === 'ready') {
    const near = lod.bands[0];
    if (!near || near.representationId === null) fail(id, 'status=ready but nearest lod band is not backed by a representation');
  }
  void plannedSeen;
}

/** Throws if `value` is not a structurally valid VegetationAsset; otherwise narrows it. */
export function assertVegetationAsset(value: unknown): asserts value is VegetationAsset {
  const a = value as Partial<VegetationAsset>;
  const id = isStr(a.id) ? a.id : '<no-id>';
  if (!isStr(a.id)) fail(id, 'id missing');
  if (!isStr(a.commonName)) fail(id, 'commonName missing');
  if (!Array.isArray(a.tags)) fail(id, 'tags must be an array');
  if (!a.status || !STATUSES.has(a.status)) fail(id, `status invalid: ${String(a.status)}`);

  const p = a.provenance;
  if (!p || !isStr(p.source)) fail(id, 'provenance.source missing');
  if (!LICENSES.has(p.license)) fail(id, `provenance.license invalid: ${String(p?.license)}`);
  if (typeof p.attributionRequired !== 'boolean') fail(id, 'provenance.attributionRequired must be boolean');
  if (p.license.startsWith('CC-BY') && !p.attributionRequired) {
    fail(id, 'CC-BY* license requires attributionRequired=true');
  }

  const n = a.normalization;
  if (!n || n.upAxis !== 'Y' || n.forwardAxis !== '-Z' || n.unit !== 'meter' || n.pivot !== 'ground-center') {
    fail(id, 'normalization must be {upAxis:Y, forwardAxis:-Z, unit:meter, pivot:ground-center}');
  }

  if (!Array.isArray(a.materialBuckets)) fail(id, 'materialBuckets must be an array');
  const bucketIds = new Set<string>();
  for (const b of a.materialBuckets) {
    if (!isStr(b.id)) fail(id, 'material bucket missing id');
    if (!BLENDS.has(b.blend)) fail(id, `material bucket '${b.id}' has invalid blend`);
    bucketIds.add(b.id);
  }

  if (!Array.isArray(a.representations)) fail(id, 'representations must be an array');
  if (a.status === 'ready' && a.representations.length === 0) fail(id, 'status=ready but no representations');
  const repIds = new Set<string>();
  for (const r of a.representations) {
    checkRepresentation(id, r);
    if (repIds.has(r.id)) fail(id, `duplicate representation id '${r.id}'`);
    repIds.add(r.id);
    if (r.kind === 'mesh') {
      for (const bid of r.materialBuckets) {
        if (!bucketIds.has(bid)) fail(id, `mesh '${r.id}' references unknown material bucket '${bid}'`);
      }
    }
  }

  checkLod(id, a, repIds);

  const e = a.ecology;
  if (!e || !TIERS.has(e.tier)) fail(id, 'ecology.tier invalid');
  if (!Array.isArray(e.preferredBiomes)) fail(id, 'ecology.preferredBiomes must be an array');
}

/** True when every lod band of an asset is backed by a real (non-planned) representation. */
export function isLodComplete(asset: VegetationAsset): boolean {
  return asset.lod.bands.every((b) => b.representationId !== null);
}

/** Validate a whole catalog; throws on the first bad entry or duplicate id. */
export function assertCatalog(assets: readonly unknown[]): asserts assets is VegetationAsset[] {
  const seen = new Set<string>();
  for (const a of assets) {
    assertVegetationAsset(a);
    if (seen.has(a.id)) throw new Error(`vegetation-library: duplicate asset id '${a.id}'`);
    seen.add(a.id);
  }
}
