// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Shared TSL post-grade node-builder helpers for the P6 cinematic post stack.
 *
 * Like `NodeMaterialLibrary`, these are composable shader-graph builders — they
 * return TSL color nodes, they do NOT own a render pass. P6 wires them into the
 * post pipeline's `outputNode`; this phase ships only the building blocks.
 *
 * Each grade is identity-at-neutral by construction (lift 0, gamma 1, gain 1,
 * saturation 1, contrast 1, tone strength 0, vignette amount 0), so composing the
 * full chain with neutral parameters is a true no-op pass-through. Backend-
 * agnostic `three/tsl` primitives only: identical on the WebGPU backend and the
 * WebGL2 fallback. On the pure `?renderer=webgl` legacy path nothing instantiates
 * these, so they add zero cost there.
 *
 * Typing follows the established repo convention (`TerrainMaterial.ts`): the TSL
 * boundary is `any`-typed (`TslNode`) with thin casting wrappers, because the
 * strict r185 node-class generics fight ergonomic chaining. Graph structure is
 * still validated by the sibling `.test.ts`.
 */

import {
  clamp as tslClampBase,
  dot as tslDotBase,
  float,
  Fn,
  mix as tslMixBase,
  pow as tslPowBase,
  vec2,
  vec3,
} from 'three/tsl';

import type { TslNode } from './NodeMaterialLibrary';

export type { TslNode };

const tslFloat = (value: number): TslNode => float(value) as TslNode;
const tslVec2 = (...args: TslNode[]): TslNode => (vec2 as (...v: TslNode[]) => TslNode)(...args);
const tslVec3 = (...args: TslNode[]): TslNode => (vec3 as (...v: TslNode[]) => TslNode)(...args);
const tslClamp = (...args: TslNode[]): TslNode => (tslClampBase as (...v: TslNode[]) => TslNode)(...args);
const tslDot = (...args: TslNode[]): TslNode => (tslDotBase as (...v: TslNode[]) => TslNode)(...args);
const tslMix = (...args: TslNode[]): TslNode => (tslMixBase as (...v: TslNode[]) => TslNode)(...args);
const tslPow = (...args: TslNode[]): TslNode => (tslPowBase as (...v: TslNode[]) => TslNode)(...args);

/** Rec. 709 luma weights — perceptual luminance for saturation/contrast grading. */
export const REC709_LUMA: TslNode = tslVec3(0.2126, 0.7152, 0.0722);

/**
 * Lift/gamma/gain color grade (the classic three-way correction), applied per
 * channel. Neutral at lift=0, gamma=1, gain=1 -> returns the input color.
 *   out = pow(clamp(color * gain + lift), 1 / gamma)
 */
export const liftGammaGainNode = Fn(([color, lift, gamma, gain]: TslNode[]): TslNode => {
  const liftV = lift ?? tslVec3(0.0);
  const gammaV = gamma ?? tslVec3(1.0);
  const gainV = gain ?? tslVec3(1.0);
  const graded = tslClamp(color.mul(gainV).add(liftV), tslFloat(0.0), tslFloat(1.0));
  return tslPow(graded, tslVec3(1.0).div(gammaV));
});

/**
 * Saturation around perceptual luma. `amount` 1 = identity, 0 = greyscale, >1
 * pushes saturation. Luma is preserved so brightness does not shift.
 */
export const saturationNode = Fn(([color, amount]: TslNode[]): TslNode => {
  const amt = amount ?? tslFloat(1.0);
  const luma = tslDot(color, REC709_LUMA);
  return tslMix(tslVec3(luma), color, amt);
});

/**
 * Contrast curve around a pivot (default mid-grey 0.5). `amount` 1 = identity,
 * >1 increases contrast, <1 flattens it.
 */
export const contrastNode = Fn(([color, amount, pivot]: TslNode[]): TslNode => {
  const amt = amount ?? tslFloat(1.0);
  const piv = pivot ?? tslFloat(0.5);
  return color.sub(piv).mul(amt).add(piv);
});

/**
 * Smooth filmic-ish S-curve via a single `strength` knob. At strength 0 it is the
 * identity curve; positive strength steepens the midtones and rolls off the
 * highlights. Pure scalar/vector ops — no LUT texture.
 */
export const toneCurveNode = Fn(([color, strength]: TslNode[]): TslNode => {
  const str = strength ?? tslFloat(0.0);
  const c = tslClamp(color, tslFloat(0.0), tslFloat(1.0));
  // Quintic smootherstep gives a symmetric S; blend by strength toward it.
  const curved = c.mul(c).mul(c).mul(c.mul(c.mul(6.0).sub(15.0)).add(10.0));
  return tslMix(c, curved, tslClamp(str, tslFloat(0.0), tslFloat(1.0)));
});

/**
 * Radial vignette factor. `uv` is a 0-1 screen UV node; `amount` 0 = no darkening,
 * 1 = full corner falloff. `softness` controls the falloff radius. Returns a
 * scalar multiplier in [1-amount, 1] to apply to color.
 */
export const vignetteFactorNode = Fn(([uv, amount, softness]: TslNode[]): TslNode => {
  const amt = amount ?? tslFloat(0.0);
  const soft = softness ?? tslFloat(0.5);
  const centered = uv.sub(tslVec2(0.5, 0.5));
  // Squared radial distance from screen center (0 at center, ~0.5 at corners).
  const dist = tslDot(centered, centered);
  const falloff = tslClamp(dist.mul(soft.add(0.5).mul(2.0)), tslFloat(0.0), tslFloat(1.0));
  return tslFloat(1.0).sub(falloff.mul(tslClamp(amt, tslFloat(0.0), tslFloat(1.0))));
});

/**
 * Apply a vignette factor (from `vignetteFactorNode`) to a color.
 */
export const applyVignetteNode = Fn(([color, factor]: TslNode[]): TslNode => {
  return color.mul(factor);
});
