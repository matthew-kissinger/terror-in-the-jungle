// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { BiomeClassificationRule, BiomeVegetationEntry } from '../../config/biomes';
import type { VegetationTypeConfig } from '../../config/vegetationTypes';
import type { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import type { TerrainExclusionZone } from './TerrainFeatureTypes';
import { JungleGroundRing, type JungleGroundRingDebugInfo } from './JungleGroundRing';
import { VegetationScatterer, type VegetationScattererDebugInfo } from './VegetationScatterer';

export interface TerrainVegetationFrameBudget {
  maxAddsPerFrame: number;
  maxRemovalsPerFrame: number;
}

export interface TerrainVegetationUpdateResult {
  didWork: boolean;
  pendingUnits: number;
}

export interface TerrainVegetationRuntimeDebugInfo {
  vegetation: VegetationScattererDebugInfo;
  jungleGroundRing: JungleGroundRingDebugInfo;
}

export class TerrainVegetationRuntime {
  private vegetationScatterer: VegetationScatterer;
  private jungleGroundRing: JungleGroundRing;

  constructor(
    billboardSystem: GlobalBillboardSystem,
    vegetationCellSize: number,
  ) {
    this.vegetationScatterer = new VegetationScatterer(billboardSystem, vegetationCellSize);
    this.jungleGroundRing = new JungleGroundRing(billboardSystem);
  }

  setWorldBounds(worldSize: number, visualMargin: number): void {
    this.vegetationScatterer.setWorldBounds(worldSize, visualMargin);
    this.jungleGroundRing.setWorldBounds(worldSize, visualMargin);
  }

  configure(
    activeTypes: VegetationTypeConfig[],
    defaultBiomeId: string,
    biomePalettes: Map<string, BiomeVegetationEntry[]>,
    biomeRules: BiomeClassificationRule[],
  ): void {
    this.jungleGroundRing.configure(activeTypes, defaultBiomeId, biomePalettes, biomeRules);
    this.vegetationScatterer.configure(
      activeTypes.filter((type) => type.tier !== 'groundCover'),
      defaultBiomeId,
      biomePalettes,
      biomeRules,
    );
  }

  setExclusionZones(zones: TerrainExclusionZone[]): void {
    this.vegetationScatterer.setExclusionZones(zones);
    this.jungleGroundRing.setExclusionZones(zones);
  }

  updateBudgeted(
    playerPosition: THREE.Vector3,
    budgetMs: number,
    frameBudget: TerrainVegetationFrameBudget,
  ): TerrainVegetationUpdateResult {
    const ringDidWork = this.jungleGroundRing.updateBudgeted(playerPosition, {
      maxAddsPerFrame: Math.min(
        Math.max(1, Math.floor(budgetMs * 3)),
        frameBudget.maxAddsPerFrame,
      ),
      maxRemovalsPerFrame: Math.max(
        frameBudget.maxRemovalsPerFrame,
        Math.max(4, Math.floor(budgetMs * 8)),
      ),
    });
    const didWork = this.vegetationScatterer.updateBudgeted(playerPosition, {
      maxAddsPerFrame: frameBudget.maxAddsPerFrame,
      maxRemovalsPerFrame: Math.max(
        frameBudget.maxRemovalsPerFrame,
        Math.max(2, Math.floor(budgetMs * 6)),
      ),
    }) || ringDidWork;
    const pending = this.vegetationScatterer.getPendingCounts();
    const ringPending = this.jungleGroundRing.getPendingCounts();

    return {
      didWork,
      pendingUnits: pending.adds + pending.removals + ringPending.adds + ringPending.removals,
    };
  }

  getDebugInfo(): TerrainVegetationRuntimeDebugInfo {
    return {
      vegetation: this.vegetationScatterer.getDebugInfo(),
      jungleGroundRing: this.jungleGroundRing.getDebugInfo(),
    };
  }

  regenerateAll(): void {
    this.vegetationScatterer.regenerateAll();
    this.jungleGroundRing.regenerateAll();
  }

  async regenerateAllAsync(onProgress?: (done: number, total: number) => void): Promise<void> {
    await this.vegetationScatterer.regenerateAllAsync(onProgress);
    this.jungleGroundRing.regenerateAll();
  }

  dispose(): void {
    this.vegetationScatterer.dispose();
    this.jungleGroundRing.dispose();
  }
}
