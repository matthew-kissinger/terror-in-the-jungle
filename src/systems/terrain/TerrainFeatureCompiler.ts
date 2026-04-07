import type {
  GameModeConfig,
  MapFeatureCircleFootprint,
  MapFeatureDefinition,
  MapFeatureRectFootprint,
} from '../../config/gameModeTypes';
import { AIRFIELD_TEMPLATES } from '../world/AirfieldTemplates';
import { generateAirfieldLayout } from '../world/AirfieldLayoutGenerator';
import { compileTerrainFlow } from './TerrainFlowCompiler';
import type {
  CompiledTerrainFeatureSet,
  TerrainExclusionZone,
  TerrainStampConfig,
  TerrainStampTargetHeightMode,
  TerrainSurfaceKind,
  TerrainSurfacePatch,
} from './TerrainFeatureTypes';

const DEFAULT_HELIPAD_RADIUS = 12;
const DEFAULT_HELIPAD_FLAT_RADIUS = 8;
const DEFAULT_HELIPAD_BLEND_RADIUS = 13;
const DEFAULT_HELIPAD_SURFACE_OUTER_RADIUS = 12.5;
const DEFAULT_HELIPAD_EXCLUSION_RADIUS = 13;
const DEFAULT_FIREBASE_GRADE_STRENGTH = 0.35;
const DEFAULT_VILLAGE_GRADE_STRENGTH = 0.2;
const DEFAULT_AIRFIELD_GRADE_STRENGTH = 0.25;
const DEFAULT_ROAD_GRADE_STRENGTH = 0.18;

export function compileTerrainFeatures(
  config: GameModeConfig,
  getTerrainHeight?: ((x: number, z: number) => number) | null,
): CompiledTerrainFeatureSet {
  const features = config.features ?? [];
  const compiled: CompiledTerrainFeatureSet = {
    stamps: [],
    surfacePatches: [],
    vegetationExclusionZones: [],
    flowPaths: [],
  };

  for (const feature of features) {
    compileFeature(feature, compiled);
  }

  const terrainFlow = compileTerrainFlow(config, getTerrainHeight);
  compiled.stamps.push(...terrainFlow.stamps);
  compiled.surfacePatches.push(...terrainFlow.surfacePatches);
  compiled.flowPaths.push(...terrainFlow.flowPaths);

  compiled.stamps.sort((a, b) => a.priority - b.priority);
  compiled.surfacePatches.sort((a, b) => a.priority - b.priority);
  return compiled;
}

function compileFeature(feature: MapFeatureDefinition, compiled: CompiledTerrainFeatureSet): void {
  const stamps = compileTerrainStamps(feature);
  if (stamps.length > 0) {
    compiled.stamps.push(...stamps);
  }

  const surfacePatch = compileSurfacePatch(feature);
  if (surfacePatch) {
    compiled.surfacePatches.push(surfacePatch);
  }

  const generatedSurfacePatches = compileGeneratedSurfacePatches(feature);
  if (generatedSurfacePatches.length > 0) {
    compiled.surfacePatches.push(...generatedSurfacePatches);
  }

  const exclusionZone = compileVegetationExclusion(feature);
  if (exclusionZone) {
    compiled.vegetationExclusionZones.push(exclusionZone);
  }
}

function compileTerrainStamps(feature: MapFeatureDefinition): TerrainStampConfig[] {
  const terrain = feature.terrain;
  if (!terrain?.flatten) return [];

  const generated = compileGeneratedTerrainStamps(feature);
  if (generated.length > 0) {
    return generated;
  }

  const circle = resolveCircleFootprint(feature);
  if (!circle) return [];

  const innerRadius = terrain.flatRadius ?? Math.min(circle.radius, defaultFlatRadiusForFeature(feature));
  const outerRadius = Math.max(innerRadius, terrain.blendRadius ?? Math.max(circle.radius, defaultBlendRadiusForFeature(feature)));
  const gradeRadius = resolveGradeRadius(feature, circle.radius, outerRadius);
  const gradeStrength = resolveGradeStrength(feature, terrain.gradeStrength, gradeRadius, outerRadius);
  const samplingRadius = terrain.samplingRadius ?? innerRadius;

  return [{
    kind: 'flatten_circle',
    centerX: feature.position.x,
    centerZ: feature.position.z,
    innerRadius,
    outerRadius,
    gradeRadius,
    gradeStrength,
    samplingRadius,
    targetHeightMode: terrain.targetHeightMode ?? 'max',
    heightOffset: terrain.heightOffset ?? 0,
    priority: terrain.priority ?? defaultPriorityForFeature(feature),
  }];
}

