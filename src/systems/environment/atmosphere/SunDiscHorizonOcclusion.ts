// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * CPU terrain-horizon occlusion test for the sun disc.
 *
 * The additive disc sprite sits at the sky-dome radius, far beyond any real
 * terrain, so a depth test alone cannot reliably occlude it against distant
 * ridgelines — the body shines through hills at grazing sun angles. Instead of
 * a GPU depth readback, we march the terrain height query along the horizontal
 * projection of the camera->sun ray a handful of times, compute the largest
 * elevation angle any sampled ridge subtends from the eye, and fade the disc
 * opacity over a small angular band as the sun's own elevation angle drops
 * below that blocking horizon. This is O(samples) CPU work per frame, cached by
 * the caller; no GPU state, no allocation in the hot path.
 *
 * All functions here are pure so the fade math is L1-testable without a live
 * terrain or renderer.
 */

/** A terrain height sample expressed as a horizontal distance + terrain top height. */
export interface HorizonSample {
  /** Horizontal distance from the eye along the sun azimuth, world units. */
  distance: number;
  /** Terrain surface height at that sample point, world units. */
  terrainHeight: number;
}

/** Default sample distances (meters) marched outward along the sun azimuth. */
export const DEFAULT_HORIZON_SAMPLE_DISTANCES = [
  120, 260, 460, 740, 1150, 1750, 2600, 3800,
] as const;

/**
 * Angular width (radians) of the fade band. The disc is fully visible when the
 * sun sits this far ABOVE the blocking ridge angle and fully hidden once it
 * drops this far BELOW it, with a smoothstep in between. ~1.2° each side keeps
 * the hand-off soft (no hard pop) without a long ghost.
 */
export const HORIZON_FADE_BAND_RAD = 0.021;

/**
 * Largest terrain-blocking elevation angle (radians, measured up from the eye's
 * horizontal) across the sampled ridge line. A sample at eye height or below
 * contributes a non-positive angle; the max over all samples is the ridge the
 * sun must clear. Returns `-Infinity` when there are no samples so an empty
 * march never occludes.
 *
 * @param eyeHeight   world-space Y of the camera.
 * @param samples     terrain height samples marched outward along the sun azimuth.
 */
export function maxBlockingElevationAngle(eyeHeight: number, samples: readonly HorizonSample[]): number {
  let maxAngle = Number.NEGATIVE_INFINITY;
  for (const s of samples) {
    if (!(s.distance > 0)) continue;
    const rise = s.terrainHeight - eyeHeight;
    const angle = Math.atan2(rise, s.distance);
    if (angle > maxAngle) maxAngle = angle;
  }
  return maxAngle;
}

/**
 * Opacity multiplier in [0, 1] for the disc given the sun's own elevation angle
 * and the terrain's blocking angle. 1 when the sun sits a full fade-band above
 * the ridge (clear sky), 0 once it has sunk a full band below it (behind the
 * hill), smoothstepped across the band so the disc fades rather than pops.
 *
 * @param sunElevationRad   elevation angle of the sun above the eye horizontal.
 * @param blockingAngleRad  ridge angle from {@link maxBlockingElevationAngle}.
 * @param bandRad           half-width of the fade band (defaults to {@link HORIZON_FADE_BAND_RAD}).
 */
export function horizonOcclusionOpacity(
  sunElevationRad: number,
  blockingAngleRad: number,
  bandRad: number = HORIZON_FADE_BAND_RAD,
): number {
  if (!Number.isFinite(blockingAngleRad)) return 1;
  const band = Math.max(1e-4, bandRad);
  // above ridge by >= band -> 1; below ridge by >= band -> 0.
  const t = (sunElevationRad - (blockingAngleRad - band)) / (2 * band);
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Convenience: combined horizon-test. Given the eye height, the sun's elevation
 * angle, and the marched samples, returns the disc opacity multiplier. Pure —
 * the caller supplies already-sampled terrain heights so this stays testable
 * without a terrain runtime.
 */
export function computeHorizonOcclusion(
  eyeHeight: number,
  sunElevationRad: number,
  samples: readonly HorizonSample[],
  bandRad: number = HORIZON_FADE_BAND_RAD,
): number {
  const blocking = maxBlockingElevationAngle(eyeHeight, samples);
  return horizonOcclusionOpacity(sunElevationRad, blocking, bandRad);
}

/** Minimal terrain-height query surface the march needs (subset of ITerrainRuntime). */
export interface TerrainHeightQuery {
  getHeightAt(x: number, z: number): number;
  isTerrainReady?(): boolean;
  hasTerrainAt?(x: number, z: number): boolean;
}

/** Minimal vector-like shape (avoids a THREE import in this pure module). */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Drive the CPU horizon march against a live terrain-height query and return the
 * disc opacity multiplier (0..1). Marches {@link DEFAULT_HORIZON_SAMPLE_DISTANCES}
 * outward along the horizontal projection of the sun direction, reading terrain
 * heights, then reduces via the pure {@link computeHorizonOcclusion}.
 *
 * Returns 1 (no occlusion) when the terrain is not ready, the sun is at/below the
 * geometric horizon (handled by the disc's own `y < 0` hide), or the horizontal
 * sun direction is degenerate (sun near straight up — nothing can block it).
 * Reuses a scratch array so the per-frame call allocates nothing.
 */
export function sampleTerrainHorizonOcclusion(
  terrain: TerrainHeightQuery,
  camera: Vec3Like,
  sunDir: Vec3Like,
  scratch: HorizonSample[],
): number {
  if (sunDir.y <= 0) return 1;
  if (terrain.isTerrainReady && !terrain.isTerrainReady()) return 1;
  const horizLen = Math.hypot(sunDir.x, sunDir.z);
  if (horizLen < 1e-4) return 1; // sun near-vertical — no ridge can block it.
  const nx = sunDir.x / horizLen;
  const nz = sunDir.z / horizLen;
  const sunElevationRad = Math.atan2(sunDir.y, horizLen);

  scratch.length = 0;
  for (const dist of DEFAULT_HORIZON_SAMPLE_DISTANCES) {
    const sx = camera.x + nx * dist;
    const sz = camera.z + nz * dist;
    if (terrain.hasTerrainAt && !terrain.hasTerrainAt(sx, sz)) continue;
    const h = terrain.getHeightAt(sx, sz);
    if (!Number.isFinite(h)) continue;
    scratch.push({ distance: dist, terrainHeight: h });
  }
  return computeHorizonOcclusion(camera.y, sunElevationRad, scratch);
}
