import * as THREE from 'three';
import type { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';
import { modelLoader } from '../assets/ModelLoader';
import { AnimalModels } from '../assets/modelPaths';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';

/**
 * Ambient wildlife system. Spawns small groups of animals near the player
 * using a cell-based approach (128m cells). Animals are purely cosmetic:
 * no collision, no combat interaction.
 */

// ── Animal type definitions ──

type AnimalKind = 'egret' | 'water_buffalo' | 'macaque' | 'wild_boar' | 'king_cobra' | 'tiger';

interface AnimalConfig {
  kind: AnimalKind;
  modelPath: string;
  scale: number;
  perCell: number;
  /** Wander speed in m/s. 0 = stationary. */
  wanderSpeed: number;
  /** Spawn weight for weighted random selection. Higher = more common. */
  spawnWeight: number;
  /** Minimum terrain height for spawning. */
  minHeight: number;
}

const ANIMAL_CONFIGS: AnimalConfig[] = [
  { kind: 'egret', modelPath: AnimalModels.EGRET, scale: 0.6, perCell: 2, wanderSpeed: 0.5, spawnWeight: 0.3, minHeight: 0.2 },
  { kind: 'water_buffalo', modelPath: AnimalModels.WATER_BUFFALO, scale: 1.0, perCell: 1, wanderSpeed: 0, spawnWeight: 0.25, minHeight: 0.2 },
  { kind: 'macaque', modelPath: AnimalModels.MACAQUE, scale: 0.4, perCell: 2, wanderSpeed: 0.4, spawnWeight: 0.25, minHeight: 0.2 },
  { kind: 'wild_boar', modelPath: AnimalModels.WILD_BOAR, scale: 0.5, perCell: 2, wanderSpeed: 0.3, spawnWeight: 0.3, minHeight: 1.0 },
  { kind: 'king_cobra', modelPath: AnimalModels.KING_COBRA, scale: 0.3, perCell: 1, wanderSpeed: 0.1, spawnWeight: 0.15, minHeight: 0.1 },
  { kind: 'tiger', modelPath: AnimalModels.TIGER, scale: 0.9, perCell: 1, wanderSpeed: 0, spawnWeight: 0.05, minHeight: 2.0 },
];

const CELL_SIZE = 128;
const MAX_CELL_DISTANCE = 2; // ~200m radius (2 cells * 128m)
const DISPOSE_DISTANCE_SQ = 250 * 250;

interface SpawnedAnimal {
  object: THREE.Group;
  kind: AnimalKind;
  wanderSpeed: number;
  wanderAngle: number;
  /** World-space origin for wander radius clamping. */
  originX: number;
  originZ: number;
}

interface AnimalCell {
  key: string;
  animals: SpawnedAnimal[];
}

export class AnimalSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private templates: Map<AnimalKind, THREE.Group> = new Map();
  private activeCells: Map<string, AnimalCell> = new Map();
  private lastPlayerCellX = NaN;
  private lastPlayerCellZ = NaN;
  private ready = false;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
  }

  async init(): Promise<void> {
    Logger.info('world', 'Initializing Animal System...');

    const loadResults = await Promise.allSettled(
      ANIMAL_CONFIGS.map(async (cfg) => {
        const group = await modelLoader.loadModel(cfg.modelPath);
        group.scale.setScalar(cfg.scale);
        this.templates.set(cfg.kind, group);
      })
    );

    const failed = loadResults.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      Logger.warn('world', `AnimalSystem: ${failed}/${ANIMAL_CONFIGS.length} animal models failed to load`);
    }

    this.ready = this.templates.size > 0;
    Logger.info('world', `AnimalSystem ready with ${this.templates.size} animal types`);
  }

  update(deltaTime: number): void {
    if (!this.ready) return;

    const playerPos = this.camera.position;
    const cellX = Math.floor(playerPos.x / CELL_SIZE);
    const cellZ = Math.floor(playerPos.z / CELL_SIZE);

    // Rebuild cells when player crosses a cell boundary
    if (cellX !== this.lastPlayerCellX || cellZ !== this.lastPlayerCellZ) {
      this.lastPlayerCellX = cellX;
      this.lastPlayerCellZ = cellZ;
      this.rebuildCells(cellX, cellZ);
    }

    // Dispose distant cells
    this.pruneDistantCells(playerPos);

    // Animate wandering animals
    this.updateWander(deltaTime);
  }

  dispose(): void {
    for (const cell of this.activeCells.values()) {
      this.removeCell(cell);
    }
    this.activeCells.clear();
    this.templates.clear();
  }

  // ── Private ──

  private rebuildCells(centerCellX: number, centerCellZ: number): void {
    const neededKeys = new Set<string>();

    for (let dx = -MAX_CELL_DISTANCE; dx <= MAX_CELL_DISTANCE; dx++) {
      for (let dz = -MAX_CELL_DISTANCE; dz <= MAX_CELL_DISTANCE; dz++) {
        neededKeys.add(`${centerCellX + dx},${centerCellZ + dz}`);
      }
    }

    // Remove cells no longer needed
    for (const [key, cell] of this.activeCells) {
      if (!neededKeys.has(key)) {
        this.removeCell(cell);
        this.activeCells.delete(key);
      }
    }

    // Add new cells
    for (const key of neededKeys) {
      if (!this.activeCells.has(key)) {
        const cell = this.spawnCell(key);
        if (cell) {
          this.activeCells.set(key, cell);
        }
      }
    }
  }

  private spawnCell(cellKey: string): AnimalCell | null {
    const [cxStr, czStr] = cellKey.split(',');
    const cellX = parseInt(cxStr, 10);
    const cellZ = parseInt(czStr, 10);

    const baseX = cellX * CELL_SIZE;
    const baseZ = cellZ * CELL_SIZE;
    const cache = getHeightQueryCache();
    const animals: SpawnedAnimal[] = [];

    // Deterministic seed per cell for repeatable placement
    const cellSeed = this.hashCell(cellX, cellZ);
    let seedState = cellSeed;

    // Pick animal type for this cell via weighted random selection
    const cfg = this.pickWeightedAnimal(seedState);
    seedState = this.nextRand(seedState);
    if (!cfg) return null;

    const template = this.templates.get(cfg.kind);
    if (!template) return null;

    for (let i = 0; i < cfg.perCell; i++) {
      // Pseudo-random position within cell
      seedState = this.nextRand(seedState);
      const lx = ((seedState & 0xffff) / 0xffff) * CELL_SIZE;
      seedState = this.nextRand(seedState);
      const lz = ((seedState & 0xffff) / 0xffff) * CELL_SIZE;

      const wx = baseX + lx;
      const wz = baseZ + lz;
      const wy = cache.getHeightAt(wx, wz);

      // Skip positions below the animal's minimum height threshold
      if (wy < cfg.minHeight) continue;

      const clone = template.clone();
      clone.position.set(wx, wy, wz);

      // Random Y rotation
      seedState = this.nextRand(seedState);
      clone.rotation.y = ((seedState & 0xffff) / 0xffff) * Math.PI * 2;

      this.scene.add(clone);
      animals.push({
        object: clone,
        kind: cfg.kind,
        wanderSpeed: cfg.wanderSpeed,
        wanderAngle: clone.rotation.y,
        originX: wx,
        originZ: wz,
      });
    }

    if (animals.length === 0) return null;
    return { key: cellKey, animals };
  }

  /** Weighted random selection from available animal configs. */
  private pickWeightedAnimal(seed: number): AnimalConfig | null {
    // Build pool of configs that have loaded templates
    const available = ANIMAL_CONFIGS.filter((c) => this.templates.has(c.kind));
    if (available.length === 0) return null;

    const totalWeight = available.reduce((sum, c) => sum + c.spawnWeight, 0);
    const roll = ((seed & 0xffff) / 0xffff) * totalWeight;

    let cumulative = 0;
    for (const cfg of available) {
      cumulative += cfg.spawnWeight;
      if (roll < cumulative) return cfg;
    }
    return available[available.length - 1];
  }

  private removeCell(cell: AnimalCell): void {
    for (const animal of cell.animals) {
      this.scene.remove(animal.object);
    }
  }

  private pruneDistantCells(playerPos: THREE.Vector3): void {
    for (const [key, cell] of this.activeCells) {
      // Check distance from cell center to player
      const [cxStr, czStr] = key.split(',');
      const cx = (parseInt(cxStr, 10) + 0.5) * CELL_SIZE;
      const cz = (parseInt(czStr, 10) + 0.5) * CELL_SIZE;
      const dx = cx - playerPos.x;
      const dz = cz - playerPos.z;

      if (dx * dx + dz * dz > DISPOSE_DISTANCE_SQ) {
        this.removeCell(cell);
        this.activeCells.delete(key);
      }
    }
  }

  private updateWander(dt: number): void {
    const cache = getHeightQueryCache();

    for (const cell of this.activeCells.values()) {
      for (const animal of cell.animals) {
        if (animal.wanderSpeed <= 0) continue;

        // Slowly drift wander angle
        animal.wanderAngle += (Math.sin(performance.now() * 0.0003 + animal.originX) * 0.5) * dt;

        const pos = animal.object.position;
        const moveX = Math.cos(animal.wanderAngle) * animal.wanderSpeed * dt;
        const moveZ = Math.sin(animal.wanderAngle) * animal.wanderSpeed * dt;

        const nextX = pos.x + moveX;
        const nextZ = pos.z + moveZ;

        // Clamp to 20m wander radius from origin
        const dox = nextX - animal.originX;
        const doz = nextZ - animal.originZ;
        const distSq = dox * dox + doz * doz;
        const maxWanderSq = 20 * 20;

        if (distSq > maxWanderSq) {
          // Reverse direction toward origin
          animal.wanderAngle = Math.atan2(animal.originZ - pos.z, animal.originX - pos.x);
          continue;
        }

        const nextY = cache.getHeightAt(nextX, nextZ);
        if (nextY < 0.2) {
          // Would walk underwater; reverse
          animal.wanderAngle += Math.PI;
          continue;
        }

        pos.set(nextX, nextY, nextZ);
        animal.object.rotation.y = animal.wanderAngle;
      }
    }
  }

  // ── Deterministic hashing ──

  private hashCell(cx: number, cz: number): number {
    // Simple integer hash for repeatable per-cell placement
    let h = (cx * 73856093) ^ (cz * 19349663);
    h = ((h >> 16) ^ h) * 0x45d9f3b;
    h = ((h >> 16) ^ h) * 0x45d9f3b;
    return (h >>> 0);
  }

  private nextRand(state: number): number {
    // xorshift32
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state >>> 0;
  }
}
