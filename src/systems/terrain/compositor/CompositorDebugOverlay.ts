// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { WorldOverlay } from '../../../ui/debug/WorldOverlayRegistry';
import type { TerrainStampConfig } from '../TerrainFeatureTypes';
import type { IHeightProvider } from '../IHeightProvider';
import {
  ENVELOPE_RAMP_THRESHOLD_METERS,
  stampAABB,
  type AABB2D,
} from './TerrainStampConflictDetector';
import { HYDROLOGY_TERRAIN_PRIORITY } from '../hydrology/HydrologyTerrainFeatures';

/**
 * R2.3 of cycle-terrain-compositor (memo:
 * docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).
 *
 * Dev-only debug overlay that visualises the canonical
 * {@link TerrainCompositorOutput}: one wireframe AABB per stamp colour-coded by
 * the stamp's origin (airfield / hydrology / motor-pool / route), and one red
 * line per spatial conflict reported by R1.2's detector / R2.1's resolver.
 *
 * Toggle behaviour follows the existing {@link createTerrainSeamOverlay} contract:
 * geometry is allocated on mount and disposed on unmount so repeated chord
 * toggles never leak GPU buffers.
 *
 * Stamps from the compositor do not yet carry a domain "kind" annotation
 * (R1.3's annotations cover policy, not origin), so the overlay classifies by
 * shape + the same envelope-ramp heuristic the detector uses to compute AABBs:
 *   - flatten_capsule with `gradeRadius - outerRadius >= 30`   → white (airfield envelope)
 *   - flatten_capsule at the hydrology priority (40)           → blue (hydrology channel)
 *   - other flatten_capsule                                    → green (route / flow stamp)
 *   - flatten_circle                                           → orange (firebase / helipad / village anchor)
 *
 * This mirrors {@link stampAABB}'s `ENVELOPE_RAMP_THRESHOLD_METERS` check at
 * TerrainStampConflictDetector.ts so the overlay and the detector always agree
 * on which capsule is an airfield envelope.
 */

const COLOR_AIRFIELD = 0xffffff;
const COLOR_HYDROLOGY = 0x3399ff;
const COLOR_MOTORPOOL = 0xff8800;
const COLOR_ROUTE = 0x33dd55;
const COLOR_CONFLICT = 0xff2233;

const AABB_TOP_OFFSET_M = 50;
const CONFLICT_LIFT_M = 0.5;
const OVERLAY_ID = 'compositor-stamps';
const OVERLAY_LABEL = 'Compositor Stamps';
const OVERLAY_HOTKEY = 'J';

/**
 * Minimal shape the overlay needs from each conflict record. We accept the
 * superset of what R1.2's `TerrainStampConflictDetector` emits today and what
 * R2.1's policy resolver will emit tomorrow — both expose the participating
 * stamp indices and the overlap AABB. Anything else (severity, policy, etc.)
 * is informational and ignored here.
 */
export interface CompositorOverlayConflict {
  stampA: number;
  stampB: number;
  overlapAABB: AABB2D;
}

/**
 * Source the overlay reads on toggle-on. Implementations route to the live
 * {@link TerrainCompositorOutput} cached by {@link ModeStartupPreparer}.
 */
export interface CompositorDebugOverlaySource {
  getOutput(): {
    stamps: ReadonlyArray<TerrainStampConfig>;
    conflicts: ReadonlyArray<CompositorOverlayConflict>;
    composedProvider: IHeightProvider;
  } | null;
}

/**
 * Internal type for resolved per-stamp box parameters. Decoupled from
 * `TerrainStampConfig` so the build path stays kind-agnostic.
 */
interface StampBox {
  aabb: AABB2D;
  groundY: number;
  color: number;
}

/**
 * Build a {@link WorldOverlay} that visualises composed stamps + conflicts.
 * The overlay is registered through the existing `Shift+\` chord by
 * {@link wireWorldOverlays}; this factory takes no scene reference because the
 * registry mounts the overlay's own group lazily.
 */
