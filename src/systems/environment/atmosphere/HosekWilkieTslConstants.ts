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

// Inner = cos(0.25°), Outer = cos(0.65°) for a ~1.3° soft-edged body.
export const SUN_DISC_INNER_DEFAULT = Math.cos((0.25 * Math.PI) / 180);
export const SUN_DISC_OUTER_DEFAULT = Math.cos((0.65 * Math.PI) / 180);

export const SUN_AUREOLE_OUTER_NOON_DEFAULT = Math.cos((1.5 * Math.PI) / 180);
export const SUN_AUREOLE_OUTER_LOWSUN_DEFAULT = Math.cos((3 * Math.PI) / 180);
export const SUN_AUREOLE_RELATIVE_GAIN = 0.0000005;

// The Preetham forward-scatter lobe remains display-white well outside the
// explicit sun body at golden hour. Compress the broad base lobe across the
// measured plate so only the controlled disc/aureole can clip.
export const SUN_BASE_GLARE_COMPRESS_OUTER_DEFAULT = Math.cos((24 * Math.PI) / 180);
export const SUN_BASE_GLARE_CAP_R = 0.62;
export const SUN_BASE_GLARE_CAP_G = 0.58;
export const SUN_BASE_GLARE_CAP_B = 0.54;
export const SUN_BASE_GLARE_HIGH_SUN_CAP_R = 0.62;
export const SUN_BASE_GLARE_HIGH_SUN_CAP_G = 0.74;
export const SUN_BASE_GLARE_HIGH_SUN_CAP_B = 0.92;
export const SUN_BASE_GLARE_HIGH_SUN_BLEND_START_Y = 0.70;
export const SUN_BASE_GLARE_HIGH_SUN_BLEND_FULL_Y = 0.90;

export const SUN_DISC_HDR_GAIN = 19000.0;

// Civil-twilight elevation band for the night-red fix.
// Sun↔moon blend interpolates over [-8°, -2°] elevation.
export const TWILIGHT_UPPER_RAD = (-2 * Math.PI) / 180;
export const TWILIGHT_LOWER_RAD = (-8 * Math.PI) / 180;

export const MOON_COLOR_R = 0.18;
export const MOON_COLOR_G = 0.20;
export const MOON_COLOR_B = 0.30;
