// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Shared visual-margin "collar" extrapolation for finite maps.
 *
 * Beyond the playable square a finite map has no authored terrain, so the
 * render-only collar continues the playable edge outward. The ORIGINAL
 * implementation linearly extrapolated the playable-edge slope across the FULL
 * collar (`slope * outwardDistance`, up to ~900-1600m, capped at a far-too-loose
 * +/-320m). With ordinary slopes that bakes single-texel terrain TOWERS up to
 * ~260m into the collar grid: an ~0.49 m/m edge slope x ~505m outward = +248m,
 * and adjacent collar texels (sampling slightly different edge slopes)
 * extrapolate to wildly different heights, producing thin isolated spires. That
 * is the root cause of the recurring "terrain spike" reports (2026-06-30
 * investigation); earlier "spike fixes" mis-targeted impostor cards / DEM scans
 * and never touched this math.
 *
 * This module is the SINGLE source of truth for the collar math, imported by all
 * three bake paths (main-thread {@link VisualExtentHeightProvider}, the terrain
 * worker, and the prepared-visual worker bake) so the logic can never silently
 * drift across byte-identical copies again. Two independent guarantees keep the
 * collar tower-free:
 *   1. SATURATING falloff: an edge slope only influences the collar within
 *      ~{@link SLOPE_FALLOFF_METERS} of outward distance and then levels off,
 *      instead of growing without bound.
 *   2. ENVELOPE clamp: the final collar height can never exceed the real
 *      playable terrain's height range by more than {@link ENVELOPE_PAD_METERS}.
 *
 * The DEM `sourceDelta` branch (real terrain beyond the playable edge) is
 * intentionally NOT routed through here and stays unclamped — it is real data,
 * not synthetic extrapolation.
 */

/** Inner span used to measure the playable-edge slope (clamped per map size). */
const EDGE_SLOPE_SAMPLE_MIN_METERS = 8;
const EDGE_SLOPE_SAMPLE_MAX_METERS = 64;
/** Outward distance at which an edge slope's collar influence saturates. Long
 *  enough that the near collar rolls naturally before flattening toward the
 *  envelope-clamped far horizon. */
const SLOPE_FALLOFF_METERS = 80;
/** Collar may exceed the playable height range by at most this (keeps the far
 *  horizon from reading dead-flat while still forbidding towers). */
const ENVELOPE_PAD_METERS = 24;
/** Hard safety cap on the raw extrapolated delta (replaces the unbounded-linear 320). */
const MAX_COLLAR_DELTA_METERS = 96;
/** Resolution of the one-time playable-envelope scan (steps per axis). */
const ENVELOPE_SAMPLE_STEPS = 64;

export interface PlayableHeightEnvelope {
  readonly min: number;
  readonly max: number;
}

export type HeightSampler = (worldX: number, worldZ: number) => number;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Edge-slope influence that grows with outward distance but saturates at
 * {@link SLOPE_FALLOFF_METERS}, so a collar slope can never run away to a tower.
 */
function saturatingOutward(distance: number): number {
  if (distance <= 0) return 0;
  return SLOPE_FALLOFF_METERS * (1 - Math.exp(-distance / SLOPE_FALLOFF_METERS));
}

/**
 * Min/max base height over the playable square, sampled on a coarse grid.
 * Compute once per bake (it is the clamp envelope for every collar texel).
 */
export function computePlayableHeightEnvelope(
  sample: HeightSampler,
  halfPlayable: number,
  steps: number = ENVELOPE_SAMPLE_STEPS,
): PlayableHeightEnvelope {
  if (halfPlayable <= 0) {
    const h = sample(0, 0);
    return { min: h, max: h };
  }
  let min = Infinity;
  let max = -Infinity;
  const span = halfPlayable * 2;
  for (let i = 0; i <= steps; i++) {
    const z = -halfPlayable + (span * i) / steps;
    for (let j = 0; j <= steps; j++) {
      const x = -halfPlayable + (span * j) / steps;
      const h = sample(x, z);
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 0 };
  return { min, max };
}

const envelopeCache = new WeakMap<object, PlayableHeightEnvelope>();

/**
 * {@link computePlayableHeightEnvelope} memoized on a stable per-bake object
 * (e.g. the immutable height config), so a per-texel bake loop computes it once.
 */
export function playableHeightEnvelopeFor(
  key: object,
  sample: HeightSampler,
  halfPlayable: number,
): PlayableHeightEnvelope {
  let envelope = envelopeCache.get(key);
  if (!envelope) {
    envelope = computePlayableHeightEnvelope(sample, halfPlayable);
    envelopeCache.set(key, envelope);
  }
  return envelope;
}

/**
 * Final collar height at an out-of-playable point: the playable-edge height plus
 * a bounded, saturating edge-slope extrapolation, hard-clamped to the playable
 * height envelope (+/- {@link ENVELOPE_PAD_METERS}). Returns the (enveloped)
 * edge height for on-edge points.
 *
 * `clampedX/clampedZ` are `worldX/worldZ` clamped to the playable square; the
 * caller has already returned early for genuinely in-playable points.
 */
export function collarExtrapolatedHeight(
  sample: HeightSampler,
  worldX: number,
  worldZ: number,
  clampedX: number,
  clampedZ: number,
  halfPlayable: number,
  edgeBaseHeight: number,
  envelope: PlayableHeightEnvelope,
): number {
  const loBound = envelope.min - ENVELOPE_PAD_METERS;
  const hiBound = envelope.max + ENVELOPE_PAD_METERS;

  const outsideX = worldX - clampedX;
  const outsideZ = worldZ - clampedZ;
  if (outsideX === 0 && outsideZ === 0) {
    return clamp(edgeBaseHeight, loBound, hiBound);
  }

  const sampleStep = clamp(halfPlayable / 128, EDGE_SLOPE_SAMPLE_MIN_METERS, EDGE_SLOPE_SAMPLE_MAX_METERS);
  let delta = 0;
  let weight = 0;

  if (Math.abs(outsideX) > 0) {
    const signX = Math.sign(outsideX);
    const innerX = clamp(clampedX - signX * sampleStep, -halfPlayable, halfPlayable);
    const inwardDistance = Math.abs(clampedX - innerX);
    if (inwardDistance > 0) {
      const edge = sample(clampedX, clampedZ);
      const inner = sample(innerX, clampedZ);
      delta += ((edge - inner) / inwardDistance) * saturatingOutward(Math.abs(outsideX));
      weight++;
    }
  }

  if (Math.abs(outsideZ) > 0) {
    const signZ = Math.sign(outsideZ);
    const innerZ = clamp(clampedZ - signZ * sampleStep, -halfPlayable, halfPlayable);
    const inwardDistance = Math.abs(clampedZ - innerZ);
    if (inwardDistance > 0) {
      const edge = sample(clampedX, clampedZ);
      const inner = sample(clampedX, innerZ);
      delta += ((edge - inner) / inwardDistance) * saturatingOutward(Math.abs(outsideZ));
      weight++;
    }
  }

  if (weight === 0) {
    return clamp(edgeBaseHeight, loBound, hiBound);
  }

  const averagedDelta = clamp(delta / weight, -MAX_COLLAR_DELTA_METERS, MAX_COLLAR_DELTA_METERS);
  return clamp(edgeBaseHeight + averagedDelta, loBound, hiBound);
}
