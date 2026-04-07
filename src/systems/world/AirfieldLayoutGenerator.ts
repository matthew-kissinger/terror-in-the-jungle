import * as THREE from 'three';
import type { StaticModelPlacementConfig } from '../../config/gameModeTypes';
import type { RectTerrainSurfacePatch } from '../terrain/TerrainFeatureTypes';
import type {
  AirfieldTemplate,
  AirfieldStructureEntry,
  AirfieldSurfaceRect,
} from './AirfieldTemplates';

const DEFAULT_CLEARANCE_RADIUS = 6;

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
  radius: number,
  placed: Array<{ x: number; z: number; radius: number }>,
): boolean {
  for (const p of placed) {
    const dx = x - p.x;
    const dz = z - p.z;
    const minSpacing = radius + p.radius;
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

  function localOffset(along: number, lateral: number): THREE.Vector3 {
    return new THREE.Vector3(lateral, 0, along);
  }

  // Transform local offset (along runway / lateral) to world offset
  function toWorld(along: number, lateral: number): { x: number; z: number } {
    return {
      x: along * sinH + lateral * cosH,
      z: along * cosH - lateral * sinH,
    };
  }

  function pushSurfaceRect(rect: AirfieldSurfaceRect): void {
    const worldCenter = toWorld(rect.offsetAlongRunway, rect.offsetLateral);
    surfacePatches.push({
      shape: 'rect',
      x: center.x + worldCenter.x,
      z: center.z + worldCenter.z,
      width: rect.width,
      length: rect.length,
      blend: rect.blend,
      yaw: heading + (rect.yaw ?? 0),
      surface: rect.surface,
      priority: rect.surface === 'runway' ? 10 : 8,
    });
  }

  const surfacePatches: RectTerrainSurfacePatch[] = [];
  const placements: StaticModelPlacementConfig[] = [];
  const placed: Array<{ x: number; z: number; radius: number }> = [];

  // 1. Runway surface patch
  pushSurfaceRect({
    offsetAlongRunway: 0,
    offsetLateral: 0,
    width: template.runwayWidth,
    length: template.runwayLength,
    blend: 3,
    surface: 'runway',
  });

  // 2. Apron and taxiway surface patches
  for (const apron of template.aprons) {
    pushSurfaceRect(apron);
  }
  for (const taxiway of template.taxiways) {
    pushSurfaceRect(taxiway);
  }

  // 3. Aircraft parking spots
  for (let i = 0; i < template.parkingSpots.length; i++) {
    const spot = template.parkingSpots[i];
    const along = spot.offsetAlongRunway;
    const lateral = spot.offsetLateral;
    const localOff = localOffset(along, lateral);
    const clearanceRadius = Math.max(DEFAULT_CLEARANCE_RADIUS, spot.clearanceRadius ?? DEFAULT_CLEARANCE_RADIUS);

    placements.push({
      id: `parking_${i}`,
      modelPath: spot.modelPath,
      offset: localOff,
      yaw: spot.yaw ?? 0,
      registerCollision: true,
    });
    placed.push({ x: localOff.x, z: localOff.z, radius: clearanceRadius });
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
        lateral = (template.runwayWidth * 0.5 + 8 + rng() * 20) * (rng() > 0.5 ? 1 : -1);
        break;
      case 'dispersal':
        along = (rng() - 0.5) * template.runwayLength * 0.6;
        lateral = template.dispersalOffset + rng() * 18;
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

    const localOff = localOffset(along, lateral);
    const clearanceRadius = entry.registerCollision ? 9 : DEFAULT_CLEARANCE_RADIUS;

    if (!isSpacingValid(localOff.x, localOff.z, clearanceRadius, placed)) continue;

    placements.push({
      id: `struct_${placements.length}`,
      modelPath: entry.modelPath,
      offset: localOff,
      yaw: (rng() - 0.5) * 0.3,
      registerCollision: entry.registerCollision,
    });
    placed.push({ x: localOff.x, z: localOff.z, radius: clearanceRadius });
  }

  return { placements, surfacePatches };
}