export function createCompositorDebugOverlay(
  source: CompositorDebugOverlaySource,
): WorldOverlay {
  let stampLines: THREE.LineSegments | null = null;
  let conflictLines: THREE.LineSegments | null = null;
  let mountedGroup: THREE.Group | null = null;

  function dispose(): void {
    if (stampLines && mountedGroup) {
      mountedGroup.remove(stampLines);
      stampLines.geometry.dispose();
      (stampLines.material as THREE.Material).dispose();
    }
    if (conflictLines && mountedGroup) {
      mountedGroup.remove(conflictLines);
      conflictLines.geometry.dispose();
      (conflictLines.material as THREE.Material).dispose();
    }
    stampLines = null;
    conflictLines = null;
    mountedGroup = null;
  }

  return {
    id: OVERLAY_ID,
    label: OVERLAY_LABEL,
    hotkey: OVERLAY_HOTKEY,
    defaultVisible: false,

    mount(group: THREE.Group): void {
      mountedGroup = group;
      const output = source.getOutput();
      const boxes = output ? buildStampBoxes(output.stamps, output.composedProvider) : [];
      stampLines = buildStampLineSegments(boxes);
      group.add(stampLines);

      if (output && output.conflicts.length > 0) {
        conflictLines = buildConflictLineSegments(boxes, output.conflicts);
        group.add(conflictLines);
      }
    },

    unmount(): void {
      dispose();
    },
  };
}

/**
 * Classify a stamp by (kind, envelope-ramp-width) so the overlay agrees with
 * {@link stampAABB} on what counts as an airfield-envelope-class capsule. This
 * replaces an earlier priority-band classifier that mis-labelled the airfield
 * envelope (priority 30, below the hydrology band) and motor-pool / route
 * stamps (priorities 56-60, both in the "airfield" band).
 *
 * Exported so the test suite can pin the classification rule.
 */
export function classifyStampColor(stamp: TerrainStampConfig): number {
  if (stamp.kind === 'flatten_capsule') {
    const rampWidth = stamp.gradeRadius - stamp.outerRadius;
    if (rampWidth >= ENVELOPE_RAMP_THRESHOLD_METERS) return COLOR_AIRFIELD;
    if (stamp.priority === HYDROLOGY_TERRAIN_PRIORITY) return COLOR_HYDROLOGY;
    return COLOR_ROUTE;
  }
  // flatten_circle: firebase / helipad / motor-pool / village anchor.
  return COLOR_MOTORPOOL;
}

function stampCenter(stamp: TerrainStampConfig): { x: number; z: number } {
  if (stamp.kind === 'flatten_circle') {
    return { x: stamp.centerX, z: stamp.centerZ };
  }
  return {
    x: (stamp.startX + stamp.endX) * 0.5,
    z: (stamp.startZ + stamp.endZ) * 0.5,
  };
}

function buildStampBoxes(
  stamps: ReadonlyArray<TerrainStampConfig>,
  composedProvider: IHeightProvider,
): StampBox[] {
  const boxes: StampBox[] = new Array(stamps.length);
  for (let i = 0; i < stamps.length; i++) {
    const stamp = stamps[i];
    const center = stampCenter(stamp);
    boxes[i] = {
      aabb: stampAABB(stamp),
      groundY: composedProvider.getHeightAt(center.x, center.z),
      color: classifyStampColor(stamp),
    };
  }
  return boxes;
}

/**
 * Build one wireframe box per stamp. We pack all stamps into a single
 * {@link THREE.LineSegments} so we still need only one geometry + material
 * even when stamp counts grow into the hundreds at OF startup.
 *
 * Each box contributes 12 edges (8 verts of an AABB connected as a cube),
 * encoded as 12 line segments × 2 verts × 3 floats = 72 floats per stamp.
 * Per-vertex colour matches the stamp's classification so a single material
 * with vertex colours covers all four colour categories without batch breaks.
 */
function buildStampLineSegments(boxes: StampBox[]): THREE.LineSegments {
  const segmentsPerBox = 12;
  const positions = new Float32Array(boxes.length * segmentsPerBox * 2 * 3);
  const colors = new Float32Array(boxes.length * segmentsPerBox * 2 * 3);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    const y0 = box.groundY;
    const y1 = box.groundY + AABB_TOP_OFFSET_M;
    const { minX, minZ, maxX, maxZ } = box.aabb;
    tmpColor.set(box.color);
    const r = tmpColor.r;
    const g = tmpColor.g;
    const b = tmpColor.b;
    const baseFloat = i * segmentsPerBox * 2 * 3;
    writeBoxEdges(positions, baseFloat, minX, minZ, maxX, maxZ, y0, y1);
    fillColorRange(colors, baseFloat, segmentsPerBox * 2, r, g, b);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
    depthTest: false,
  });
  const lines = new THREE.LineSegments(geom, mat);
  lines.renderOrder = 9997;
  lines.name = 'compositor-stamp-aabbs';
  return lines;
}

