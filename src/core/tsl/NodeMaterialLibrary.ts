// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Shared TSL node-builder library for terrain-derived shading.
 *
 * These are small, composable shader-graph helpers — they build and return TSL
 * nodes, they do NOT construct materials or render anything themselves. Later
 * phases consume them:
 *   - P5 (orbital topo map): relief shade + hypsometric tint + contour over the
 *     baked heightmap read through `TerrainSystem.getBakedHeightmap()`.
 *   - P6 (post stack): height displacement for stylized map geometry.
 *
 * Backend portability: every node here is built from backend-agnostic `three/tsl`
 * primitives, so the same graph compiles on the WebGPU backend AND on the
 * WebGPU renderer's internal WebGL2 fallback (TSL has been backend-agnostic
 * since r171 — see `TslMaterialFactory.evaluateNodeMaterialReadiness`). There is
 * deliberately NO screen-space derivative (`dFdx`/`fwidth`) or vertex-stage CDLOD
 * coupling here: the r185 WebGPU-CDLOD regression means new TSL on the terrain
 * vertex path renders invisible in prod, so these helpers stay off that path and
 * operate purely on caller-supplied height/normal/uv inputs.
 *
 * On the pure `?renderer=webgl` legacy diagnostic path these are a true no-op:
 * nothing imports or instantiates them there (the legacy `WebGLRenderer` path
 * gates all TSL surfaces off via `evaluateNodeMaterialReadiness`), so no graph is
 * ever built.
 *
 * Typing note: the strict r185 node types are too rigid for ergonomic chaining,
 * so — following the established repo convention (see `TerrainMaterial.ts`) — the
 * TSL boundary is `any`-typed (`TslNode`) with thin casting wrappers. The graph
 * itself is still validated structurally by the sibling `.test.ts`.
 */

import {
  clamp as tslClampBase,
  cross as tslCrossBase,
  dot as tslDotBase,
  float,
  Fn,
  fract as tslFractBase,
  min as tslMinBase,
  mix as tslMixBase,
  normalize as tslNormalizeBase,
  smoothstep as tslSmoothstepBase,
  vec3,
} from 'three/tsl';

/**
 * A TSL shader-graph node. Kept as `any` at the boundary so builders compose
 * without fighting the strict node-class generics; consumers treat it opaquely.
 */
export type TslNode = any;

const tslFloat = (value: number): TslNode => float(value) as TslNode;
const tslVec3 = (...args: TslNode[]): TslNode => (vec3 as (...v: TslNode[]) => TslNode)(...args);
const tslClamp = (...args: TslNode[]): TslNode => (tslClampBase as (...v: TslNode[]) => TslNode)(...args);
const tslCross = (...args: TslNode[]): TslNode => (tslCrossBase as (...v: TslNode[]) => TslNode)(...args);
const tslDot = (...args: TslNode[]): TslNode => (tslDotBase as (...v: TslNode[]) => TslNode)(...args);
const tslFract = (value: TslNode): TslNode => (tslFractBase as (v: TslNode) => TslNode)(value);
const tslMin = (...args: TslNode[]): TslNode => (tslMinBase as (...v: TslNode[]) => TslNode)(...args);
const tslMix = (...args: TslNode[]): TslNode => (tslMixBase as (...v: TslNode[]) => TslNode)(...args);
const tslNormalize = (value: TslNode): TslNode => (tslNormalizeBase as (v: TslNode) => TslNode)(value);
const tslSmoothstep = (...args: TslNode[]): TslNode => (tslSmoothstepBase as (...v: TslNode[]) => TslNode)(...args);

/** Default sun azimuth/elevation for relief shading when a caller does not supply a light direction. */
export const DEFAULT_RELIEF_LIGHT_DIR: TslNode = tslVec3(-0.5, 0.8, 0.35);

/**
 * Lambert-style relief (hillshade) term in [0,1] from a surface normal and a
 * light direction. `ambient` lifts the shadow floor so deep valleys never go
 * fully black on the map.
 */
export const reliefShadeNode = Fn(([normal, lightDir, ambient]: TslNode[]): TslNode => {
  const l = tslNormalize(lightDir ?? DEFAULT_RELIEF_LIGHT_DIR);
  const n = tslNormalize(normal);
  const amb = ambient ?? tslFloat(0.25);
  const lambert = tslClamp(tslDot(n, l), tslFloat(0.0), tslFloat(1.0));
  return tslMix(amb, tslFloat(1.0), lambert);
});

/**
 * Reconstruct a world-space surface normal from height-field finite differences.
 * `hL`/`hR` are heights one step left/right (x), `hD`/`hU` one step down/up (z),
 * `cellSize` the world distance between samples. Lets the map shade relief from
 * the baked heightmap without needing a baked normal texture.
 */
export const heightFieldNormalNode = Fn(([hL, hR, hD, hU, cellSize]: TslNode[]): TslNode => {
  const step = cellSize ?? tslFloat(1.0);
  const dx = tslVec3(step.mul(2.0), hR.sub(hL), tslFloat(0.0));
  const dz = tslVec3(tslFloat(0.0), hU.sub(hD), step.mul(2.0));
  return tslNormalize(tslCross(dz, dx));
});

/**
 * Hypsometric (elevation-band) tint. Maps a normalized height in [0,1] through a
 * four-stop low -> mid -> high -> peak ramp. Stop colors are caller-supplied so a
 * scenario can theme its map (jungle green-to-rock, desert, etc.).
 */
export const hypsometricTintNode = Fn(([heightNorm, low, mid, high, peak]: TslNode[]): TslNode => {
  const t = tslClamp(heightNorm, tslFloat(0.0), tslFloat(1.0));
  const lowMid = tslMix(low, mid, tslSmoothstep(tslFloat(0.0), tslFloat(0.4), t));
  const midHigh = tslMix(lowMid, high, tslSmoothstep(tslFloat(0.35), tslFloat(0.75), t));
  return tslMix(midHigh, peak, tslSmoothstep(tslFloat(0.7), tslFloat(1.0), t));
});

/**
 * Contour-line intensity in [0,1] for a height value. Produces a soft line each
 * time `height` crosses a multiple of `spacing`; `lineWidth` is the band
 * half-width in height units. Pure function of height — no screen-space
 * derivatives, so it is identical on WebGPU and the WebGL2 fallback.
 */
export const contourLineNode = Fn(([height, spacing, lineWidth]: TslNode[]): TslNode => {
  const space = spacing ?? tslFloat(50.0);
  const width = lineWidth ?? tslFloat(2.0);
  const phase = tslFract(height.div(space));
  // Distance to the nearest contour crossing (0 or 1 in phase space).
  const distToLine = tslMin(phase, tslFloat(1.0).sub(phase)).mul(space);
  return tslFloat(1.0).sub(tslSmoothstep(tslFloat(0.0), width, distToLine));
});

/**
 * Height-displacement offset along a normal. Returns the displaced position so a
 * caller can wire it into a `positionNode`. Used by P6 for stylized relief geo;
 * NOT wired onto the CDLOD terrain vertex path (r185 regression).
 */
export const heightDisplaceNode = Fn(([position, normal, heightNorm, amplitude]: TslNode[]): TslNode => {
  const amp = amplitude ?? tslFloat(1.0);
  const offset = tslNormalize(normal).mul(tslClamp(heightNorm, tslFloat(0.0), tslFloat(1.0))).mul(amp);
  return position.add(offset);
});
