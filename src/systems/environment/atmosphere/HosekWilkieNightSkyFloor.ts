// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export const NIGHT_SKY_FLOOR_DAY_GAIN = 0.1;
export const NIGHT_SKY_FLOOR_NIGHT_GAIN = 4.2;
export const NIGHT_SKY_FLOOR_BLEND_START_Y = 0.08;
export const NIGHT_SKY_FLOOR_BLEND_FULL_Y = -0.12;

export function nightSkyFloorBlendForSunY(sunY: number): number {
  const clampedSunY = Math.max(-1, Math.min(1, sunY));
  const t = Math.max(
    0,
    Math.min(
      1,
      (clampedSunY - NIGHT_SKY_FLOOR_BLEND_FULL_Y) /
        Math.max(1e-9, NIGHT_SKY_FLOOR_BLEND_START_Y - NIGHT_SKY_FLOOR_BLEND_FULL_Y),
    ),
  );
  return 1 - t * t * (3 - 2 * t);
}
