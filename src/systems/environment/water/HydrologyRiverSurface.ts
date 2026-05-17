import * as THREE from 'three';
import { Logger } from '../../../utils/Logger';
import type { HydrologyBakeArtifact } from '../../terrain/hydrology/HydrologyBake';
import { buildHydrologyRiverGeometry } from './HydrologyRiverGeometry';

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
  /** Unit-length flow direction in world-XZ (segment start -> end). */
  flowX: number;
  flowZ: number;
  /**
   * Per-segment flow speed in m/s, scaled by accumulation factor so larger
   * channels carry more current. Consumed by `WaterSurfaceSampler` to fill
   * `WaterInteractionSample.flowVelocity`; buoyancy + swim apply the push.
   */
  flowSpeedMetersPerSecond: number;
}

export const EMPTY_HYDROLOGY_RIVER_STATS: HydrologyRiverMeshStats = {
  channelCount: 0,
  segmentCount: 0,
  vertexCount: 0,
  totalLengthMeters: 0,
  maxAccumulationCells: 0,
};

export const HYDROLOGY_RIVER_MATERIAL_PROFILE = 'natural_channel_gradient';

/**
 * Optional hook fired once when a fresh river material is created, before
 * the mesh is added to the scene. The owning `WaterSystem` uses this to
 * have `WaterSurfaceBinding` install the flow-visuals `onBeforeCompile`
 * patch on the river material (see `installHydrologyRiverFlowPatch`).
 * Kept optional so unit tests can construct the surface without wiring
 * the binding layer.
 */
export type HydrologyRiverMaterialReadyHook = (
  material: THREE.MeshStandardMaterial,
) => void;

export interface HydrologyRiverSurfaceOptions {
  onMaterialReady?: HydrologyRiverMaterialReadyHook;
}

/**
 * Hydrology-bake consumer surface. Owns the river mesh + group attached
 * to the scene, the material, the per-channel stats, and the
 * query-segments table consumed by `WaterSurfaceSampler`. Owning
 * `WaterSystem` calls `setArtifact()` on scenario load and `clear()`/null
 * on teardown.
 *
 * Geometry construction (including the per-vertex `aFlowDir` / `aFoamMask`
 * attributes consumed by the flow-visuals shader patch) lives in
 * `./HydrologyRiverGeometry`. The material is created here so the
 * `onMaterialReady` hook (provided by `WaterSystem` → `WaterSurfaceBinding`)
 * can install the `onBeforeCompile` patch before the mesh enters the scene.
 */
export class HydrologyRiverSurface {
  private scene: THREE.Scene;
  private readonly onMaterialReady?: HydrologyRiverMaterialReadyHook;
  private group?: THREE.Group;
  private mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private stats: HydrologyRiverMeshStats = { ...EMPTY_HYDROLOGY_RIVER_STATS };
  private querySegments: HydrologyWaterQuerySegment[] = [];

  constructor(scene: THREE.Scene, options: HydrologyRiverSurfaceOptions = {}) {
    this.scene = scene;
    this.onMaterialReady = options.onMaterialReady;
  }

  /**
   * Replace the active hydrology surface. `null` clears; an artifact with
   * no polylines is a no-op after the clear. Returns true on attach.
   */
  setArtifact(artifact: HydrologyBakeArtifact | null): boolean {
    this.clear();
    if (!artifact || artifact.channelPolylines.length === 0) return false;

    const geo = buildHydrologyRiverGeometry(artifact);
    if (!geo) return false;

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
    this.onMaterialReady?.(material);

    const mesh = new THREE.Mesh(geo.geometry, material);
    mesh.name = 'hydrology-river-surface-mesh';
    mesh.frustumCulled = true;
    mesh.renderOrder = 2;

    const group = new THREE.Group();
    group.name = 'hydrology-river-surfaces';
    group.add(mesh);
    this.scene.add(group);

    this.group = group;
    this.mesh = mesh;
    this.stats = geo.stats;
    this.querySegments = geo.querySegments;
    Logger.info(
      'environment',
      `Hydrology river surfaces loaded: ${geo.stats.channelCount} channels, ${geo.stats.segmentCount} segments`,
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
}
