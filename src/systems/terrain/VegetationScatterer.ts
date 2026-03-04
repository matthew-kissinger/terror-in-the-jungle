import * as THREE from 'three';
import type { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import type { VegetationTypeConfig } from '../../config/vegetationTypes';
import { type BiomeClassificationRule, type BiomeVegetationEntry } from '../../config/biomes';
import { classifyBiome, computeSlopeDeg } from './BiomeClassifier';
import { ChunkVegetationGenerator } from './ChunkVegetationGenerator';
import { getHeightQueryCache } from './HeightQueryCache';

/**
 * Cell-based vegetation scatterer. Replaces per-chunk vegetation generation.
 *
 * Divides world into cells (default 128x128m). Generates vegetation for cells near
 * the player, removes distant cells. Uses the same 3-pass algorithm as before
 * (canopy / mid / ground via ChunkVegetationGenerator).
 */
export class VegetationScatterer {
  private static readonly DEFAULT_VISUAL_MARGIN = 200;
  private billboardSystem: GlobalBillboardSystem;
  private cellSize: number;
  private activeCells: Set<string> = new Set();
  private maxCellDistance: number; // In cells
  private lastPlayerCellX = NaN;
  private lastPlayerCellZ = NaN;
  private worldHalfExtent = Infinity; // Half the world size; cells outside are skipped
  private visualMargin = VegetationScatterer.DEFAULT_VISUAL_MARGIN;

  // Vegetation config
  private vegetationTypes: VegetationTypeConfig[] = [];
  private biomePalettes: Map<string, BiomeVegetationEntry[]> = new Map();
  private defaultBiomeId = 'denseJungle';
  private biomeRules: BiomeClassificationRule[] = [];

  constructor(
    billboardSystem: GlobalBillboardSystem,
    cellSize: number = 128,
    maxCellDistance: number = 6,
  ) {
    this.billboardSystem = billboardSystem;
    this.cellSize = cellSize;
    this.maxCellDistance = maxCellDistance;
  }

  setWorldSize(worldSize: number): void {
    this.worldHalfExtent = worldSize * 0.5;
  }

  setWorldBounds(worldSize: number, visualMargin: number = VegetationScatterer.DEFAULT_VISUAL_MARGIN): void {
    this.worldHalfExtent = worldSize * 0.5;
    this.visualMargin = Math.max(0, visualMargin);
  }

  /**
   * Set vegetation types and biome classification/palette config.
   */
  configure(
    types: VegetationTypeConfig[],
    defaultBiomeId: string,
    biomePalettes: Map<string, BiomeVegetationEntry[]>,
    biomeRules: BiomeClassificationRule[] = [],
  ): void {
    this.vegetationTypes = types;
    this.defaultBiomeId = defaultBiomeId;
    this.biomePalettes = new Map(biomePalettes);
    this.biomeRules = biomeRules.slice();
  }

  /**
   * Update each frame. Checks if player moved to a new cell and generates/removes vegetation.
   */
  update(playerPosition: THREE.Vector3): void {
    const cellX = Math.floor(playerPosition.x / this.cellSize);
    const cellZ = Math.floor(playerPosition.z / this.cellSize);

    // Only rebuild if player moved to a different cell
    if (cellX === this.lastPlayerCellX && cellZ === this.lastPlayerCellZ) {
      return;
    }
    this.lastPlayerCellX = cellX;
    this.lastPlayerCellZ = cellZ;

    const neededCells = new Set<string>();

    // Determine which cells should be active
    for (let dx = -this.maxCellDistance; dx <= this.maxCellDistance; dx++) {
      for (let dz = -this.maxCellDistance; dz <= this.maxCellDistance; dz++) {
        const key = `${cellX + dx},${cellZ + dz}`;
        neededCells.add(key);
      }
    }

    // Remove cells that are no longer needed
    for (const key of this.activeCells) {
      if (!neededCells.has(key)) {
        this.billboardSystem.removeChunkInstances(key);
        this.activeCells.delete(key);
      }
    }

    // Generate cells that are newly needed
    for (const key of neededCells) {
      if (!this.activeCells.has(key)) {
        this.generateCell(key);
        this.activeCells.add(key);
      }
    }
  }

  private generateCell(cellKey: string): void {
    if (this.vegetationTypes.length === 0 || this.biomePalettes.size === 0) return;

    const [cxStr, czStr] = cellKey.split(',');
    const cellX = parseInt(cxStr, 10);
    const cellZ = parseInt(czStr, 10);

    const cache = getHeightQueryCache();
    const baseX = cellX * this.cellSize;
    const baseZ = cellZ * this.cellSize;
    const centerX = baseX + this.cellSize * 0.5;
    const centerZ = baseZ + this.cellSize * 0.5;

    // Skip cells beyond the visual terrain margin (200m past world edge)
    const limit = this.worldHalfExtent + this.visualMargin;
    if (Math.abs(centerX) > limit || Math.abs(centerZ) > limit) return;
    const centerHeight = cache.getHeightAt(centerX, centerZ);
    const centerSlopeDeg = computeSlopeDeg(centerX, centerZ, 4, (x, z) => cache.getHeightAt(x, z));
    const biomeId = classifyBiome(centerHeight, centerSlopeDeg, this.biomeRules, this.defaultBiomeId);
    const biomePalette = this.biomePalettes.get(biomeId) ?? this.biomePalettes.get(this.defaultBiomeId);
    if (!biomePalette || biomePalette.length === 0) return;

    // Height lookup in local cell coordinates
    const getHeight = (localX: number, localZ: number): number => {
      return cache.getHeightAt(baseX + localX, baseZ + localZ);
    };

    const instances = ChunkVegetationGenerator.generateVegetation(
      cellX,
      cellZ,
      this.cellSize,
      getHeight,
      this.vegetationTypes,
      biomePalette,
    );

    if (instances.size > 0) {
      this.billboardSystem.addChunkInstances(cellKey, instances);
    }
  }

  /**
   * Clear all vegetation and reset state.
   */
  clear(): void {
    for (const key of this.activeCells) {
      this.billboardSystem.removeChunkInstances(key);
    }
    this.activeCells.clear();
    this.lastPlayerCellX = NaN;
    this.lastPlayerCellZ = NaN;
  }

  /**
   * Force regeneration of all active cells (e.g. after biome config change).
   */
  regenerateAll(): void {
    const keys = [...this.activeCells];
    for (const key of keys) {
      this.billboardSystem.removeChunkInstances(key);
      this.generateCell(key);
    }
  }

  getActiveCellCount(): number {
    return this.activeCells.size;
  }

  dispose(): void {
    this.clear();
  }
}
