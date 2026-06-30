// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Material factory for the orbital relief mesh.
 *
 * Two first-class paths, chosen from the active renderer backend:
 *   - WebGPU: a `MeshStandardNodeMaterial` whose `colorNode` is the P0 shared
 *     TSL graph — hypsometric tint × relief (hill-)shade × contour lines — over
 *     the per-vertex normalized height the mesh builder bakes into the UV.w
 *     channel. This is the rich, backend-agnostic path (also lights up on the
 *     WebGPU renderer's internal WebGL2 fallback, since TSL is backend-agnostic
 *     since r171).
 *   - Legacy WebGL (`?renderer=webgl`): a plain `MeshLambertMaterial` with
 *     `vertexColors` — the mesh builder already wrote hypsometric vertex colours
 *     (CPU mirror of the same ramp), so the relief reads correctly with no TSL.
 *
 * The TSL import is dynamic so the legacy WebGL bundle path never pulls in
 * `three/webgpu`. Both paths return a `THREE.Material` the renderer drops onto
 * the relief mesh.
 */

import * as THREE from 'three';
import {
  hypsometricTintNode,
  reliefShadeNode,
  contourLineNode,
  type TslNode,
} from '../../../core/tsl/NodeMaterialLibrary';
import { DEFAULT_TOPO_RAMP, type HypsometricRamp } from './OrbitalTopoMeshBuilder';

export interface TopoMaterialOptions {
  ramp?: HypsometricRamp;
  /** Height span (metres) of the source relief, for contour spacing. */
  heightRange?: number;
  /** Contour interval in metres. */
  contourSpacing?: number;
}

function rampVec3(tsl: typeof import('three/tsl'), c: [number, number, number]): TslNode {
  return (tsl.vec3 as (...v: number[]) => TslNode)(c[0], c[1], c[2]);
}

/**
 * Build the rich WebGPU/TSL relief material. `attributeHeightNorm` is the
 * per-vertex normalized height attribute name the mesh writes (see
 * `OrbitalTopoMaterial`'s vertex-color convention); we reuse the UV.y of the
 * grid because it is monotonic with row, so instead we read the baked
 * normalized height from an explicit attribute. To stay off the terrain vertex
 * path entirely we drive hypsometric tint from a vertex attribute, never from
 * screen-space derivatives.
 */
export async function createTopoNodeMaterial(
  options: TopoMaterialOptions = {},
): Promise<THREE.Material> {
  const [webgpu, tsl] = await Promise.all([import('three/webgpu'), import('three/tsl')]);
  const ramp = options.ramp ?? DEFAULT_TOPO_RAMP;
  const spacing = options.contourSpacing ?? chooseContourSpacing(options.heightRange ?? 500);

  const material = new webgpu.MeshStandardNodeMaterial({
    name: 'orbital-topo-relief',
    roughness: 0.95,
    metalness: 0.0,
    flatShading: false,
    vertexColors: false,
  }) as THREE.Material & { colorNode?: unknown };

  // Per-vertex normalized height baked into the `topoHeightNorm` attribute (the
  // mesh builder writes it); read it through TSL's `attribute()`.
  const heightNorm = (tsl.attribute as (name: string, type?: string) => TslNode)('topoHeightNorm', 'float');
  // Per-vertex world height for the contour graph (separate attribute).
  const worldHeight = (tsl.attribute as (name: string, type?: string) => TslNode)('topoWorldHeight', 'float');

  const tint = (hypsometricTintNode as (...a: TslNode[]) => TslNode)(
    heightNorm,
    rampVec3(tsl, ramp.low),
    rampVec3(tsl, ramp.mid),
    rampVec3(tsl, ramp.high),
    rampVec3(tsl, ramp.peak),
  );

  const shade = (reliefShadeNode as (...a: TslNode[]) => TslNode)(
    (tsl as unknown as { normalLocal: TslNode }).normalLocal,
    undefined,
    (tsl.float as (v: number) => TslNode)(0.35),
  );

  const contour = (contourLineNode as (...a: TslNode[]) => TslNode)(
    worldHeight,
    (tsl.float as (v: number) => TslNode)(spacing),
    (tsl.float as (v: number) => TslNode)(spacing * 0.06),
  );

  const lit = (tint as { mul: (v: TslNode) => TslNode }).mul(shade);
  const contourTint = rampVec3(tsl, [0.12, 0.1, 0.08]);
  const colored = (tsl.mix as (...v: TslNode[]) => TslNode)(lit, contourTint, (contour as { mul: (v: number) => TslNode }).mul(0.55));

  (material as { colorNode?: unknown }).colorNode = colored;
  return material;
}

/**
 * WebGL2-fallback Lambert material. The relief reads from the per-vertex
 * hypsometric colours the mesh builder wrote, lit by a standard Lambert term —
 * no TSL, no node material, no `three/webgpu` import.
 */
export function createTopoLambertMaterial(): THREE.Material {
  return new THREE.MeshLambertMaterial({
    name: 'orbital-topo-relief-lambert',
    vertexColors: true,
    flatShading: false,
  });
}

/** Pick a sensible contour interval (metres) for a given relief height span. */
export function chooseContourSpacing(heightRange: number): number {
  if (heightRange > 1500) return 200;
  if (heightRange > 800) return 100;
  if (heightRange > 400) return 50;
  if (heightRange > 150) return 25;
  return 10;
}
