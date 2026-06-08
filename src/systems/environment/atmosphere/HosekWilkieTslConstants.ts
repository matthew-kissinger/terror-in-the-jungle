// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

// Preetham scattering constants shared by the runtime TSL graph and the CPU
// test mirror.
export const TOTAL_RAYLEIGH = [
  5.804542996261093e-6,
  1.3562911419845635e-5,
  3.0265902468824876e-5,
] as const;

export const MIE_CONST = [
  1.8399918514433978e14,
  2.7798023919660528e14,
  4.0790479543861094e14,
] as const;

export const CUTOFF_ANGLE = 1.6110731556870734;
export const STEEPNESS = 1.5;
export const EE_BASE = 1000.0;

// Body outer = cos(0.9°). The visible body is owned by SunDiscMesh; the sky
// node uses this edge only to keep broad forward-scatter from flattening into
// a second circular sun.
export const SUN_DISC_OUTER_DEFAULT = Math.cos((0.9 * Math.PI) / 180);

// The Preetham forward-scatter lobe remains display-white well outside the
// sun-body footprint at golden hour. Compress the base lobe near the sun so the
// depth-tested SunDiscMesh can read as the only hard body, without flattening a
// wide circular plate into the sky.
export const SUN_BASE_GLARE_COMPRESS_OUTER_DEFAULT = Math.cos((24 * Math.PI) / 180);
export const SUN_BASE_GLARE_COMPRESS_SHAPE_POWER = 1.85;
export const SUN_BASE_GLARE_OVER_CAP_RETENTION = 0.012;
export const SUN_BASE_GLARE_CAP_R = 0.82;
export const SUN_BASE_GLARE_CAP_G = 0.70;
export const SUN_BASE_GLARE_CAP_B = 0.52;
export const SUN_BASE_GLARE_HIGH_SUN_CAP_R = 0.62;
export const SUN_BASE_GLARE_HIGH_SUN_CAP_G = 0.74;
export const SUN_BASE_GLARE_HIGH_SUN_CAP_B = 0.92;
export const SUN_BASE_GLARE_HIGH_SUN_BLEND_START_Y = 0.70;
export const SUN_BASE_GLARE_HIGH_SUN_BLEND_FULL_Y = 0.90;

export const MOON_COLOR_R = 0.18;
export const MOON_COLOR_G = 0.20;
export const MOON_COLOR_B = 0.30;
