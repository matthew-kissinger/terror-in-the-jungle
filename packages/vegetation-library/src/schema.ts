// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Engine-agnostic vegetation asset schema.
//
// This file is the CONTRACT. It describes *what a vegetation asset is and how it
// can be rendered* in terms no renderer owns: no three.js, no engine types, no DOM.
// A consuming engine reads these descriptors and maps them, via its own thin
// adapter, onto whatever runtime representation it uses (billboard system, static
// impostor system, instanced mesh, etc.). The library never reaches into an engine;
// engines reach into the library.
//
// Two layers, deliberately separated:
//   1. `representations` — the INVENTORY of authored/baked render forms for an asset
//      (a near mesh, a mid card atlas, a far impostor, a ground card). Each is a pure
//      descriptor with a stable id.
//   2. `lod` — the chosen STRATEGY: an ordered near->far chain of distance bands, each
//      pointing at a representation (or marked planned-but-not-yet-baked) plus a perf
//      budget. NOT every asset is impostor-only: a fern may be one instanced card at
//      all ranges; a hero tree is mesh-near + impostor-far; ground cover may skip the
//      far band entirely. The right chain depends on inventory, budget, and perf.
//
// Binary files (GLBs, textures, atlases) live wherever the consumer serves them.
// Descriptors reference them by ROOT-RELATIVE logical paths (e.g.
// 'vegetation/banyan/banyan-large-textured.glb'); `resolve.ts` joins a logical path
// onto the consumer's asset root.

/** Canopy layer the asset reads as. Drives placement density + LOD policy. */
export type VegetationTier = 'canopy' | 'midLevel' | 'groundCover';

/** SPDX license id of the *source* asset. Governs attribution + redistribution. */
export type AssetLicense =
  | 'CC0-1.0'
  | 'CC-BY-4.0'
  | 'CC-BY-SA-4.0'
  | 'MIT'
  | 'AGPL-3.0-or-later';

/**
 * Lifecycle of an asset in the library.
 * - `ready`        normalized + has >=1 renderable representation AND a usable lod chain.
 * - `sourceStaged` raw source bytes are present (under the source tree) but not yet
 *                  normalized into a representation.
 * - `pending`      planned; provenance recorded but source not acquired.
 */
export type AssetStatus = 'ready' | 'sourceStaged' | 'pending';

/** Where the asset came from + how it must be credited. */
export interface AssetProvenance {
  /** Provider name, e.g. 'Sketchfab', 'ambientCG', 'Poly Haven', 'Kiln Studio', 'EZ-Tree'. */
  source: string;
  /** Author handle, or null for anonymous / CC0 public-domain. */
  author: string | null;
  /** Canonical source URL, or null if generated in-house. */
  url: string | null;
  license: AssetLicense;
  /** True when the license (e.g. CC-BY*) obliges a visible credit. */
  attributionRequired: boolean;
  /** Triangle count of the original source mesh, before normalization, if known. */
  sourceTris?: number;
  notes?: string;
}

/**
 * The geometric convention every NORMALIZED asset adheres to. Fixed for the whole
 * library so adapters never have to special-case orientation. Stored explicitly so a
 * non-conforming asset is detectable rather than silently wrong.
 */
export interface NormalizationConvention {
  upAxis: 'Y';
  forwardAxis: '-Z';
  unit: 'meter';
  /** Origin at the base, centered in X/Z, ground at y=0. */
  pivot: 'ground-center';
}

/** How a material bucket blends. Drives the engine's batching + sort policy. */
export type MaterialBlend = 'opaque' | 'alphaClip' | 'alphaBlend';

/**
 * A shared material bucket. The whole point of Strategy A: many assets collapse onto
 * a few buckets so the renderer can batch them. Map paths are root-relative logical
 * paths resolved by `resolve.ts`.
 */
export interface MaterialBucket {
  /** Stable id, unique within the asset, e.g. 'bark', 'leaf', 'card'. */
  id: string;
  blend: MaterialBlend;
  maps: {
    baseColor?: string;
    normal?: string;
    roughness?: string;
    /** Alpha mask for alphaClip/alphaBlend cards. */
    opacity?: string;
    height?: string;
  };
  /** Default scalar PBR factors when a map is absent. */
  factors?: {
    roughness?: number;
    metalness?: number;
    /** Cutoff for alphaClip buckets. */
    alphaCutoff?: number;
  };
}

export interface Bounds {
  /** Center in normalized local space (meters). */
  center: [number, number, number];
  /** Full extent (meters). */
  size: [number, number, number];
  /** Bounding-sphere radius (meters). */
  radius: number;
}

export const REPRESENTATION_KINDS = ['mesh', 'billboardAtlas', 'octaImpostor', 'groundCard'] as const;
export type RepresentationKind = (typeof REPRESENTATION_KINDS)[number];

/** Per-band / per-representation perf envelope for budget accounting. */
export interface PerfBudget {
  trisPerInstance?: number;
  /** Draw calls per batched group (instancing collapses many instances to few calls). */
  drawCallsPerBatch?: number;
  /** Texture memory of this representation's maps, MB, if measured. */
  textureMb?: number;
}

