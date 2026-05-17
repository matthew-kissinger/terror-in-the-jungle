import * as THREE from 'three';
import type { HydrologyBakeArtifact } from '../../terrain/hydrology/HydrologyBake';
import type {
  HydrologyRiverMeshStats,
  HydrologyWaterQuerySegment,
} from './HydrologyRiverSurface';

const MAX_HYDROLOGY_RIVER_CHANNELS = 24;
const MAX_HYDROLOGY_RIVER_SEGMENTS = 2048;
const HYDROLOGY_RIVER_SURFACE_OFFSET_METERS = 0.35;
const HYDROLOGY_RIVER_MIN_SEGMENT_LENGTH_METERS = 0.5;
const HYDROLOGY_RIVER_BANK_COLOR = new THREE.Color(0x23382e);
const HYDROLOGY_RIVER_SHALLOW_COLOR = new THREE.Color(0x1e4e52);
const HYDROLOGY_RIVER_DEEP_COLOR = new THREE.Color(0x0b2a34);
const HYDROLOGY_RIVER_BANK_ALPHA = 0.01;
const HYDROLOGY_RIVER_CENTER_ALPHA = 0.32;

// Flow-visuals constants (from hydrology-river-flow-visuals, VODA-1 R2).
// Foam mask combines narrowness + slope into a single per-vertex [0..1]
// value the shader brightens fragments with. Narrowness ramps below
// `flowFactor = NARROW_THRESHOLD` (low-accumulation headwaters); slope is
// fully on at SLOPE_M_PER_M rise-over-run. Bank vertices get a 0.25
// floor of the center value so the foam cap bleeds into the bank.
const HYDROLOGY_RIVER_FOAM_NARROW_THRESHOLD = 0.6;
const HYDROLOGY_RIVER_FOAM_SLOPE_M_PER_M = 0.05;
const HYDROLOGY_RIVER_FOAM_NARROW_WEIGHT = 0.55;
const HYDROLOGY_RIVER_FOAM_SLOPE_WEIGHT = 0.85;
const HYDROLOGY_RIVER_FOAM_BANK_FLOOR_FRACTION = 0.25;

// Gameplay flow speeds (m/s) consumed by `WaterSurfaceSampler.sample()` to
// fill `WaterInteractionSample.flowVelocity`. Headwaters get a small floor
// so even a tiny stream nudges floating bodies downstream; main channels
// (accumulation p99) get the max. Mirrors the visual `HYDROLOGY_RIVER_
// FLOW_SPEED_M_PER_S = 0.45` in feel — gameplay is half a notch faster so
// the perpendicular swim drift is observable in playtest.
const HYDROLOGY_RIVER_GAMEPLAY_FLOW_MIN_M_PER_S = 0.15;
const HYDROLOGY_RIVER_GAMEPLAY_FLOW_MAX_M_PER_S = 0.6;

export interface HydrologyRiverGeometryBuild {
  geometry: THREE.BufferGeometry;
  stats: HydrologyRiverMeshStats;
  querySegments: HydrologyWaterQuerySegment[];
}

/**
 * Pure geometry builder for hydrology river surfaces. Consumes a baked
 * hydrology artifact and emits a triangulated channel mesh with:
 *   - position / normal / uv / color (vec4, alpha = depth tint)
 *   - aFlowDir (vec2, world-XZ unit vector per vertex)
 *   - aFoamMask (float per vertex, narrowness + slope combined)
 *
 * Bake-time attribute emission keeps the flow-visuals fragment shader
 * branch-free. Returns null when no segment survived the min-length
 * filter (caller treats this as "no surface to attach").
 */
