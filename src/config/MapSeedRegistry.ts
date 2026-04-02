import { GameMode } from './gameModeTypes';

interface MapSeedVariant {
  seed: number;
  navmeshAsset: string;
  heightmapAsset: string;
}

/**
 * Registry of pre-baked map seed variants per mode.
 * Each variant has a navmesh + heightmap pair generated at build time.
 */
const SEED_VARIANTS: Record<string, MapSeedVariant[]> = {
  [GameMode.OPEN_FRONTIER]: [
    { seed: 42, navmeshAsset: '/data/navmesh/open_frontier-42.bin', heightmapAsset: '/data/heightmaps/open_frontier-42.f32' },
    { seed: 137, navmeshAsset: '/data/navmesh/open_frontier-137.bin', heightmapAsset: '/data/heightmaps/open_frontier-137.f32' },
    { seed: 2718, navmeshAsset: '/data/navmesh/open_frontier-2718.bin', heightmapAsset: '/data/heightmaps/open_frontier-2718.f32' },
    { seed: 31415, navmeshAsset: '/data/navmesh/open_frontier-31415.bin', heightmapAsset: '/data/heightmaps/open_frontier-31415.f32' },
    { seed: 65537, navmeshAsset: '/data/navmesh/open_frontier-65537.bin', heightmapAsset: '/data/heightmaps/open_frontier-65537.f32' },
  ],
  [GameMode.ZONE_CONTROL]: [
    { seed: 42, navmeshAsset: '/data/navmesh/zone_control-42.bin', heightmapAsset: '/data/heightmaps/zone_control-42.f32' },
    { seed: 137, navmeshAsset: '/data/navmesh/zone_control-137.bin', heightmapAsset: '/data/heightmaps/zone_control-137.f32' },
    { seed: 2718, navmeshAsset: '/data/navmesh/zone_control-2718.bin', heightmapAsset: '/data/heightmaps/zone_control-2718.f32' },
  ],
  [GameMode.TEAM_DEATHMATCH]: [
    { seed: 42, navmeshAsset: '/data/navmesh/tdm-42.bin', heightmapAsset: '/data/heightmaps/tdm-42.f32' },
    { seed: 137, navmeshAsset: '/data/navmesh/tdm-137.bin', heightmapAsset: '/data/heightmaps/tdm-137.f32' },
    { seed: 2718, navmeshAsset: '/data/navmesh/tdm-2718.bin', heightmapAsset: '/data/heightmaps/tdm-2718.f32' },
  ],
};

const LAST_SEED_KEY = 'titj_last_seed_';

/**
 * Get all registered variants for a mode.
 */
export function getMapVariants(mode: GameMode): MapSeedVariant[] {
  return SEED_VARIANTS[mode] ?? [];
}

/**
 * Pick a random pre-baked seed variant for a mode, avoiding the last-used seed.
 * Returns null if no variants are registered (e.g. A Shau uses DEM, AI sandbox is random).
 */
export function pickRandomVariant(mode: GameMode): MapSeedVariant | null {
  const variants = SEED_VARIANTS[mode];
  if (!variants || variants.length === 0) return null;
  if (variants.length === 1) return variants[0];

  // Avoid repeating the last seed
  let lastSeed: number | null = null;
  try {
    const stored = sessionStorage.getItem(LAST_SEED_KEY + mode);
    if (stored !== null) lastSeed = parseInt(stored, 10);
  } catch {
    // sessionStorage may be unavailable
  }

  const candidates = lastSeed !== null
    ? variants.filter(v => v.seed !== lastSeed)
    : variants;
  const pool = candidates.length > 0 ? candidates : variants;
  const picked = pool[Math.floor(Math.random() * pool.length)];

  try {
    sessionStorage.setItem(LAST_SEED_KEY + mode, String(picked.seed));
  } catch {
    // ignore
  }

  return picked;
}
