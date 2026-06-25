// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { StaticImpostorArchetype } from '../../config/staticImpostorArchetypes';
import type { BiomeClassificationRule, BiomeVegetationEntry } from '../../config/biomes';
import { classifyBiome, computeSlopeDeg } from './BiomeClassifier';

/**
 * GLB hero scatterer (Phase II of the vegetation-library integration).
 *
 * Scatters real GLB "hero" meshes (e.g. the jungle-tree canopy hero) across the
 * world by BIOME DENSITY, on the same cell-streaming lifecycle as
 * VegetationScatterer, but driving the StaticImpostorSystem directly instead of
 * the billboard system: a real mesh near the player, a baked octahedral impostor
 * far away. Heroes are sparse — billboards (VegetationScatterer) fill in the
 * dense understory; this layer only anchors the canopy.
 *
 * Design + reuse/AVOID rationale: docs/rearch/VEGETATION_PHASE_II_GLB_HERO_SCATTER_2026-06-25.md.
 *
 * The runtime dependencies (model loader, impostor registrar, scene, height
 * sampler) are injected so the streaming/placement logic is unit-testable
 * without three.js asset loading or a live renderer.
 */

/** A served-URL GLB loader (structurally satisfied by ModelLoader). */
export interface HeroModelLoader {
  loadModelFromUrl(servedUrl: string): Promise<THREE.Group>;
  disposeInstance(instance: THREE.Object3D): void;
}

/** The impostor registrar (structurally satisfied by StaticImpostorSystem). */
export interface HeroImpostorRegistrar {
  registerInstance(params: { id: string; modelPath: string; object: THREE.Object3D }): boolean;
  unregisterInstance(id: string): void;
  update(deltaTime: number): void;
}

export interface GLBHeroScattererDeps {
  scene: THREE.Object3D;
  modelLoader: HeroModelLoader;
  impostors: HeroImpostorRegistrar;
  /** Terrain height at world (x, z). */
  getHeight: (x: number, z: number) => number;
  /** Hero archetypes keyed by slug (== asset id == palette typeId). From the adapter. */
  archetypes: Readonly<Record<string, StaticImpostorArchetype>>;
}

export interface GLBHeroScattererDebugInfo {
  activeCells: number;
  targetCells: number;
  pendingAdditions: number;
  pendingRemovals: number;
  registeredInstances: number;
  inFlightLoads: number;
}

interface HeroPlacement {
  slug: string;
  modelPath: string;
  x: number;
  z: number;
  y: number;
  yaw: number;
  scale: number;
}

interface HeroCellResidency {
  /** Bumped each time the cell is (re)generated; stale async loads self-cancel. */
  generation: number;
  ids: string[];
  objects: THREE.Object3D[];
  inFlight: number;
}

const DEG2RAD = Math.PI / 180;

export class GLBHeroScatterer {
  /** Canopy hero spacing (m) at densityMultiplier 1.0; effective spacing grows as density falls. */
  private static readonly BASE_SPACING_M = 26;
  /** Reject heroes on slopes steeper than this (jungle-tree ecology slopeRangeDeg [0,20]). */
  private static readonly MAX_SLOPE_DEG = 20;
  /** Low-frequency patch gate: skip placement where the patch field is below this. */
  private static readonly PATCH_GATE = 0.12;
  private static readonly SLOPE_SAMPLE_DIST_M = 2;

  private readonly deps: GLBHeroScattererDeps;
  private cellSize: number;
  private maxCellDistance: number;

  private readonly activeCells = new Map<string, HeroCellResidency>();
  private readonly targetCells = new Set<string>();
  private readonly pendingAdditions: string[] = [];
  private readonly pendingRemovals: string[] = [];

  private defaultBiomeId = 'denseJungle';
  private biomeRules: BiomeClassificationRule[] = [];
  private biomePalettes = new Map<string, BiomeVegetationEntry[]>();

  private worldHalfExtent = Infinity;
  private visualMargin = 200;
  private lastPlayerCellX = NaN;
  private lastPlayerCellZ = NaN;
  private idCounter = 0;
  private registeredInstances = 0;
  private inFlightLoads = 0;

