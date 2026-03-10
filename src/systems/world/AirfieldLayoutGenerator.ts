import * as THREE from 'three';
import type { StaticModelPlacementConfig } from '../../config/gameModeTypes';
import type { RectTerrainSurfacePatch } from '../terrain/TerrainFeatureTypes';
import type { AirfieldTemplate, AirfieldStructureEntry } from './AirfieldTemplates';

const MIN_SPACING = 6;

interface AirfieldLayout {
  placements: StaticModelPlacementConfig[];
  surfacePatches: RectTerrainSurfacePatch[];
}

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

function weightedSelect(entries: AirfieldStructureEntry[], rng: () => number): AirfieldStructureEntry {
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
  placed: Array<{ x: number; z: number }>,
): boolean {
  for (const p of placed) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < minSpacing * minSpacing) return false;
  }
  return true;
}

export function generateAirfieldLayout(
  template: AirfieldTemplate,
  center: THREE.Vector3,
  heading: number,
  seedHint?: string,
): AirfieldLayout {
  const seed =
    hashString(seedHint ?? template.id) +
    Math.round(center.x * 100) +
    Math.round(center.z * 100);
  const rng = createRng(seed);

  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);

  // Transform local offset (along runway / lateral) to world offset
  function toWorld(along: number, lateral: number): { x: number; z: number } {
    return {
      x: along * sinH + lateral * cosH,
      z: along * cosH - lateral * sinH,
    };
  }

  const surfacePatches: RectTerrainSurfacePatch[] = [];
  const placements: StaticModelPlacementConfig[] = [];
  const placed: Array<{ x: number; z: number }> = [];

  // 1. Runway surface patch
  surfacePatches.push({
    shape: 'rect',
    x: center.x,
    z: center.z,
    width: template.runwayWidth,
    length: template.runwayLength,
    blend: 3,
    yaw: heading,
    surface: 'runway',
    priority: 10,
  });

  // 2. Taxiway surface patch (perpendicular connector from runway to dispersal)
  const taxiwayCenter = toWorld(0, template.dispersalOffset * 0.5);
  surfacePatches.push({
    shape: 'rect',
    x: center.x + taxiwayCenter.x,
    z: center.z + taxiwayCenter.z,
    width: template.taxiwayWidth,
    length: template.dispersalOffset,
    blend: 2,
    yaw: heading + Math.PI / 2,
    surface: 'packed_earth',
    priority: 8,
  });

  // 3. Aircraft parking spots
  for (let i = 0; i < template.parkingSpots.length; i++) {
    const spot = template.parkingSpots[i];
    const along = (spot.offsetAlongRunway - 0.5) * template.runwayLength;
    const lateral = spot.offsetLateral;
    const worldOff = toWorld(along, lateral);

    placements.push({
      id: `parking_${i}`,
      modelPath: spot.modelPath,
      offset: new THREE.Vector3(worldOff.x, 0, worldOff.z),
      yaw: heading,
      registerCollision: true,
    });
    placed.push(worldOff);
  }

  // 4. Fill structures from template pool
  const targetCount =
    template.structureCount.min +
    Math.floor(rng() * (template.structureCount.max - template.structureCount.min + 1));

  const maxAttempts = targetCount * 10;
  let attempts = 0;

  while (placements.length < targetCount + template.parkingSpots.length && attempts < maxAttempts) {
    attempts++;
    const entry = weightedSelect(template.pool, rng);

    let along: number;
    let lateral: number;

    switch (entry.zone) {
      case 'runway_side':
        along = (rng() - 0.5) * template.runwayLength * 0.8;
        lateral = (template.runwayWidth * 0.5 + 5 + rng() * 15) * (rng() > 0.5 ? 1 : -1);
        break;
      case 'dispersal':
        along = (rng() - 0.5) * template.runwayLength * 0.6;
        lateral = template.dispersalOffset + rng() * 15;
        break;
      case 'perimeter': {
        const perimDist = Math.max(template.runwayLength * 0.5, template.dispersalOffset + 20);
        const angle = rng() * Math.PI * 2;
        along = Math.cos(angle) * perimDist;
        lateral = Math.sin(angle) * perimDist;
        break;
      }
      default: // parking zone handled above
        continue;
    }

    const worldOff = toWorld(along, lateral);

    if (!isSpacingValid(worldOff.x, worldOff.z, MIN_SPACING, placed)) continue;

    placements.push({
      id: `struct_${placements.length}`,
      modelPath: entry.modelPath,
      offset: new THREE.Vector3(worldOff.x, 0, worldOff.z),
      yaw: heading + (rng() - 0.5) * 0.3,
      registerCollision: entry.registerCollision,
    });
    placed.push(worldOff);
  }

  return { placements, surfacePatches };
}