function buildConflictLineSegments(
  boxes: ReadonlyArray<StampBox>,
  conflicts: ReadonlyArray<CompositorOverlayConflict>,
): THREE.LineSegments {
  // Each conflict draws two short segments — stampA-center to overlap-mid and
  // overlap-mid to stampB-center — so the resulting V reads as a single
  // connected edge across the overlap from helicopter altitude.
  const segmentsPerConflict = 2;
  const positions = new Float32Array(conflicts.length * segmentsPerConflict * 2 * 3);
  let segCount = 0;
  for (let i = 0; i < conflicts.length; i++) {
    const conflict = conflicts[i];
    const boxA = boxes[conflict.stampA];
    const boxB = boxes[conflict.stampB];
    if (!boxA || !boxB) continue;
    const overlap = conflict.overlapAABB;
    if (!overlap) continue;
    const y = Math.max(boxA.groundY, boxB.groundY) + CONFLICT_LIFT_M;
    const cax = (boxA.aabb.minX + boxA.aabb.maxX) * 0.5;
    const caz = (boxA.aabb.minZ + boxA.aabb.maxZ) * 0.5;
    const cbx = (boxB.aabb.minX + boxB.aabb.maxX) * 0.5;
    const cbz = (boxB.aabb.minZ + boxB.aabb.maxZ) * 0.5;
    const midX = (overlap.minX + overlap.maxX) * 0.5;
    const midZ = (overlap.minZ + overlap.maxZ) * 0.5;
    let base = segCount * 6;
    positions[base] = cax; positions[base + 1] = y; positions[base + 2] = caz;
    positions[base + 3] = midX; positions[base + 4] = y; positions[base + 5] = midZ;
    segCount++;
    base = segCount * 6;
    positions[base] = midX; positions[base + 1] = y; positions[base + 2] = midZ;
    positions[base + 3] = cbx; positions[base + 4] = y; positions[base + 5] = cbz;
    segCount++;
  }

  const geom = new THREE.BufferGeometry();
  const trimmedPositions = positions.length === segCount * 6
    ? positions
    : positions.slice(0, segCount * 6);
  geom.setAttribute('position', new THREE.Float32BufferAttribute(trimmedPositions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: COLOR_CONFLICT,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const lines = new THREE.LineSegments(geom, mat);
  lines.renderOrder = 9998;
  lines.name = 'compositor-conflict-edges';
  return lines;
}

/** Write the 12 wireframe-cube edges of an AABB into a position buffer. */
function writeBoxEdges(
  out: Float32Array,
  baseFloat: number,
  minX: number, minZ: number,
  maxX: number, maxZ: number,
  yLo: number, yHi: number,
): void {
  // Four bottom edges (y = yLo).
  let p = baseFloat;
  p = pushSegment(out, p, minX, yLo, minZ, maxX, yLo, minZ);
  p = pushSegment(out, p, maxX, yLo, minZ, maxX, yLo, maxZ);
  p = pushSegment(out, p, maxX, yLo, maxZ, minX, yLo, maxZ);
  p = pushSegment(out, p, minX, yLo, maxZ, minX, yLo, minZ);
  // Four top edges (y = yHi).
  p = pushSegment(out, p, minX, yHi, minZ, maxX, yHi, minZ);
  p = pushSegment(out, p, maxX, yHi, minZ, maxX, yHi, maxZ);
  p = pushSegment(out, p, maxX, yHi, maxZ, minX, yHi, maxZ);
  p = pushSegment(out, p, minX, yHi, maxZ, minX, yHi, minZ);
  // Four vertical edges.
  p = pushSegment(out, p, minX, yLo, minZ, minX, yHi, minZ);
  p = pushSegment(out, p, maxX, yLo, minZ, maxX, yHi, minZ);
  p = pushSegment(out, p, maxX, yLo, maxZ, maxX, yHi, maxZ);
  pushSegment(out, p, minX, yLo, maxZ, minX, yHi, maxZ);
}

function pushSegment(
  out: Float32Array,
  p: number,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
): number {
  out[p] = x0; out[p + 1] = y0; out[p + 2] = z0;
  out[p + 3] = x1; out[p + 4] = y1; out[p + 5] = z1;
  return p + 6;
}

function fillColorRange(
  out: Float32Array,
  baseFloat: number,
  vertCount: number,
  r: number, g: number, b: number,
): void {
  for (let i = 0; i < vertCount; i++) {
    const p = baseFloat + i * 3;
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
  }
}
