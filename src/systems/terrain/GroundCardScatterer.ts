// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { VegetationGroundCardArchetype } from '../../config/vegetation/groundCardArchetypes';
import type { BiomeClassificationRule, BiomeVegetationEntry } from '../../config/biomes';
import type { TerrainExclusionZone } from './TerrainFeatureTypes';
import { classifyBiome, computeSlopeDeg } from './BiomeClassifier';
import { GroundCardNearMeshTier } from './GroundCardNearMeshTier';

/**
 * Dense ground-cover scatterer (understory-fern / taro-elephant-ear / rice-paddy).
 *
 * World-anchored, per-cell streaming on the SAME lifecycle as GLBHeroScatterer:
 * plants are pinned in world space and stream in/out by cell as the player moves.
 * This is deliberately NOT the rejected camera-following JungleGroundRing — every
 * placement is deterministic from its world cell and never re-rolls under the camera.
 *
 * Two cheap LOD tiers per species, keyed off the per-archetype distances from the
 * vegetation-library catalog:
 *  - FAR (meshFarEdge .. cull): one INSTANCED 2-plane alpha cross per (cell, species),
 *    sharing ONE unit cross geometry + ONE baked-atlas material per species. Hundreds
 *    of plants in a cell cost a single draw + a single texture; per-cell distance +
 *    frustum culling drop cells outside the cull radius. Cards are NEVER one clone each.
 *  - NEAR (0 .. meshFarEdge): the real GLB mesh, promoted for the closest plants only
 *    (global cap), with the matching card instance hidden so there is no double-draw.
 *    Bounded + hysteretic so walking does not thrash the GLB loader.
 *
 * The archetypes are INJECTED (from `vegetationLibraryGroundCards()`) and kept isolated
 * from the global STATIC_IMPOSTOR_ARCHETYPES registry, exactly like the hero path. All
 * runtime dependencies (scene, model loader, height sampler, texture provider) are
 * injected so the streaming/placement maths is unit-testable without a live renderer.
 */

/** A served-URL GLB loader (structurally satisfied by ModelLoader). */
export interface GroundCardModelLoader {
  loadModelFromUrl(servedUrl: string): Promise<THREE.Group>;
  disposeInstance(instance: THREE.Object3D): void;
}

/** Builds a card texture from a served URL. Omitted in tests (cards render untextured). */
export interface GroundCardTextureProvider {
  load(url: string, colorSpace: THREE.ColorSpace): THREE.Texture;
}

export interface GroundCardScattererDeps {
  scene: THREE.Object3D;
  modelLoader: GroundCardModelLoader;
  /** Terrain height at world (x, z). */
  getHeight: (x: number, z: number) => number;
  /** Ground-card archetypes keyed by slug (== asset id == palette typeId). From the adapter. */
  archetypes: Readonly<Record<string, VegetationGroundCardArchetype>>;
  /** Optional baked-atlas texture provider. When omitted, cards render untextured (tests). */
  textureProvider?: GroundCardTextureProvider;
  /** Cap on concurrently-promoted near GLB meshes. 0 disables the near tier (cards only). */
  maxNearMeshes?: number;
}

export interface GroundCardScattererDebugInfo {
  activeCells: number;
  targetCells: number;
  pendingAdditions: number;
  pendingRemovals: number;
  cardBatches: number;
  cardInstances: number;
  visibleBatches: number;
  nearMeshes: number;
  inFlightNearLoads: number;
}

export interface GroundCardPlacement {
  x: number;
  z: number;
  /** Terrain height — the near GLB (ground-pivot) and the base-anchored card both sit here. */
  height: number;
  yaw: number;
  scale: number;
}

export interface GroundCardBatch {
  slug: string;
  mesh: THREE.InstancedMesh;
  placements: GroundCardPlacement[];
  /** Original per-instance matrices, restored when a near mesh demotes. */
  baseMatrices: THREE.Matrix4[];
  /** Instance indices currently hidden because a near GLB mesh is shown instead. */
  hidden: Set<number>;
  meshFarEdgeSq: number;
  meshDemoteSq: number;
  cullDistanceSq: number;
}

