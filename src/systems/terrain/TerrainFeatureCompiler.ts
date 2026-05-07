import type {
  GameModeConfig,
  MapFeatureCircleFootprint,
  MapFeatureDefinition,
  MapFeatureRectFootprint,
} from '../../config/gameModeTypes';
import { AIRFIELD_TEMPLATES, type AirfieldSurfaceRect, type AirfieldTemplate } from '../world/AirfieldTemplates';
import { generateAirfieldLayout } from '../world/AirfieldLayoutGenerator';
import { Logger } from '../../utils/Logger';
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
const DEFAULT_HELIPAD_GRADE_STRENGTH = 0.42;
const DEFAULT_FIREBASE_GRADE_STRENGTH = 0.35;
const DEFAULT_VILLAGE_GRADE_STRENGTH = 0.2;
const DEFAULT_AIRFIELD_GRADE_STRENGTH = 0.25;
const DEFAULT_ROAD_GRADE_STRENGTH = 0.18;
/** Lateral buffer beyond the widest authored surface rect that the envelope flattens. */
const AIRFIELD_ENVELOPE_STRUCTURE_BUFFER_M = 16;
/** Outer grade ramp beyond the inner flat radius — smooths hard cliffs at the airfield edge. */
const AIRFIELD_ENVELOPE_GRADE_RAMP_M = 48;
/** Strength of the envelope's graded shoulder (0-1). Strong enough to soften cliff faces. */
const AIRFIELD_ENVELOPE_GRADE_STRENGTH = 0.65;
/** Meter-scale vertical span across the envelope that triggers a site-slope warning. */
const AIRFIELD_SLOPE_WARNING_SPAN_M = 18;
/**
 * Extra flat-band margin applied to taxiway capsule stamps only. The painted
 * tarmac (RectTerrainSurfacePatch) extends rect.width / 2 from centerline; the
 * base innerPadding (1.5m) leaves only 1.5m of flat band past the paint, and
 * the capsule's hemispherical endcaps can expose sloped ground under the
 * corners of the painted rectangle. An additional 2m keeps the full painted
 * taxiway inside the guaranteed-flat zone. Runway and apron rects are
 * unaffected — they already have wider padding.
 */
const TAXIWAY_EXTRA_PAD = 2;

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
    compileFeature(feature, compiled, getTerrainHeight ?? null);
  }

  const terrainFlow = compileTerrainFlow(config, getTerrainHeight);
  compiled.stamps.push(...terrainFlow.stamps);
  compiled.surfacePatches.push(...terrainFlow.surfacePatches);
  compiled.flowPaths.push(...terrainFlow.flowPaths);

  compiled.stamps.sort((a, b) => a.priority - b.priority);
  compiled.surfacePatches.sort((a, b) => a.priority - b.priority);
  return compiled;
}

