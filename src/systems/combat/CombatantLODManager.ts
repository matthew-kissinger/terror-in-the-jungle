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
import { estimateGPUTier, isMobileGPU } from '../../utils/DeviceDetector';
import { resetRaycastBudget } from './ai/RaycastBudget';

// Stagger periods: how many frames between full AI updates per LOD tier
const STAGGER_HIGH = 3;
const STAGGER_MEDIUM = 5;

/**
 * Manages LOD (Level of Detail) calculations and update scheduling for combatants
 */
export class CombatantLODManager {
  private combatants: Map<string, Combatant>;
  private readonly highBucket: Combatant[] = [];
  private readonly mediumBucket: Combatant[] = [];
  private readonly lowBucket: Combatant[] = [];
  private readonly culledBucket: Combatant[] = [];
  private readonly scratchVector = new THREE.Vector3();
  private readonly _scratchDirection = new THREE.Vector3();
  private readonly _scratchOffset = new THREE.Vector3();
  private playerPosition: THREE.Vector3;
  private gameModeManager?: GameModeManager;
  private zoneManager?: ZoneManager;

  // Performance scaling parameters
  private highLODRange = 200;
  private mediumLODRange = 400;
  private lowLODRange = 600;

  // LOD counts
  lodHighCount = 0;
  lodMediumCount = 0;
  lodLowCount = 0;
  lodCulledCount = 0;

  // Adaptive update timing
  private frameDeltaEma = 1 / 60; // seconds
  private readonly FRAME_EMA_ALPHA = 0.1;
  intervalScale = 1.0; // Scales min update intervals when FPS is low

  // Frame counter for AI staggering
  private frameCounter = 0;

  // Profiling: how many AI updates were staggered (skipped) this frame
  staggeredSkipCount = 0;

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

