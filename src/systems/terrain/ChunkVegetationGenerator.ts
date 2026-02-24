import * as THREE from 'three';
import { BillboardInstance } from '../../types';
import { MathUtils } from '../../utils/Math';
import { VegetationTypeConfig } from '../../config/vegetationTypes';
import { BiomeVegetationEntry } from '../../config/biomes';

const MAX_CANOPY_SLOPE = 30;
const MAX_MIDLEVEL_SLOPE = 40;
const SLOPE_SAMPLE_DIST = 2.0;
const TRUNK_SUPPRESS_RADIUS = 3.0;
const TRUNK_SUPPRESS_RADIUS_SQ = TRUNK_SUPPRESS_RADIUS * TRUNK_SUPPRESS_RADIUS;
const TRUNK_CELL_SIZE = TRUNK_SUPPRESS_RADIUS;

function slopeDeg(
  lx: number, lz: number, size: number,
  h: (x: number, z: number) => number,
): number {
  const hC = h(lx, lz);
  const hE = h(Math.min(size, lx + SLOPE_SAMPLE_DIST), lz);
  const hN = h(lx, Math.min(size, lz + SLOPE_SAMPLE_DIST));
  const dx = hE - hC;
  const dz = hN - hC;
  return Math.atan(Math.sqrt(dx * dx + dz * dz) / SLOPE_SAMPLE_DIST) * (180 / Math.PI);
}

/** Fast integer-hash density noise (no sin/cos). Returns 0..1. */
function densityNoise(wx: number, wz: number): number {
  let h = ((wx * 374761 | 0) ^ (wz * 668265 | 0)) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fff) / 0x7fff;
}

/** Spatial grid for O(1) trunk proximity checks instead of O(n) linear scan. */
class TrunkGrid {
  private cells = new Map<number, Array<{ x: number; z: number }>>();
  private gridSize: number;

  constructor(size: number) {
    this.gridSize = size;
  }

  private key(cx: number, cz: number): number {
    return (cx + 1000) * 10000 + (cz + 1000);
  }

  add(x: number, z: number): void {
    const cx = Math.floor(x / this.gridSize);
    const cz = Math.floor(z / this.gridSize);
    const k = this.key(cx, cz);
    let cell = this.cells.get(k);
    if (!cell) { cell = []; this.cells.set(k, cell); }
    cell.push({ x, z });
  }

  isNear(lx: number, lz: number): boolean {
    const cx = Math.floor(lx / this.gridSize);
    const cz = Math.floor(lz / this.gridSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = this.cells.get(this.key(cx + dx, cz + dz));
        if (!cell) continue;
        for (const t of cell) {
          const ddx = lx - t.x;
          const ddz = lz - t.z;
          if (ddx * ddx + ddz * ddz < TRUNK_SUPPRESS_RADIUS_SQ) return true;
        }
      }
    }
    return false;
  }
}

/**
 * Data-driven vegetation generator.
 * - Canopy trees share a poisson grid (no overlap) with slope rejection
 * - Mid-level poisson types share a separate grid (no overlap) with slope rejection
 * - Ground cover suppressed near tree/palm trunks
 * - All placement skips underwater (height < 0)
 * - Density modulated by low-frequency noise for natural patchiness
 */