  constructor(deps: GLBHeroScattererDeps, cellSize = 128, maxCellDistance = 6) {
    this.deps = deps;
    this.cellSize = cellSize;
    this.maxCellDistance = maxCellDistance;
  }

  setWorldBounds(worldSize: number, visualMargin = 200): void {
    this.worldHalfExtent = worldSize * 0.5;
    this.visualMargin = Math.max(0, visualMargin);
  }

  /**
   * Set biome classification + per-biome palettes. The hero scatterer reads the
   * SAME BiomeVegetationEntry palette as the billboard scatterer; it simply
   * filters to entries whose typeId matches a registered hero archetype slug.
   */
  configure(
    defaultBiomeId: string,
    biomePalettes: Map<string, BiomeVegetationEntry[]>,
    biomeRules: BiomeClassificationRule[],
  ): void {
    this.defaultBiomeId = defaultBiomeId;
    this.biomePalettes = new Map(biomePalettes);
    this.biomeRules = biomeRules.slice();
  }

  /** Whether any configured palette places at least one hero archetype. */
  private hasAnyHeroPalette(): boolean {
    if (Object.keys(this.deps.archetypes).length === 0) return false;
    for (const palette of this.biomePalettes.values()) {
      for (const entry of palette) {
        if (entry.densityMultiplier > 0 && entry.typeId in this.deps.archetypes) return true;
      }
    }
    return false;
  }

  /**
   * Stream cells in/out around the player within a per-frame add/remove budget.
   * Returns true if any cell work happened this call.
   */
  updateBudgeted(
    playerPosition: THREE.Vector3,
    options: { maxAddsPerFrame: number; maxRemovalsPerFrame: number },
  ): boolean {
    const cellX = Math.floor(playerPosition.x / this.cellSize);
    const cellZ = Math.floor(playerPosition.z / this.cellSize);
    if (cellX !== this.lastPlayerCellX || cellZ !== this.lastPlayerCellZ) {
      this.lastPlayerCellX = cellX;
      this.lastPlayerCellZ = cellZ;
      this.rebuildResidencyTargets(cellX, cellZ);
    }

    let didWork = false;

    const maxRemovals = Math.max(0, options.maxRemovalsPerFrame);
    let removed = 0;
    while (removed < maxRemovals && this.pendingRemovals.length > 0) {
      const key = this.pendingRemovals.shift()!;
      this.evictCell(key);
      removed++;
      didWork = true;
    }

    const maxAdds = Math.max(0, options.maxAddsPerFrame);
    let added = 0;
    while (added < maxAdds && this.pendingAdditions.length > 0) {
      const key = this.pendingAdditions.shift()!;
      this.generateCell(key);
      added++;
      didWork = true;
    }

    return didWork;
  }

  /** Per-frame impostor LOD update (mesh <-> impostor by camera distance). */
  updateImpostors(deltaTime: number): void {
    this.deps.impostors.update(deltaTime);
  }

  getPendingCounts(): { adds: number; removals: number } {
    return { adds: this.pendingAdditions.length, removals: this.pendingRemovals.length };
  }

  getDebugInfo(): GLBHeroScattererDebugInfo {
    return {
      activeCells: this.activeCells.size,
      targetCells: this.targetCells.size,
      pendingAdditions: this.pendingAdditions.length,
      pendingRemovals: this.pendingRemovals.length,
      registeredInstances: this.registeredInstances,
      inFlightLoads: this.inFlightLoads,
    };
  }

  /** Force-clear all heroes and reset streaming state. */
  clear(): void {
    for (const key of [...this.activeCells.keys()]) {
      this.evictCell(key);
    }
    this.activeCells.clear();
    this.targetCells.clear();
    this.pendingAdditions.length = 0;
    this.pendingRemovals.length = 0;
    this.lastPlayerCellX = NaN;
    this.lastPlayerCellZ = NaN;
  }

  dispose(): void {
    this.clear();
  }

