import type * as THREE from 'three';
import type { HydrologyWaterQuerySegment } from './HydrologyRiverSurface';

export type WaterSurfaceSource = 'none' | 'global' | 'hydrology';

export interface WaterInteractionSample {
  source: WaterSurfaceSource;
  surfaceY: number | null;
  depth: number;
  submerged: boolean;
  immersion01: number;
  buoyancyScalar: number;
}

export interface WaterInteractionOptions {
  immersionDepthMeters?: number;
}

export const DEFAULT_WATER_IMMERSION_DEPTH_METERS = 1.6;

/**
 * Source bindings the sampler needs to answer queries each frame. Provided by
 * the owning `WaterSystem` and read on every call (no caching) so the sampler
 * stays a pure transform over the current world state.
 */
export interface WaterSurfaceSamplerBindings {
  globalWaterLevel: number;
  isGlobalPlaneActive(): boolean;
  getHydrologyQuerySegments(): readonly HydrologyWaterQuerySegment[];
}

/**
 * Runtime sampling for water interaction queries. Consumed by buoyancy,
 * swim, and visual-effect callers via `WaterSystem.sampleWaterInteraction`.
 * Reports scalars only — force application belongs in the future physics
 * consumer, not in the renderer-owned system.
 */
export class WaterSurfaceSampler {
  private readonly bindings: WaterSurfaceSamplerBindings;

  constructor(bindings: WaterSurfaceSamplerBindings) {
    this.bindings = bindings;
  }

  /**
   * Return the water surface Y at a gameplay position, or null when dry.
   */
  getWaterSurfaceY(position: THREE.Vector3): number | null {
    return this.resolveWaterSurface(position).surfaceY;
  }

  /**
   * Return water depth above the supplied position. Dry positions report 0.
   */
  getWaterDepth(position: THREE.Vector3): number {
    return this.sample(position).depth;
  }

  /**
   * True when the supplied position is below the active water surface.
   */
  isUnderwater(position: THREE.Vector3): boolean {
    return this.getWaterDepth(position) > 0;
  }

  /**
   * Shared gameplay sample for swimming, buoyancy, watercraft, and bank
   * interactions. Reports a scalar only; force application belongs in the
   * future physics consumer.
   */
  sample(
    position: THREE.Vector3,
    options: WaterInteractionOptions = {},
  ): WaterInteractionSample {
    const surface = this.resolveWaterSurface(position);
    if (surface.surfaceY === null) {
      return {
        source: 'none',
        surfaceY: null,
        depth: 0,
        submerged: false,
        immersion01: 0,
        buoyancyScalar: 0,
      };
    }

    const depth = Math.max(0, surface.surfaceY - position.y);
    const immersionDepthMeters = Number.isFinite(options.immersionDepthMeters)
      ? Math.max(0.01, options.immersionDepthMeters ?? DEFAULT_WATER_IMMERSION_DEPTH_METERS)
      : DEFAULT_WATER_IMMERSION_DEPTH_METERS;
    const immersion01 = clamp(depth / immersionDepthMeters, 0, 1);
    return {
      source: surface.source,
      surfaceY: surface.surfaceY,
      depth,
      submerged: depth > 0,
      immersion01,
      buoyancyScalar: immersion01,
    };
  }

  /**
   * Resolve which water source (hydrology, global plane, or none) covers
   * the given XZ. Hydrology takes priority so per-river surfaces override
   * the global plane in the overlap.
   */
  private resolveWaterSurface(position: THREE.Vector3): { source: WaterSurfaceSource; surfaceY: number | null } {
    const hydrologySurfaceY = this.sampleHydrology(position.x, position.z);
    if (hydrologySurfaceY !== null) {
      return { source: 'hydrology', surfaceY: hydrologySurfaceY };
    }
    return this.bindings.isGlobalPlaneActive()
      ? { source: 'global', surfaceY: this.bindings.globalWaterLevel }
      : { source: 'none', surfaceY: null };
  }

  /**
   * Walk the hydrology river segments and return the surface Y of the
   * nearest covered segment, or null if no segment contains the point
   * within its half-width.
   */
  private sampleHydrology(x: number, z: number): number | null {
    const segments = this.bindings.getHydrologyQuerySegments();
    let nearest: { distanceSq: number; surfaceY: number } | null = null;
    for (const segment of segments) {
      const dx = segment.endX - segment.startX;
      const dz = segment.endZ - segment.startZ;
      const lengthSq = dx * dx + dz * dz;
      if (lengthSq <= 0) continue;
      const t = clamp(((x - segment.startX) * dx + (z - segment.startZ) * dz) / lengthSq, 0, 1);
      const sampleX = segment.startX + dx * t;
      const sampleZ = segment.startZ + dz * t;
      const distanceSq = (x - sampleX) ** 2 + (z - sampleZ) ** 2;
      if (distanceSq > segment.halfWidth ** 2) continue;
      const surfaceY = segment.startSurfaceY + (segment.endSurfaceY - segment.startSurfaceY) * t;
      if (!nearest || distanceSq < nearest.distanceSq) {
        nearest = { distanceSq, surfaceY };
      }
    }
    return nearest?.surfaceY ?? null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
