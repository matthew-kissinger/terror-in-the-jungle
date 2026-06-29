// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { BiomeClassificationRule, BiomeVegetationEntry } from '../../config/biomes';
import type { VegetationTypeConfig } from '../../config/vegetationTypes';
import type { StaticImpostorArchetype } from '../../config/staticImpostorArchetypes';
import {
  vegetationLibraryGroundCards,
  vegetationLibraryStaticArchetypes,
} from '../../config/vegetation/vegetationLibraryAdapter';
import type { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { modelLoader } from '../assets/ModelLoader';
import {
  StaticImpostorSystem,
  type StaticImpostorDebugInfo,
} from '../world/staticImpostors/StaticImpostorSystem';
import type { StaticImpostorMaterialTuning } from '../world/staticImpostors/StaticImpostorMaterial';
import type { TerrainExclusionZone } from './TerrainFeatureTypes';
import { getHeightQueryCache } from './HeightQueryCache';
import { GLBHeroScatterer, type GLBHeroScattererDebugInfo } from './GLBHeroScatterer';
import {
  GroundCardScatterer,
  type GroundCardScattererDebugInfo,
  type GroundCardTextureProvider,
} from './GroundCardScatterer';
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
  heroImpostors: StaticImpostorDebugInfo | null;
  groundCards: GroundCardScattererDebugInfo;
}

/**
 * GLB canopy hero scatter (jungle-tree + rubber/teak hardwoods) ships ON by default.
 *
 * It was previously gated OFF on a MISDIAGNOSIS: a `bindGroup_object 131072 > 65536`
 * WebGPU error was blamed on per-object uniform pressure from the hero meshes, but
 * 131072 == 2048*64 was the CDLOD terrain InstancedMesh instance-matrix overflow
 * (fixed in the r185 terrain repair). A combat120 A/B (heroes off vs on, denseJungle)
 * then measured the real cost as modest and draw-call-neutral: +~67k tris (+22%),
 * +0 draws/frame (impostor batching + shared materials hold), +~28MB heap, and 0
 * console errors under WebGPU. So it ships ON.
 *
 * Opt out at runtime with `?vegHeroes=0` or `window.__vegHeroScatter = false`
 * (read once at construction). No window (SSR / node tests) keeps the path inert.
 */
function heroScatterEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __vegHeroScatter?: boolean };
  // Explicit runtime override wins: true forces on, false forces off.
  if (typeof w.__vegHeroScatter === 'boolean') return w.__vegHeroScatter;
  try {
    // Default ON in a real browser; opt out with ?vegHeroes=0.
    return new URLSearchParams(window.location.search).get('vegHeroes') !== '0';
  } catch {
    return true;
  }
}

/**
 * Dense ground-cover cards (understory-fern / taro-elephant-ear / rice-paddy) ship ON by
 * default in a browser. They replace the old fern/elephantEar billboards in the jungle +
 * riverbank palettes with a cheap INSTANCED far card + a real near GLB mesh, world-anchored
 * per cell (NOT the rejected camera-following ground ring).
 *
 * Opt out at runtime with `?vegGroundCards=0` or `window.__vegGroundCards = false`
 * (read once at construction). No window (SSR / node tests) keeps the path inert.
 */
function groundCardsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __vegGroundCards?: boolean };
  if (typeof w.__vegGroundCards === 'boolean') return w.__vegGroundCards;
  try {
    return new URLSearchParams(window.location.search).get('vegGroundCards') !== '0';
  } catch {
    return true;
  }
}