  private rebuildResidencyTargets(cellX: number, cellZ: number): void {
    this.targetCells.clear();
    if (this.hasAnyHeroPalette()) {
      for (let dx = -this.maxCellDistance; dx <= this.maxCellDistance; dx++) {
        for (let dz = -this.maxCellDistance; dz <= this.maxCellDistance; dz++) {
          this.targetCells.add(`${cellX + dx},${cellZ + dz}`);
        }
      }
    }

    // Queue removals for cells no longer needed.
    this.pendingRemovals.length = 0;
    for (const key of this.activeCells.keys()) {
      if (!this.targetCells.has(key)) this.pendingRemovals.push(key);
    }

    // Queue additions (nearest first) for needed cells not yet active.
    this.pendingAdditions.length = 0;
    const additions: Array<{ key: string; dist: number }> = [];
    for (const key of this.targetCells) {
      if (this.activeCells.has(key)) continue;
      const [kx, kz] = key.split(',');
      const dist = Math.abs(Number(kx) - cellX) + Math.abs(Number(kz) - cellZ);
      additions.push({ key, dist });
    }
    additions.sort((a, b) => a.dist - b.dist);
    for (const a of additions) this.pendingAdditions.push(a.key);
  }

  private evictCell(key: string): void {
    const residency = this.activeCells.get(key);
    if (!residency) return;
    // Invalidate in-flight loads for this cell.
    residency.generation++;
    for (let i = 0; i < residency.ids.length; i++) {
      this.deps.impostors.unregisterInstance(residency.ids[i]);
      this.deps.modelLoader.disposeInstance(residency.objects[i]);
      this.registeredInstances--;
    }
    this.activeCells.delete(key);
  }

  private generateCell(key: string): void {
    if (this.activeCells.has(key)) return;

    const comma = key.indexOf(',');
    const cellX = Number(key.slice(0, comma));
    const cellZ = Number(key.slice(comma + 1));

    const baseX = cellX * this.cellSize;
    const baseZ = cellZ * this.cellSize;
    const centerX = baseX + this.cellSize * 0.5;
    const centerZ = baseZ + this.cellSize * 0.5;

    // Skip cells beyond the visual terrain margin.
    const limit = this.worldHalfExtent + this.visualMargin;
    if (Math.abs(centerX) > limit || Math.abs(centerZ) > limit) {
      this.activeCells.set(key, { generation: 0, ids: [], objects: [], inFlight: 0 });
      return;
    }

    const placements = this.computePlacements(cellX, cellZ, baseX, baseZ);
    const residency: HeroCellResidency = { generation: 0, ids: [], objects: [], inFlight: 0 };
    this.activeCells.set(key, residency);

    const generationAtLoad = residency.generation;
    for (const placement of placements) {
      residency.inFlight++;
      this.inFlightLoads++;
      this.deps.modelLoader
        .loadModelFromUrl(placement.modelPath)
        .then((object) => {
          this.onHeroLoaded(key, generationAtLoad, placement, object);
        })
        .catch(() => {
          // Drop silently; loader logs the failure.
        })
        .finally(() => {
          this.inFlightLoads--;
          const current = this.activeCells.get(key);
          if (current && current.generation === generationAtLoad) current.inFlight--;
        });
    }
  }

  private onHeroLoaded(
    key: string,
    generationAtLoad: number,
    placement: HeroPlacement,
    object: THREE.Group,
  ): void {
    const residency = this.activeCells.get(key);
    // Cell was evicted (or regenerated) while loading: discard the stale clone.
    if (!residency || residency.generation !== generationAtLoad) {
      this.deps.modelLoader.disposeInstance(object);
      return;
    }

    // The GLB is pre-normalized (Y-up, ground-center pivot): place at terrain height directly.
    object.position.set(placement.x, placement.y, placement.z);
    object.rotation.y = placement.yaw;
    object.scale.setScalar(placement.scale);
    object.updateMatrixWorld(true);
    this.deps.scene.add(object);

    const id = `veg-hero:${placement.slug}:${this.idCounter++}`;
    const accepted = this.deps.impostors.registerInstance({
      id,
      modelPath: placement.modelPath,
      object,
    });
    if (!accepted) {
      // Archetype unknown to this impostor system or object unsafe: keep the mesh
      // in the scene but do not track it for impostor LOD; still track for teardown.
      residency.ids.push(id);
      residency.objects.push(object);
      this.registeredInstances++;
      return;
    }
    residency.ids.push(id);
    residency.objects.push(object);
    this.registeredInstances++;
  }