export interface GroundCardCellResidency {
  /** Bumped on (re)generation; stale async near-mesh loads self-cancel. */
  generation: number;
  cellX: number;
  cellZ: number;
  batches: GroundCardBatch[];
  empty: boolean;
}

const DEG2RAD = Math.PI / 180;

export class GroundCardScatterer {
  /** Card spacing (m) at effective density 1.0; effective spacing grows as density falls. */
  private static readonly BASE_SPACING_M = 3.4;
  /** Low-frequency patch gate: skip placement where the patch field is below this. */
  private static readonly PATCH_GATE = 0.1;
  private static readonly SLOPE_SAMPLE_DIST_M = 2;
  /** Demote a near mesh once the plant is this factor past meshFarEdge (anti-thrash). */
  private static readonly MESH_DEMOTE_HYSTERESIS = 1.18;
  /** Hard ceiling per (cell, species) so a pathological cell cannot explode instance counts. */
  private static readonly MAX_INSTANCES_PER_BATCH = 4096;
  private static readonly DEFAULT_MAX_NEAR_MESHES = 32;

  private readonly deps: GroundCardScattererDeps;
  private readonly nearMeshTier: GroundCardNearMeshTier;
  private cellSize: number;
  private maxCellDistance: number;

  private readonly crossGeometry: THREE.BufferGeometry;
  private readonly materials = new Map<string, THREE.Material>();

  private readonly activeCells = new Map<string, GroundCardCellResidency>();
  private readonly targetCells = new Set<string>();
  private readonly pendingAdditions: string[] = [];
  private readonly pendingRemovals: string[] = [];

  private defaultBiomeId = 'denseJungle';
  private biomeRules: BiomeClassificationRule[] = [];
  private biomePalettes = new Map<string, BiomeVegetationEntry[]>();
  private exclusionZones: Array<{ x: number; z: number; radiusSq: number }> = [];

  private worldHalfExtent = Infinity;
  private visualMargin = 200;
  private lastPlayerCellX = NaN;
  private lastPlayerCellZ = NaN;
  private readonly lastPlayerPos = new THREE.Vector3();
  private hasPlayerPos = false;
  private idCounter = 0;

  // Scratch objects reused across placement maths (never escape a method).
  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly scratchPos = new THREE.Vector3();
  private readonly scratchScale = new THREE.Vector3();
  private readonly scratchUp = new THREE.Vector3(0, 1, 0);

  constructor(deps: GroundCardScattererDeps, cellSize = 128, maxCellDistance?: number) {
    this.deps = deps;
    this.cellSize = cellSize;
    this.maxCellDistance = maxCellDistance ?? this.resolveMaxCellDistance();
    this.crossGeometry = buildCrossGeometry();
    this.nearMeshTier = new GroundCardNearMeshTier({
      scene: deps.scene,
      modelLoader: deps.modelLoader,
      archetypes: deps.archetypes,
      cellSize,
      maxNearMeshes: Math.max(0, deps.maxNearMeshes ?? GroundCardScatterer.DEFAULT_MAX_NEAR_MESHES),
      activeCells: this.activeCells,
    });
  }

  /** Residency radius (cells) that covers the densest species' cull distance. */
  private resolveMaxCellDistance(): number {
    let maxCull = 0;
    for (const arch of Object.values(this.deps.archetypes)) {
      maxCull = Math.max(maxCull, arch.cullDistanceMeters);
    }
    if (maxCull <= 0) return 1;
    return Math.max(1, Math.ceil(maxCull / this.cellSize));
  }

  setWorldBounds(worldSize: number, visualMargin = 200): void {
    this.worldHalfExtent = worldSize * 0.5;
    this.visualMargin = Math.max(0, visualMargin);
  }

