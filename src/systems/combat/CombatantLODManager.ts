import * as THREE from 'three';
import { Combatant, CombatantState } from './types';
import { CombatantAI } from './CombatantAI';
import { CombatantCombat } from './CombatantCombat';
import { CombatantMovement } from './CombatantMovement';
import { CombatantRenderer } from './CombatantRenderer';
import { SquadManager } from './SquadManager';
import { SpatialOctree } from './SpatialOctree';
import { ZoneManager } from '../world/ZoneManager';
import { GameModeManager } from '../world/GameModeManager';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';

/**
 * Manages LOD (Level of Detail) calculations and update scheduling for combatants
 */
export class CombatantLODManager {
  private combatants: Map<string, Combatant>;
  private readonly scratchCombatants: Combatant[] = [];
  private readonly scratchVector = new THREE.Vector3();
  private playerPosition: THREE.Vector3;
  private gameModeManager?: GameModeManager;
  private zoneManager?: ZoneManager;

  // LOD counts
  lodHighCount = 0;
  lodMediumCount = 0;
  lodLowCount = 0;
  lodCulledCount = 0;

  // Adaptive update timing
  private frameDeltaEma = 1 / 60; // seconds
  private readonly FRAME_EMA_ALPHA = 0.1;
  intervalScale = 1.0; // Scales min update intervals when FPS is low
  private readonly BASE_MEDIUM_MS = 50;  // ~20 Hz
  private readonly BASE_LOW_MS = 100;    // ~10 Hz
  private readonly BASE_CULLED_MS = 300; // ~3 Hz

  // Module dependencies
  private combatantAI: CombatantAI;
  private combatantCombat: CombatantCombat;
  private combatantMovement: CombatantMovement;
  private combatantRenderer: CombatantRenderer;
  private squadManager: SquadManager;
  private spatialGrid: SpatialOctree;

  constructor(
    combatants: Map<string, Combatant>,
    playerPosition: THREE.Vector3,
    combatantAI: CombatantAI,
    combatantCombat: CombatantCombat,
    combatantMovement: CombatantMovement,
    combatantRenderer: CombatantRenderer,
    squadManager: SquadManager,
    spatialGrid: SpatialOctree
  ) {
    this.combatants = combatants;
    this.playerPosition = playerPosition;
    this.combatantAI = combatantAI;
    this.combatantCombat = combatantCombat;
    this.combatantMovement = combatantMovement;
    this.combatantRenderer = combatantRenderer;
    this.squadManager = squadManager;
    this.spatialGrid = spatialGrid;
  }

  setPlayerPosition(position: THREE.Vector3): void {
    this.playerPosition = position;
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }

  /**
   * Update FPS EMA and adjust interval scaling
   */
  updateFrameTiming(deltaTime: number): void {
    this.frameDeltaEma = this.frameDeltaEma * (1 - this.FRAME_EMA_ALPHA) + deltaTime * this.FRAME_EMA_ALPHA;
    const fps = 1 / Math.max(0.001, this.frameDeltaEma);
    if (fps < 30) {
      // Scale intervals up when under target FPS (cap to 3x)
      this.intervalScale = Math.min(3.0, 30 / Math.max(10, fps));
    } else if (fps > 90) {
      // Slightly reduce intervals to feel more responsive on high FPS
      this.intervalScale = Math.max(0.75, 90 / fps);
    } else {
      this.intervalScale = 1.0;
    }
  }

  /**
   * Compute a smooth, distance-based update interval (milliseconds)
   */
  computeDynamicIntervalMs(distance: number): number {
    // Scale parameters based on world size for better performance in large worlds
    const worldSize = this.gameModeManager?.getWorldSize() || 4000;
    const isLargeWorld = worldSize > 1000;

    const startScaleAt = isLargeWorld ? 120 : 80; // units
    const maxScaleAt = isLargeWorld ? 600 : 1000; // units
    const minMs = isLargeWorld ? 33 : 16;         // ~30Hz vs 60Hz near for large worlds
    const maxMs = isLargeWorld ? 1000 : 500;      // More aggressive scaling in large worlds

    const d = Math.max(0, distance - startScaleAt);
    const t = Math.min(1, d / Math.max(1, maxScaleAt - startScaleAt));
    // Quadratic ease for smoother falloff
    const curve = t * t;
    return minMs + curve * (maxMs - minMs);
  }