  /** Deterministic sparse hero placements for a cell (one pass per hero archetype in the palette). */
  private computePlacements(cellX: number, cellZ: number, baseX: number, baseZ: number): HeroPlacement[] {
    const centerX = baseX + this.cellSize * 0.5;
    const centerZ = baseZ + this.cellSize * 0.5;
    const centerHeight = this.deps.getHeight(centerX, centerZ);
    const centerSlope = computeSlopeDeg(centerX, centerZ, 4, this.deps.getHeight);
    const biomeId = classifyBiome(centerHeight, centerSlope, this.biomeRules, this.defaultBiomeId);
    const palette = this.biomePalettes.get(biomeId) ?? this.biomePalettes.get(this.defaultBiomeId);
    if (!palette) return [];

    const placements: HeroPlacement[] = [];
    for (const entry of palette) {
      const archetype = this.deps.archetypes[entry.typeId];
      if (!archetype || entry.densityMultiplier <= 0) continue;
      this.placeHeroSpecies(archetype, entry.densityMultiplier, cellX, cellZ, baseX, baseZ, placements);
    }
    return placements;
  }

  private placeHeroSpecies(
    archetype: StaticImpostorArchetype,
    density: number,
    cellX: number,
    cellZ: number,
    baseX: number,
    baseZ: number,
    out: HeroPlacement[],
  ): void {
    // Effective spacing grows as density falls: spacing = base / sqrt(density).
    const spacing = GLBHeroScatterer.BASE_SPACING_M / Math.sqrt(Math.max(0.01, density));
    const cols = Math.max(1, Math.floor(this.cellSize / spacing));
    const cellStep = this.cellSize / cols;
    const salt = hashString(archetype.slug);

    for (let gx = 0; gx < cols; gx++) {
      for (let gz = 0; gz < cols; gz++) {
        // Jitter the grid node deterministically inside its sub-cell.
        const jx = hashInts(cellX * 131 + gx, cellZ * 131 + gz, salt) / 0xffffffff;
        const jz = hashInts(cellX * 131 + gx, cellZ * 131 + gz, salt ^ 0x9e3779b9) / 0xffffffff;
        const localX = (gx + jx) * cellStep;
        const localZ = (gz + jz) * cellStep;
        const worldX = baseX + localX;
        const worldZ = baseZ + localZ;

        // Low-frequency patch gate so heroes cluster naturally rather than gridding.
        const patch = valueNoise01(worldX / 64, worldZ / 64, salt ^ 0xBEEF);
        if (patch < GLBHeroScatterer.PATCH_GATE) continue;

        const h = this.deps.getHeight(worldX, worldZ);
        if (h < 0) continue; // underwater
        const slope = computeSlopeDeg(worldX, worldZ, GLBHeroScatterer.SLOPE_SAMPLE_DIST_M, this.deps.getHeight);
        if (slope > GLBHeroScatterer.MAX_SLOPE_DEG) continue;

        const yawHash = hashInts(gx + cellX * 977, gz + cellZ * 977, salt ^ 0xA5A5);
        const yaw = (yawHash / 0xffffffff) * 360 * DEG2RAD;
        const scaleHash = hashInts(gx + cellX * 31, gz + cellZ * 31, salt ^ 0x1234);
        const scale = 0.9 + (scaleHash / 0xffffffff) * 0.3;

        out.push({
          slug: archetype.slug,
          modelPath: archetype.modelPath,
          x: worldX,
          z: worldZ,
          y: h,
          yaw,
          scale,
        });
      }
    }
  }
}

// --- deterministic hashing (mirrors ChunkVegetationGenerator's integer-hash scheme) ---

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashInts(a: number, b: number, salt: number): number {
  let hash = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ (salt | 0);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1274126177);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function valueNoise01(x: number, z: number, salt: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const max = 0xffffffff;
  const a = hashInts(x0, z0, salt) / max;
  const b = hashInts(x0 + 1, z0, salt) / max;
  const c = hashInts(x0, z0 + 1, salt) / max;
  const d = hashInts(x0 + 1, z0 + 1, salt) / max;
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sz;
}