    this.applyPerformanceScaling();
  }

  private applyPerformanceScaling(): void {
    const gpuTier = estimateGPUTier();
    const isMobile = isMobileGPU();

    // Default desktop high settings
    this.highLODRange = 200;
    this.mediumLODRange = 400;
    this.lowLODRange = 600;

    if (isMobile || gpuTier === 'low') {
      // Aggressive mobile/low-tier scaling
      this.highLODRange = 60;
      this.mediumLODRange = 120;
      this.lowLODRange = 250;
    } else if (gpuTier === 'medium') {
      this.highLODRange = 120;
      this.mediumLODRange = 250;
      this.lowLODRange = 450;
    }
  }

  setPlayerPosition(position: THREE.Vector3): void {
    this.playerPosition = position;
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
    this.applyPerformanceScaling();
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
    
    // Target higher FPS for scaling on mobile
    const targetFps = isMobileGPU() ? 45 : 30;

    if (fps < targetFps) {
      // Scale intervals up when under target FPS
      const maxScale = isMobileGPU() ? 4.0 : 3.0;
      this.intervalScale = Math.min(maxScale, targetFps / Math.max(10, fps));
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
    const worldSize = this.gameModeManager?.getWorldSize() || 4000;
    const isLargeWorld = worldSize > 1000;
    const gpuTier = estimateGPUTier();
    const isMobile = isMobileGPU();

    const startScaleAt = isMobile ? 40 : (isLargeWorld ? 120 : 80);
    const maxScaleAt = isMobile ? 300 : (isLargeWorld ? 600 : 1000);
    
    let minMs = isLargeWorld ? 33 : 16;
    let maxMs = isLargeWorld ? 1000 : 500;

    if (isMobile || gpuTier === 'low') {
      minMs *= 2;
      maxMs *= 1.5;
    }

    const d = Math.max(0, distance - startScaleAt);
    const t = Math.min(1, d / Math.max(1, maxScaleAt - startScaleAt));
    const curve = t * t;
    return minMs + curve * (maxMs - minMs);
  }

  /**
   * Update all combatants with LOD-based scheduling
   */
  updateCombatants(deltaTime: number): void {
    this.updateDeathAnimations(deltaTime);

    // Reset per-frame raycast budget
    resetRaycastBudget();

    // Clear stale LOS cache entries
    this.combatantAI.clearLOSCache();

    // Increment frame counter for AI staggering
    this.frameCounter++;
    this.staggeredSkipCount = 0;

    const now = Date.now();
    const worldSize = this.gameModeManager?.getWorldSize() || 4000;

    this.lodHighCount = 0;
    this.lodMediumCount = 0;
    this.lodLowCount = 0;
    this.lodCulledCount = 0;

    const highLODRangeSq = this.highLODRange * this.highLODRange;
    const mediumLODRangeSq = this.mediumLODRange * this.mediumLODRange;
    const lowLODRangeSq = this.lowLODRange * this.lowLODRange;

    this.highBucket.length = 0;
    this.mediumBucket.length = 0;
    this.lowBucket.length = 0;
    this.culledBucket.length = 0;

    this.combatants.forEach(combatant => {
      if (Math.abs(combatant.position.x) > worldSize ||
          Math.abs(combatant.position.z) > worldSize) {
        this.scratchVector.set(-Math.sign(combatant.position.x), 0, -Math.sign(combatant.position.z));
        combatant.position.addScaledVector(this.scratchVector, 0.2 * deltaTime);
        combatant.lodLevel = 'culled';
        this.lodCulledCount++;
        return;
      }

      const distSq = combatant.position.distanceToSquared(this.playerPosition);
      combatant.distanceSq = distSq;

      if (distSq < highLODRangeSq) {
        this.highBucket.push(combatant);
      } else if (distSq < mediumLODRangeSq) {
        this.mediumBucket.push(combatant);
      } else if (distSq < lowLODRangeSq) {
        this.lowBucket.push(combatant);
      } else {
        this.culledBucket.push(combatant);
      }
    });

    this.highBucket.forEach((combatant, index) => {
      combatant.lodLevel = 'high';
      this.lodHighCount++;

      // Stagger AI decisions: only run full AI+combat on this combatant's turn
      if (this.frameCounter % STAGGER_HIGH === index % STAGGER_HIGH) {
        this.updateCombatantFull(combatant, deltaTime);
      } else {
        // Off-frame: still update movement, rotation, spatial position for smooth visuals
        this.updateCombatantVisualOnly(combatant, deltaTime);
        this.staggeredSkipCount++;
      }
    });

    this.mediumBucket.forEach((combatant, index) => {
      combatant.lodLevel = 'medium';
      this.lodMediumCount++;
      const distance = Math.sqrt(combatant.distanceSq!);
      const dynamicIntervalMs = this.computeDynamicIntervalMs(distance) * this.intervalScale;
      const elapsedMs = now - (combatant.lastUpdateTime || 0);

      if (elapsedMs > dynamicIntervalMs) {
        // Apply stagger within the medium LOD tier as well
        if (this.frameCounter % STAGGER_MEDIUM === index % STAGGER_MEDIUM) {
          const effectiveDelta = combatant.lastUpdateTime ? Math.min(elapsedMs / 1000, 1.0) : deltaTime;
          this.updateCombatantMedium(combatant, effectiveDelta);
          combatant.lastUpdateTime = now;
        } else {
          this.staggeredSkipCount++;
        }
      }
    });

    this.lowBucket.forEach(combatant => {
      combatant.lodLevel = 'low';
      this.lodLowCount++;
      const distance = Math.sqrt(combatant.distanceSq!);
      const dynamicIntervalMs = this.computeDynamicIntervalMs(distance) * this.intervalScale;
      const elapsedMs = now - (combatant.lastUpdateTime || 0);
      
      if (elapsedMs > dynamicIntervalMs) {
        const maxEff = Math.min(2.0, dynamicIntervalMs / 1000 * 2);
        const effectiveDelta = combatant.lastUpdateTime ? Math.min(elapsedMs / 1000, maxEff) : deltaTime;
        this.updateCombatantBasic(combatant, effectiveDelta);
        combatant.lastUpdateTime = now;
      }
    });

    this.culledBucket.forEach(combatant => {
      combatant.lodLevel = 'culled';
      this.lodCulledCount++;
      const distance = Math.sqrt(combatant.distanceSq!);
      const SIMULATION_THRESHOLD = this.lowLODRange + 200;
      
      const elapsedMs = now - (combatant.lastUpdateTime || 0);
      if (distance > SIMULATION_THRESHOLD) {
        if (elapsedMs > 30000) {
          this.simulateDistantAI(combatant);
          combatant.lastUpdateTime = now;
        }
      } else {
        const dynamicIntervalMs = this.computeDynamicIntervalMs(distance) * this.intervalScale;
        if (elapsedMs > dynamicIntervalMs) {
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
    this.spatialGrid.updatePosition(combatant.id, combatant.position);
  }

  /**
   * Visual-only update for staggered frames: movement, rotation, texture, spatial.
   * AI decisions and combat are skipped to save budget.
   */
  private updateCombatantVisualOnly(combatant: Combatant, deltaTime: number): void {
    this.combatantMovement.updateMovement(
      combatant,
      deltaTime,
      this.squadManager.getAllSquads(),
      this.combatants
    );
    this.combatantRenderer.updateCombatantTexture(combatant);
    this.combatantMovement.updateRotation(combatant, deltaTime);
    this.spatialGrid.updatePosition(combatant.id, combatant.position);
  }

  private updateDeathAnimations(deltaTime: number): void {
    const FALL_DURATION = 0.7;
    const GROUND_TIME = 4.0;
    const FADEOUT_DURATION = 1.0;
    const TOTAL_DEATH_TIME = FALL_DURATION + GROUND_TIME + FADEOUT_DURATION;

    const toRemove: string[] = [];

    this.combatants.forEach((combatant, id) => {
      if (combatant.isDying) {
        if (combatant.deathProgress === undefined) {
          combatant.deathProgress = 0;
        }
        combatant.deathProgress += deltaTime / TOTAL_DEATH_TIME;
        if (combatant.deathProgress >= 1.0) {
          combatant.isDying = false;
          combatant.state = CombatantState.DEAD;
          combatant.deathProgress = 1.0;
          toRemove.push(id);
        }
      }
    });

    toRemove.forEach(id => {
      this.combatants.delete(id);
      this.spatialGrid.remove(id);
    });
  }

  private simulateDistantAI(combatant: Combatant): void {
    if (!this.zoneManager) return;
    const simulationTimeStep = 30;
    const normalMovementSpeed = 4;
    const distanceToMove = normalMovementSpeed * simulationTimeStep;

    const zones = this.zoneManager.getAllZones();
    const targetZones = zones.filter(zone => {
      return !zone.isHomeBase && (
        zone.owner !== combatant.faction || zone.state === 'contested'
      );
    });

    if (targetZones.length > 0) {
      let nearestZone = targetZones[0];
      let minDistance = combatant.position.distanceTo(nearestZone.position);

      for (const zone of targetZones) {
        const distance = combatant.position.distanceTo(zone.position);
        if (distance < minDistance) {
          minDistance = distance;
          nearestZone = zone;
        }
      }

      const direction = this._scratchDirection
        .subVectors(nearestZone.position, combatant.position)
        .normalize();

      const movement = direction.multiplyScalar(distanceToMove);
      combatant.position.add(movement);
      combatant.rotation = Math.atan2(direction.z, direction.x);

      const randomOffset = this._scratchOffset.set(
        (Math.random() - 0.5) * 20,
        0,
        (Math.random() - 0.5) * 20
      );
      combatant.position.add(randomOffset);

      const terrainHeight = getHeightQueryCache().getHeightAt(combatant.position.x, combatant.position.z);
      combatant.position.y = terrainHeight + 3;
    }
  }
}
