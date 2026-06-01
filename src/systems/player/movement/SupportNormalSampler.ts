import * as THREE from 'three';
import { computeSmoothedSupportNormal } from '../../terrain/GameplaySurfaceSampling';

// Support-sampling footprint tuning. Mirrors the values that lived in
// PlayerMovement before the split — do not change without re-verifying the
// uphill-responsiveness and steep-terrain regression tests.
export const PLAYER_SUPPORT_SAMPLE_DISTANCE = 1.35;
export const PLAYER_SUPPORT_FOOTPRINT_RADIUS = 0.8;
export const PLAYER_SUPPORT_LOOKAHEAD = 0.95;
export const PLAYER_SUPPORT_NORMAL_SMOOTHING = 0.35;

export interface SampleSupportNormalParams {
  /** Terrain height sampler (PlayerMovement.sampleTerrainHeight, bound). */
  sampleHeight: (x: number, z: number) => number;
  x: number;
  z: number;
  moveX: number;
  moveZ: number;
  /** Output target written to and returned (the support normal). */
  target: THREE.Vector3;
  /** Reusable scratch holding the raw footprint-sampled normal. */
  sampledScratch: THREE.Vector3;
  /** Whether the player is grounded (gates the temporal smoothing). */
  grounded: boolean;
  /** When true, blend toward the sampled normal; when false, copy it. */
  smooth: boolean;
}

/**
 * Compute the smoothed support normal under the player footprint. Extracted
 * verbatim from `PlayerMovement.sampleSupportNormal`; the sampling footprint,
 * grounded gate, and smoothing lerp are unchanged so the per-frame normal and
 * determinism are preserved.
 */
export function sampleSupportNormal({
  sampleHeight,
  x,
  z,
  moveX,
  moveZ,
  target,
  sampledScratch,
  grounded,
  smooth,
}: SampleSupportNormalParams): THREE.Vector3 {
  computeSmoothedSupportNormal(
    sampleHeight,
    x,
    z,
    sampledScratch,
    {
      sampleDistance: PLAYER_SUPPORT_SAMPLE_DISTANCE,
      footprintRadius: PLAYER_SUPPORT_FOOTPRINT_RADIUS,
      lookaheadDistance: PLAYER_SUPPORT_LOOKAHEAD,
      moveX,
      moveZ,
    },
  );

  if (!grounded) {
    return target.copy(sampledScratch);
  }

  if (!smooth) {
    return target.copy(sampledScratch);
  }

  return target
    .lerp(sampledScratch, PLAYER_SUPPORT_NORMAL_SMOOTHING)
    .normalize();
}