export function buildHydrologyRiverGeometry(
  artifact: HydrologyBakeArtifact,
): HydrologyRiverGeometryBuild | null {
  const sortedChannels = [...artifact.channelPolylines]
    .sort((a, b) => b.maxAccumulationCells - a.maxAccumulationCells || b.lengthMeters - a.lengthMeters)
    .slice(0, MAX_HYDROLOGY_RIVER_CHANNELS);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const flowDirs: number[] = [];
  const foamMasks: number[] = [];
  const indices: number[] = [];
  const querySegments: HydrologyWaterQuerySegment[] = [];
  let segmentCount = 0;
  let totalLengthMeters = 0;
  let maxAccumulationCells = 0;

  for (const channel of sortedChannels) {
    const points = channel.points;
    if (points.length < 2) continue;
    maxAccumulationCells = Math.max(maxAccumulationCells, channel.maxAccumulationCells);
    let channelDistanceMeters = 0;

    for (let index = 0; index < points.length - 1; index++) {
      if (segmentCount >= MAX_HYDROLOGY_RIVER_SEGMENTS) break;
      const start = points[index];
      const end = points[index + 1];
      if (!start || !end) continue;

      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      if (length < HYDROLOGY_RIVER_MIN_SEGMENT_LENGTH_METERS) continue;

      const accCells = Math.max(start.accumulationCells, end.accumulationCells, channel.maxAccumulationCells);
      const width = resolveRiverWidth(accCells, artifact);
      const flowFactor = resolveRiverAccumulationFactor(accCells, artifact);
      const halfWidth = width * 0.5;
      const normalX = -dz / length;
      const normalZ = dx / length;
      const startY = start.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS;
      const endY = end.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS;
      const vertexBase = positions.length / 3;
      const uvStartV = channelDistanceMeters / Math.max(width, 1);
      channelDistanceMeters += length;
      const uvEndV = channelDistanceMeters / Math.max(width, 1);
      const bankColor = HYDROLOGY_RIVER_BANK_COLOR.clone()
        .lerp(HYDROLOGY_RIVER_SHALLOW_COLOR, 0.18 + flowFactor * 0.22);
      const centerColor = HYDROLOGY_RIVER_SHALLOW_COLOR.clone()
        .lerp(HYDROLOGY_RIVER_DEEP_COLOR, 0.48 + flowFactor * 0.38);

      positions.push(
        start.x + normalX * halfWidth, startY, start.z + normalZ * halfWidth,
        start.x, startY, start.z,
        start.x - normalX * halfWidth, startY, start.z - normalZ * halfWidth,
        end.x + normalX * halfWidth, endY, end.z + normalZ * halfWidth,
        end.x, endY, end.z,
        end.x - normalX * halfWidth, endY, end.z - normalZ * halfWidth,
      );
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      uvs.push(0, uvStartV, 0.5, uvStartV, 1, uvStartV, 0, uvEndV, 0.5, uvEndV, 1, uvEndV);
      pushColor(colors, bankColor, HYDROLOGY_RIVER_BANK_ALPHA);
      pushColor(colors, centerColor, HYDROLOGY_RIVER_CENTER_ALPHA);
      pushColor(colors, bankColor, HYDROLOGY_RIVER_BANK_ALPHA);
      pushColor(colors, bankColor, HYDROLOGY_RIVER_BANK_ALPHA);
      pushColor(colors, centerColor, HYDROLOGY_RIVER_CENTER_ALPHA);
      pushColor(colors, bankColor, HYDROLOGY_RIVER_BANK_ALPHA);

      // Flow direction (unit world-XZ, segment start → end) packed per
      // vertex. All six verts share the same flow vector so the fragment
      // shader can rebuild the along/across basis without recomputing the
      // segment derivative each frame.
      const flowX = dx / length;
      const flowZ = dz / length;
      for (let v = 0; v < 6; v++) flowDirs.push(flowX, flowZ);

      // Foam mask combines narrowness (low flowFactor = headwater) with
      // segment slope (rise over run). Slope is signed — uphill segments
      // are an artifact of polyline winding and shouldn't foam.
      const narrownessFoam = clamp(
        (HYDROLOGY_RIVER_FOAM_NARROW_THRESHOLD - flowFactor) / HYDROLOGY_RIVER_FOAM_NARROW_THRESHOLD,
        0,
        1,
      );
      const slope = Math.max(0, startY - endY) / length;
      const slopeFoam = clamp(slope / HYDROLOGY_RIVER_FOAM_SLOPE_M_PER_M, 0, 1);
      const centerFoam = clamp(
        narrownessFoam * HYDROLOGY_RIVER_FOAM_NARROW_WEIGHT +
          slopeFoam * HYDROLOGY_RIVER_FOAM_SLOPE_WEIGHT,
        0,
        1,
      );
      // Same vertex order as positions: bank, center, bank, bank, center,
      // bank. Bank vertices get a small floor so the cap bleeds into the
      // bank rather than producing a hard center stripe.
      const bankFoam = centerFoam * HYDROLOGY_RIVER_FOAM_BANK_FLOOR_FRACTION;
      foamMasks.push(bankFoam, centerFoam, bankFoam, bankFoam, centerFoam, bankFoam);
      indices.push(
        vertexBase, vertexBase + 3, vertexBase + 1,
        vertexBase + 3, vertexBase + 4, vertexBase + 1,
        vertexBase + 1, vertexBase + 4, vertexBase + 2,
        vertexBase + 4, vertexBase + 5, vertexBase + 2,
      );

      segmentCount++;
      totalLengthMeters += length;
      // Gameplay flow magnitude scales with accumulation factor (bigger
      // channels = stronger current). The min floor keeps headwaters
      // pushable even when flowFactor is near zero.
      const flowSpeedMetersPerSecond =
        HYDROLOGY_RIVER_GAMEPLAY_FLOW_MIN_M_PER_S
        + (HYDROLOGY_RIVER_GAMEPLAY_FLOW_MAX_M_PER_S - HYDROLOGY_RIVER_GAMEPLAY_FLOW_MIN_M_PER_S) * flowFactor;
      querySegments.push({
        startX: start.x, startZ: start.z,
        endX: end.x, endZ: end.z,
        startSurfaceY: startY, endSurfaceY: endY,
        halfWidth,
        flowX,
        flowZ,
        flowSpeedMetersPerSecond,
      });
    }
    if (segmentCount >= MAX_HYDROLOGY_RIVER_SEGMENTS) break;
  }

  if (segmentCount === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  // Flow-visuals attributes consumed by `installHydrologyRiverFlowPatch`
  // on the binding layer. Per-vertex world-XZ flow direction + foam mask
  // baked here so the GPU does not recompute the segment derivative each
  // frame.
  geometry.setAttribute('aFlowDir', new THREE.Float32BufferAttribute(flowDirs, 2));
  geometry.setAttribute('aFoamMask', new THREE.Float32BufferAttribute(foamMasks, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  return {
    geometry,
    querySegments,
    stats: {
      channelCount: sortedChannels.filter(ch => ch.points.length >= 2).length,
      segmentCount,
      vertexCount: positions.length / 3,
      totalLengthMeters,
      maxAccumulationCells,
    },
  };
}

function resolveRiverWidth(accumulationCells: number, artifact: HydrologyBakeArtifact): number {
  const cellSize = artifact.cellSizeMeters;
  const minWidth = clamp(cellSize * 0.045, 2, 4);
  const maxWidth = clamp(cellSize * 0.12, 5, 10);
  const t = resolveRiverAccumulationFactor(accumulationCells, artifact);
  return minWidth + (maxWidth - minWidth) * t;
}

function resolveRiverAccumulationFactor(
  accumulationCells: number,
  artifact: HydrologyBakeArtifact,
): number {
  const p98 = Math.max(1, artifact.thresholds.accumulationP98Cells);
  const p99 = Math.max(p98 + 1, artifact.thresholds.accumulationP99Cells);
  return clamp(
    (Math.log1p(Math.max(0, accumulationCells)) - Math.log1p(p98))
    / Math.max(0.001, Math.log1p(p99) - Math.log1p(p98)),
    0,
    1,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pushColor(colors: number[], color: THREE.Color, alpha: number): void {
  colors.push(color.r, color.g, color.b, alpha);
}