/** Optional renderer-neutral scalar tuning for foliage impostor material response. */
export interface ImpostorMaterialTuning {
  fogStrength?: number;
  foliageExposureScale?: number;
  foliageColorGamma?: number;
  foliageSaturation?: number;
  /** Fraction of each azimuth tile interval spent blending to the next tile; 1 preserves full-interval blending. */
  azimuthBlendBand?: number;
}

/**
 * An engine-neutral way to render the asset. An asset offers one or more; the lod
 * chain sequences them by distance. All are pure descriptors — no GPU objects.
 * Every representation carries a stable `id` so a LodBand can reference it.
 */
export type Representation =
  | {
      kind: 'mesh';
      /** Stable id unique within the asset, e.g. 'mesh-large', 'mesh-standard'. */
      id: string;
      /** Deployment role hint: a big hero canopy vs a small instanced plant. */
      role?: 'hero' | 'instanced';
      path: string;
      tris: number;
      /** Ids of the MaterialBucket entries this mesh uses. */
      materialBuckets: string[];
      bounds: Bounds;
      budget?: PerfBudget;
    }
  | {
      kind: 'billboardAtlas';
      id: string;
      path: string;
      normalPath?: string;
      /** Atlas grid. 'single' projection uses 1x1. */
      tilesX: number;
      tilesY: number;
      /** Pixel size of one tile. */
      tileSize: number;
      /** 'lat-lon' = azimuth x elevation view sphere; 'single' = one flat card. */
      projection: 'lat-lon' | 'single';
      /** World footprint [width, height] in meters at unit scale. */
      worldSize: [number, number];
      yOffset?: number;
      budget?: PerfBudget;
    }
  | {
      kind: 'octaImpostor';
      id: string;
      baseColorPath: string;
      normalPath: string;
      depthPath?: string;
      /** Azimuth columns x elevation rows of the octahedral atlas. */
      columns: number;
      rows: number;
      bounds: Bounds;
      materialTuning?: ImpostorMaterialTuning;
      budget?: PerfBudget;
    }
  | {
      kind: 'groundCard';
      id: string;
      baseColorPath: string;
      opacityPath?: string;
      normalPath?: string;
      /** World footprint [width, height] in meters. */
      worldSize: [number, number];
      budget?: PerfBudget;
    };

/**
 * One distance band of an asset's LOD chain. Bands are ordered near->far. A band
 * either points at an existing representation (`representationId`) or is PLANNED —
 * the strategy calls for, say, a far octahedral impostor that has not been baked yet
 * (`representationId: null`, `plannedKind: 'octaImpostor'`). Planned bands make the
 * gap between inventory and strategy explicit instead of pretending it renders.
 */
export interface LodBand {
  /** Lower distance bound (inclusive), meters. First band is typically 0. */
  minDistanceMeters: number;
  /** Upper distance bound (exclusive); null = unbounded horizon/farthest band. */
  maxDistanceMeters: number | null;
  /** Representation rendered here, by id; null when this band is planned-not-baked. */
  representationId: string | null;
  /** When representationId is null: the kind intended for this band. */
  plannedKind?: RepresentationKind;
  /** Per-band perf envelope (may differ from the representation's own budget). */
  budget?: PerfBudget;
  notes?: string;
}

/**
 * The chosen LOD approach for an asset, named + sequenced. The label is a short tag
 * for humans/telemetry ('mesh-near+octa-far', 'instanced-card-only', 'single-billboard');
 * `bands` is the machine-readable chain. `complete` is false while any band is planned.
 */
export interface LodStrategy {
  /** Short human tag for the approach. */
  label: string;
  /** Why this strategy fits this asset's inventory/budget/perf. */
  rationale?: string;
  /** Ordered near->far. */
  bands: LodBand[];
}

/** Engine-neutral placement ecology. Hints, not commands — the engine decides. */
export interface Ecology {
  tier: VegetationTier;
  /** Free-form biome tags, e.g. 'denseJungle', 'riverbank', 'trailEdge'. */
  preferredBiomes: string[];
  /** Relative scatter density 0..1; the engine scales by its own budget. */
  density?: number;
  /** Acceptable ground slope range in degrees. */
  slopeRangeDeg?: [number, number];
  /** Clumping hint. */
  cluster?: { min: number; max: number; radiusMeters: number };
}

/** A single vegetation asset: identity + provenance + representations + lod + ecology. */
export interface VegetationAsset {
  /** Stable kebab-case id, e.g. 'banyan-large', 'elephant-grass'. */
  id: string;
  commonName: string;
  /** Latin / binomial, when known. */
  species?: string;
  tags: string[];
  status: AssetStatus;
  provenance: AssetProvenance;
  normalization: NormalizationConvention;
  materialBuckets: MaterialBucket[];
  /** Inventory of authored render forms. */
  representations: Representation[];
  /** Chosen distance strategy over those representations. */
  lod: LodStrategy;
  ecology: Ecology;
}

/** A representation that has a guaranteed id (all of them do). */
export type RepresentationId = string;
