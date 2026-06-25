// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { BiomeClassificationRule, BiomeVegetationEntry } from '../../config/biomes';
import type { VegetationTypeConfig } from '../../config/vegetationTypes';
import type { StaticImpostorArchetype } from '../../config/staticImpostorArchetypes';
import { vegetationLibraryStaticArchetypes } from '../../config/vegetation/vegetationLibraryAdapter';
import type { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { modelLoader } from '../assets/ModelLoader';
import { StaticImpostorSystem } from '../world/staticImpostors/StaticImpostorSystem';
import type { TerrainExclusionZone } from './TerrainFeatureTypes';
import { getHeightQueryCache } from './HeightQueryCache';
import { GLBHeroScatterer, type GLBHeroScattererDebugInfo } from './GLBHeroScatterer';
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
  glbHeroes: GLBHeroScattererDebugInfo;
}

/**
 * GLB hero scatter (jungle-tree canopy) is gated OFF by default. The near-field
 * mesh tier currently adds one THREE.Object3D per tree sub-mesh, and at canopy
 * density that pushes three.js's WebGPU per-object uniform buffer past the 64KB
 * binding limit (bindGroup_object 131072 > 65536) — the asset still needs a
 * single-material atlas + an InstancedMesh near tier before it can ship. Enable
 * for local testing via `?vegHeroes=1` or `window.__vegHeroScatter = true`
 * (read once at runtime construction). See docs/rearch/VEGETATION_PHASE_II_*.
 */
function heroScatterEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __vegHeroScatter?: boolean };
  if (w.__vegHeroScatter === true) return true;
  try {
    return new URLSearchParams(window.location.search).get('vegHeroes') === '1';
  } catch {
    return false;
  }
}

export class TerrainVegetationRuntime {
  private vegetationScatterer: VegetationScatterer;
  private jungleGroundRing: JungleGroundRing;
  private heroImpostors: StaticImpostorSystem | null = null;
  private glbHeroScatterer: GLBHeroScatterer | null = null;

  constructor(
    billboardSystem: GlobalBillboardSystem,
    vegetationCellSize: number,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.vegetationScatterer = new VegetationScatterer(billboardSystem, vegetationCellSize);
    this.jungleGroundRing = new JungleGroundRing(billboardSystem);

    if (!heroScatterEnabled()) {
      return;
    }

    // Dedicated, vegetation-owned static-impostor system. The hero archetypes
    // (from the vegetation-library adapter) are injected here rather than merged
    // into the GLOBAL STATIC_IMPOSTOR_ARCHETYPES registry — that keeps the
    // authored-asset registry, the world-feature path, and check:static-impostors
    // (which loads every global archetype via the models/ loader) untouched.
    // Archetypes whose served modelPath lives under /assets/vegetation/ would
    // break that gate's loader; isolating them here avoids the collision.
    const heroArchetypesBySlug = vegetationLibraryStaticArchetypes();
    const heroArchetypesByModelPath: Record<string, StaticImpostorArchetype> = {};
    for (const archetype of Object.values(heroArchetypesBySlug)) {
      heroArchetypesByModelPath[archetype.modelPath] = archetype;
    }
    this.heroImpostors = new StaticImpostorSystem(scene, camera, {
      archetypes: heroArchetypesByModelPath,
    });
    this.glbHeroScatterer = new GLBHeroScatterer(
      {
        scene,
        modelLoader,
        impostors: this.heroImpostors,
        getHeight: (x, z) => getHeightQueryCache().getHeightAt(x, z),
        archetypes: heroArchetypesBySlug,
      },
      vegetationCellSize,
    );
  }

  setWorldBounds(worldSize: number, visualMargin: number): void {
    this.vegetationScatterer.setWorldBounds(worldSize, visualMargin);
    this.jungleGroundRing.setWorldBounds(worldSize, visualMargin);
    this.glbHeroScatterer?.setWorldBounds(worldSize, visualMargin);
  }

  configure(
    activeTypes: VegetationTypeConfig[],
    defaultBiomeId: string,
    biomePalettes: Map<string, BiomeVegetationEntry[]>,
    biomeRules: BiomeClassificationRule[],
  ): void {
    // Owner visual review rejected the camera-following dense ground-cover
    // circle. Keep JungleGroundRing dormant as an experiment/reference, while
    // normal gameplay uses the prior scatterer ownership for accepted ferns
    // and plants.
    this.jungleGroundRing.clear();
    this.jungleGroundRing.configure([], defaultBiomeId, biomePalettes, biomeRules);
    this.vegetationScatterer.configure(
      activeTypes,
      defaultBiomeId,
      biomePalettes,
      biomeRules,
    );
    this.glbHeroScatterer?.configure(defaultBiomeId, biomePalettes, biomeRules);
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
    const scattererDidWork = this.vegetationScatterer.updateBudgeted(playerPosition, {
      maxAddsPerFrame: frameBudget.maxAddsPerFrame,
      maxRemovalsPerFrame: Math.max(
        frameBudget.maxRemovalsPerFrame,
        Math.max(2, Math.floor(budgetMs * 6)),
      ),
    });
    // Hero GLB streaming shares the same cell budget. Heroes are sparse, so the
    // per-frame add/remove caps comfortably cover their churn; the async GLB
    // loads are naturally throttled by the loader.
    const heroDidWork = this.glbHeroScatterer?.updateBudgeted(playerPosition, {
      maxAddsPerFrame: frameBudget.maxAddsPerFrame,
      maxRemovalsPerFrame: frameBudget.maxRemovalsPerFrame,
    }) ?? false;

    const didWork = scattererDidWork || heroDidWork;
    const pending = this.vegetationScatterer.getPendingCounts();
    const ringPending = this.jungleGroundRing.getPendingCounts();
    const heroPending = this.glbHeroScatterer?.getPendingCounts() ?? { adds: 0, removals: 0 };

    return {
      didWork,
      pendingUnits:
        pending.adds + pending.removals
        + ringPending.adds + ringPending.removals
        + heroPending.adds + heroPending.removals,
    };
  }

  /**
   * Per-frame, non-budgeted update: drives the hero static-impostor LOD swap
   * (mesh <-> impostor by camera distance), which must run every frame
   * independent of the streaming budget.
   */
  update(deltaTime: number): void {
    this.glbHeroScatterer?.updateImpostors(deltaTime);
  }

  getDebugInfo(): TerrainVegetationRuntimeDebugInfo {
    return {
      vegetation: this.vegetationScatterer.getDebugInfo(),
      jungleGroundRing: this.jungleGroundRing.getDebugInfo(),
      glbHeroes: this.glbHeroScatterer?.getDebugInfo() ?? {
        activeCells: 0, targetCells: 0, pendingAdditions: 0,
        pendingRemovals: 0, registeredInstances: 0, inFlightLoads: 0,
      },
    };
  }

  regenerateAll(): void {
    this.vegetationScatterer.regenerateAll();
    this.jungleGroundRing.clear();
    this.glbHeroScatterer?.clear();
  }

  async regenerateAllAsync(onProgress?: (done: number, total: number) => void): Promise<void> {
    await this.vegetationScatterer.regenerateAllAsync(onProgress);
    this.jungleGroundRing.clear();
    this.glbHeroScatterer?.clear();
  }

  dispose(): void {
    this.vegetationScatterer.dispose();
    this.jungleGroundRing.dispose();
    this.glbHeroScatterer?.dispose();
    this.heroImpostors?.dispose();
  }
}
