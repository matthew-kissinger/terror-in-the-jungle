/**
 * Engine-agnostic terrain foundation utilities.
 *
 * Provides height-range sampling and foundation depth computation for any
 * system that places flat structures on terrain (helipads, firebases,
 * airstrips, motor pools, etc.).
 *
 * These utilities are deliberately decoupled from TerrainSystem -- they accept
 * a plain `(x, z) => height` callback so they can be used by HelipadSystem,
 * WorldFeatureSystem, or any future placement system without importing
 * terrain internals.
 */

export interface TerrainHeightRange {
  min: number;
  max: number;
}

/**
 * Sample terrain heights within a circular footprint and return the min/max.
 *
 * Sampling pattern: center point + 3 concentric rings (16/32/48 samples)
 * + 2 axis cross-sections (9 samples each). Total: ~115 samples.
 * Matches the pattern used by HelipadSystem.findMaxTerrainHeight.
 */
export function sampleTerrainHeightRange(
  centerX: number,
  centerZ: number,
  radius: number,
  getHeight: (x: number, z: number) => number,
): TerrainHeightRange {
  let min = Infinity;
  let max = -Infinity;

  const sample = (x: number, z: number): void => {
    const h = getHeight(x, z);
    if (h < min) min = h;
    if (h > max) max = h;
  };

  // Center
  sample(centerX, centerZ);

  // 3 concentric rings
  const ringPointsBase = 16;
  for (let ring = 1; ring <= 3; ring++) {
    const ringRadius = (radius * ring) / 3;
    const pointsInRing = ringPointsBase * ring;
    for (let i = 0; i < pointsInRing; i++) {
      const angle = (i / pointsInRing) * Math.PI * 2;
      sample(
        centerX + Math.cos(angle) * ringRadius,
        centerZ + Math.sin(angle) * ringRadius,
      );
    }
  }

  // Axis cross-sections (X and Z)
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    sample(centerX + (t - 0.5) * radius * 2, centerZ);
    sample(centerX, centerZ + (t - 0.5) * radius * 2);
  }

  return { min, max };
}

/**
 * Compute the foundation depth needed to cover all terrain below a flat
 * platform.
 *
 * @param targetHeight  Height of the platform's top surface.
 * @param minTerrainHeight  Lowest terrain point within the footprint.
 * @param minDepth  Minimum depth even on flat terrain (default 0.6m).
 * @param margin  Extra depth below the lowest terrain point to prevent
 *                edge gaps from bilinear interpolation (default 1.0m).
 */
export function computeFoundationDepth(
  targetHeight: number,
  minTerrainHeight: number,
  minDepth = 0.6,
  margin = 1.0,
): number {
  const terrainGap = targetHeight - minTerrainHeight;
  return Math.max(minDepth, terrainGap + margin);
}