function compileFeature(
  feature: MapFeatureDefinition,
  compiled: CompiledTerrainFeatureSet,
  getTerrainHeight: ((x: number, z: number) => number) | null,
): void {
  const stamps = compileTerrainStamps(feature, getTerrainHeight);
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

function compileTerrainStamps(
  feature: MapFeatureDefinition,
  getTerrainHeight: ((x: number, z: number) => number) | null,
): TerrainStampConfig[] {
  const terrain = feature.terrain;
  if (!terrain?.flatten) return [];

  const generated = compileGeneratedTerrainStamps(feature, getTerrainHeight);
  if (generated.length > 0) {
    return generated;
  }

  const circle = resolveCircleFootprint(feature);
  if (!circle) return [];

  const surfaceOuterRadius = resolveCircularSurfaceOuterRadius(feature);
  const innerRadius = Math.max(
    terrain.flatRadius ?? Math.min(circle.radius, defaultFlatRadiusForFeature(feature)),
    surfaceOuterRadius ?? 0,
  );
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

function resolveCircularSurfaceOuterRadius(feature: MapFeatureDefinition): number | null {
  if (!feature.surface || !resolveCircleFootprint(feature)) {
    return null;
  }
  const innerRadius = feature.surface.innerRadius ?? resolveCircleFootprint(feature)?.radius ?? 0;
  return Math.max(innerRadius, feature.surface.outerRadius ?? defaultSurfaceOuterRadiusForFeature(feature));
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

function compileGeneratedTerrainStamps(
  feature: MapFeatureDefinition,
  getTerrainHeight: ((x: number, z: number) => number) | null,
): TerrainStampConfig[] {
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
  const airfieldDatumHeight = getTerrainHeight
    ? resolveAirfieldDatumHeight(feature, template, getTerrainHeight)
    : undefined;

  // Warn when the airfield is authored on a steep site. Procedural relocation
  // is not possible here (airfields are hand-authored in game mode configs),
  // but a dev-time warning flags the problem for map authors.
  if (getTerrainHeight) {
    maybeWarnAirfieldSlope(feature, feature.templateId, template, getTerrainHeight);
  }

  const stampedRects: Array<{ kind: 'runway' | 'apron' | 'taxiway' | 'filler'; rect: AirfieldSurfaceRect }> = [
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

  // Add filler stamps to bridge gaps between runway and nearest side stamps.
  // Without these, a 30m+ band between runway and taxiway/apron is unflattened.
  const runwayCapsuleWidth = Math.min(template.runwayWidth, template.runwayLength);
  const runwayInnerEdge = runwayCapsuleWidth * 0.5 + 3; // runway innerPadding

  const sideRects = [...template.taxiways, ...template.aprons];
  const positiveSide = sideRects.filter((r) => r.offsetLateral > 0);
  const negativeSide = sideRects.filter((r) => r.offsetLateral < 0);

  for (const side of [
    { rects: positiveSide, sign: 1 },
    { rects: negativeSide, sign: -1 },
  ]) {
    let farEdge: number;
    if (side.rects.length > 0) {
      farEdge = Math.min(
        ...side.rects.map((r) => {
          const capsW = Math.min(r.width, r.length);
          return Math.abs(r.offsetLateral) - capsW * 0.5 - 1.5; // non-runway innerPadding
        }),
      );
    } else {
      // No taxiway/apron on this side; cover the runway_side building zone
      farEdge = template.runwayWidth * 0.5 + 30;
    }

    const gapWidth = farEdge - runwayInnerEdge;
    if (gapWidth <= 2) continue;

    const gapCenter = (runwayInnerEdge + farEdge) * 0.5;
    stampedRects.unshift({
      kind: 'filler' as const,
      rect: {
        offsetAlongRunway: 0,
        offsetLateral: gapCenter * side.sign,
        length: template.runwayLength * 0.8,
        width: gapWidth,
        yaw: 0,
        surface: 'packed_earth' as const,
        blend: 3,
      },
    });
  }

  const rectStamps: TerrainStampConfig[] = stampedRects.map(({ kind, rect }, index) => {
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

    // Fillers use 'center' target height mode to match runway elevation
    const targetHeightMode = kind === 'filler' ? 'center' as const : stampTuning.targetHeightMode;

    // Taxiway capsules get extra flat-band padding so the painted tarmac
    // (rect.width-wide) stays inside the guaranteed-flat zone at the capsule
    // endcaps. Runway and apron padding are unchanged.
    const taxiwayExtraPad = kind === 'taxiway' ? TAXIWAY_EXTRA_PAD : 0;

    return {
      kind: 'flatten_capsule',
      startX: center.x - directionX * segmentHalfLength,
      startZ: center.z - directionZ * segmentHalfLength,
      endX: center.x + directionX * segmentHalfLength,
      endZ: center.z + directionZ * segmentHalfLength,
      innerRadius: capsuleWidth * 0.5 + stampTuning.innerPadding + taxiwayExtraPad,
      outerRadius: capsuleWidth * 0.5 + stampTuning.outerPadding,
      gradeRadius: capsuleWidth * 0.5 + stampTuning.gradePadding,
      gradeStrength: authoredStrength ?? stampTuning.gradeStrength,
      samplingRadius: stampTuning.samplingRadius(capsuleWidth),
      targetHeightMode,
      fixedTargetHeight: airfieldDatumHeight,
      heightOffset,
      priority: priority + resolveAirfieldStampPriorityOffset(kind) + index,
    };
  });

  // Envelope stamp: flattens the whole airfield footprint (runway + aprons +
  // taxiways + procedural structure zones) at runway-level with a smooth
  // grade-blend outward. Without this, dispersal / perimeter structures sit
  // on bumpy or cliff-edge terrain, and bumps appear between the authored
  // surface rects. Lower priority than the rect stamps so they still win
  // inside their own inner radii.
  const envelope = buildAirfieldEnvelopeStamp(feature, template, priority, heightOffset, airfieldDatumHeight);
  return envelope ? [envelope, ...rectStamps] : rectStamps;
}

/**
 * Compute the maximum lateral reach of any authored surface rect (taxiway /
 * apron / runway) from the airfield centerline in local coordinates.
 */
function maxLateralSurfaceReach(template: AirfieldTemplate): number {
  let reach = template.runwayWidth * 0.5;
  for (const rect of [...template.aprons, ...template.taxiways]) {
    const rectHalfWidth = Math.abs(rect.offsetLateral) + Math.max(rect.width, rect.length) * 0.5;
    if (rectHalfWidth > reach) reach = rectHalfWidth;
  }
  return reach;
}

/**
 * Lateral radius of the envelope's fully-flat zone for `template`. Mirrors the
 * `innerLateral` computation in `buildAirfieldEnvelopeStamp`, exposed so the
 * procedural layout generator can clamp perimeter placements inside the flat
 * zone instead of landing on the graded shoulder.
 */
export function airfieldEnvelopeInnerLateral(template: AirfieldTemplate): number {
  const lateralReach = Math.max(
    maxLateralSurfaceReach(template),
    template.dispersalOffset + 22,
  );
  return lateralReach + AIRFIELD_ENVELOPE_STRUCTURE_BUFFER_M;
}

/**
 * Compute the maximum along-runway reach of any authored surface rect.
 */
function maxAlongSurfaceReach(template: AirfieldTemplate): number {
  let reach = template.runwayLength * 0.5;
  for (const rect of [...template.aprons, ...template.taxiways]) {
    const rectHalfLen = Math.abs(rect.offsetAlongRunway) + Math.max(rect.width, rect.length) * 0.5;
    if (rectHalfLen > reach) reach = rectHalfLen;
  }
  return reach;
}

function buildAirfieldEnvelopeStamp(
  feature: MapFeatureDefinition,
  template: AirfieldTemplate,
  basePriority: number,
  heightOffset: number,
  fixedTargetHeight?: number,
): TerrainStampConfig | null {
  // The procedural layout (AirfieldLayoutGenerator) places structures at
  // `dispersalOffset + 18` lateral and `runwayLength * 0.5` along, with
  // "perimeter" structures at radius max(runwayLength/2, dispersalOffset+20).
  // The envelope's inner (fully-flat) radius must cover authored surfaces and
  // the dispersal zone. The layout generator clamps perimeter placements to
  // `airfieldEnvelopeInnerLateral(template) - 8` so perimeter props stay
  // inside the flat zone rather than landing on the graded shoulder.
  const alongReach = Math.max(
    maxAlongSurfaceReach(template),
    template.runwayLength * 0.5,
  );

  const innerLateral = airfieldEnvelopeInnerLateral(template);
  const innerAlong = alongReach + AIRFIELD_ENVELOPE_STRUCTURE_BUFFER_M;

  const yaw = feature.placement?.yaw ?? 0;
  const directionX = Math.sin(yaw);
  const directionZ = Math.cos(yaw);

  // Capsule: inner radius = lateral extent; segment length = along extent - lateral extent.
  // When along extent <= lateral extent the capsule degenerates to a circle, which is fine.
  const segmentHalfLength = Math.max(0, innerAlong - innerLateral);

  const innerRadius = innerLateral;
  // Doubled from +6 m (Round 3): a 6 m transition from full flatten to the
  // grade-strength shoulder behaved as a small cliff at the flat edge. 12 m
  // gives the inner blend visible width so the airfield rim no longer reads
  // as a ring around perimeter structures.
  const outerRadius = innerRadius + 12;
  const gradeRadius = outerRadius + AIRFIELD_ENVELOPE_GRADE_RAMP_M;
  // The envelope uses its own stronger grade strength (independent of the
  // authored `terrain.gradeStrength`, which tunes the rect stamps). A stronger
  // shoulder is what actually prevents hard cliff edges at the airfield
  // perimeter — without it, the terrain around perimeter structures keeps its
  // native slope and can drop sharply next to foundations.
  const gradeStrength = AIRFIELD_ENVELOPE_GRADE_STRENGTH;

  return {
    kind: 'flatten_capsule',
    startX: feature.position.x - directionX * segmentHalfLength,
    startZ: feature.position.z - directionZ * segmentHalfLength,
    endX: feature.position.x + directionX * segmentHalfLength,
    endZ: feature.position.z + directionZ * segmentHalfLength,
    innerRadius,
    outerRadius,
    gradeRadius,
    gradeStrength,
    // Sampling the runway centerline gives the envelope the same target height
    // the runway stamp would pick, so runway and envelope agree on "airfield
    // level" and no step appears where the runway meets its surrounds.
    samplingRadius: Math.max(12, template.runwayLength * 0.25),
    targetHeightMode: 'center',
    fixedTargetHeight,
    heightOffset,
    // Priority below all rect stamps (filler is priority - 5); use -20 so the
    // envelope applies first and every authored rect overrides within its own
    // inner radius.
    priority: basePriority - 20,
  };
}

function resolveAirfieldDatumHeight(
  feature: MapFeatureDefinition,
  template: AirfieldTemplate,
  getTerrainHeight: (x: number, z: number) => number,
): number {
  const yaw = feature.placement?.yaw ?? 0;
  const directionX = Math.sin(yaw);
  const directionZ = Math.cos(yaw);
  const halfLength = template.runwayLength * 0.5;
  const sampleCount = 9;
  const samples: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const t = i / (sampleCount - 1);
    const along = -halfLength + (halfLength * 2 * t);
    samples.push(getTerrainHeight(
      feature.position.x + directionX * along,
      feature.position.z + directionZ * along,
    ));
  }

  const mode = feature.terrain?.targetHeightMode ?? 'center';
  switch (mode) {
    case 'max':
      return samples.reduce((maxHeight, sample) => Math.max(maxHeight, sample), -Infinity);
    case 'average':
    case 'center':
    default:
      return samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  }
}

function maybeWarnAirfieldSlope(
  feature: MapFeatureDefinition,
  templateId: string,
  template: AirfieldTemplate,
  getTerrainHeight: (x: number, z: number) => number,
): void {
  const yaw = feature.placement?.yaw ?? 0;
  const halfLen = template.runwayLength * 0.5;
  const halfWidth = Math.max(template.runwayWidth * 0.5, 24);
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);

  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  const sampleOffsets: Array<[number, number]> = [
    [0, 0],
    [halfLen, 0],
    [-halfLen, 0],
    [0, halfWidth],
    [0, -halfWidth],
    [halfLen * 0.6, halfWidth * 0.6],
    [-halfLen * 0.6, halfWidth * 0.6],
    [halfLen * 0.6, -halfWidth * 0.6],
    [-halfLen * 0.6, -halfWidth * 0.6],
  ];
  for (const [along, lateral] of sampleOffsets) {
    const worldX = feature.position.x + along * sinY + lateral * cosY;
    const worldZ = feature.position.z + along * cosY - lateral * sinY;
    const h = getTerrainHeight(worldX, worldZ);
    if (!Number.isFinite(h)) continue;
    if (h < minHeight) minHeight = h;
    if (h > maxHeight) maxHeight = h;
  }
  const span = maxHeight - minHeight;
  if (Number.isFinite(span) && span > AIRFIELD_SLOPE_WARNING_SPAN_M) {
    Logger.warn(
      'terrain',
      `Airfield "${feature.id}" (template ${templateId}) sits on steep terrain: ` +
        `vertical span ${span.toFixed(1)}m across ${template.runwayLength.toFixed(0)}m runway footprint. ` +
        `Envelope flatten will smooth the site but consider authoring a flatter position.`,
    );
  }
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
      return Math.max(outerRadius + footprintRadius * 1.5, footprintRadius * 3);
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
      return DEFAULT_HELIPAD_GRADE_STRENGTH;
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

function resolveAirfieldStampPriorityOffset(kind: 'runway' | 'apron' | 'taxiway' | 'filler'): number {
  switch (kind) {
    case 'runway':
      return 20;
    case 'apron':
      return 10;
    case 'taxiway':
      return 0;
    case 'filler':
      return -5;
    default:
      return 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
