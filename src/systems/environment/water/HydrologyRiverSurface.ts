import * as THREE from 'three';
import { Logger } from '../../../utils/Logger';
import type { HydrologyBakeArtifact } from '../../terrain/hydrology/HydrologyBake';

export interface HydrologyRiverMeshStats {
  channelCount: number;
  segmentCount: number;
  vertexCount: number;
  totalLengthMeters: number;
  maxAccumulationCells: number;
}

export interface HydrologyWaterQuerySegment {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  startSurfaceY: number;
  endSurfaceY: number;
  halfWidth: number;
}

export const EMPTY_HYDROLOGY_RIVER_STATS: HydrologyRiverMeshStats = {
  channelCount: 0,
  segmentCount: 0,
  vertexCount: 0,
  totalLengthMeters: 0,
  maxAccumulationCells: 0,
};

const MAX_HYDROLOGY_RIVER_CHANNELS = 24;
const MAX_HYDROLOGY_RIVER_SEGMENTS = 2048;
const HYDROLOGY_RIVER_SURFACE_OFFSET_METERS = 0.35;
const HYDROLOGY_RIVER_MIN_SEGMENT_LENGTH_METERS = 0.5;
export const HYDROLOGY_RIVER_MATERIAL_PROFILE = 'natural_channel_gradient';
const HYDROLOGY_RIVER_BANK_COLOR = new THREE.Color(0x23382e);
const HYDROLOGY_RIVER_SHALLOW_COLOR = new THREE.Color(0x1e4e52);
const HYDROLOGY_RIVER_DEEP_COLOR = new THREE.Color(0x0b2a34);
const HYDROLOGY_RIVER_BANK_ALPHA = 0.01;
const HYDROLOGY_RIVER_CENTER_ALPHA = 0.32;

/**
 * Hydrology-bake consumer surface. Owns the river mesh + group attached
 * to the scene, the material, the geometry-builder pipeline, the
 * per-channel stats, and the query-segments table consumed by
 * `WaterSurfaceSampler`. Owning `WaterSystem` calls `setArtifact()` on
 * scenario load and `clear()`/null on teardown.
 */
export class HydrologyRiverSurface {
  private scene: THREE.Scene;
  private group?: THREE.Group;
  private mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private stats: HydrologyRiverMeshStats = { ...EMPTY_HYDROLOGY_RIVER_STATS };
  private querySegments: HydrologyWaterQuerySegment[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Replace the active hydrology surface. `null` clears; an artifact with
   * no polylines is a no-op after the clear. Returns true on attach.
   */
  setArtifact(artifact: HydrologyBakeArtifact | null): boolean {
    this.clear();
    if (!artifact || artifact.channelPolylines.length === 0) return false;

    const meshBuild = this.buildMesh(artifact);
    if (!meshBuild) return false;

    const group = new THREE.Group();
    group.name = 'hydrology-river-surfaces';
    group.add(meshBuild.mesh);
    this.scene.add(group);

    this.group = group;
    this.mesh = meshBuild.mesh;
    this.stats = meshBuild.stats;
    this.querySegments = meshBuild.querySegments;
    Logger.info(
      'environment',
      `Hydrology river surfaces loaded: ${meshBuild.stats.channelCount} channels, ${meshBuild.stats.segmentCount} segments`,
    );
    return true;
  }

  /** Detach + dispose the active river surface. Safe when nothing attached. */
  clear(): void {
    if (this.group) this.scene.remove(this.group);
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    this.group = undefined;
    this.mesh = undefined;
    this.stats = { ...EMPTY_HYDROLOGY_RIVER_STATS };
    this.querySegments = [];
  }

  isActive(): boolean { return !!this.group; }
  isVisible(): boolean { return Boolean(this.group?.visible); }
  getMaterialProfile(): string { return this.mesh ? HYDROLOGY_RIVER_MATERIAL_PROFILE : 'none'; }
  getStats(): HydrologyRiverMeshStats { return this.stats; }
  getQuerySegments(): readonly HydrologyWaterQuerySegment[] { return this.querySegments; }

  private buildMesh(artifact: HydrologyBakeArtifact): {
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    stats: HydrologyRiverMeshStats;
    querySegments: HydrologyWaterQuerySegment[];
  } | null {
    const geo = this.buildGeometry(artifact);
    if (!geo) return null;

    const material = new THREE.MeshStandardMaterial({
      name: 'hydrology-river-surface-material',
      color: 0xffffff,
      emissive: 0x000000,
      emissiveIntensity: 0.02,
      roughness: 0.54,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo.geometry, material);
    mesh.name = 'hydrology-river-surface-mesh';
    mesh.frustumCulled = true;
    mesh.renderOrder = 2;
    return { mesh, stats: geo.stats, querySegments: geo.querySegments };
  }

  private buildGeometry(artifact: HydrologyBakeArtifact): {
    geometry: THREE.BufferGeometry;
    stats: HydrologyRiverMeshStats;
    querySegments: HydrologyWaterQuerySegment[];
  } | null {
    const sortedChannels = [...artifact.channelPolylines]
      .sort((a, b) => b.maxAccumulationCells - a.maxAccumulationCells || b.lengthMeters - a.lengthMeters)
      .slice(0, MAX_HYDROLOGY_RIVER_CHANNELS);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
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
        indices.push(
          vertexBase, vertexBase + 3, vertexBase + 1,
          vertexBase + 3, vertexBase + 4, vertexBase + 1,
          vertexBase + 1, vertexBase + 4, vertexBase + 2,
          vertexBase + 4, vertexBase + 5, vertexBase + 2,
        );

        segmentCount++;
        totalLengthMeters += length;
        querySegments.push({
          startX: start.x, startZ: start.z,
          endX: end.x, endZ: end.z,
          startSurfaceY: startY, endSurfaceY: endY,
          halfWidth,
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