function compileSurfacePatch(feature: MapFeatureDefinition): TerrainSurfacePatch | null {
  if (feature.kind === 'airfield' && feature.templateId) {
    return null;
  }

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

function compileGeneratedSurfacePatches(feature: MapFeatureDefinition): TerrainSurfacePatch[] {
  if (feature.kind !== 'airfield' || !feature.templateId) {
    return [];
  }

  const template = AIRFIELD_TEMPLATES[feature.templateId];
  if (!template) {
    return [];
  }

  return generateAirfieldLayout(
    template,
    feature.position,
    feature.placement?.yaw ?? 0,
    feature.seedHint ?? feature.id,
  ).surfacePatches;
}

function compileGeneratedTerrainStamps(feature: MapFeatureDefinition): TerrainStampConfig[] {
  if (feature.kind !== 'airfield' || !feature.templateId) {
    return [];
  }

  const template = AIRFIELD_TEMPLATES[feature.templateId];
  if (!template) {
    return [];
  }

  const priority = feature.terrain?.priority ?? defaultPriorityForFeature(feature);
  const heightOffset = feature.terrain?.heightOffset ?? 0;
  const authoredStrength = feature.terrain?.gradeStrength;

  const stampedRects = [
    ...template.taxiways.map((rect) => ({ kind: 'taxiway' as const, rect })),
    ...template.aprons.map((rect) => ({ kind: 'apron' as const, rect })),
    {
      kind: 'runway' as const,
      rect: {
        offsetAlongRunway: 0,
        offsetLateral: 0,
        length: template.runwayLength,
        width: template.runwayWidth,
        yaw: 0,
        surface: 'runway' as const,
        blend: 3,
      },
    },
  ];

  return stampedRects.map(({ kind, rect }, index) => {
    const stampTuning = resolveAirfieldStampTuning(rect.surface, feature.terrain?.targetHeightMode);
    const yaw = (feature.placement?.yaw ?? 0) + (rect.yaw ?? 0);
    const center = localAlongLateralToWorld(
      feature.position.x,
      feature.position.z,
      feature.placement?.yaw ?? 0,
      rect.offsetAlongRunway,
      rect.offsetLateral,
    );
    const directionX = Math.sin(yaw);
    const directionZ = Math.cos(yaw);
    const capsuleLength = Math.max(rect.width, rect.length);
    const capsuleWidth = Math.min(rect.width, rect.length);
    const segmentHalfLength = Math.max(0, (capsuleLength - capsuleWidth) * 0.5);

    return {
      kind: 'flatten_capsule',
      startX: center.x - directionX * segmentHalfLength,
      startZ: center.z - directionZ * segmentHalfLength,
      endX: center.x + directionX * segmentHalfLength,
      endZ: center.z + directionZ * segmentHalfLength,
      innerRadius: capsuleWidth * 0.5 + stampTuning.innerPadding,
      outerRadius: capsuleWidth * 0.5 + stampTuning.outerPadding,
      gradeRadius: capsuleWidth * 0.5 + stampTuning.gradePadding,
      gradeStrength: authoredStrength ?? stampTuning.gradeStrength,
      samplingRadius: stampTuning.samplingRadius(capsuleWidth),
      targetHeightMode: stampTuning.targetHeightMode,
      heightOffset,
      priority: priority + resolveAirfieldStampPriorityOffset(kind) + index,
    };
  });
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

function resolveGradeRadius(feature: MapFeatureDefinition, footprintRadius: number, outerRadius: number): number {
  const authored = feature.terrain?.gradeRadius;
  if (typeof authored === 'number') {
    return Math.max(outerRadius, authored);
  }

  switch (feature.kind) {
    case 'firebase':
      return Math.max(outerRadius + footprintRadius * 1.35, footprintRadius * 3.4);
    case 'village':
      return Math.max(outerRadius + footprintRadius, footprintRadius * 2.4);
    case 'airfield':
      return Math.max(outerRadius + footprintRadius * 1.1, footprintRadius * 2.6);
    case 'road':
      return Math.max(outerRadius + footprintRadius * 0.75, footprintRadius * 2);
    case 'helipad':
    default:
      return outerRadius;
  }
}

function resolveGradeStrength(
  feature: MapFeatureDefinition,
  authoredStrength: number | undefined,
  gradeRadius: number,
  outerRadius: number,
): number {
  if (gradeRadius <= outerRadius) {
    return 0;
  }

  if (typeof authoredStrength === 'number') {
    return clamp(authoredStrength, 0, 1);
  }

  switch (feature.kind) {
    case 'firebase':
      return DEFAULT_FIREBASE_GRADE_STRENGTH;
    case 'village':
      return DEFAULT_VILLAGE_GRADE_STRENGTH;
    case 'airfield':
      return DEFAULT_AIRFIELD_GRADE_STRENGTH;
    case 'road':
      return DEFAULT_ROAD_GRADE_STRENGTH;
    case 'helipad':
    default:
      return 0;
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

function localAlongLateralToWorld(
  centerX: number,
  centerZ: number,
  heading: number,
  along: number,
  lateral: number,
): { x: number; z: number } {
  return {
    x: centerX + along * Math.sin(heading) + lateral * Math.cos(heading),
    z: centerZ + along * Math.cos(heading) - lateral * Math.sin(heading),
  };
}

function resolveAirfieldStampTuning(
  surface: TerrainSurfaceKind,
  authoredMode: TerrainStampTargetHeightMode | undefined,
): {
  innerPadding: number;
  outerPadding: number;
  gradePadding: number;
  gradeStrength: number;
  targetHeightMode: TerrainStampTargetHeightMode;
  samplingRadius: (width: number) => number;
} {
  if (surface === 'runway') {
    return {
      innerPadding: 3,
      outerPadding: 8,
      gradePadding: 22,
      gradeStrength: 0.22,
      targetHeightMode: authoredMode ?? 'center',
      samplingRadius: (width) => Math.max(10, width * 0.8),
    };
  }

  return {
    innerPadding: 1.5,
    outerPadding: 5,
    gradePadding: 14,
    gradeStrength: 0.16,
    targetHeightMode: authoredMode ?? 'average',
    samplingRadius: (width) => Math.max(8, width * 0.65),
  };
}

function resolveAirfieldStampPriorityOffset(kind: 'runway' | 'apron' | 'taxiway'): number {
  switch (kind) {
    case 'runway':
      return 20;
    case 'apron':
      return 10;
    case 'taxiway':
    default:
      return 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
