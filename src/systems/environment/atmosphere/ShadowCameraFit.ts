// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Elevation-aware fit for the game's ONE directional shadow map
 * (`shadow-single-map-truth`).
 *
 * The single ortho shadow camera follows the player and is oriented by the sun
 * direction each frame (see `AtmosphereSystem.applyToRenderer`). The legacy fit
 * used a FIXED ortho box (±70/100m footprint) with `far = 300`, but the light
 * sits `SUN_LIGHT_DISTANCE` (500m) away along the sun direction — so the ground
 * beneath the player was BEYOND the far plane and, worse, at grazing sun angles
 * the depth column the footprint projects onto stretches without bound, crushing
 * depth precision into acne or blanking the map. This module computes the ortho
 * near/far and slope-scaled bias from the live sun elevation so dawn/dusk shadows
 * stay stable instead of degenerating.
 *
 * Pure math, no THREE import — the caller (AtmosphereSystem) reads the returned
 * scalars onto `moonLight.shadow.camera`/`.shadow`. Shared so a parity test can
 * pin the behavior and both renderer paths (WebGPU + WebGL2 fallback) see the
 * same numbers (the shadow depth pass is renderer-agnostic in three.js — this
 * fit feeds the DirectionalLightShadow the same way for both backends).
 */

/**
 * Minimum sun-elevation sine used when fitting the depth column. Below this the
 * light is treated as if grazing at a fixed shallow angle so the far plane stays
 * bounded (a truly horizontal light would need an infinite depth column). At
 * `sin = 0.12` the sun is ~7deg above the horizon — a believable dawn/dusk floor
 * that keeps the depth range finite while still lengthening shadows.
 */
export const SHADOW_FIT_MIN_ELEVATION_SIN = 0.12;

/**
 * Hard cap on how far the depth column is allowed to stretch at low sun, as a
 * multiple of the light distance. Without this a shallow sun would push `far`
 * arbitrarily large and re-crush precision — the very failure we are fixing.
 * 2.4x keeps the far plane within ~1200m for the 500m light distance.
 */
export const SHADOW_FIT_MAX_DEPTH_MULTIPLE = 2.4;

/**
 * Base shadow bias (constant depth offset) at a HIGH sun, before slope scaling.
 * Kept tiny and negative per three.js convention (pull the caster slightly
 * toward the light to hide self-shadow acne without visible peter-panning).
 */
const SHADOW_FIT_BASE_BIAS = -0.00015;

/**
 * Additional bias added as the sun approaches the horizon. At grazing angles a
 * texel spans much more world depth, so a larger constant offset is needed to
 * clear acne. Scaled by `(1 - elevationSin)` so it vanishes at zenith.
 */
const SHADOW_FIT_GRAZE_BIAS = -0.0006;

/**
 * `normalBias` pushes the sample point along the surface normal, which is the
 * right lever for acne on sloped ground under a low sun. Scaled up modestly for
 * lower-resolution shadow maps (a 512 texel covers more world than a 2048 texel).
 */
const SHADOW_FIT_BASE_NORMAL_BIAS = 0.6;

/** Reference shadow-map size the normalBias scale is calibrated against. */
const SHADOW_FIT_REFERENCE_MAP_SIZE = 2048;

interface ShadowCameraFitParams {
  /**
   * Horizontal half-extent (metres) of the ground footprint the map must cover.
   * This is the existing ±70/100m ortho half-size and stays the ortho box width.
   */
  groundHalfExtent: number;
  /**
   * Sine of the sun altitude, i.e. the sun-direction Y component. Values <= 0
   * (sun at/below horizon) are floored to {@link SHADOW_FIT_MIN_ELEVATION_SIN}.
   */
  sunElevationSin: number;
  /** Distance (metres) the directional light is placed from the follow target. */
  lightDistance: number;
  /** Active shadow-map size in texels (512 / 1024 / 2048). */
  mapSize: number;
}

export interface ShadowCameraFit {
  /** Ortho half-extent (left/right/top/bottom magnitude) in metres. */
  halfExtent: number;
  /** Near plane distance along the light axis. */
  near: number;
  /** Far plane distance along the light axis. */
  far: number;
  /** `DirectionalLightShadow.bias` (constant depth offset). */
  bias: number;
  /** `DirectionalLightShadow.normalBias` (offset along surface normal). */
  normalBias: number;
  /** Effective elevation sine actually used (post-floor) — exposed for debug. */
  effectiveElevationSin: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Compute the elevation-aware ortho frustum + bias for the single shadow map.
 *
 * Contract (the behavior tests pin, NOT the exact constants):
 *  - The depth column [near, far] always straddles `lightDistance` so the ground
 *    beneath the follow target is inside the frustum at every sun elevation.
 *  - `far` grows as the sun lowers (the footprint projects onto a longer column)
 *    but is capped at `lightDistance * SHADOW_FIT_MAX_DEPTH_MULTIPLE`.
 *  - `near` never goes non-positive.
 *  - Bias magnitude grows toward the horizon and shrinks toward zenith.
 */
export function computeShadowCameraFit(params: ShadowCameraFitParams): ShadowCameraFit {
  const { groundHalfExtent, lightDistance, mapSize } = params;

  const effectiveElevationSin = Math.max(
    SHADOW_FIT_MIN_ELEVATION_SIN,
    // A sun below the horizon still needs a valid (if unused) fit; floor it.
    Number.isFinite(params.sunElevationSin) ? params.sunElevationSin : 1,
  );

  // The ground footprint of radius R, viewed along a light whose altitude sine
  // is `e`, projects onto a depth half-column of ~ R / e along the light axis
  // (shallow light -> long column). Cap it so grazing sun cannot blow up `far`.
  const rawHalfDepth = groundHalfExtent / effectiveElevationSin;
  const maxHalfDepth = lightDistance * (SHADOW_FIT_MAX_DEPTH_MULTIPLE - 1);
  const halfDepth = Math.min(rawHalfDepth, maxHalfDepth);

  // Straddle the light distance so the target plane is always inside [near, far].
  const near = Math.max(0.5, lightDistance - halfDepth);
  const far = lightDistance + halfDepth;

  // Bias: base offset plus a graze term that fades to zero at zenith.
  const grazeFactor = 1 - effectiveElevationSin; // 0 at zenith, ~0.88 at floor
  const bias = SHADOW_FIT_BASE_BIAS + SHADOW_FIT_GRAZE_BIAS * grazeFactor;

  // normalBias scales with 1/mapSize (coarser maps need a larger push) and with
  // the graze factor (sloped ground under a low sun is the worst acne case).
  const mapScale = SHADOW_FIT_REFERENCE_MAP_SIZE / Math.max(1, mapSize);
  const normalBias = SHADOW_FIT_BASE_NORMAL_BIAS * mapScale * (1 + grazeFactor);

  return {
    halfExtent: groundHalfExtent,
    near,
    far,
    bias,
    normalBias,
    effectiveElevationSin: clamp(effectiveElevationSin, 0, 1),
  };
}
