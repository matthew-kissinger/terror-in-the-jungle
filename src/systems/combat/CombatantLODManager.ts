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
import { estimateGPUTier, isMobileGPU } from '../../utils/DeviceDetector';
import { resetRaycastBudget } from './ai/RaycastBudget';
import {
  resetCombatFireRaycastBudget,
  setMaxCombatFireRaycastsPerFrame
} from './ai/CombatFireRaycastBudget';
import { Logger } from '../../utils/Logger';

// Stagger periods: how many frames between full AI updates per LOD tier
const STAGGER_HIGH = 3;
const STAGGER_MEDIUM = 5;
const STAGGER_LOW = 8;
const STAGGER_CULLED_NEAR = 12;

/**
 * Manages LOD (Level of Detail) calculations and update scheduling for combatants
 */
export class CombatantLODManager {
  private static readonly MIN_AI_BUDGET_MS = 0.5;
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
  private lastAiSpikeLogMs = 0;
  private lastFullUpdateSpikeLogMs = 0;
  private lastLodPipelineSpikeLogMs = 0;
  private lastCulledUnitSpikeLogMs = 0;
  private lastAiBudgetLogMs = 0;
  private readonly AI_LOG_THROTTLE_MS = 5000;
  private readonly AI_FRAME_BUDGET_MS = 6.0;
  private readonly AI_SEVERE_OVER_BUDGET_MULTIPLIER = 2.5;
  private readonly CULLED_LOOP_BUDGET_MS = 1.5;
  private readonly CULLED_DISTANT_SIM_INTERVAL_MS = 45000;
  private maxHighFullUpdatesPerFrame = 20;
  private maxMediumFullUpdatesPerFrame = 24;
  private highFullUpdatesThisFrame = 0;
  private mediumFullUpdatesThisFrame = 0;
  private aiBudgetExceededEventsThisFrame = 0;
  private aiSevereOverBudgetEventsThisFrame = 0;
  private aiBudgetMs = this.AI_FRAME_BUDGET_MS;

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
      this.maxHighFullUpdatesPerFrame = 8;
      this.maxMediumFullUpdatesPerFrame = 10;
    } else if (gpuTier === 'medium') {
      this.highLODRange = 120;
      this.mediumLODRange = 250;
      this.lowLODRange = 450;
      this.maxHighFullUpdatesPerFrame = 12;
      this.maxMediumFullUpdatesPerFrame = 16;
    } else {
      this.maxHighFullUpdatesPerFrame = 20;
      this.maxMediumFullUpdatesPerFrame = 24;
    }
  }

  setLODRanges(high: number, medium: number, low: number): void {
    this.highLODRange = high;
    this.mediumLODRange = medium;
    this.lowLODRange = low;
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
  updateCombatants(deltaTime: number, options?: { enableAI?: boolean }): void {
    const enableAI = options?.enableAI ?? true;
    const lodPipelineStart = performance.now();
    let deathMs = 0;
    let classifyMs = 0;
    let highLoopMs = 0;
    let mediumLoopMs = 0;
    let lowLoopMs = 0;
    let culledLoopMs = 0;
    const aiFrameStart = performance.now();
    const deathStart = performance.now();
    this.updateDeathAnimations(deltaTime);
    deathMs = performance.now() - deathStart;

    if (enableAI) {
      // Reset per-frame raycast budget
      resetRaycastBudget();
      // Adaptive cap: reduce expensive NPC fire terrain checks when interval scale rises.
      const fireRaycastCap = Math.max(4, Math.min(24, Math.round(16 / Math.max(1, this.intervalScale))));
      setMaxCombatFireRaycastsPerFrame(fireRaycastCap);
      resetCombatFireRaycastBudget();

      // Clear stale LOS cache entries
      this.combatantAI.clearLOSCache();
      this.combatantAI.beginFrame?.();
    }

    // Increment frame counter for AI staggering
    this.frameCounter++;
    this.staggeredSkipCount = 0;
    this.highFullUpdatesThisFrame = 0;
    this.mediumFullUpdatesThisFrame = 0;
    this.aiBudgetExceededEventsThisFrame = 0;
    this.aiSevereOverBudgetEventsThisFrame = 0;
    this.aiBudgetMs = Math.max(CombatantLODManager.MIN_AI_BUDGET_MS, this.AI_FRAME_BUDGET_MS * this.intervalScale);

    const now = Date.now();
    const worldSize = this.gameModeManager?.getWorldSize() || 4000;
    const isLargeWorldMode = worldSize >= 1000;

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

    const classifyStart = performance.now();
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
    classifyMs = performance.now() - classifyStart;

    const highStart = performance.now();
    this.highBucket.forEach((combatant, index) => {
      combatant.lodLevel = 'high';
      this.lodHighCount++;

      if (!enableAI || this.isAIBudgetExceeded(aiFrameStart)) {
        if (enableAI && this.isAISeverelyOverBudget(aiFrameStart)) {
          this.updateCombatantUltraLight(combatant, deltaTime);
        } else {
          this.updateCombatantVisualOnly(combatant, deltaTime);
        }
        this.staggeredSkipCount++;
        return;
      }

      // Stagger AI decisions: only run full AI+combat on this combatant's turn
      if (this.frameCounter % STAGGER_HIGH === index % STAGGER_HIGH) {
        if (this.highFullUpdatesThisFrame >= this.maxHighFullUpdatesPerFrame) {
          this.updateCombatantVisualOnly(combatant, deltaTime);
          this.staggeredSkipCount++;
          return;
        }
        this.updateCombatantFull(combatant, deltaTime);
        this.highFullUpdatesThisFrame++;
      } else {
        // Off-frame: still update movement, rotation, spatial position for smooth visuals
        this.updateCombatantVisualOnly(combatant, deltaTime);
        this.staggeredSkipCount++;
      }
    });
    highLoopMs = performance.now() - highStart;

    const mediumStart = performance.now();
    this.mediumBucket.forEach((combatant, index) => {
      combatant.lodLevel = 'medium';
      this.lodMediumCount++;
      const distance = Math.sqrt(combatant.distanceSq!);
      const dynamicIntervalMs = this.computeDynamicIntervalMs(distance) * this.intervalScale;
      const elapsedMs = now - (combatant.lastUpdateTime || 0);

      if (elapsedMs > dynamicIntervalMs) {
        if (!enableAI || this.isAIBudgetExceeded(aiFrameStart)) {
          if (enableAI && this.isAISeverelyOverBudget(aiFrameStart)) {
            this.updateCombatantUltraLight(combatant, deltaTime);
          } else {
            this.updateCombatantBasic(combatant, deltaTime);
          }
          combatant.lastUpdateTime = now;
          this.staggeredSkipCount++;
          return;
        }

        // Apply stagger within the medium LOD tier as well
        if (this.frameCounter % STAGGER_MEDIUM === index % STAGGER_MEDIUM) {
          if (this.mediumFullUpdatesThisFrame >= this.maxMediumFullUpdatesPerFrame) {
            this.staggeredSkipCount++;
            return;
          }
          const effectiveDelta = combatant.lastUpdateTime ? Math.min(elapsedMs / 1000, 1.0) : deltaTime;
          this.updateCombatantMedium(combatant, effectiveDelta);
          this.mediumFullUpdatesThisFrame++;
          combatant.lastUpdateTime = now;
        } else {
          this.staggeredSkipCount++;
        }
      }
    });
    mediumLoopMs = performance.now() - mediumStart;

    const lowStart = performance.now();
    this.lowBucket.forEach((combatant, index) => {
      combatant.lodLevel = 'low';
      this.lodLowCount++;
      if (isLargeWorldMode && this.frameCounter % STAGGER_LOW !== index % STAGGER_LOW) {
        this.staggeredSkipCount++;
        return;
      }
      const distance = Math.sqrt(combatant.distanceSq!);
      const dynamicIntervalMs = this.computeDynamicIntervalMs(distance) * this.intervalScale;
      const elapsedMs = now - (combatant.lastUpdateTime || 0);
      
      if (elapsedMs > dynamicIntervalMs) {
        if (enableAI && this.isAISeverelyOverBudget(aiFrameStart)) {
          this.updateCombatantUltraLight(combatant, deltaTime);
          combatant.lastUpdateTime = now;
          this.staggeredSkipCount++;
          return;
        }
        const maxEff = Math.min(2.0, dynamicIntervalMs / 1000 * 2);
        const effectiveDelta = combatant.lastUpdateTime ? Math.min(elapsedMs / 1000, maxEff) : deltaTime;
        this.updateCombatantBasic(combatant, effectiveDelta, { lowCost: isLargeWorldMode });
        combatant.lastUpdateTime = now;
      }
    });
    lowLoopMs = performance.now() - lowStart;

    const culledStart = performance.now();
    let culledDeferred = 0;
    for (let index = 0; index < this.culledBucket.length; index++) {
      const combatant = this.culledBucket[index];
      combatant.lodLevel = 'culled';
      this.lodCulledCount++;
      if (isLargeWorldMode) {
        const culledElapsedMs = performance.now() - culledStart;
        const culledBudgetMs = this.CULLED_LOOP_BUDGET_MS * Math.max(1.0, this.intervalScale);
        if (culledElapsedMs > culledBudgetMs) {
          culledDeferred += (this.culledBucket.length - index);
          break;
        }
      }
      const distance = Math.sqrt(combatant.distanceSq!);
      const SIMULATION_THRESHOLD = this.lowLODRange + 200;
      if (!combatant.lastUpdateTime) {
        combatant.lastUpdateTime = now - this.getStablePhaseOffsetMs(combatant.id, this.CULLED_DISTANT_SIM_INTERVAL_MS);
      }
      
      const elapsedMs = now - (combatant.lastUpdateTime || 0);
      if (distance > SIMULATION_THRESHOLD) {
        if (elapsedMs > this.CULLED_DISTANT_SIM_INTERVAL_MS) {
          const unitStart = performance.now();
          if (enableAI && !this.isAIBudgetExceeded(aiFrameStart)) {
            this.simulateDistantAI(combatant);
          } else if (enableAI && this.isAISeverelyOverBudget(aiFrameStart)) {
            this.updateCombatantUltraLight(combatant, deltaTime);
          }
          const unitMs = performance.now() - unitStart;
          if (unitMs > 100 && (performance.now() - this.lastCulledUnitSpikeLogMs) > this.AI_LOG_THROTTLE_MS) {
            this.lastCulledUnitSpikeLogMs = performance.now();
            Logger.warn(
              'combat-ai',
              `[LOD culled-unit spike] path=distant id=${combatant.id} ms=${unitMs.toFixed(1)} dist=${distance.toFixed(1)} elapsed=${elapsedMs.toFixed(1)}`
            );
          }
          combatant.lastUpdateTime = now;
        }
      } else {
        if (isLargeWorldMode && this.frameCounter % STAGGER_CULLED_NEAR !== index % STAGGER_CULLED_NEAR) {
          this.staggeredSkipCount++;
          return;
        }
        const dynamicIntervalMs = this.computeDynamicIntervalMs(distance) * this.intervalScale;
        if (elapsedMs > dynamicIntervalMs) {
          if (enableAI && this.isAISeverelyOverBudget(aiFrameStart)) {
            this.updateCombatantUltraLight(combatant, deltaTime);
            combatant.lastUpdateTime = now;
            this.staggeredSkipCount++;
            return;
          }
          const maxEff = Math.min(3.0, dynamicIntervalMs / 1000 * 3);
          const effectiveDelta = combatant.lastUpdateTime ? Math.min(elapsedMs / 1000, maxEff) : deltaTime;
          const sparseSpatialSync = !isLargeWorldMode;
          const unitStart = performance.now();
          this.updateCombatantBasic(combatant, effectiveDelta, {
            lowCost: isLargeWorldMode,
            updateSpatial: sparseSpatialSync
          });
          const unitMs = performance.now() - unitStart;
          if (unitMs > 100 && (performance.now() - this.lastCulledUnitSpikeLogMs) > this.AI_LOG_THROTTLE_MS) {
            this.lastCulledUnitSpikeLogMs = performance.now();
            Logger.warn(
              'combat-ai',
              `[LOD culled-unit spike] path=near id=${combatant.id} ms=${unitMs.toFixed(1)} dist=${distance.toFixed(1)} elapsed=${elapsedMs.toFixed(1)} sync=${sparseSpatialSync ? 1 : 0}`
            );
          }
          combatant.lastUpdateTime = now;
        }
      }
    }
    if (culledDeferred > 0) {
      this.staggeredSkipCount += culledDeferred;
    }
    culledLoopMs = performance.now() - culledStart;

    const lodPipelineMs = performance.now() - lodPipelineStart;
    const nowMs = performance.now();
    const severeLodSpike = lodPipelineMs > 1000;
    if (
      severeLodSpike ||
      (lodPipelineMs > 120 && (nowMs - this.lastLodPipelineSpikeLogMs) > this.AI_LOG_THROTTLE_MS)
    ) {
      this.lastLodPipelineSpikeLogMs = nowMs;
      Logger.warn(
        'combat-ai',
        `[LOD spike] total=${lodPipelineMs.toFixed(1)}ms death=${deathMs.toFixed(1)} classify=${classifyMs.toFixed(1)} high=${highLoopMs.toFixed(1)} medium=${mediumLoopMs.toFixed(1)} low=${lowLoopMs.toFixed(1)} culled=${culledLoopMs.toFixed(1)} culledDeferred=${culledDeferred} counts(h/m/l/c)=${this.highBucket.length}/${this.mediumBucket.length}/${this.lowBucket.length}/${this.culledBucket.length}`
      );
    }
  }

  private isAIBudgetExceeded(aiFrameStart: number): boolean {
    const elapsed = performance.now() - aiFrameStart;
    if (elapsed <= this.aiBudgetMs) {
      return false;
    }
    this.aiBudgetExceededEventsThisFrame++;

    const now = performance.now();
    if (now - this.lastAiBudgetLogMs > this.AI_LOG_THROTTLE_MS) {
      this.lastAiBudgetLogMs = now;
      Logger.warn('combat-ai', `[AI budget] frame AI budget exceeded (${elapsed.toFixed(1)}ms > ${this.aiBudgetMs.toFixed(1)}ms), degrading remaining updates`);
    }
    return true;
  }

  private isAISeverelyOverBudget(aiFrameStart: number): boolean {
    const severe = (performance.now() - aiFrameStart) > (this.aiBudgetMs * this.AI_SEVERE_OVER_BUDGET_MULTIPLIER);
    if (severe) {
      this.aiSevereOverBudgetEventsThisFrame++;
    }
    return severe;
  }

  private updateCombatantFull(combatant: Combatant, deltaTime: number): void {
    const fullStart = performance.now();
    const aiStart = performance.now();
    this.combatantAI.updateAI(combatant, deltaTime, this.playerPosition, this.combatants, this.spatialGrid);
    const aiMs = performance.now() - aiStart;
    const now = performance.now();
    if (aiMs > 50 && now - this.lastAiSpikeLogMs > this.AI_LOG_THROTTLE_MS) {
      this.lastAiSpikeLogMs = now;
      Logger.warn(
        'combat-ai',
        `[AI spike] ${aiMs.toFixed(1)}ms combatant=${combatant.id} state=${combatant.state} squad=${combatant.squadId ?? 'none'} target=${combatant.target?.id ?? 'none'}`
      );
    }
    const moveStart = performance.now();
    this.combatantMovement.updateMovement(
      combatant,
      deltaTime,
      this.squadManager.getAllSquads(),
      this.combatants
    );
    const moveMs = performance.now() - moveStart;
    const combatStart = performance.now();
    this.combatantCombat.updateCombat(
      combatant,
      deltaTime,
      this.playerPosition,
      this.combatants,
      this.squadManager.getAllSquads()
    );
    const combatMs = performance.now() - combatStart;
    const renderStart = performance.now();
    this.combatantRenderer.updateCombatantTexture(combatant);
    const renderMs = performance.now() - renderStart;
    this.combatantMovement.updateRotation(combatant, deltaTime);
    const spatialStart = performance.now();
    this.spatialGrid.updatePosition(combatant.id, combatant.position);
    const spatialMs = performance.now() - spatialStart;

    const totalMs = performance.now() - fullStart;
    if (totalMs > 100 && now - this.lastFullUpdateSpikeLogMs > this.AI_LOG_THROTTLE_MS) {
      this.lastFullUpdateSpikeLogMs = now;
      Logger.warn(
        'combat-ai',
        `[AI full-update spike] total=${totalMs.toFixed(1)}ms ai=${aiMs.toFixed(1)} move=${moveMs.toFixed(1)} combat=${combatMs.toFixed(1)} render=${renderMs.toFixed(1)} spatial=${spatialMs.toFixed(1)} combatant=${combatant.id} state=${combatant.state} lod=${combatant.lodLevel}`
      );
    }
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

  private updateCombatantBasic(combatant: Combatant, deltaTime: number, options?: { lowCost?: boolean; updateSpatial?: boolean }): void {
    if (options?.lowCost) {
      // Far-NPC fallback path: preserve coarse motion without expensive state/terrain work.
      combatant.position.addScaledVector(combatant.velocity, deltaTime);
      this.combatantMovement.updateRotation(combatant, deltaTime);
      if (options.updateSpatial !== false) {
        this.spatialGrid.updatePosition(combatant.id, combatant.position);
      }
      return;
    }

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

  /**
   * Emergency degrade mode for severe overload frames.
   * Keeps billboard-facing continuity while skipping movement/combat/spatial updates.
   */
  private updateCombatantUltraLight(combatant: Combatant, deltaTime: number): void {
    this.combatantRenderer.updateCombatantTexture(combatant);
    this.combatantMovement.updateRotation(combatant, deltaTime);
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

  getFrameSchedulingStats(): {
    frameCounter: number;
    intervalScale: number;
    aiBudgetMs: number;
    staggeredSkips: number;
    highFullUpdates: number;
    mediumFullUpdates: number;
    maxHighFullUpdatesPerFrame: number;
    maxMediumFullUpdatesPerFrame: number;
    aiBudgetExceededEvents: number;
    aiSevereOverBudgetEvents: number;
  } {
    return {
      frameCounter: this.frameCounter,
      intervalScale: this.intervalScale,
      aiBudgetMs: this.aiBudgetMs,
      staggeredSkips: this.staggeredSkipCount,
      highFullUpdates: this.highFullUpdatesThisFrame,
      mediumFullUpdates: this.mediumFullUpdatesThisFrame,
      maxHighFullUpdatesPerFrame: this.maxHighFullUpdatesPerFrame,
      maxMediumFullUpdatesPerFrame: this.maxMediumFullUpdatesPerFrame,
      aiBudgetExceededEvents: this.aiBudgetExceededEventsThisFrame,
      aiSevereOverBudgetEvents: this.aiSevereOverBudgetEventsThisFrame
    };
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
      // Culled distant simulation is approximate by design; avoid expensive terrain
      // height sampling on non-rendered actors to prevent far-NPC herd spikes.
      combatant.position.y = 3;
    }
  }

  private getStablePhaseOffsetMs(id: string, periodMs: number): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash) + id.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % Math.max(1, periodMs);
  }
}
