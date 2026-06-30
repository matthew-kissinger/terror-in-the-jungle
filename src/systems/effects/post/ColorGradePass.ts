// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Filmic colour-grade pass for the P6 post stack.
 *
 * Composes the shared, identity-at-neutral builders from
 * `src/core/tsl/PostGradeNodes.ts` (lift/gamma/gain, saturation, contrast, a
 * filmic S-curve, and a radial vignette) into a single graded colour node. The
 * pass itself owns no render target — it returns a TSL colour node that
 * `NodePostProcessing` wires into the pipeline `outputNode`, so it is
 * backend-agnostic (identical on WebGPU and the WebGL2 fallback) and adds zero
 * cost on the pure `?renderer=webgl` legacy path (nothing instantiates it).
 *
 * THREE grade LUTs ship so the owner can A/B-pick in playtest (`?post=<lut>` or
 * the WorldBuilder toggle): a neutral baseline, a warm "golden jungle" look, and
 * a cool "overcast" look. "LUT" here means a parameter preset for the grade
 * builders, not a 3D texture — keeping the grade as scalar/vector graph ops
 * avoids a `Data3DTexture` upload and stays on the safe non-vertex TSL surface.
 *
 * Typing follows the repo convention (`TerrainMaterial.ts` / `PostGradeNodes`):
 * the TSL boundary is `any`-typed (`TslNode`).
 */

import { float, uv, vec3 } from 'three/tsl';

import {
  applyVignetteNode,
  contrastNode,
  liftGammaGainNode,
  saturationNode,
  toneCurveNode,
  vignetteFactorNode,
  type TslNode,
} from '../../../core/tsl/PostGradeNodes';

export type { TslNode };

/** Selectable grade looks. Owner picks the final one in playtest. */
export type ColorGradeLut = 'neutral' | 'golden' | 'overcast';

export const COLOR_GRADE_LUTS: readonly ColorGradeLut[] = ['neutral', 'golden', 'overcast'] as const;

export const DEFAULT_COLOR_GRADE_LUT: ColorGradeLut = 'golden';

/** Per-LUT grade parameters. Neutral is a true identity pass-through. */
export interface ColorGradeParams {
  liftRgb: readonly [number, number, number];
  gammaRgb: readonly [number, number, number];
  gainRgb: readonly [number, number, number];
  saturation: number;
  contrast: number;
  toneStrength: number;
  vignetteAmount: number;
  vignetteSoftness: number;
}

export const COLOR_GRADE_PRESETS: Record<ColorGradeLut, ColorGradeParams> = {
  // Identity by construction — the documented no-op grade.
  neutral: {
    liftRgb: [0, 0, 0],
    gammaRgb: [1, 1, 1],
    gainRgb: [1, 1, 1],
    saturation: 1,
    contrast: 1,
    toneStrength: 0,
    vignetteAmount: 0,
    vignetteSoftness: 0.5,
  },
  // Warm "golden jungle" — lifts shadows slightly cool, pushes warm gain,
  // gentle filmic rolloff, mild saturation + vignette.
  golden: {
    liftRgb: [0.0, 0.005, 0.012],
    gammaRgb: [0.98, 1.0, 1.04],
    gainRgb: [1.06, 1.02, 0.94],
    saturation: 1.08,
    contrast: 1.06,
    toneStrength: 0.35,
    vignetteAmount: 0.28,
    vignetteSoftness: 0.55,
  },
  // Cool "overcast" — flatter, desaturated, cooler highlights for grey-sky mood.
  overcast: {
    liftRgb: [0.006, 0.006, 0.01],
    gammaRgb: [1.02, 1.01, 0.99],
    gainRgb: [0.96, 0.98, 1.04],
    saturation: 0.92,
    contrast: 0.97,
    toneStrength: 0.2,
    vignetteAmount: 0.22,
    vignetteSoftness: 0.6,
  },
};

export function resolveColorGradeLut(value: string | null | undefined): ColorGradeLut | null {
  if (value === 'neutral' || value === 'golden' || value === 'overcast') return value;
  return null;
}

/**
 * Build the graded colour node for the given source colour node and LUT.
 * Composes the full grade chain at the preset's parameters; at `neutral` this is
 * an identity pass-through of `sourceColor`.
 */
export function buildColorGradeNode(sourceColor: TslNode, lut: ColorGradeLut): TslNode {
  const p = COLOR_GRADE_PRESETS[lut];
  let c = liftGammaGainNode(
    sourceColor,
    vec3(p.liftRgb[0], p.liftRgb[1], p.liftRgb[2]),
    vec3(p.gammaRgb[0], p.gammaRgb[1], p.gammaRgb[2]),
    vec3(p.gainRgb[0], p.gainRgb[1], p.gainRgb[2]),
  );
  c = saturationNode(c, float(p.saturation));
  c = contrastNode(c, float(p.contrast), float(0.5));
  c = toneCurveNode(c, float(p.toneStrength));
  const factor = vignetteFactorNode(uv(), float(p.vignetteAmount), float(p.vignetteSoftness));
  c = applyVignetteNode(c, factor);
  return c;
}
