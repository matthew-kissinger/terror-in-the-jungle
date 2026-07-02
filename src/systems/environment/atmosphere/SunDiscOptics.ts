// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Shared physically-motivated optics constants + CPU mirrors for the rebuilt
 * sun disc (`sun-disc-scorch-rebuild`). Exported so the TSL (WebGPU), GLSL
 * (WebGL2), and CPU-fallback paths draw the SAME numbers and a parity test can
 * assert they stay in sync — the repo convention established by
 * {@link SUN_DISC_SINE_FREQ} for the band-limited surface terms.
 *
 * Two effects live here:
 *  - Limb darkening: the standard cos-theta approximation `I(r) = 1 - u(1 - mu)`
 *    with `mu = sqrt(1 - r^2)`, giving a body that is bright at center and dims
 *    toward the limb like a real solar photosphere instead of a flat lobe.
 *  - Forward-scatter halo: a small additive glow immediately around the body
 *    edge. Kept deliberately tight — the sky dome owns the WIDE glow, this disc
 *    owns only the hot body and its immediate scatter ring.
 */

/**
 * Limb-darkening coefficient `u`. `u = 0` is a flat disc; `u -> 1` fully darkens
 * the limb to zero. ~0.6 matches the broadband solar value and reads as a body
 * with volume without hollowing the edge.
 */
export const SUN_DISC_LIMB_U = 0.6;

/**
 * Radius (in body-radius units, i.e. `r/bodyRadius`) beyond the body edge where
 * the forward-scatter halo has fully faded. 1.0 = body edge, so the halo lives
 * in the annulus `1.0 .. HALO_OUTER_R`. Kept small: the dome owns the wide glow.
 */
export const SUN_DISC_HALO_OUTER_R = 1.85;

/** Peak additive strength of the halo at the body edge (before elevation/turbidity scaling). */
export const SUN_DISC_HALO_STRENGTH = 0.34;

/**
 * Limb-darkening intensity at normalized body radius `r` in [0, 1].
 * `I(0) = 1` (bright center), `I(1) = 1 - u` (dimmed limb), monotonically
 * decreasing across the body. Values of `r > 1` (outside the body) clamp to the
 * limb value; `r < 0` is treated as 0.
 *
 * @param r  radius normalized to the body edge (`geometricRadius / bodyRadius`).
 * @param u  limb coefficient (defaults to {@link SUN_DISC_LIMB_U}).
 */
export function limbDarkening(r: number, u: number = SUN_DISC_LIMB_U): number {
  const rc = Math.max(0, Math.min(1, r));
  const mu = Math.sqrt(Math.max(0, 1 - rc * rc));
  return 1 - u * (1 - mu);
}

/**
 * Forward-scatter halo strength at normalized body radius `r`. Zero inside the
 * body (`r <= 1`, where the body itself is drawn) and outside the halo annulus
 * (`r >= HALO_OUTER_R`); peaks just outside the body edge and falls off smoothly.
 * Returned strength is the pre-scale value; the shader multiplies it by an
 * elevation/turbidity plausibility factor and adds it to the body.
 *
 * @param r        radius normalized to the body edge.
 * @param outerR   outer halo radius (defaults to {@link SUN_DISC_HALO_OUTER_R}).
 * @param strength peak halo strength (defaults to {@link SUN_DISC_HALO_STRENGTH}).
 */
export function scatterHalo(
  r: number,
  outerR: number = SUN_DISC_HALO_OUTER_R,
  strength: number = SUN_DISC_HALO_STRENGTH,
): number {
  if (r <= 1 || r >= outerR) return 0;
  // Normalized position across the annulus, 0 at body edge -> 1 at outer edge.
  const t = (r - 1) / Math.max(1e-4, outerR - 1);
  // Smooth 1->0 falloff from the body edge outward (inverse-square-ish tail).
  const falloff = (1 - t) * (1 - t);
  return strength * falloff;
}