  /**
   * Update all combatants with LOD-based scheduling
   */
  updateCombatants(deltaTime: number): void {
    // Update death animations first
    this.updateDeathAnimations(deltaTime);

    // Reuse scratch array to avoid per-frame allocations
    this.scratchCombatants.length = 0;
    this.combatants.forEach(combatant => {
      this.scratchCombatants.push(combatant);
    });

    this.scratchCombatants.sort((a, b) => {
      const distA = a.position.distanceToSquared(this.playerPosition);
      const distB = b.position.distanceToSquared(this.playerPosition);
      return distA - distB;
    });

    const now = Date.now();
    const worldSize = this.gameModeManager?.getWorldSize() || 4000;
    const maxProcessingDistance = worldSize > 1000 ? 800 : 500; // Scale processing distance with world size

    this.lodHighCount = 0;
    this.lodMediumCount = 0;
    this.lodLowCount = 0;
    this.lodCulledCount = 0;

    this.scratchCombatants.forEach(combatant => {
      const distance = combatant.position.distanceTo(this.playerPosition);

      // Skip update entirely if off-map (chunk likely not loaded). Minimal maintenance only.
      if (Math.abs(combatant.position.x) > worldSize ||
          Math.abs(combatant.position.z) > worldSize) {
        // Nudge toward map center slowly so off-map agents don't explode simulation cost
        this.scratchVector.set(-Math.sign(combatant.position.x), 0, -Math.sign(combatant.position.z));
        combatant.position.addScaledVector(this.scratchVector, 0.2 * deltaTime);
        this.lodCulledCount++;
        return;
      }

      // Only care about AI that can actually affect gameplay
      const COMBAT_RANGE = 200; // Max engagement range + buffer

      if (distance > COMBAT_RANGE) {
        combatant.lodLevel = 'culled';
        this.lodCulledCount++;
        // Just teleport them toward random zones occasionally
        const elapsedMs = now - (combatant.lastUpdateTime || 0);
        if (elapsedMs > 30000) { // Update every 30 seconds
          this.simulateDistantAI(combatant);
          combatant.lastUpdateTime = now;
        }
        return;
      }

      const dynamicIntervalMs = this.computeDynamicIntervalMs(distance) * this.intervalScale;

      // Determine LOD level - scale distances based on world size
      const isLargeWorld = worldSize > 1000;
      const highLODRange = isLargeWorld ? 200 : 150;
      const mediumLODRange = isLargeWorld ? 400 : 300;
      const lowLODRange = isLargeWorld ? 600 : 500;

      if (distance < highLODRange) {
        combatant.lodLevel = 'high';
        this.lodHighCount++;
        this.updateCombatantFull(combatant, deltaTime);
      } else if (distance < mediumLODRange) {
        combatant.lodLevel = 'medium';
        this.lodMediumCount++;
        const elapsedMs = now - (combatant.lastUpdateTime || 0);
        if (elapsedMs > dynamicIntervalMs) {
          const effectiveDelta = combatant.lastUpdateTime ? Math.min(elapsedMs / 1000, 1.0) : deltaTime;
          this.updateCombatantMedium(combatant, effectiveDelta);
          combatant.lastUpdateTime = now;
        }
      } else if (distance < lowLODRange) {
        combatant.lodLevel = 'low';
        this.lodLowCount++;
        const elapsedMs = now - (combatant.lastUpdateTime || 0);
        if (elapsedMs > dynamicIntervalMs) {
          const maxEff = Math.min(2.0, dynamicIntervalMs / 1000 * 2);
          const effectiveDelta = combatant.lastUpdateTime ? Math.min(elapsedMs / 1000, maxEff) : deltaTime;
          this.updateCombatantBasic(combatant, effectiveDelta);
          combatant.lastUpdateTime = now;
        }
      } else {
        // Very far: still update basic movement infrequently to keep world alive
        combatant.lodLevel = 'culled';
        this.lodCulledCount++;
        const elapsedMs = now - (combatant.lastUpdateTime || 0);
        if (elapsedMs > dynamicIntervalMs) {
          // Allow larger effective delta for far agents to cover ground decisively
          const maxEff = Math.min(3.0, dynamicIntervalMs / 1000 * 3);
          const effectiveDelta = combatant.lastUpdateTime ? Math.min(elapsedMs / 1000, maxEff) : deltaTime;
          this.updateCombatantBasic(combatant, effectiveDelta);
          combatant.lastUpdateTime = now;
        }
      }
    });
  }