  /**
   * Set biome classification + per-biome palettes. The card scatterer reads the SAME
   * BiomeVegetationEntry palette as every other scatterer; it filters to entries whose
   * typeId matches a registered ground-card archetype slug (dual-namespace: kebab card
   * ids never collide with the camelCase billboard ids).
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

  setExclusionZones(zones: TerrainExclusionZone[]): void {
    this.exclusionZones = zones.map((zone) => ({
      x: zone.x,
      z: zone.z,
      radiusSq: zone.radius * zone.radius,
    }));
  }

  /** Whether any configured palette places at least one ground-card archetype. */
  private hasAnyGroundCardPalette(): boolean {
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
   * Returns true if any cell work happened this call. Per-frame visibility + near-mesh
   * LOD live in updateLod() (every frame, off the streaming budget).
   */
  updateBudgeted(
    playerPosition: THREE.Vector3,
    options: { maxAddsPerFrame: number; maxRemovalsPerFrame: number },
  ): boolean {
    this.lastPlayerPos.copy(playerPosition);
    this.hasPlayerPos = true;

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
      this.evictCell(this.pendingRemovals.shift()!);
      removed++;
      didWork = true;
    }

    const maxAdds = Math.max(0, options.maxAddsPerFrame);
    let added = 0;
    while (added < maxAdds && this.pendingAdditions.length > 0) {
      this.generateCell(this.pendingAdditions.shift()!);
      added++;
      didWork = true;
    }

    return didWork;
  }

  /**
   * Per-frame, non-budgeted update: per-cell distance/frustum culling toggles + near-mesh
   * LOD swaps. Runs every frame using the last player position cached by updateBudgeted
   * (the streaming budget may skip frames, but cull/LOD must not).
   */
  updateLod(_deltaTime: number): void {
    if (!this.hasPlayerPos) return;
    this.refreshCulling(this.lastPlayerPos);
    this.nearMeshTier.refresh(this.lastPlayerPos);
  }

  getPendingCounts(): { adds: number; removals: number } {
    return { adds: this.pendingAdditions.length, removals: this.pendingRemovals.length };
  }

  getDebugInfo(): GroundCardScattererDebugInfo {
    let cardBatches = 0;
    let cardInstances = 0;
    let visibleBatches = 0;
    for (const residency of this.activeCells.values()) {
      for (const batch of residency.batches) {
        cardBatches++;
        cardInstances += batch.placements.length;
        if (batch.mesh.visible) visibleBatches++;
      }
    }
    return {
      activeCells: this.activeCells.size,
      targetCells: this.targetCells.size,
      pendingAdditions: this.pendingAdditions.length,
      pendingRemovals: this.pendingRemovals.length,
      cardBatches,
      cardInstances,
      visibleBatches,
      nearMeshes: this.nearMeshTier.activeCount,
      inFlightNearLoads: this.nearMeshTier.inFlightLoadCount,
    };
  }

  /** Force-clear all cards + near meshes and reset streaming state. */
  clear(): void {
    for (const key of [...this.activeCells.keys()]) this.evictCell(key);
    this.activeCells.clear();
    this.targetCells.clear();
    this.pendingAdditions.length = 0;
    this.pendingRemovals.length = 0;
    this.lastPlayerCellX = NaN;
    this.lastPlayerCellZ = NaN;
  }

  dispose(): void {
    this.clear();
    this.crossGeometry.dispose();
    for (const mat of this.materials.values()) {
      const map = (mat as THREE.MeshStandardMaterial).map;
      if (map) map.dispose();
      mat.dispose();
    }
    this.materials.clear();
  }

  private rebuildResidencyTargets(cellX: number, cellZ: number): void {
    this.targetCells.clear();
    if (this.hasAnyGroundCardPalette()) {
      for (let dx = -this.maxCellDistance; dx <= this.maxCellDistance; dx++) {
        for (let dz = -this.maxCellDistance; dz <= this.maxCellDistance; dz++) {
          this.targetCells.add(`${cellX + dx},${cellZ + dz}`);
        }
      }
    }

    this.pendingRemovals.length = 0;
    for (const key of this.activeCells.keys()) {
      if (!this.targetCells.has(key)) this.pendingRemovals.push(key);
    }

    this.pendingAdditions.length = 0;
    const additions: Array<{ key: string; dist: number }> = [];
    for (const key of this.targetCells) {
      if (this.activeCells.has(key)) continue;
      const comma = key.indexOf(',');
      const kx = Number(key.slice(0, comma));
      const kz = Number(key.slice(comma + 1));
      additions.push({ key, dist: Math.abs(kx - cellX) + Math.abs(kz - cellZ) });
    }
    additions.sort((a, b) => a.dist - b.dist);
    for (const a of additions) this.pendingAdditions.push(a.key);
  }