export class ChunkVegetationGenerator {
  static generateVegetation(
    chunkX: number,
    chunkZ: number,
    size: number,
    getHeight: (localX: number, localZ: number) => number,
    vegetationTypes: VegetationTypeConfig[],
    biomePalette: BiomeVegetationEntry[],
  ): Map<string, BillboardInstance[]> {
    const baseX = chunkX * size;
    const baseZ = chunkZ * size;
    const DENSITY_PER_UNIT = 1.0 / 128.0;
    const result = new Map<string, BillboardInstance[]>();

    const densityMap = new Map<string, number>();
    for (const entry of biomePalette) {
      densityMap.set(entry.typeId, entry.densityMultiplier);
    }

    // Partition types
    const canopyTypes: VegetationTypeConfig[] = [];
    const midPoissonTypes: VegetationTypeConfig[] = [];
    const groundTypes: VegetationTypeConfig[] = [];

    for (const vt of vegetationTypes) {
      const d = densityMap.get(vt.id);
      if (d === undefined || d <= 0) continue;
      if (vt.tier === 'canopy') canopyTypes.push(vt);
      else if (vt.tier === 'midLevel' && vt.placement === 'poisson') midPoissonTypes.push(vt);
      else groundTypes.push(vt);
    }

    const trunkGrid = new TrunkGrid(TRUNK_CELL_SIZE);

    // ---- CANOPY: shared poisson grid, slope + water rejection ----
    if (canopyTypes.length > 0) {
      const minDist = Math.max(...canopyTypes.map(t => t.poissonMinDistance ?? 16));
      const points = MathUtils.poissonDiskSampling(size, size, minDist);

      const weights: { t: VegetationTypeConfig; w: number }[] = [];
      let total = 0;
      for (const ct of canopyTypes) {
        const w = ct.baseDensity * (densityMap.get(ct.id) ?? 0);
        weights.push({ t: ct, w });
        total += w;
      }

      let idx = 0;
      for (const { t: ct, w } of weights) {
        const share = total > 0 ? w / total : 0;
        const count = Math.floor(points.length * share);
        const instances: BillboardInstance[] = [];

        for (let i = 0; i < count && idx < points.length; i++, idx++) {
          const p = points[idx];
          const h = getHeight(p.x, p.y);
          if (h < 0) continue;
          if (slopeDeg(p.x, p.y, size, getHeight) > MAX_CANOPY_SLOPE) continue;
          const dn = densityNoise(baseX + p.x, baseZ + p.y);
          if (dn < 0.15) continue;
          const s = MathUtils.randomInRange(0.9, 1.1);
          instances.push({
            position: new THREE.Vector3(baseX + p.x, h + ct.yOffset, baseZ + p.y),
            scale: new THREE.Vector3(s, s, 1),
            rotation: 0,
          });
          trunkGrid.add(p.x, p.y);
        }
        if (instances.length > 0) result.set(ct.id, instances);
      }
    }

    // ---- MID-LEVEL POISSON: shared grid, moderate slope rejection ----
    if (midPoissonTypes.length > 0) {
      const minDist = Math.max(...midPoissonTypes.map(t => t.poissonMinDistance ?? 8));
      const points = MathUtils.poissonDiskSampling(size, size, minDist);

      const weights: { t: VegetationTypeConfig; w: number }[] = [];
      let total = 0;
      for (const mt of midPoissonTypes) {
        const w = mt.baseDensity * (densityMap.get(mt.id) ?? 0);
        weights.push({ t: mt, w });
        total += w;
      }

      let idx = 0;
      for (const { t: mt, w } of weights) {
        const share = total > 0 ? w / total : 0;
        const count = Math.floor(points.length * share);
        const instances: BillboardInstance[] = [];

        for (let i = 0; i < count && idx < points.length; i++, idx++) {
          const p = points[idx];
          const h = getHeight(p.x, p.y);
          if (h < 0) continue;
          if (slopeDeg(p.x, p.y, size, getHeight) > MAX_MIDLEVEL_SLOPE) continue;
          const dn = densityNoise(baseX + p.x, baseZ + p.y);
          if (dn < 0.1) continue;
          const s = MathUtils.randomInRange(0.9, 1.1);
          instances.push({
            position: new THREE.Vector3(baseX + p.x, h + mt.yOffset, baseZ + p.y),
            scale: new THREE.Vector3(s, s, 1),
            rotation: 0,
          });
          trunkGrid.add(p.x, p.y);
        }
        if (instances.length > 0) result.set(mt.id, instances);
      }
    }

    // ---- GROUND COVER + MID-LEVEL RANDOM: trunk suppression, water/slope check, density noise ----
    for (const vt of groundTypes) {
      const biomeDensity = densityMap.get(vt.id)!;
      const effectiveDensity = vt.baseDensity * biomeDensity;
      const instances: BillboardInstance[] = [];

      if (vt.placement === 'poisson') {
        const minDist = vt.poissonMinDistance ?? 10;
        const pts = MathUtils.poissonDiskSampling(size, size, minDist);
        const maxCount = Math.floor(size * size * DENSITY_PER_UNIT * effectiveDensity);
        const limit = Math.min(pts.length, maxCount);

        for (let i = 0; i < limit; i++) {
          const p = pts[i];
          const h = getHeight(p.x, p.y);
          if (h < 0) continue;
          if (trunkGrid.isNear(p.x, p.y)) continue;
          const s = MathUtils.randomInRange(0.9, 1.1);
          instances.push({
            position: new THREE.Vector3(baseX + p.x, h + vt.yOffset, baseZ + p.y),
            scale: new THREE.Vector3(s, s, 1),
            rotation: 0,
          });
        }
      } else {
        const count = Math.floor(size * size * DENSITY_PER_UNIT * effectiveDensity);
        for (let i = 0; i < count; i++) {
          const lx = Math.random() * size;
          const lz = Math.random() * size;
          const h = getHeight(lx, lz);
          if (h < 0) continue;
          if (trunkGrid.isNear(lx, lz)) continue;
          const dn = densityNoise(baseX + lx, baseZ + lz);
          if (Math.random() > dn) continue;
          const s = MathUtils.randomInRange(0.9, 1.1);
          instances.push({
            position: new THREE.Vector3(baseX + lx, h + vt.yOffset, baseZ + lz),
            scale: new THREE.Vector3(s, s, 1),
            rotation: 0,
          });
        }
      }

      if (instances.length > 0) result.set(vt.id, instances);
    }

    return result;
  }
}
