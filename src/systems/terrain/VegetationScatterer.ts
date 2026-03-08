import * as THREE from 'three';
import type { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import type { VegetationTypeConfig } from '../../config/vegetationTypes';
import { type BiomeClassificationRule, type BiomeVegetationEntry } from '../../config/biomes';
import { classifyBiome, computeSlopeDeg } from './BiomeClassifier';
import { ChunkVegetationGenerator } from './ChunkVegetationGenerator';
import { getHeightQueryCache } from './HeightQueryCache';
import type { TerrainExclusionZone } from './TerrainFeatureTypes';

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
  private targetCells: Set<string> = new Set();
  private pendingAdditions: string[] = [];
  private pendingRemovals: string[] = [];
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
  private exclusionZones: TerrainExclusionZone[] = [];

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

  setExclusionZones(zones: TerrainExclusionZone[]): void {
    this.exclusionZones = zones.slice();
  }

  /**
   * Update each frame. Checks if player moved to a new cell and generates/removes vegetation.
   */
  update(playerPosition: THREE.Vector3): boolean {
    return this.updateBudgeted(playerPosition, { maxAddsPerFrame: 4, maxRemovalsPerFrame: 8 });
  }

  updateBudgeted(
    playerPosition: THREE.Vector3,
    options: { maxAddsPerFrame: number; maxRemovalsPerFrame: number }
  ): boolean {
    const cellX = Math.floor(playerPosition.x / this.cellSize);
    const cellZ = Math.floor(playerPosition.z / this.cellSize);

    if (cellX !== this.lastPlayerCellX || cellZ !== this.lastPlayerCellZ) {
      this.lastPlayerCellX = cellX;
      this.lastPlayerCellZ = cellZ;
      this.rebuildResidencyTargets(cellX, cellZ);
    }

    return this.processPendingWork(options.maxAddsPerFrame, options.maxRemovalsPerFrame);
  }

  getPendingCounts(): { adds: number; removals: number } {
    return {
      adds: this.pendingAdditions.length,
      removals: this.pendingRemovals.length,
    };
  }

  isReadyAround(playerPosition: THREE.Vector3, radiusCells: number = 1): boolean {
    const centerCellX = Math.floor(playerPosition.x / this.cellSize);
    const centerCellZ = Math.floor(playerPosition.z / this.cellSize);

    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      for (let dz = -radiusCells; dz <= radiusCells; dz++) {
        const key = `${centerCellX + dx},${centerCellZ + dz}`;
        if (!this.activeCells.has(key)) {
          return false;
        }
      }
    }

    return true;
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
    const centerHeight = this.getAlignedHeight(cache, centerX, centerZ);
    const centerSlopeDeg = computeSlopeDeg(centerX, centerZ, 4, (x, z) => this.getAlignedHeight(cache, x, z));
    const biomeId = classifyBiome(centerHeight, centerSlopeDeg, this.biomeRules, this.defaultBiomeId);
    const biomePalette = this.biomePalettes.get(biomeId) ?? this.biomePalettes.get(this.defaultBiomeId);
    if (!biomePalette || biomePalette.length === 0) return;

    // Height lookup in local cell coordinates
    const getHeight = (localX: number, localZ: number): number => {
      return this.getAlignedHeight(cache, baseX + localX, baseZ + localZ);
    };

    const instances = ChunkVegetationGenerator.generateVegetation(
      cellX,
      cellZ,
      this.cellSize,
      getHeight,
      this.vegetationTypes,
      biomePalette,
    );

    const filteredInstances = this.filterExcludedInstances(instances);
    if (filteredInstances.size > 0) {
      this.billboardSystem.addChunkInstances(cellKey, filteredInstances);
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
    this.targetCells.clear();
    this.pendingAdditions = [];
    this.pendingRemovals = [];
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

  private rebuildResidencyTargets(cellX: number, cellZ: number): void {
    const neededCells = new Set<string>();

    for (let dx = -this.maxCellDistance; dx <= this.maxCellDistance; dx++) {
      for (let dz = -this.maxCellDistance; dz <= this.maxCellDistance; dz++) {
        neededCells.add(`${cellX + dx},${cellZ + dz}`);
      }
    }

    this.targetCells = neededCells;
    this.pendingRemovals = this.pendingRemovals.filter(key => neededCells.has(key));
    this.pendingAdditions = this.pendingAdditions.filter(key => neededCells.has(key));

    for (const key of this.activeCells) {
      if (!neededCells.has(key) && !this.pendingRemovals.includes(key)) {
        this.pendingRemovals.push(key);
      }
    }

    const additions = Array.from(neededCells)
      .filter(key => !this.activeCells.has(key) && !this.pendingAdditions.includes(key))
      .sort((a, b) => this.getCellDistanceToCenter(a, cellX, cellZ) - this.getCellDistanceToCenter(b, cellX, cellZ));

    this.pendingAdditions.push(...additions);
  }

  private processPendingWork(maxAddsPerFrame: number, maxRemovalsPerFrame: number): boolean {
    let didWork = false;

    for (let i = 0; i < Math.max(0, maxRemovalsPerFrame) && this.pendingRemovals.length > 0; i++) {
      const key = this.pendingRemovals.shift()!;
      this.billboardSystem.removeChunkInstances(key);
      this.activeCells.delete(key);
      didWork = true;
    }

    for (let i = 0; i < Math.max(0, maxAddsPerFrame) && this.pendingAdditions.length > 0; i++) {
      const key = this.pendingAdditions.shift()!;
      this.generateCell(key);
      this.activeCells.add(key);
      didWork = true;
    }

    return didWork;
  }

  private getCellDistanceToCenter(cellKey: string, centerCellX: number, centerCellZ: number): number {
    const [cxStr, czStr] = cellKey.split(',');
    const cellX = parseInt(cxStr, 10);
    const cellZ = parseInt(czStr, 10);
    return Math.abs(cellX - centerCellX) + Math.abs(cellZ - centerCellZ);
  }

  private getAlignedHeight(
    cache: ReturnType<typeof getHeightQueryCache>,
    worldX: number,
    worldZ: number
  ): number {
    // No clamping needed: the heightmap covers the full visual extent
    // (worldSize + 2*visualMargin), so margin vegetation gets real heights.
    return cache.getHeightAt(worldX, worldZ);
  }

  private filterExcludedInstances(instancesByType: Map<string, THREE.Object3D[] | any[]>): Map<string, any[]> {
    if (this.exclusionZones.length === 0) {
      return instancesByType as Map<string, any[]>;
    }

    const filtered = new Map<string, any[]>();
    for (const [typeId, instances] of instancesByType) {
      const nextInstances = instances.filter((instance: any) => !this.isExcluded(instance.position.x, instance.position.z));
      if (nextInstances.length > 0) {
        filtered.set(typeId, nextInstances);
      }
    }
    return filtered;
  }

  private isExcluded(worldX: number, worldZ: number): boolean {
    for (const zone of this.exclusionZones) {
      const dx = worldX - zone.x;
      const dz = worldZ - zone.z;
      if (dx * dx + dz * dz <= zone.radius * zone.radius) {
        return true;
      }
    }
    return false;
  }
}
