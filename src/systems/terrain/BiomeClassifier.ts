import { BiomeClassificationRule } from '../../config/biomes';

/**
 * Classifies a terrain position into a biome ID based on elevation and slope.
 * Rules are sorted by priority (highest wins). A position must satisfy all
 * constraints in a rule (elevation range, slope limit) to match.
 */
export function classifyBiome(
  elevation: number,
  slopeDeg: number,
  rules: BiomeClassificationRule[] | undefined,
  defaultBiomeId: string
): string {
  if (!rules || rules.length === 0) return defaultBiomeId;

  let bestId = defaultBiomeId;
  let bestPriority = -Infinity;

  for (const rule of rules) {
    if (rule.priority <= bestPriority) continue;
    if (rule.elevationMin !== undefined && elevation < rule.elevationMin) continue;
    if (rule.elevationMax !== undefined && elevation > rule.elevationMax) continue;
    if (rule.slopeMax !== undefined && slopeDeg > rule.slopeMax) continue;
    bestId = rule.biomeId;
    bestPriority = rule.priority;
  }

  return bestId;
}

/**
 * Compute slope in degrees from a height sampling function.
 * Samples 4 neighbours around (cx, cz) at the given distance.
 */
export function computeSlopeDeg(
  cx: number,
  cz: number,
  sampleDist: number,
  getHeight: (x: number, z: number) => number
): number {
  const hE = getHeight(cx + sampleDist, cz);
  const hW = getHeight(cx - sampleDist, cz);
  const hN = getHeight(cx, cz - sampleDist);
  const hS = getHeight(cx, cz + sampleDist);

  const dx = (hE - hW) / (2 * sampleDist);
  const dz = (hS - hN) / (2 * sampleDist);

  return Math.atan(Math.sqrt(dx * dx + dz * dz)) * (180 / Math.PI);
}
