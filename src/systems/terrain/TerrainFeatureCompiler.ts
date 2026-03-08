import type {
  GameModeConfig,
  MapFeatureCircleFootprint,
  MapFeatureDefinition,
  MapFeatureRectFootprint,
  TerrainFeatureStampPolicy,
  TerrainFeatureSurfacePolicy,
  TerrainFeatureVegetationPolicy,
} from '../../config/gameModeTypes';
import type {
  CompiledTerrainFeatureSet,
  TerrainExclusionZone,
  TerrainStampConfig,
  TerrainSurfacePatch,
} from './TerrainFeatureTypes';

const DEFAULT_HELIPAD_RADIUS = 12;
const DEFAULT_HELIPAD_FLAT_RADIUS = 8;
const DEFAULT_HELIPAD_BLEND_RADIUS = 13;
const DEFAULT_HELIPAD_SURFACE_OUTER_RADIUS = 12.5;
const DEFAULT_HELIPAD_EXCLUSION_RADIUS = 13;

export function compileTerrainFeatures(config: GameModeConfig): CompiledTerrainFeatureSet {
  const features = config.features ?? [];
  const compiled: CompiledTerrainFeatureSet = {
    stamps: [],
    surfacePatches: [],
    vegetationExclusionZones: [],
  };

  for (const feature of features) {
    compileFeature(feature, compiled);
  }

  compiled.stamps.sort((a, b) => a.priority - b.priority);
  compiled.surfacePatches.sort((a, b) => a.priority - b.priority);
  return compiled;
}

function compileFeature(feature: MapFeatureDefinition, compiled: CompiledTerrainFeatureSet): void {
  const stamp = compileTerrainStamp(feature);
  if (stamp) {
    compiled.stamps.push(stamp);
  }

  const surfacePatch = compileSurfacePatch(feature);
  if (surfacePatch) {
    compiled.surfacePatches.push(surfacePatch);
  }

  const exclusionZone = compileVegetationExclusion(feature);
  if (exclusionZone) {
    compiled.vegetationExclusionZones.push(exclusionZone);
  }
}

function compileTerrainStamp(feature: MapFeatureDefinition): TerrainStampConfig | null {
  const terrain = feature.terrain;
  if (!terrain?.flatten) return null;

  const circle = resolveCircleFootprint(feature);
  if (!circle) return null;

  const innerRadius = terrain.flatRadius ?? Math.min(circle.radius, defaultFlatRadiusForFeature(feature));
  const outerRadius = Math.max(innerRadius, terrain.blendRadius ?? Math.max(circle.radius, defaultBlendRadiusForFeature(feature)));
  const samplingRadius = terrain.samplingRadius ?? innerRadius;

  return {
    kind: 'flatten_circle',
    centerX: feature.position.x,
    centerZ: feature.position.z,
    innerRadius,
    outerRadius,
    samplingRadius,
    targetHeightMode: terrain.targetHeightMode ?? 'max',
    heightOffset: terrain.heightOffset ?? 0,
    priority: terrain.priority ?? defaultPriorityForFeature(feature),
  };
}

function compileSurfacePatch(feature: MapFeatureDefinition): TerrainSurfacePatch | null {
  const surface = feature.surface;
  if (!surface) return null;

  const circle = resolveCircleFootprint(feature);
  if (circle) {
    const innerRadius = surface.innerRadius ?? circle.radius;
    const outerRadius = Math.max(innerRadius, surface.outerRadius ?? defaultSurfaceOuterRadiusForFeature(feature));
    return {
      shape: 'circle',
      x: feature.position.x,
      z: feature.position.z,
      innerRadius,
      outerRadius,
      surface: surface.kind,
      priority: feature.terrain?.priority ?? defaultPriorityForFeature(feature),
    };
  }

  const rect = resolveRectFootprint(feature);
  if (!rect) return null;

  return {
    shape: 'rect',
    x: feature.position.x,
    z: feature.position.z,
    width: surface.width ?? rect.width,
    length: surface.length ?? rect.length,
    blend: Math.max(0.1, surface.blend ?? 2),
    yaw: feature.placement?.yaw ?? 0,
    surface: surface.kind,
    priority: feature.terrain?.priority ?? defaultPriorityForFeature(feature),
  };
}

function compileVegetationExclusion(feature: MapFeatureDefinition): TerrainExclusionZone | null {
  const vegetation = feature.vegetation;
  if (!vegetation?.clear) return null;

  const radius = vegetation.exclusionRadius ?? defaultExclusionRadiusForFeature(feature);
  if (!(radius > 0)) return null;

  return {
    x: feature.position.x,
    z: feature.position.z,
    radius,
    sourceId: feature.id,
  };
}

function resolveCircleFootprint(feature: MapFeatureDefinition): MapFeatureCircleFootprint | null {
  if (feature.footprint?.shape === 'circle') {
    return feature.footprint;
  }
  if (feature.kind === 'helipad') {
    return { shape: 'circle', radius: DEFAULT_HELIPAD_RADIUS };
  }
  return null;
}

function resolveRectFootprint(feature: MapFeatureDefinition): MapFeatureRectFootprint | null {
  if (feature.footprint?.shape === 'rect') {
    return feature.footprint;
  }
  return null;
}

function defaultFlatRadiusForFeature(feature: MapFeatureDefinition): number {
  switch (feature.kind) {
    case 'helipad':
      return DEFAULT_HELIPAD_FLAT_RADIUS;
    default:
      return 8;
  }
}

function defaultBlendRadiusForFeature(feature: MapFeatureDefinition): number {
  switch (feature.kind) {
    case 'helipad':
      return DEFAULT_HELIPAD_BLEND_RADIUS;
    default:
      return 12;
  }
}

function defaultSurfaceOuterRadiusForFeature(feature: MapFeatureDefinition): number {
  switch (feature.kind) {
    case 'helipad':
      return DEFAULT_HELIPAD_SURFACE_OUTER_RADIUS;
    default:
      return 12;
  }
}

function defaultExclusionRadiusForFeature(feature: MapFeatureDefinition): number {
  switch (feature.kind) {
    case 'helipad':
      return DEFAULT_HELIPAD_EXCLUSION_RADIUS;
    default:
      return 12;
  }
}

function defaultPriorityForFeature(feature: MapFeatureDefinition): number {
  switch (feature.kind) {
    case 'airfield':
      return 50;
    case 'firebase':
      return 60;
    case 'helipad':
      return 100;
    case 'road':
      return 110;
    case 'village':
      return 120;
    default:
      return 100;
  }
}
