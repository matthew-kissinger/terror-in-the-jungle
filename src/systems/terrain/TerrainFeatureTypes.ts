// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export type TerrainStampTargetHeightMode = 'center' | 'average' | 'max';

/**
 * Conflict-resolution policy used by the upcoming `TerrainCompositor`
 * (cycle-terrain-compositor R2.1) when two stamps overlap.
 *
 * - `never_below` — the resolved height never drops below this stamp's target.
 * - `never_above` — the resolved height never exceeds this stamp's target.
 * - `override`    — this stamp's target wins inside its envelope by priority.
 * - `consult`     — this stamp defers its target to overlapping higher-priority
 *                   stamps but still applies its own envelope shape.
 *
 * Optional today; R2.1 supplies a behavior-preserving default at the compose
 * site for any stamp that does not annotate this field.
 */
export type TerrainStampObstructionPolicy =
  | 'never_below'
  | 'never_above'
  | 'override'
  | 'consult';

/**
 * Target-height resolution strategy used by the upcoming `TerrainCompositor`.
 *
 * - `baked`                — `fixedTargetHeight` is authoritative.
 * - `sample_at_compose`    — sample the base provider when composition begins.
 * - `sample_post_compose`  — sample the *composed* provider after all
 *                            lower-priority stamps have been applied (lets a
 *                            stamp ride on top of an overlapping authored
 *                            datum, e.g. an airfield envelope draping over
 *                            adjacent hydrology cuts).
 *
 * Optional today; the field is metadata until R2.1 implements the resolver.
 */
export type TerrainStampTargetHeightStrategy =
  | 'baked'
  | 'sample_at_compose'
  | 'sample_post_compose';

export interface FlattenCircleTerrainStamp {
  kind: 'flatten_circle';
  centerX: number;
  centerZ: number;
  innerRadius: number;
  outerRadius: number;
  gradeRadius: number;
  gradeStrength: number;
  samplingRadius: number;
  targetHeightMode: TerrainStampTargetHeightMode;
  fixedTargetHeight?: number;
  heightOffset: number;
  priority: number;
  obstructionPolicy?: TerrainStampObstructionPolicy;
  targetHeightStrategy?: TerrainStampTargetHeightStrategy;
}

export interface FlattenCapsuleTerrainStamp {
  kind: 'flatten_capsule';
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  innerRadius: number;
  outerRadius: number;
  gradeRadius: number;
  gradeStrength: number;
  samplingRadius: number;
  targetHeightMode: TerrainStampTargetHeightMode;
  fixedTargetHeight?: number;
  heightOffset: number;
  priority: number;
  obstructionPolicy?: TerrainStampObstructionPolicy;
  targetHeightStrategy?: TerrainStampTargetHeightStrategy;
}

export interface ResolvedFlattenCircleTerrainStamp extends FlattenCircleTerrainStamp {
  targetHeight: number;
}

export interface ResolvedFlattenCapsuleTerrainStamp extends FlattenCapsuleTerrainStamp {
  targetHeight: number;
}

export type TerrainStampConfig = FlattenCircleTerrainStamp | FlattenCapsuleTerrainStamp;
export type ResolvedTerrainStampConfig =
  | ResolvedFlattenCircleTerrainStamp
  | ResolvedFlattenCapsuleTerrainStamp;

export type TerrainSurfaceKind = 'packed_earth' | 'runway' | 'dirt_road' | 'gravel_road' | 'jungle_trail';

export interface CircleTerrainSurfacePatch {
  shape: 'circle';
  x: number;
  z: number;
  innerRadius: number;
  outerRadius: number;
  surface: TerrainSurfaceKind;
  priority: number;
}

export interface RectTerrainSurfacePatch {
  shape: 'rect';
  x: number;
  z: number;
  width: number;
  length: number;
  blend: number;
  yaw: number;
  surface: TerrainSurfaceKind;
  priority: number;
}

export type TerrainSurfacePatch = CircleTerrainSurfacePatch | RectTerrainSurfacePatch;

export interface TerrainFlowPathPoint {
  x: number;
  z: number;
}

export interface TerrainFlowPath {
  id: string;
  kind: 'route';
  width: number;
  surface: TerrainSurfaceKind;
  sourceIds: string[];
  points: TerrainFlowPathPoint[];
}

export interface TerrainExclusionZone {
  x: number;
  z: number;
  radius: number;
  sourceId?: string;
}

export interface CompiledTerrainFeatureSet {
  stamps: TerrainStampConfig[];
  surfacePatches: TerrainSurfacePatch[];
  vegetationExclusionZones: TerrainExclusionZone[];
  flowPaths: TerrainFlowPath[];
}