  private evictCell(key: string): void {
    const residency = this.activeCells.get(key);
    if (!residency) return;
    // Invalidate in-flight near-mesh loads for this cell.
    residency.generation++;

    // Demote + dispose any near meshes that belong to this cell.
    this.nearMeshTier.evictCell(key);

    for (const batch of residency.batches) {
      this.deps.scene.remove(batch.mesh);
      batch.mesh.dispose(); // frees the per-instance matrix buffer; shared geom/material kept
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

    const residency: GroundCardCellResidency = {
      generation: 0,
      cellX,
      cellZ,
      batches: [],
      empty: true,
    };
    this.activeCells.set(key, residency);

    // Skip cells beyond the visual terrain margin.
    const limit = this.worldHalfExtent + this.visualMargin;
    if (Math.abs(centerX) > limit || Math.abs(centerZ) > limit) return;

    const centerHeight = this.deps.getHeight(centerX, centerZ);
    const centerSlope = computeSlopeDeg(centerX, centerZ, 4, this.deps.getHeight);
    const biomeId = classifyBiome(centerHeight, centerSlope, this.biomeRules, this.defaultBiomeId);
    const palette = this.biomePalettes.get(biomeId) ?? this.biomePalettes.get(this.defaultBiomeId);
    if (!palette) return;

    for (const entry of palette) {
      const archetype = this.deps.archetypes[entry.typeId];
      if (!archetype || entry.densityMultiplier <= 0) continue;
      const placements = this.computePlacements(archetype, entry.densityMultiplier, cellX, cellZ, baseX, baseZ);
      if (placements.length === 0) continue;
      residency.batches.push(this.buildBatch(key, archetype, placements));
      residency.empty = false;
    }
  }

  private buildBatch(
    cellKey: string,
    archetype: VegetationGroundCardArchetype,
    placements: GroundCardPlacement[],
  ): GroundCardBatch {
    const material = this.materialFor(archetype);
    const mesh = new THREE.InstancedMesh(this.crossGeometry, material, placements.length);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    mesh.name = `veg-card:${archetype.slug}:${cellKey}`;

    const baseMatrices: THREE.Matrix4[] = [];
    const w = archetype.cardWorldSize[0];
    const h = archetype.cardWorldSize[1];
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      this.scratchPos.set(p.x, p.height, p.z); // base-anchored geometry → origin sits on terrain
      this.scratchQuat.setFromAxisAngle(this.scratchUp, p.yaw);
      this.scratchScale.set(w * p.scale, h * p.scale, w * p.scale);
      this.scratchMatrix.compose(this.scratchPos, this.scratchQuat, this.scratchScale);
      mesh.setMatrixAt(i, this.scratchMatrix);
      baseMatrices.push(this.scratchMatrix.clone());
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere(); // drives THREE's per-object frustum cull for this cell

    this.deps.scene.add(mesh);

    const far = archetype.meshFarEdgeMeters;
    const demote = far * GroundCardScatterer.MESH_DEMOTE_HYSTERESIS;
    return {
      slug: archetype.slug,
      mesh,
      placements,
      baseMatrices,
      hidden: new Set<number>(),
      meshFarEdgeSq: far * far,
      meshDemoteSq: demote * demote,
      cullDistanceSq: archetype.cullDistanceMeters * archetype.cullDistanceMeters,
    };
  }

  /** Shared, lazily-built MeshStandardMaterial per species (one baked atlas, alpha-cutout). */
  private materialFor(archetype: VegetationGroundCardArchetype): THREE.Material {
    const existing = this.materials.get(archetype.slug);
    if (existing) return existing;

    const material = new THREE.MeshStandardMaterial({
      alphaTest: 0.5,
      transparent: false,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    });
    if (this.deps.textureProvider) {
      try {
        const map = this.deps.textureProvider.load(archetype.card.baseColor, THREE.SRGBColorSpace);
        material.map = map;
        material.needsUpdate = true;
      } catch {
        // Untextured fallback (still alpha-opaque); production always supplies a provider.
      }
    }
    this.materials.set(archetype.slug, material);
    return material;
  }

  /** Deterministic world-anchored placements for one species in a cell. */
  private computePlacements(
    archetype: VegetationGroundCardArchetype,
    densityMultiplier: number,
    cellX: number,
    cellZ: number,
    baseX: number,
    baseZ: number,
  ): GroundCardPlacement[] {
    const effectiveDensity = Math.max(0.02, densityMultiplier * archetype.density);
    const spacing = GroundCardScatterer.BASE_SPACING_M / Math.sqrt(effectiveDensity);
    const cols = Math.max(1, Math.floor(this.cellSize / spacing));
    const cellStep = this.cellSize / cols;
    const salt = hashString(archetype.slug);
    const limit = this.worldHalfExtent + this.visualMargin;

    const out: GroundCardPlacement[] = [];
    for (let gx = 0; gx < cols; gx++) {
      for (let gz = 0; gz < cols; gz++) {
        if (out.length >= GroundCardScatterer.MAX_INSTANCES_PER_BATCH) return out;

        const jx = hashInts(cellX * 131 + gx, cellZ * 131 + gz, salt) / 0xffffffff;
        const jz = hashInts(cellX * 131 + gx, cellZ * 131 + gz, salt ^ 0x9e3779b9) / 0xffffffff;
        const worldX = baseX + (gx + jx) * cellStep;
        const worldZ = baseZ + (gz + jz) * cellStep;
        if (Math.abs(worldX) > limit || Math.abs(worldZ) > limit) continue;

        // Low-frequency patch gate so cover clusters naturally rather than gridding.
        const patch = valueNoise01(worldX / 48, worldZ / 48, salt ^ 0xbeef);
        if (patch < GroundCardScatterer.PATCH_GATE) continue;

        const height = this.deps.getHeight(worldX, worldZ);
        if (height < 0) continue; // underwater
        const slope = computeSlopeDeg(worldX, worldZ, GroundCardScatterer.SLOPE_SAMPLE_DIST_M, this.deps.getHeight);
        if (slope > archetype.maxSlopeDeg) continue;
        if (this.isExcluded(worldX, worldZ)) continue;

        const yawHash = hashInts(gx + cellX * 977, gz + cellZ * 977, salt ^ 0xa5a5);
        const yaw = (yawHash / 0xffffffff) * 360 * DEG2RAD;
        const scaleHash = hashInts(gx + cellX * 31, gz + cellZ * 31, salt ^ 0x1234);
        const scale = 0.8 + (scaleHash / 0xffffffff) * 0.4;

        out.push({ x: worldX, z: worldZ, height, yaw, scale });
      }
    }
    return out;
  }

  private isExcluded(worldX: number, worldZ: number): boolean {
    for (const zone of this.exclusionZones) {
      const dx = worldX - zone.x;
      const dz = worldZ - zone.z;
      if (dx * dx + dz * dz <= zone.radiusSq) return true;
    }
    return false;
  }

  /** Per-cell distance cull (per species) — toggles InstancedMesh.visible. */
  private refreshCulling(player: THREE.Vector3): void {
    for (const residency of this.activeCells.values()) {
      if (residency.empty) continue;
      const minX = residency.cellX * this.cellSize;
      const minZ = residency.cellZ * this.cellSize;
      const maxX = minX + this.cellSize;
      const maxZ = minZ + this.cellSize;
      const nx = clamp(player.x, minX, maxX);
      const nz = clamp(player.z, minZ, maxZ);
      const dx = player.x - nx;
      const dz = player.z - nz;
      const nearestSq = dx * dx + dz * dz;
      for (const batch of residency.batches) {
        batch.mesh.visible = nearestSq <= batch.cullDistanceSq;
      }
    }
  }
}

// --- geometry -------------------------------------------------------------------

/**
 * A unit 2-plane cross, base-anchored: two perpendicular vertical quads spanning
 * x/z in [-0.5, 0.5] and y in [0, 1], so the instance origin sits on the terrain and a
 * per-instance scale of (cardWidth, cardHeight, cardWidth) yields the world footprint.
 * Up-facing vertex normals keep both planes evenly lit (no dark backside) under DoubleSide.
 */
function buildCrossGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([
    // plane A (faces ±Z), at z = 0
    -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0,
    // plane B (faces ±X), at x = 0
    0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
  ]);
  const normals = new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]);
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
  ];
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

// --- helpers --------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// --- deterministic hashing (mirrors GLBHeroScatterer's integer-hash scheme) ------

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
