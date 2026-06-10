// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

/**
 * Per-scenario rig trims (Phase 3, cycle `cycle-2026-06-09-exposure-atmosphere-unify`).
 *
 * On the legacy (flag OFF) path each scenario shapes the look through the
 * Hosek backend's physical knobs (turbidity / rayleigh / groundAlbedo) and a
 * pre-output `preset.exposure` scalar — an ABSOLUTE color stack. That stack is
 * untouched here and stays the authority while the rig is OFF.
 *
 * On the rig (flag ON) path the physical baseline is already correct: the rig
 * reads the SAME uncompressed Hosek radiance terrain consumes, so a second
 * absolute color stack would fight it (the divergence the campaign is deleting).
 * Instead each scenario contributes a small set of BOUNDED trims — multipliers
 * over the physical baseline, not replacements — so the artistic intent
 * (warmer dawn, cooler dusk, a touch brighter noon) survives the unification
 * without re-introducing a competing authority.
 *
 * Every field is OPTIONAL and defaults to identity (tint = white, intensity =
 * 1). A preset with no `rigTrim` therefore renders the pure physical baseline
 * on the rig path. Multipliers are clamped into a narrow band (see
 * `RIG_TRIM_*`) so a typo cannot blow the scene out — a trim can nudge, never
 * dominate. The trim is the ONLY scenario-specific shaping on the rig path.
 */
export interface RigPresetTrim {
  /** Multiplier on the direct sun/moon radiance. White (1,1,1) = no change. */
  sunTint?: THREE.Color;
  /** Multiplier on the sky + ground irradiance. White = no change. */
  skyTint?: THREE.Color;
  /** Multiplier on the fog color. White = no change. */
  fogTint?: THREE.Color;
  /**
   * Scalar multiplier on the single scene-wide rig exposure for this scenario.
   * 1 = the physical baseline exposure curve. A scenario can sit a touch
   * brighter or dimmer than the curve without per-family compensation. Clamped
   * to `[RIG_TRIM_INTENSITY_MIN, RIG_TRIM_INTENSITY_MAX]`.
   */
  intensity?: number;
}

/**
 * Trim bounds. A trim is a nudge: a tint channel can swing between 70% and 140%
 * of baseline, the exposure intensity between 75% and 135%. Tight enough that a
 * preset can shape the mood but can never re-create the old absolute-stack
 * dominance — the rig physical baseline stays the load-bearing authority.
 */
export const RIG_TRIM_TINT_MIN = 0.7;
export const RIG_TRIM_TINT_MAX = 1.4;
export const RIG_TRIM_INTENSITY_MIN = 0.75;
export const RIG_TRIM_INTENSITY_MAX = 1.35;

function clampTintChannel(v: number): number {
  return THREE.MathUtils.clamp(v, RIG_TRIM_TINT_MIN, RIG_TRIM_TINT_MAX);
}

/** Clamp a tint color's channels into the trim band, writing into `out`. */
export function clampRigTint(tint: THREE.Color, out: THREE.Color): THREE.Color {
  out.setRGB(
    clampTintChannel(tint.r),
    clampTintChannel(tint.g),
    clampTintChannel(tint.b),
  );
  return out;
}

/** Clamp an intensity multiplier into the trim band. */
export function clampRigIntensity(intensity: number): number {
  return THREE.MathUtils.clamp(intensity, RIG_TRIM_INTENSITY_MIN, RIG_TRIM_INTENSITY_MAX);
}

/**
 * The rig terms a trim multiplies, all in linear radiance. The trim mutates
 * these in place (each `.multiply(...)` a bounded channel-wise multiply) and
 * returns the trimmed exposure. Pure; no allocation beyond the one scratch
 * color owned by this module.
 */
export interface RigTrimTargets {
  sunRadiance: THREE.Color;
  skyIrradiance: THREE.Color;
  groundIrradiance: THREE.Color;
  fogColor: THREE.Color;
}

const scratchTint = new THREE.Color();

/**
 * Apply a scenario's bounded trims to the rig terms + base exposure. Returns
 * the trimmed exposure (base × clamped intensity). When `trim` is undefined the
 * terms are left untouched and the base exposure is returned unchanged — the
 * pure physical baseline. The sky tint applies to BOTH the sky and ground
 * irradiance so the hemisphere fill stays internally consistent.
 */
export function applyRigPresetTrim(
  targets: RigTrimTargets,
  baseExposure: number,
  trim: RigPresetTrim | undefined,
): number {
  if (!trim) return baseExposure;

  if (trim.sunTint) {
    targets.sunRadiance.multiply(clampRigTint(trim.sunTint, scratchTint));
  }
  if (trim.skyTint) {
    clampRigTint(trim.skyTint, scratchTint);
    targets.skyIrradiance.multiply(scratchTint);
    targets.groundIrradiance.multiply(scratchTint);
  }
  if (trim.fogTint) {
    targets.fogColor.multiply(clampRigTint(trim.fogTint, scratchTint));
  }

  return trim.intensity !== undefined
    ? baseExposure * clampRigIntensity(trim.intensity)
    : baseExposure;
}
