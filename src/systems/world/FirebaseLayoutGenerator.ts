import * as THREE from 'three';
import type { StaticModelPlacementConfig } from '../../config/gameModeTypes';
import type { FirebaseTemplate, FirebaseStructureEntry } from './FirebaseTemplates';

// Minimum spacing per model category at world scale
const MIN_SPACING_TOWER = 10;
const MIN_SPACING_BUILDING = 8;
const MIN_SPACING_PROP = 3;

const CORNER_COUNT = 4;
const CORNER_ANGLES = [
  Math.PI * 0.25,  // NE
  Math.PI * 0.75,  // NW
  Math.PI * 1.25,  // SW
  Math.PI * 1.75,  // SE
];

/** Simple seeded PRNG (mulberry32) */
function createRng(seed: number): () => number {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash;
}

function getMinSpacing(modelPath: string): number {
  if (modelPath.includes('guard-tower') || modelPath.includes('comms-tower') || modelPath.includes('water-tower')) {
    return MIN_SPACING_TOWER;
  }
  if (modelPath.includes('fuel-drum') || modelPath.includes('supply-crate') || modelPath.includes('ammo-crate')) {
    return MIN_SPACING_PROP;
  }
  return MIN_SPACING_BUILDING;
}

function weightedSelect(entries: FirebaseStructureEntry[], rng: () => number): FirebaseStructureEntry {
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  let r = rng() * totalWeight;
  for (const entry of entries) {
    r -= entry.weight;
    if (r <= 0) return entry;
  }
  return entries[entries.length - 1];
}

function isSpacingValid(
  x: number,
  z: number,
  minSpacing: number,
  placed: Array<{ x: number; z: number; spacing: number }>,
): boolean {
  for (const p of placed) {
    const dx = x - p.x;
    const dz = z - p.z;
    const minDist = Math.max(minSpacing, p.spacing);
    if (dx * dx + dz * dz < minDist * minDist) return false;
  }
  return true;
}

export function generateFirebaseLayout(
  template: FirebaseTemplate,
  center: THREE.Vector3,
  rotation: number,
  seedHint?: string,
): StaticModelPlacementConfig[] {
  const seed =
    hashString(seedHint ?? template.id) +
    Math.round(center.x * 100) +
    Math.round(center.z * 100);
  const rng = createRng(seed);

  const targetCount =
    template.structureCount.min +
    Math.floor(rng() * (template.structureCount.max - template.structureCount.min + 1));

  const placements: StaticModelPlacementConfig[] = [];
  const placed: Array<{ x: number; z: number; spacing: number }> = [];

  // Phase 1: Place corner structures (guard towers at cardinal-ish positions)
  const cornerPool = template.pool.filter(e => e.zone === 'corner');
  if (cornerPool.length > 0) {
    for (let i = 0; i < CORNER_COUNT; i++) {
      const entry = weightedSelect(cornerPool, rng);
      const angle = CORNER_ANGLES[i] + rotation;
      const radius =
        template.zones.perimeter.innerRadius +
        rng() * (template.zones.perimeter.outerRadius - template.zones.perimeter.innerRadius);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const spacing = getMinSpacing(entry.modelPath);

      if (isSpacingValid(x, z, spacing, placed)) {
        const yaw = entry.facesOutward ? angle + Math.PI : rng() * Math.PI * 2;
        placements.push({
          id: `corner_${i}`,
          modelPath: entry.modelPath,
          offset: new THREE.Vector3(x, 0, z),
          yaw,
          registerCollision: entry.registerCollision,
        });
        placed.push({ x, z, spacing });
      }
    }
  }

  // Phase 2: Place entrance structures
  const entrancePool = template.pool.filter(e => e.zone === 'entrance');
  for (const entry of entrancePool) {
    const angle = template.zones.entrance.angle + rotation;
    const radius = template.zones.perimeter.outerRadius;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const spacing = getMinSpacing(entry.modelPath);

    if (isSpacingValid(x, z, spacing, placed)) {
      placements.push({
        id: `entrance_${placements.length}`,
        modelPath: entry.modelPath,
        offset: new THREE.Vector3(x, 0, z),
        yaw: angle,
        registerCollision: entry.registerCollision,
      });
      placed.push({ x, z, spacing });
    }
  }

  // Phase 3: Fill remaining with interior and perimeter structures
  const fillPool = template.pool.filter(e => e.zone === 'interior' || e.zone === 'perimeter');
  const maxAttempts = targetCount * 10;
  let attempts = 0;

  while (placements.length < targetCount && attempts < maxAttempts) {
    attempts++;
    const entry = weightedSelect(fillPool, rng);
    const spacing = getMinSpacing(entry.modelPath);

    let x: number, z: number;
    if (entry.zone === 'perimeter') {
      const angle = rng() * Math.PI * 2;
      const radius =
        template.zones.perimeter.innerRadius +
        rng() * (template.zones.perimeter.outerRadius - template.zones.perimeter.innerRadius);
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
    } else {
      // Interior: random within interior radius
      const angle = rng() * Math.PI * 2;
      const radius = rng() * template.zones.interior.radius;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
    }

    if (!isSpacingValid(x, z, spacing, placed)) continue;

    const yaw = entry.facesOutward
      ? Math.atan2(z, x) + Math.PI
      : rng() * Math.PI * 2;

    placements.push({
      id: `fill_${placements.length}`,
      modelPath: entry.modelPath,
      offset: new THREE.Vector3(x, 0, z),
      yaw,
      registerCollision: entry.registerCollision,
    });
    placed.push({ x, z, spacing });
  }

  return placements;
}