function readFiniteQueryNumber(params: URLSearchParams, name: string, min: number, max: number): number | undefined {
  const raw = params.get(name);
  if (raw === null || raw.trim().length === 0) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

interface VegetationImpostorReviewOptions {
  readonly materialTuning?: StaticImpostorMaterialTuning;
  readonly transitionFadeMeters: number;
}

const DEFAULT_VEGETATION_IMPOSTOR_TRANSITION_METERS = 28;

function vegetationImpostorReviewOptions(): VegetationImpostorReviewOptions {
  const defaults: VegetationImpostorReviewOptions = {
    transitionFadeMeters: DEFAULT_VEGETATION_IMPOSTOR_TRANSITION_METERS,
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const params = new URLSearchParams(window.location.search);
    const fogStrength = readFiniteQueryNumber(params, 'vegImpostorFogStrength', 0, 1.5);
    const foliageExposureScale = readFiniteQueryNumber(params, 'vegImpostorExposureScale', 0, 2);
    const foliageColorGamma = readFiniteQueryNumber(params, 'vegImpostorColorGamma', 0.6, 2.5);
    const foliageSaturation = readFiniteQueryNumber(params, 'vegImpostorSaturation', 0, 1.25);
    const transitionFadeMeters = readFiniteQueryNumber(
      params,
      'vegImpostorTransitionMeters',
      0,
      80,
    ) ?? DEFAULT_VEGETATION_IMPOSTOR_TRANSITION_METERS;
    const materialTuning = fogStrength === undefined
      && foliageExposureScale === undefined
      && foliageColorGamma === undefined
      && foliageSaturation === undefined
      ? undefined
      : {
          ...(fogStrength !== undefined ? { fogStrength } : {}),
          ...(foliageExposureScale !== undefined ? { foliageExposureScale } : {}),
          ...(foliageColorGamma !== undefined ? { foliageColorGamma } : {}),
          ...(foliageSaturation !== undefined ? { foliageSaturation } : {}),
        };
    return { materialTuning, transitionFadeMeters };
  } catch {
    return defaults;
  }
}

/** Browser texture provider for the baked ground-card atlases (mipmapped, anisotropic). */
function createCardTextureProvider(): GroundCardTextureProvider {
  const loader = new THREE.TextureLoader();
  return {
    load(url: string, colorSpace: THREE.ColorSpace): THREE.Texture {
      const texture = loader.load(url);
      texture.colorSpace = colorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = 4;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      return texture;
    },
  };
}

/**
 * Per-archetype impostor batch capacity for the vegetation-owned scatterer.
 *
 * The authored world-feature props (WorldFeatureSystem) are sparse and hand-placed,
 * so the StaticImpostorSystem default of 256 is plenty there. The vegetation heroes
 * are different: they are scattered PROCEDURALLY at biome density across the whole
 * streaming radius, and the dense mid-heroes (fan-palm ~0.55, bamboo-grove ~0.28)
 * generate far more than 256 impostor instances inside that radius. Sizing every
 * veg-hero batch generously lets those distant plants actually render instead of
 * overflowing the batch (each instance is ~8 floats, so 8192 ≈ 256KB per archetype —
 * cheap, and the sparse heroes never come close to filling it).
 */
const VEGETATION_HERO_IMPOSTOR_BATCH_CAPACITY = 8192;

export class TerrainVegetationRuntime {
  private vegetationScatterer: VegetationScatterer;
  private jungleGroundRing: JungleGroundRing;
  private heroImpostors: StaticImpostorSystem | null = null;
  private glbHeroScatterer: GLBHeroScatterer | null = null;
  private groundCardScatterer: GroundCardScatterer | null = null;

  constructor(
    billboardSystem: GlobalBillboardSystem,
    vegetationCellSize: number,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.vegetationScatterer = new VegetationScatterer(billboardSystem, vegetationCellSize);
    this.jungleGroundRing = new JungleGroundRing(billboardSystem);

    // Dense ground-cover cards stream on their own flag (independent of the hero canopy).
    // Archetypes come from the vegetation-library adapter and stay isolated from the
    // global STATIC_IMPOSTOR_ARCHETYPES registry, exactly like the hero archetypes.
    if (scene && groundCardsEnabled()) {
      this.groundCardScatterer = new GroundCardScatterer(
        {
          scene,
          modelLoader,
          getHeight: (x, z) => getHeightQueryCache().getHeightAt(x, z),
          archetypes: vegetationLibraryGroundCards(),
          textureProvider: createCardTextureProvider(),
        },
        vegetationCellSize,
      );
    }

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
    const impostorReviewOptions = vegetationImpostorReviewOptions();
    this.heroImpostors = new StaticImpostorSystem(scene, camera, {
      archetypes: heroArchetypesByModelPath,
      batchCapacity: VEGETATION_HERO_IMPOSTOR_BATCH_CAPACITY,
      debugSource: 'vegetation',
      materialTuning: impostorReviewOptions.materialTuning,
      transitionFadeMeters: impostorReviewOptions.transitionFadeMeters,
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
    this.groundCardScatterer?.setWorldBounds(worldSize, visualMargin);
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
    this.groundCardScatterer?.configure(defaultBiomeId, biomePalettes, biomeRules);
  }

  setExclusionZones(zones: TerrainExclusionZone[]): void {
    this.vegetationScatterer.setExclusionZones(zones);
    this.jungleGroundRing.setExclusionZones(zones);
    this.glbHeroScatterer?.setExclusionZones(zones);
    this.groundCardScatterer?.setExclusionZones(zones);
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
    // Dense ground-cover cards share the same cell budget. Each cell is one instanced
    // batch per species, so its add/remove cost is cheap relative to the billboard cells.
    const groundCardDidWork = this.groundCardScatterer?.updateBudgeted(playerPosition, {
      maxAddsPerFrame: frameBudget.maxAddsPerFrame,
      maxRemovalsPerFrame: frameBudget.maxRemovalsPerFrame,
    }) ?? false;

    const didWork = scattererDidWork || heroDidWork || groundCardDidWork;
    const pending = this.vegetationScatterer.getPendingCounts();
    const ringPending = this.jungleGroundRing.getPendingCounts();
    const heroPending = this.glbHeroScatterer?.getPendingCounts() ?? { adds: 0, removals: 0 };
    const cardPending = this.groundCardScatterer?.getPendingCounts() ?? { adds: 0, removals: 0 };

    return {
      didWork,
      pendingUnits:
        pending.adds + pending.removals
        + ringPending.adds + ringPending.removals
        + heroPending.adds + heroPending.removals
        + cardPending.adds + cardPending.removals,
    };
  }

  /**
   * Per-frame, non-budgeted update: drives the hero static-impostor LOD swap
   * (mesh <-> impostor by camera distance) and the ground-card per-cell culling +
   * near-mesh LOD, which must run every frame independent of the streaming budget.
   */
  update(deltaTime: number): void {
    this.glbHeroScatterer?.updateImpostors(deltaTime);
    this.groundCardScatterer?.updateLod(deltaTime);
  }

  getDebugInfo(): TerrainVegetationRuntimeDebugInfo {
    return {
      vegetation: this.vegetationScatterer.getDebugInfo(),
      jungleGroundRing: this.jungleGroundRing.getDebugInfo(),
      glbHeroes: this.glbHeroScatterer?.getDebugInfo() ?? {
        activeCells: 0, targetCells: 0, pendingAdditions: 0,
        pendingRemovals: 0, registeredInstances: 0, inFlightLoads: 0,
      },
      heroImpostors: this.heroImpostors?.getDebugInfo() ?? null,
      groundCards: this.groundCardScatterer?.getDebugInfo() ?? {
        activeCells: 0, targetCells: 0, pendingAdditions: 0, pendingRemovals: 0,
        cardBatches: 0, cardInstances: 0, visibleBatches: 0, nearMeshes: 0, inFlightNearLoads: 0,
      },
    };
  }

  regenerateAll(): void {
    this.vegetationScatterer.regenerateAll();
    this.jungleGroundRing.clear();
    this.glbHeroScatterer?.clear();
    this.groundCardScatterer?.clear();
  }

  async regenerateAllAsync(onProgress?: (done: number, total: number) => void): Promise<void> {
    await this.vegetationScatterer.regenerateAllAsync(onProgress);
    this.jungleGroundRing.clear();
    this.glbHeroScatterer?.clear();
    this.groundCardScatterer?.clear();
  }

  dispose(): void {
    this.vegetationScatterer.dispose();
    this.jungleGroundRing.dispose();
    this.glbHeroScatterer?.dispose();
    this.heroImpostors?.dispose();
    this.groundCardScatterer?.dispose();
  }
}
