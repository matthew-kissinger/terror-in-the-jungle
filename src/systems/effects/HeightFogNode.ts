// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Atmospheric-depth (height fog) TSL node-builders for the P6 post stack.
 *
 * NEW SIBLING module by design: `TerrainMaterial.ts` (1192 LOC) and
 * `AtmosphereSystem.ts` (~698 LOC) are both at/near the source budget ceiling,
 * so the screen-space atmospheric-depth graph lives here rather than growing
 * either god module (see brief P6b). Like `PostGradeNodes` and
 * `NodeMaterialLibrary`, these are composable shader-graph builders — they
 * return TSL color/scalar nodes and own no render pass. The post pipeline
 * (`NodePostProcessing`) wires them into its `outputNode`.
 *
 * The fog is screen-space and reconstructed from a depth/view-Z node, NOT from
 * the terrain vertex path (the r185 WebGPU-CDLOD regression renders new
 * terrain-vertex TSL invisible in prod — see `NodeMaterialLibrary` note), so it
 * is safe on the unified WebGPURenderer AND its WebGL2 fallback. At neutral
 * params (density 0 or fog color == scene color) it is an identity pass-through.
 *
 * Typing follows the repo convention (`TerrainMaterial.ts` / `PostGradeNodes`):
 * the TSL boundary is `any`-typed (`TslNode`) with thin casting wrappers because
 * the strict r185 node-class generics fight ergonomic chaining. The graph is
 * still validated structurally by the sibling `.test.ts`.
 */

import {
  clamp as tslClampBase,
  exp as tslExpBase,
  Fn,
  max as tslMaxBase,
  mix as tslMixBase,
  float,
} from 'three/tsl';

import type { TslNode } from '../../core/tsl/NodeMaterialLibrary';

export type { TslNode };

const tslFloat = (value: number): TslNode => float(value) as TslNode;
const tslClamp = (...args: TslNode[]): TslNode => (tslClampBase as (...v: TslNode[]) => TslNode)(...args);
const tslExp = (value: TslNode): TslNode => (tslExpBase as (v: TslNode) => TslNode)(value);
const tslMax = (...args: TslNode[]): TslNode => (tslMaxBase as (...v: TslNode[]) => TslNode)(...args);
const tslMix = (...args: TslNode[]): TslNode => (tslMixBase as (...v: TslNode[]) => TslNode)(...args);

/**
 * Exponential atmospheric-depth factor in [0,1] from a positive view-space
 * distance. `density` 0 returns 0 (no fog); larger density saturates the factor
 * toward 1 sooner. `start` pushes the onset out so near geometry stays crisp.
 *   factor = 1 - exp(-density * max(0, dist - start))
 * Pure scalar ops — identical on WebGPU and the WebGL2 fallback.
 */
export const heightFogFactorNode = Fn(([viewDistance, density, start]: TslNode[]): TslNode => {
  const dens = density ?? tslFloat(0.0);
  const onset = start ?? tslFloat(0.0);
  const reach = tslMax(viewDistance.sub(onset), tslFloat(0.0));
  const factor = tslFloat(1.0).sub(tslExp(reach.mul(dens).negate()));
  return tslClamp(factor, tslFloat(0.0), tslFloat(1.0));
});

/**
 * Blend a scene color toward a fog color by an atmospheric-depth factor (from
 * {@link heightFogFactorNode}). At factor 0 returns the scene color unchanged
 * (the documented no-op); at factor 1 returns pure fog color.
 */
export const applyHeightFogNode = Fn(([sceneColor, fogColor, factor]: TslNode[]): TslNode => {
  return tslMix(sceneColor, fogColor, factor);
});

/**
 * Height-attenuated fog factor: scales the base atmospheric-depth factor down as
 * the sampled world height rises above `floor`, so valleys hold haze while peaks
 * and aircraft views clear. `heightFalloff` controls how fast the haze thins with
 * altitude. At `heightFalloff` 0 this is identity (returns the base factor).
 */
export const heightAttenuatedFogNode = Fn(
  ([baseFactor, worldHeight, floor, heightFalloff]: TslNode[]): TslNode => {
    const flr = floor ?? tslFloat(0.0);
    const falloff = heightFalloff ?? tslFloat(0.0);
    const above = tslMax(worldHeight.sub(flr), tslFloat(0.0));
    const attenuation = tslExp(above.mul(falloff).negate());
    return tslClamp(baseFactor.mul(attenuation), tslFloat(0.0), tslFloat(1.0));
  },
);
