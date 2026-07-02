// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Shared sun-elevation radiance gate (`sun-elevation-light-gating`).
 *
 * The lighting-rig core (LightingRig.ts) fed the Hosek backend's `getSun`
 * radiance to every consumer UNCONDITIONALLY — the backend crossfades to a dim
 * cool moon color below the horizon, but it never *died*, so a sun sitting
 * behind a ridge (or below the horizon entirely) still lit sun-facing slopes and
 * foliage. That is the owner "light goes through the terrain depending on where
 * the sun is" symptom.
 *
 * This module owns ONE curve: a smooth (smoothstep-band, no pop) multiplier on
 * the direct-sun radiance keyed purely on sun elevation. It is applied at the
 * RIG level (`deriveLightingRigState`), so every rig consumer — terrain PBR
 * scene lights, foliage billboards, static impostors, NPC sprites — inherits the
 * IDENTICAL rolloff by construction rather than each re-deriving its own low-sun
 * response.
 *
 * Physical shape:
 *  - At and below the geometric horizon (elevation <= 0) the direct sun term is
 *    fully gated to 0. Direct sunlight cannot reach a surface from below the
 *    horizon; the night floor (`ambientRadiance`) keeps the scene readable.
 *  - Through the civil-twilight band just above the horizon the gate rolls in
 *    smoothly to full strength, so dawn/dusk keep a believable grazing warmth
 *    (reddened by the Hosek backend's own sun color — this gate MULTIPLIES, it
 *    never re-tints) that fades to zero as the sun sets rather than snapping off.
 *
 * The gate is a scalar in [0, 1]; the caller multiplies the linear sun radiance
 * by it. Because it is elevation-only and monotonic, it composes cleanly with
 * the exposure curve and the scenario trim without fighting either.
 */

/**
 * Geometric horizon, in radians of sun elevation. At or below this the direct
 * sun term is fully gated off. Exactly 0 == the true horizon (sun direction's up
 * component crosses zero), matching where `deriveLightingRigState` fades the
 * night ambient floor IN.
 */
export const SUN_GATE_HORIZON_RAD = 0.0;

/**
 * Elevation (radians) at which the gate reaches full strength (1.0). Between
 * {@link SUN_GATE_HORIZON_RAD} and this the gate rolls in over the civil-twilight
 * band (~0 .. ~5.7deg). Chosen so a sun clearing a ridge regains full direct
 * energy plausibly quickly while a setting sun fades out smoothly rather than
 * popping. Kept modest so the daytime look above the band is byte-identical to
 * the ungated behavior (gate == 1 for any sun meaningfully above the horizon).
 */
export const SUN_GATE_FULL_RAD = 0.1;

/**
 * Smooth Hermite step (matches THREE.MathUtils.smoothstep / TSL `smoothstep`):
 * 0 for `x <= edge0`, 1 for `x >= edge1`, smooth cubic in between. Duplicated
 * here (rather than importing THREE) so this stays a zero-dependency pure module
 * a fast L1 test can exercise, and so the CPU mirror matches the shader
 * `smoothstep` exactly.
 */
function sunGateSmoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Elevation-gate multiplier for the direct sun radiance, in [0, 1].
 *
 * - `elevationRad <= SUN_GATE_HORIZON_RAD` -> 0 (sun at/below horizon: no direct light).
 * - `elevationRad >= SUN_GATE_FULL_RAD`    -> 1 (sun clear of the horizon band: full direct light).
 * - Between: a smooth, monotonically increasing rolloff (no pop).
 *
 * Elevation-only by design: the same value applies to every material family so
 * they share one low-sun curve. The backend's own dawn reddening is untouched —
 * this only scales magnitude.
 *
 * @param elevationRad sun elevation in radians (`asin(sunDirection.y)`).
 */
export function sunElevationGate(elevationRad: number): number {
  return sunGateSmoothstep(SUN_GATE_HORIZON_RAD, SUN_GATE_FULL_RAD, elevationRad);
}

/**
 * Card-normal low-sun fade — the companion curve to {@link sunElevationGate} for
 * the camera-facing card families (foliage billboards, static-impostor foliage,
 * NPC sprites). Keyed on `sunDirection.y` (== `sin` of elevation), it lives in
 * this shared module so the card families and terrain read ONE coordinated
 * low-sun source instead of each maintaining a private band (previously
 * `RIG_LOW_SUN_FADE_*` on BillboardNodeMaterial, copied by import into the other
 * two families).
 *
 * ## Why a second, supplemental curve
 *
 * {@link sunElevationGate} already kills the direct sun radiance at/below the
 * horizon for EVERY family, so terrain and cards die together there. But a card
 * has no true sloped normal and no horizon ray-march: its up-biased `(0,1,0)`
 * normal OVER-catches a low warm sun that terrain's real geometry + horizon
 * occlusion naturally reject (Phase 1 measured 17h foliage 0.180 vs terrain
 * 0.054). Above the gate band the sun radiance is back at full strength, so
 * without this the card overshoot returns. This fade mirrors terrain's own
 * grazing-sun suppression over the SAME `sunDirection.y` band terrain's horizon
 * occlusion uses, so cards track terrain instead of overshooting it. A floor
 * keeps a residual dusk contribution so cards do not crash below terrain.
 *
 * The two curves compose: `directCardSun = gatedRadiance * diff * cardLowSunFade`.
 * Terrain gets `gatedRadiance` + horizon-occlusion color darkening. Both share
 * the gate; the fade is the card-only geometry correction.
 */
export const SUN_CARD_FADE_LO = 0.22;
export const SUN_CARD_FADE_HI = 0.52;
export const SUN_CARD_FADE_FLOOR = 0.35;

/**
 * Card low-sun fade multiplier at sun height `sunDirectionY` (== sin elevation),
 * in `[SUN_CARD_FADE_FLOOR, 1]`. Full (1) with a high sun, easing to the floor as
 * the sun nears the horizon. The CPU mirror of the shader expression the card
 * materials build with TSL `smoothstep`; exported for the L1 curve test.
 */
export function sunCardLowSunFade(sunDirectionY: number): number {
  return SUN_CARD_FADE_FLOOR
    + (1 - SUN_CARD_FADE_FLOOR) * sunGateSmoothstep(SUN_CARD_FADE_LO, SUN_CARD_FADE_HI, sunDirectionY);
}
