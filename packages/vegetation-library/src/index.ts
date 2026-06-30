// SPDX-License-Identifier: AGPL-3.0-or-later
//
// @game-field-kits/vegetation-library — engine-agnostic vegetation asset library.
//
// Public surface: the schema types (the contract), the validated catalog, and the
// path resolver. No renderer, no engine types. A consuming engine imports the
// catalog, picks representations per its own LOD/perf policy, resolves logical paths
// against its asset root, and loads the binaries however it likes.

export type {
  AssetLicense,
  AssetProvenance,
  AssetStatus,
  Bounds,
  Ecology,
  LodBand,
  LodStrategy,
  MaterialBlend,
  MaterialBucket,
  NormalizationConvention,
  PerfBudget,
  Representation,
  RepresentationId,
  RepresentationKind,
  VegetationAsset,
  VegetationTier,
} from './schema';
export { REPRESENTATION_KINDS } from './schema';

export {
  assertCatalog,
  assertVegetationAsset,
  isLodComplete,
} from './validate';

export {
  VEGETATION_CATALOG,
  getVegetationAsset,
  readyVegetation,
  vegetationAssetIds,
  vegetationByStatus,
  vegetationByTier,
} from './catalog';

export {
  representationForDistance,
  resolveAsset,
  resolveAssetPath,
  resolveMaterialBucket,
  resolveRepresentation,
} from './resolve';
