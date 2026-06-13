// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { VegetationTypeConfig } from '../../config/vegetationTypes';
import type { BiomeClassificationRule, BiomeVegetationEntry } from '../../config/biomes';
import type { BillboardInstance } from '../../types';
import type { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import type { TerrainExclusionZone } from './TerrainFeatureTypes';
import { classifyBiome, computeSlopeDeg } from './BiomeClassifier';
import { getHeightQueryCache } from './HeightQueryCache';

export interface JungleGroundRingCellGenerationDebugInfo {
  cellKey: string;
  biomeId: string | null;
  instanceCount: number;
  typeCounts: Record<string, number>;
  skippedReason: 'unconfigured' | 'outside-world-margin' | 'empty-palette' | 'empty-cell' | null;
}

export interface JungleGroundRingUpdateDebugInfo {
  requestedAddBudget: number;
  resolvedAddBudget: number;
  maxRemovalsPerFrame: number;
  addedCells: number;
  removedCells: number;
  generatedInstances: number;
  emptyCells: number;
  lastGeneratedCell: JungleGroundRingCellGenerationDebugInfo | null;
}

export interface JungleGroundRingDebugInfo {
  cellSize: number;
  radiusCells: number;
  activeCells: number;
  targetCells: number;
  pendingAdditions: number;
  pendingRemovals: number;
  lastPlayerCell: { x: number; z: number } | null;
  lastUpdate: JungleGroundRingUpdateDebugInfo;
}

const EMPTY_UPDATE_DEBUG: JungleGroundRingUpdateDebugInfo = {
  requestedAddBudget: 0,
  resolvedAddBudget: 0,
  maxRemovalsPerFrame: 0,
  addedCells: 0,
  removedCells: 0,
  generatedInstances: 0,
  emptyCells: 0,
  lastGeneratedCell: null,
};

const CHUNK_PREFIX = 'jungle-ground-ring:';
const DEFAULT_VISUAL_MARGIN = 200;
const DENSITY_PER_UNIT = 1.0 / 54.0;
const SLOPE_SAMPLE_DIST = 2.0;
const CRITICAL_RESIDENCY_RADIUS_CELLS = 1;

/**
 * Camera-following near-field ground cover. This borrows the aggregate ring
 * strategy from Fable5 while keeping TIJ's existing GPU billboard renderer.
 */
export class JungleGroundRing {
  private billboardSystem: GlobalBillboardSystem;
  private cellSize: number;
  private radiusCells: number;
  private activeCells: Set<string> = new Set();
  private targetCells: Set<string> = new Set();
  private pendingAdditions: string[] = [];
  private pendingRemovals: string[] = [];
  private lastPlayerCellX = NaN;
  private lastPlayerCellZ = NaN;
  private playerPosition = new THREE.Vector3();
  private worldHalfExtent = Infinity;
  private visualMargin = DEFAULT_VISUAL_MARGIN;
  private vegetationTypes: VegetationTypeConfig[] = [];
  private biomePalettes: Map<string, BiomeVegetationEntry[]> = new Map();
  private defaultBiomeId = 'denseJungle';
  private biomeRules: BiomeClassificationRule[] = [];
  private exclusionZones: TerrainExclusionZone[] = [];
  private lastUpdateDebug: JungleGroundRingUpdateDebugInfo = { ...EMPTY_UPDATE_DEBUG };

  constructor(
    billboardSystem: GlobalBillboardSystem,
    cellSize: number = 32,
    radiusCells: number = 3,
  ) {
    this.billboardSystem = billboardSystem;
    this.cellSize = cellSize;
    this.radiusCells = radiusCells;
  }

  setWorldBounds(worldSize: number, visualMargin: number = DEFAULT_VISUAL_MARGIN): void {
    this.worldHalfExtent = worldSize * 0.5;
    this.visualMargin = Math.max(0, visualMargin);
  }

  configure(
    types: VegetationTypeConfig[],
    defaultBiomeId: string,
    biomePalettes: Map<string, BiomeVegetationEntry[]>,
    biomeRules: BiomeClassificationRule[] = [],
  ): void {
    this.vegetationTypes = types.filter((type) => type.tier === 'groundCover');
    this.defaultBiomeId = defaultBiomeId;
    this.biomePalettes = new Map(biomePalettes);
    this.biomeRules = biomeRules.slice();
  }

  setExclusionZones(zones: TerrainExclusionZone[]): void {
    this.exclusionZones = zones.slice();
  }

  update(playerPosition: THREE.Vector3): boolean {
    return this.updateBudgeted(playerPosition, { maxAddsPerFrame: 2, maxRemovalsPerFrame: 10 });
  }

  updateBudgeted(
    playerPosition: THREE.Vector3,
    options: { maxAddsPerFrame: number; maxRemovalsPerFrame: number },
  ): boolean {
    this.playerPosition.copy(playerPosition);
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

  getDebugInfo(): JungleGroundRingDebugInfo {
    return {
      cellSize: this.cellSize,
      radiusCells: this.radiusCells,
      activeCells: this.activeCells.size,
      targetCells: this.targetCells.size,
      pendingAdditions: this.pendingAdditions.length,
      pendingRemovals: this.pendingRemovals.length,
      lastPlayerCell: Number.isFinite(this.lastPlayerCellX) && Number.isFinite(this.lastPlayerCellZ)
        ? { x: this.lastPlayerCellX, z: this.lastPlayerCellZ }
        : null,
      lastUpdate: {
        ...this.lastUpdateDebug,
        lastGeneratedCell: this.lastUpdateDebug.lastGeneratedCell
          ? {
              ...this.lastUpdateDebug.lastGeneratedCell,
              typeCounts: { ...this.lastUpdateDebug.lastGeneratedCell.typeCounts },
            }
          : null,
      },
    };
  }

  clear(): void {
    for (const key of this.activeCells) {
      this.billboardSystem.removeChunkInstances(this.toChunkKey(key));
    }
    this.activeCells.clear();
    this.targetCells.clear();
    this.pendingAdditions = [];
    this.pendingRemovals = [];
    this.lastPlayerCellX = NaN;
    this.lastPlayerCellZ = NaN;
  }

  regenerateAll(): void {
    const keys = [...this.activeCells];
    for (const key of keys) {
      this.billboardSystem.removeChunkInstances(this.toChunkKey(key));
      this.generateCell(key);
    }
  }

  dispose(): void {
    this.clear();
  }

  private rebuildResidencyTargets(cellX: number, cellZ: number): void {
    const neededCells = new Set<string>();

    for (let dx = -this.radiusCells; dx <= this.radiusCells; dx++) {
      for (let dz = -this.radiusCells; dz <= this.radiusCells; dz++) {
        neededCells.add(`${cellX + dx},${cellZ + dz}`);
      }
    }

    this.targetCells = neededCells;
    this.pendingRemovals = this.pendingRemovals.filter((key) => neededCells.has(key));
    this.pendingAdditions = this.pendingAdditions.filter((key) => neededCells.has(key));

    for (const key of this.activeCells) {
      if (!neededCells.has(key) && !this.pendingRemovals.includes(key)) {
        this.pendingRemovals.push(key);
      }
    }

    const additions = Array.from(neededCells)
      .filter((key) => !this.activeCells.has(key) && !this.pendingAdditions.includes(key))
      .sort((a, b) => this.getCellDistanceToCenter(a, cellX, cellZ) - this.getCellDistanceToCenter(b, cellX, cellZ));

    this.pendingAdditions.push(...additions);
  }

  private processPendingWork(maxAddsPerFrame: number, maxRemovalsPerFrame: number): boolean {
    let didWork = false;
    const debug: JungleGroundRingUpdateDebugInfo = {
      requestedAddBudget: Math.max(0, maxAddsPerFrame),
      resolvedAddBudget: 0,
      maxRemovalsPerFrame: Math.max(0, maxRemovalsPerFrame),
      addedCells: 0,
      removedCells: 0,
      generatedInstances: 0,
      emptyCells: 0,
      lastGeneratedCell: null,
    };

    for (let i = 0; i < debug.maxRemovalsPerFrame && this.pendingRemovals.length > 0; i++) {
      const key = this.pendingRemovals.shift()!;
      this.billboardSystem.removeChunkInstances(this.toChunkKey(key));
      this.activeCells.delete(key);
      debug.removedCells++;
      didWork = true;
    }

    const addBudget = this.resolveAddBudget(maxAddsPerFrame);
    debug.resolvedAddBudget = addBudget;
    for (let i = 0; i < addBudget && this.pendingAdditions.length > 0; i++) {
      const key = this.pendingAdditions.shift()!;
      const generated = this.generateCell(key);
      this.activeCells.add(key);
      debug.addedCells++;
      debug.generatedInstances += generated.instanceCount;
      debug.lastGeneratedCell = generated;
      if (generated.instanceCount === 0) {
        debug.emptyCells++;
      }
      didWork = true;
    }

    this.lastUpdateDebug = debug;
    return didWork;
  }

  private resolveAddBudget(maxAddsPerFrame: number): number {
    const requestedBudget = Math.max(0, maxAddsPerFrame);
    if (requestedBudget > 0 || this.pendingAdditions.length === 0) {
      return requestedBudget;
    }

    const criticalIndex = this.pendingAdditions.findIndex((key) =>
      this.getCellDistanceToCenter(
        key,
        this.lastPlayerCellX,
        this.lastPlayerCellZ,
      ) <= CRITICAL_RESIDENCY_RADIUS_CELLS
    );
    if (criticalIndex < 0) {
      return 0;
    }
    if (criticalIndex > 0) {
      const [criticalCell] = this.pendingAdditions.splice(criticalIndex, 1);
      this.pendingAdditions.unshift(criticalCell);
    }
    return 1;
  }

  private generateCell(cellKey: string): JungleGroundRingCellGenerationDebugInfo {
    if (this.vegetationTypes.length === 0 || this.biomePalettes.size === 0) {
      return this.createCellGenerationDebugInfo(cellKey, null, new Map(), 'unconfigured');
    }

    const [cxStr, czStr] = cellKey.split(',');
    const cellX = parseInt(cxStr, 10);
    const cellZ = parseInt(czStr, 10);
    const cache = getHeightQueryCache();
    const baseX = cellX * this.cellSize;
    const baseZ = cellZ * this.cellSize;
    const centerX = baseX + this.cellSize * 0.5;
    const centerZ = baseZ + this.cellSize * 0.5;
    const limit = this.worldHalfExtent + this.visualMargin;

    if (Math.abs(centerX) > limit || Math.abs(centerZ) > limit) {
      return this.createCellGenerationDebugInfo(cellKey, null, new Map(), 'outside-world-margin');
    }

    const centerHeight = this.getAlignedHeight(cache, centerX, centerZ);
    const centerSlopeDeg = computeSlopeDeg(centerX, centerZ, 4, (x, z) => this.getAlignedHeight(cache, x, z));
    const biomeId = classifyBiome(centerHeight, centerSlopeDeg, this.biomeRules, this.defaultBiomeId);
    const biomePalette = this.biomePalettes.get(biomeId) ?? this.biomePalettes.get(this.defaultBiomeId);
    if (!biomePalette || biomePalette.length === 0) {
      return this.createCellGenerationDebugInfo(cellKey, biomeId, new Map(), 'empty-palette');
    }

    const densityMap = new Map<string, number>();
    for (const entry of biomePalette) {
      densityMap.set(entry.typeId, entry.densityMultiplier);
    }

    const instancesByType = new Map<string, BillboardInstance[]>();
    for (const type of this.vegetationTypes) {
      const densityMultiplier = densityMap.get(type.id);
      if (densityMultiplier === undefined || densityMultiplier <= 0) {
        continue;
      }

      const instances = this.generateTypeInstances(
        type,
        densityMultiplier,
        cellX,
        cellZ,
        baseX,
        baseZ,
        cache,
      );
      if (instances.length > 0) {
        instancesByType.set(type.id, instances);
      }
    }

    if (instancesByType.size > 0) {
      this.billboardSystem.addChunkInstances(this.toChunkKey(cellKey), instancesByType);
    }

    return this.createCellGenerationDebugInfo(
      cellKey,
      biomeId,
      instancesByType,
      instancesByType.size > 0 ? null : 'empty-cell',
    );
  }

  private generateTypeInstances(
    type: VegetationTypeConfig,
    densityMultiplier: number,
    cellX: number,
    cellZ: number,
    baseX: number,
    baseZ: number,
    cache: ReturnType<typeof getHeightQueryCache>,
  ): BillboardInstance[] {
    const effectiveDensity = type.baseDensity * densityMultiplier;
    const candidateCount = Math.floor(this.cellSize * this.cellSize * DENSITY_PER_UNIT * effectiveDensity);
    const typeSalt = this.hashString(type.id);
    const instances: BillboardInstance[] = [];
    const maxRadius = (this.radiusCells + 0.5) * this.cellSize;
    const fadeStart = maxRadius * 0.58;

    for (let i = 0; i < candidateCount; i++) {
      const hx = this.hashInts(cellX * 1009 + i, cellZ, typeSalt);
      const hz = this.hashInts(cellZ * 1009 + i, cellX, typeSalt ^ 0x9e3779b9);
      const localX = (hx / 0xffffffff) * this.cellSize;
      const localZ = (hz / 0xffffffff) * this.cellSize;
      const worldX = baseX + localX;
      const worldZ = baseZ + localZ;
      const dx = worldX - this.playerPosition.x;
      const dz = worldZ - this.playerPosition.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const coverage = 1 - this.smoothstep(fadeStart, maxRadius, distance);
      if (coverage <= 0) {
        continue;
      }

      const patch = 0.64 + this.valueNoise01(worldX / 38, worldZ / 38, typeSalt ^ 0x51f15eaf) * 0.56;
      const survivorRoll = this.hashInts(cellX + i, cellZ - i, typeSalt ^ 0x45d9f3b) / 0xffffffff;
      if (survivorRoll > coverage * patch) {
        continue;
      }

      const height = this.getAlignedHeight(cache, worldX, worldZ);
      if (height < 0) {
        continue;
      }
      if (type.maxSlopeDeg !== undefined) {
        const slopeDeg = computeSlopeDeg(worldX, worldZ, SLOPE_SAMPLE_DIST, (x, z) => this.getAlignedHeight(cache, x, z));
        if (slopeDeg > type.maxSlopeDeg) {
          continue;
        }
      }
      if (this.isExcluded(worldX, worldZ)) {
        continue;
      }

      const scaleRoll = this.hashInts(cellX, cellZ, typeSalt ^ (i * 7919)) / 0xffffffff;
      const baseScale = 0.78 + scaleRoll * 0.48;
      const thinningScale = coverage < 0.92 ? Math.min(1.55, 1 / Math.sqrt(Math.max(coverage, 0.42))) : 1;
      const scale = baseScale * thinningScale;
      const rotation = (this.hashInts(cellX - i, cellZ + i, typeSalt ^ 0xa511e9b3) / 0xffffffff) * Math.PI * 2;

      instances.push({
        position: new THREE.Vector3(worldX, height + type.yOffset * scale, worldZ),
        scale: new THREE.Vector3(scale, scale, 1),
        rotation,
      });
    }

    return instances;
  }

  private getAlignedHeight(
    cache: ReturnType<typeof getHeightQueryCache>,
    worldX: number,
    worldZ: number,
  ): number {
    return cache.getHeightAt(worldX, worldZ);
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

  private createCellGenerationDebugInfo(
    cellKey: string,
    biomeId: string | null,
    instancesByType: Map<string, BillboardInstance[]>,
    skippedReason: JungleGroundRingCellGenerationDebugInfo['skippedReason'],
  ): JungleGroundRingCellGenerationDebugInfo {
    const typeCounts: Record<string, number> = {};
    let instanceCount = 0;
    for (const [typeId, instances] of instancesByType) {
      typeCounts[typeId] = instances.length;
      instanceCount += instances.length;
    }

    return {
      cellKey,
      biomeId,
      instanceCount,
      typeCounts,
      skippedReason,
    };
  }

  private toChunkKey(cellKey: string): string {
    return `${CHUNK_PREFIX}${cellKey}`;
  }

  private getCellDistanceToCenter(cellKey: string, centerCellX: number, centerCellZ: number): number {
    const [cxStr, czStr] = cellKey.split(',');
    const cellX = parseInt(cxStr, 10);
    const cellZ = parseInt(czStr, 10);
    return Math.abs(cellX - centerCellX) + Math.abs(cellZ - centerCellZ);
  }

  private smoothstep(edge0: number, edge1: number, value: number): number {
    if (edge0 === edge1) {
      return value < edge0 ? 0 : 1;
    }
    const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  private valueNoise01(x: number, z: number, salt: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = x - x0;
    const tz = z - z0;
    const sx = tx * tx * (3 - 2 * tx);
    const sz = tz * tz * (3 - 2 * tz);
    const maxUint32 = 0xffffffff;
    const a = this.hashInts(x0, z0, salt) / maxUint32;
    const b = this.hashInts(x0 + 1, z0, salt) / maxUint32;
    const c = this.hashInts(x0, z0 + 1, salt) / maxUint32;
    const d = this.hashInts(x0 + 1, z0 + 1, salt) / maxUint32;
    const xTop = THREE.MathUtils.lerp(a, b, sx);
    const xBottom = THREE.MathUtils.lerp(c, d, sx);
    return THREE.MathUtils.lerp(xTop, xBottom, sz);
  }

  private hashString(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private hashInts(a: number, b: number, salt: number): number {
    let hash = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ (salt | 0);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 1274126177);
    hash ^= hash >>> 16;
    return hash >>> 0;
  }
}