  private updateCombatantFull(combatant: Combatant, deltaTime: number): void {
    this.combatantAI.updateAI(combatant, deltaTime, this.playerPosition, this.combatants, this.spatialGrid);
    this.combatantMovement.updateMovement(
      combatant,
      deltaTime,
      this.squadManager.getAllSquads(),
      this.combatants
    );
    this.combatantCombat.updateCombat(
      combatant,
      deltaTime,
      this.playerPosition,
      this.combatants,
      this.squadManager.getAllSquads()
    );
    this.combatantRenderer.updateCombatantTexture(combatant);
    this.combatantMovement.updateRotation(combatant, deltaTime);
    // Update spatial grid after movement
    this.spatialGrid.updatePosition(combatant.id, combatant.position);
  }

  private updateCombatantMedium(combatant: Combatant, deltaTime: number): void {
    this.combatantAI.updateAI(combatant, deltaTime, this.playerPosition, this.combatants, this.spatialGrid);
    this.combatantMovement.updateMovement(
      combatant,
      deltaTime,
      this.squadManager.getAllSquads(),
      this.combatants
    );
    this.combatantCombat.updateCombat(
      combatant,
      deltaTime,
      this.playerPosition,
      this.combatants,
      this.squadManager.getAllSquads()
    );
    this.combatantMovement.updateRotation(combatant, deltaTime);
    // Update spatial grid after movement
    this.spatialGrid.updatePosition(combatant.id, combatant.position);
  }

  private updateCombatantBasic(combatant: Combatant, deltaTime: number): void {
    this.combatantMovement.updateMovement(
      combatant,
      deltaTime,
      this.squadManager.getAllSquads(),
      this.combatants
    );
    this.combatantMovement.updateRotation(combatant, deltaTime);
    // Update spatial grid after movement
    this.spatialGrid.updatePosition(combatant.id, combatant.position);
  }

  private updateDeathAnimations(deltaTime: number): void {
    const FALL_DURATION = 0.7; // 0.7 seconds for fall animation
    const GROUND_TIME = 4.0; // 4 seconds on ground before fadeout
    const FADEOUT_DURATION = 1.0; // 1 second fadeout
    const TOTAL_DEATH_TIME = FALL_DURATION + GROUND_TIME + FADEOUT_DURATION;

    const toRemove: string[] = [];

    this.combatants.forEach((combatant, id) => {
      if (combatant.isDying) {
        // Progress death animation
        if (combatant.deathProgress === undefined) {
          combatant.deathProgress = 0;
        }

        combatant.deathProgress += deltaTime / TOTAL_DEATH_TIME;

        // When animation completes, mark for cleanup
        if (combatant.deathProgress >= 1.0) {
          combatant.isDying = false;
          combatant.state = CombatantState.DEAD;
          combatant.deathProgress = 1.0;
          toRemove.push(id);
        }
      }
    });

    // Remove fully dead combatants
    toRemove.forEach(id => {
      this.combatants.delete(id);
      this.spatialGrid.remove(id);
    });
  }

  /**
   * Distant AI simulation with proper velocity scaling
   */
  private simulateDistantAI(combatant: Combatant): void {
    if (!this.zoneManager) return;

    // Calculate how much time passed since last update (30 seconds)
    const simulationTimeStep = 30; // seconds
    const normalMovementSpeed = 4; // units per second (normal AI walking speed)

    // Scale movement to cover realistic distance over the simulation interval
    const distanceToMove = normalMovementSpeed * simulationTimeStep; // 120 units over 30 seconds

    // Find strategic target for this combatant
    const zones = this.zoneManager.getAllZones();
    const targetZones = zones.filter(zone => {
      // Target capturable zones or defend contested ones
      return !zone.isHomeBase && (
        zone.owner !== combatant.faction || zone.state === 'contested'
      );
    });

    if (targetZones.length > 0) {
      // Pick closest strategic zone
      let nearestZone = targetZones[0];
      let minDistance = combatant.position.distanceTo(nearestZone.position);

      for (const zone of targetZones) {
        const distance = combatant.position.distanceTo(zone.position);
        if (distance < minDistance) {
          minDistance = distance;
          nearestZone = zone;
        }
      }

      // Move toward the target zone at realistic speed
      const direction = new THREE.Vector3()
        .subVectors(nearestZone.position, combatant.position)
        .normalize();

      // Apply scaled movement
      const movement = direction.multiplyScalar(distanceToMove);
      combatant.position.add(movement);

      // Update rotation to face movement direction
      combatant.rotation = Math.atan2(direction.z, direction.x);

      // Add some randomness to avoid all AI clustering
      const randomOffset = new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        0,
        (Math.random() - 0.5) * 20
      );
      combatant.position.add(randomOffset);

      // Keep on terrain
      const terrainHeight = getHeightQueryCache().getHeightAt(combatant.position.x, combatant.position.z);
      combatant.position.y = terrainHeight + 3;
    }
  }
}
