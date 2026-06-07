// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { HydrologyWaterQuerySegment } from './HydrologyRiverSurface';
import type { WaterBodyQuerySegment } from './WaterBodyAuthority';

export type WaterSurfaceSource = 'none' | 'global' | 'hydrology' | 'water_body';

export interface WaterInteractionSample {
  source: WaterSurfaceSource;
  surfaceY: number | null;
  depth: number;
  submerged: boolean;
  immersion01: number;
  buoyancyScalar: number;
  /**
   * Horizontal flow velocity in m/s (world XZ; `y` is always 0). Populated
   * from the matched hydrology segment when the sample falls inside a
   * channel; (0,0,0) for the global plane and dry samples. Consumers:
   * `BuoyancyForce` blends body horizontal velocity toward this; the
   * player swim path adds it as a downstream push.
   *
   * The vector is freshly allocated per call so callers may keep, copy,
   * or mutate it without affecting subsequent samples. Cost: one Vector3
   * per query, bounded by the few-dozen-bodies-per-frame regime this
   * targets.
   */
  flowVelocity: THREE.Vector3;
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
  getWaterBodyQuerySegments(): readonly WaterBodyQuerySegment[];
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
        flowVelocity: new THREE.Vector3(),
      };
    }

    const depth = Math.max(0, surface.surfaceY - position.y);
    const immersionDepthMeters = Number.isFinite(options.immersionDepthMeters)
      ? Math.max(0.01, options.immersionDepthMeters ?? DEFAULT_WATER_IMMERSION_DEPTH_METERS)
      : DEFAULT_WATER_IMMERSION_DEPTH_METERS;
    const immersion01 = clamp(depth / immersionDepthMeters, 0, 1);
    // Flow vector freshly allocated per call so consumers can copy or
    // mutate without aliasing. Zero outside hydrology channels.
    const flowVelocity = new THREE.Vector3();
    if (surface.flowSegment) {
      const seg = surface.flowSegment;
      flowVelocity.set(seg.flowX * seg.flowSpeedMetersPerSecond, 0, seg.flowZ * seg.flowSpeedMetersPerSecond);
    }
    return {
      source: surface.source,
      surfaceY: surface.surfaceY,
      depth,
      submerged: depth > 0,
      immersion01,
      buoyancyScalar: immersion01,
      flowVelocity,
    };
  }

  /**
   * Resolve which water source (authored water body, hydrology, global plane,
   * or none) covers the given XZ. Authored level/depth water bodies take
   * priority over old terrain-following hydrology ribbons; hydrology still
   * overrides the global plane. When a segment matches,
   * its reference is returned so the sampler can derive flow velocity
   * from the same segment without a second walk.
   */
  private resolveWaterSurface(position: THREE.Vector3): {
    source: WaterSurfaceSource;
    surfaceY: number | null;
    flowSegment: WaterFlowSegment | null;
  } {
    const waterBody = this.sampleWaterBody(position.x, position.z);
    if (waterBody !== null) {
      return { source: 'water_body', surfaceY: waterBody.surfaceY, flowSegment: waterBody.segment };
    }
    const hydrology = this.sampleHydrology(position.x, position.z);
    if (hydrology !== null) {
      return { source: 'hydrology', surfaceY: hydrology.surfaceY, flowSegment: hydrology.segment };
    }
    if (this.bindings.isGlobalPlaneActive()) {
      return { source: 'global', surfaceY: this.bindings.globalWaterLevel, flowSegment: null };
    }
    return { source: 'none', surfaceY: null, flowSegment: null };
  }

  /**
   * Walk the hydrology river segments and return the surface Y of the
   * nearest covered segment, or null if no segment contains the point
   * within its half-width. Returns the matched segment alongside so the
   * caller can derive flow direction without a second walk.
   */
  private sampleHydrology(
    x: number,
    z: number,
  ): { surfaceY: number; segment: HydrologyWaterQuerySegment } | null {
    const segments = this.bindings.getHydrologyQuerySegments();
    let nearest: { distanceSq: number; surfaceY: number; segment: HydrologyWaterQuerySegment } | null = null;
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
        nearest = { distanceSq, surfaceY, segment };
      }
    }
    return nearest === null ? null : { surfaceY: nearest.surfaceY, segment: nearest.segment };
  }

  /**
   * Walk authored level/depth water-body reaches and return the constant
   * surface Y of the nearest covered segment. The segment also carries flow
   * and bed-depth metadata for gameplay diagnostics.
   */
  private sampleWaterBody(
    x: number,
    z: number,
  ): { surfaceY: number; segment: WaterBodyQuerySegment } | null {
    const segments = this.bindings.getWaterBodyQuerySegments();
    let nearest: { distanceSq: number; surfaceY: number; segment: WaterBodyQuerySegment } | null = null;
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
        nearest = { distanceSq, surfaceY, segment };
      }
    }
    return nearest === null ? null : { surfaceY: nearest.surfaceY, segment: nearest.segment };
  }
}

interface WaterFlowSegment {
  flowX: number;
  flowZ: number;
  flowSpeedMetersPerSecond: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
