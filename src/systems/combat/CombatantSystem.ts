import * as THREE from 'three';
import { GameSystem } from '../../types';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { AssetLoader } from '../assets/AssetLoader';
import type { ITerrainRuntime, IZoneQuery, IHUDSystem } from '../../types/SystemInterfaces';
import { Combatant, CombatantState, Faction, isBlufor } from './types';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashSystem } from '../effects/MuzzleFlashSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { TicketSystem } from '../world/TicketSystem';
import { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { AudioManager } from '../audio/AudioManager';
import { GameModeManager } from '../world/GameModeManager';
import { Logger } from '../../utils/Logger';
import { NPC_Y_OFFSET } from '../../config/CombatantConfig';
// Refactored modules
import { CombatantFactory } from './CombatantFactory';
import { CombatantAI } from './CombatantAI';
import { CombatantCombat, CombatHitResult } from './CombatantCombat';
import { CombatantMovement } from './CombatantMovement';
import { CombatantRenderer } from './CombatantRenderer';
import { SquadManager } from './SquadManager';
import { SpatialGridManager, spatialGridManager as defaultSpatialGridManager } from './SpatialGridManager';
import { InfluenceMapSystem } from './InfluenceMapSystem';

// New focused modules
import { CombatantSpawnManager } from './CombatantSpawnManager';
import { CombatantLODManager } from './CombatantLODManager';
import { CombatantProfiler } from './CombatantProfiler';
import { CombatantSystemDamage } from './CombatantSystemDamage';
import { CombatantSystemUpdate } from './CombatantSystemUpdate';
import { AILineOfSight } from './ai/AILineOfSight';
import { clusterManager } from './ClusterManager';
import { getRaycastBudgetStats } from './ai/RaycastBudget';
import { getCombatFireRaycastBudgetStats } from './ai/CombatFireRaycastBudget';
import { isPerfDiagnosticsEnabled, isPerfUserTimingEnabled } from '../../core/PerfDiagnostics';
import type { NavmeshSystem } from '../navigation/NavmeshSystem';
import type { PlayerSuppressionSystem } from '../player/PlayerSuppressionSystem';

interface CombatantSystemDependencies {
  terrainSystem: ITerrainRuntime;
  camera: THREE.Camera;
  ticketSystem: TicketSystem;
  playerHealthSystem: PlayerHealthSystem;
  zoneManager: IZoneQuery;
  gameModeManager: GameModeManager;
  hudSystem: IHUDSystem;
  audioManager: AudioManager;
  playerSuppressionSystem: PlayerSuppressionSystem;
}

export class CombatantSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private globalBillboardSystem: GlobalBillboardSystem;
  private assetLoader: AssetLoader;
  private terrainSystem?: ITerrainRuntime;
  private ticketSystem?: TicketSystem;
  private playerHealthSystem?: PlayerHealthSystem;
  private zoneQuery?: IZoneQuery;
  private audioManager?: AudioManager;
  private hudSystem?: IHUDSystem;
  private gameModeManager?: GameModeManager;

  // Refactored modules
  private combatantFactory: CombatantFactory;
  public readonly combatantAI: CombatantAI;
  public readonly combatantCombat: CombatantCombat;
  private combatantMovement: CombatantMovement;
  public readonly combatantRenderer: CombatantRenderer;
  public readonly squadManager: SquadManager;
  public influenceMap?: InfluenceMapSystem;
  public sandbagSystem?: import('../weapons/SandbagSystem').SandbagSystem;
  private readonly spatialGridManager: SpatialGridManager;

  // New focused modules
  private spawnManager: CombatantSpawnManager;
  private lodManager: CombatantLODManager;
  private profiler: CombatantProfiler;
  private damageHandler: CombatantSystemDamage;
  private updateHelpers: CombatantSystemUpdate;

  // Effects pools
  private tracerPool: TracerPool;
  private muzzleFlashSystem: MuzzleFlashSystem;
  public readonly impactEffectsPool: ImpactEffectsPool;
  public readonly explosionEffectsPool: ExplosionEffectsPool;

  // Combatant management
  public readonly combatants: Map<string, Combatant> = new Map();
  private playerPosition = new THREE.Vector3();
  private autonomousSpawningEnabled = true;
  private combatEnabled = false;
  private readonly perfUserTimingEnabled =
    (import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1') && isPerfUserTimingEnabled();
  private readonly COMBAT_AI_USER_TIMING_MIN_MS = 0.25;
  private readonly COMBAT_AI_USER_TIMING_METHOD_LIMIT = 10;

  // Player squad
  public shouldCreatePlayerSquad = false;
  public playerSquadId?: string;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    globalBillboardSystem: GlobalBillboardSystem,
    assetLoader: AssetLoader,
    terrainSystem?: ITerrainRuntime,
    spatialGridManager: SpatialGridManager = defaultSpatialGridManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.globalBillboardSystem = globalBillboardSystem;
    this.assetLoader = assetLoader;
    this.terrainSystem = terrainSystem;
    this.spatialGridManager = spatialGridManager;

    // Initialize effect pools
    this.tracerPool = new TracerPool(this.scene, 256);
    this.muzzleFlashSystem = new MuzzleFlashSystem(this.scene, 64);
    this.impactEffectsPool = new ImpactEffectsPool(this.scene, 128);
    this.explosionEffectsPool = new ExplosionEffectsPool(this.scene, 16);

    // Initialize modules
    this.combatantFactory = new CombatantFactory();
    this.combatantAI = new CombatantAI();
    this.combatantRenderer = new CombatantRenderer(scene, camera, assetLoader);
    this.combatantCombat = new CombatantCombat(
      scene,
      this.tracerPool,
      this.muzzleFlashSystem,
      this.impactEffectsPool,
      this.combatantRenderer
    );
    this.combatantMovement = new CombatantMovement(terrainSystem, undefined);
    this.squadManager = new SquadManager(this.combatantFactory, terrainSystem);

    // Initialize spatial grid (will be reinitialized when game mode is set)
    this.spatialGridManager.initialize(4000);

    // Set spatial grid manager on CombatantMovement for cluster manager optimizations
    this.combatantMovement.setSpatialGridManager(this.spatialGridManager);

    // Initialize new focused modules
    this.spawnManager = new CombatantSpawnManager(
      this.combatants,
      this.combatantFactory,
      this.squadManager
    );

    this.lodManager = new CombatantLODManager(
      this.combatants,
      this.playerPosition,
      this.combatantAI,
      this.combatantCombat,
      this.combatantMovement,
      this.combatantRenderer,
      this.squadManager,
      this.spatialGridManager
    );

    this.profiler = new CombatantProfiler(
      this.combatants
    );

    // Initialize extracted modules
    this.damageHandler = new CombatantSystemDamage(
      this.combatants,
      this.squadManager,
      this.spawnManager
    );

    this.updateHelpers = new CombatantSystemUpdate(
      this.combatants,
      this.squadManager
    );

    // Combat queries use the unified spatial grid manager.
    this.combatantCombat.setSpatialQueryProvider((center, radius) => this.spatialGridManager.queryRadius(center, radius));
  }

  async init(): Promise<void> {
    Logger.info('Combat', 'Initializing Combatant System (BLUFOR vs OPFOR)...');

    // Create billboard meshes for each faction and state
    await this.combatantRenderer.createFactionBillboards();

    // Update AI with all squads
    this.combatantAI.setSquads(this.squadManager.getAllSquads());

    // Expose profiling only for harness/dev diagnostics. Gate matches
    // src/core/PerfDiagnostics.ts: DEV or VITE_PERF_HARNESS build.
    if ((import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1') && typeof window !== 'undefined' && isPerfDiagnosticsEnabled()) {
      (window as any).combatProfile = () => this.getCombatProfile();
    }

    Logger.info('Combat', 'Combatant System initialized');
    if ((import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1') && isPerfDiagnosticsEnabled()) {
      Logger.info('Combat', 'Use window.combatProfile() in console to see combat performance breakdown');
    }
  }
  /**
   * Get detailed combat profiling info for debugging performance
   */
  getCombatProfile() {
    return this.profiler.getCombatProfile();
  }
  update(deltaTime: number): void {
    // Update player position
    this.camera.getWorldPosition(this.playerPosition);
    this.lodManager.setPlayerPosition(this.playerPosition);

    // Update FPS EMA and adjust interval scaling
    this.lodManager.updateFrameTiming(deltaTime);
    const updateStart = performance.now();
    const isGameActive = this.ticketSystem ? this.ticketSystem.isGameActive() : true;

    if (!this.combatEnabled || !isGameActive) {
      // Combat-disabled path: movement/visual updates only, no AI/combat decisions.
      this.lodManager.updateCombatants(deltaTime, { enableAI: false });
      this.combatantRenderer.updateWalkFrame(deltaTime);
      this.combatantRenderer.updateBillboards(this.combatants, this.playerPosition);
      this.combatantRenderer.updateShaderUniforms(deltaTime);
      const duration = performance.now() - updateStart;
      this.profiler.updateTiming(duration);
      this.profiler.profiling.aiStateMs = {};
      this.profiler.profiling.aiMethodMs = {};
      this.profiler.profiling.aiMethodCounts = {};
      this.profiler.profiling.aiMethodTotalCounts = {};
      this.profiler.profiling.aiSlowestUpdate = null;
      this.profiler.profiling.aiUpdateMs = 0;
      return;
    }

    // Update spawn manager (progressive spawns, reinforcement waves, respawns)
    if (this.autonomousSpawningEnabled) {
      this.spawnManager.update(deltaTime, this.combatEnabled, this.ticketSystem);
    }

    // Periodic squad objective reassignment using influence map
    this.updateHelpers.updateSquadObjectives(deltaTime);

    // Update influence map with current game state
    let t0 = performance.now();
    if (this.influenceMap && this.zoneQuery) {
      this.influenceMap.setCombatants(this.combatants);
      this.influenceMap.setZones(this.zoneQuery.getAllZones());
      this.influenceMap.setPlayerPosition(this.playerPosition);
      // Update sandbag bounds if available
      const sandbagSystem = (this as any).sandbagSystem;
      if (sandbagSystem && typeof sandbagSystem.getSandbagBounds === 'function') {
        this.influenceMap.setSandbagBounds(sandbagSystem.getSandbagBounds());
      }
    }
    this.profiler.profiling.influenceMapMs = performance.now() - t0;

    // Update combatants (AI, movement, combat) with LOD scheduling
    t0 = performance.now();
    this.lodManager.updateCombatants(deltaTime);
    this.profiler.profiling.aiUpdateMs = performance.now() - t0;
    this.profiler.profiling.aiStateMs = this.combatantAI.getFrameStateProfile();
    this.profiler.profiling.aiMethodMs = this.combatantAI.getFrameMethodProfile();
    this.profiler.profiling.aiMethodCounts = this.combatantAI.getFrameMethodCountProfile();
    this.profiler.profiling.aiMethodTotalCounts = this.combatantAI.getMethodTotalCountProfile();
    this.profiler.profiling.aiSlowestUpdate = this.combatantAI.getSlowestUpdateBreakdown();
    this.recordCombatAiUserTiming(
      this.profiler.profiling.aiUpdateMs,
      this.profiler.profiling.aiMethodMs,
      this.profiler.profiling.aiSlowestUpdate
    );
    this.profiler.profiling.aiScheduling = this.lodManager.getFrameSchedulingStats();
    const losStats = AILineOfSight.getCacheStats();
    this.profiler.profiling.losCache = losStats;
    this.profiler.profiling.closeEngagement = {
      engagement: this.combatantAI.getCloseEngagementTelemetry(),
      targetAcquisition: this.combatantAI.getTargetAcquisitionTelemetry(),
      targetDistribution: clusterManager.getTargetDistributionTelemetry(),
      lineOfSight: losStats,
      losCallsites: this.combatantAI.getLosCallsiteTelemetry()
    };
    this.profiler.profiling.raycastBudget = getRaycastBudgetStats();
    this.profiler.profiling.combatFireRaycastBudget = getCombatFireRaycastBudgetStats();

    // Update LOD counts in profiler
    this.profiler.setLODCounts(
      this.lodManager.lodHighCount,
      this.lodManager.lodMediumCount,
      this.lodManager.lodLowCount,
      this.lodManager.lodCulledCount
    );

    // Count engaging combatants
    this.profiler.updateEngagementCounts();

    // Update billboard rotations and walk animation
    t0 = performance.now();
    this.combatantRenderer.updateWalkFrame(deltaTime);
    this.combatantRenderer.updateBillboards(this.combatants, this.playerPosition);
    this.combatantRenderer.updateShaderUniforms(deltaTime);
    this.profiler.profiling.billboardUpdateMs = performance.now() - t0;

    // Update effect pools
    t0 = performance.now();
    this.tracerPool.update();
    this.muzzleFlashSystem.update(deltaTime);
    this.impactEffectsPool.update(deltaTime);
    this.profiler.profiling.effectPoolsMs = performance.now() - t0;

    const duration = performance.now() - updateStart;
    this.profiler.profiling.totalMs = duration;
    this.profiler.updateTiming(duration);
  }

  private recordCombatAiUserTiming(
    aiUpdateMs: number,
    aiMethodMs: Record<string, number>,
    aiSlowestUpdate: { stateAtStart: string; lodLevel: string; totalMs: number } | null
  ): void {
    if (!this.perfUserTimingEnabled) return;

    this.measureCombatAiDuration('CombatAI.frame.total', aiUpdateMs);

    const methodEntries = Object.entries(aiMethodMs)
      .filter(([, durationMs]) => Number.isFinite(durationMs) && durationMs >= this.COMBAT_AI_USER_TIMING_MIN_MS)
      .sort(([, a], [, b]) => b - a)
      .slice(0, this.COMBAT_AI_USER_TIMING_METHOD_LIMIT);

    for (const [methodName, durationMs] of methodEntries) {
      this.measureCombatAiDuration(`CombatAI.method.${this.sanitizeUserTimingName(methodName)}`, durationMs);
    }

    if (aiSlowestUpdate && aiSlowestUpdate.totalMs >= this.COMBAT_AI_USER_TIMING_MIN_MS) {
      this.measureCombatAiDuration(
        `CombatAI.slowest.${this.sanitizeUserTimingName(aiSlowestUpdate.stateAtStart)}.${this.sanitizeUserTimingName(aiSlowestUpdate.lodLevel)}`,
        aiSlowestUpdate.totalMs
      );
    }
  }

  private measureCombatAiDuration(name: string, durationMs: number): void {
    if (
      !Number.isFinite(durationMs)
      || durationMs < this.COMBAT_AI_USER_TIMING_MIN_MS
      || typeof performance === 'undefined'
      || typeof performance.measure !== 'function'
    ) {
      return;
    }

    try {
      performance.measure(name, {
        start: Math.max(0, performance.now() - durationMs),
        duration: durationMs
      });
    } catch {
      // Diagnostic-only timing must never affect simulation behavior.
    }
  }

  private sanitizeUserTimingName(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.:-]/g, '_');
  }

  // Reseed forces when switching game modes to honor new HQ layouts and caps
  public reseedForcesForMode(): void {
    const createdPlayerSquadId = this.spawnManager.reseedForcesForMode(this.shouldCreatePlayerSquad, this.playerSquadId);
    if (createdPlayerSquadId) {
      this.playerSquadId = createdPlayerSquadId;
    }
    this.combatantAI.setSquads(this.squadManager.getAllSquads());
  }

  // -- Materialization bridge (used by WarSimulator) --

  /**
   * Create a full CombatantSystem entity from external agent data.
   * Returns the combatant ID for tracking.
   */
  materializeAgent(data: {
    faction: Faction;
    x: number;
    y: number;
    z: number;
    health: number;
    squadId?: string;
  }): string {
    const position = new THREE.Vector3(data.x, data.y, data.z);

    // Ensure external materialized agents are grounded at current terrain height.
    // Strategic agents can travel long distances between height updates.
    let terrainHeight = Number.NaN;
    if (!this.terrainSystem) {
      throw new Error('CombatantSystem requires terrainSystem before terrain-aware agent materialization');
    }
    terrainHeight = Number(this.terrainSystem.getHeightAt(data.x, data.z));
    if (Number.isFinite(terrainHeight)) {
      position.y = terrainHeight + NPC_Y_OFFSET;
    }

    const combatant = this.combatantFactory.createCombatant(
      data.faction,
      position,
      data.squadId ? { squadId: data.squadId, squadRole: 'follower' } : undefined
    );
    combatant.health = Math.min(data.health, combatant.maxHealth);
    this.combatants.set(combatant.id, combatant);
    this.spatialGridManager.syncEntity(combatant.id, combatant.position);
    return combatant.id;
  }

  /**
   * Remove a combatant and return its current state for the WarSimulator to absorb.
   * Returns null if combatant not found.
   */
  dematerializeAgent(combatantId: string): { x: number; y: number; z: number; health: number; alive: boolean } | null {
    const c = this.combatants.get(combatantId);
    if (!c) return null;

    const snapshot = {
      x: c.position.x,
      y: c.position.y,
      z: c.position.z,
      health: c.health,
      alive: c.state !== CombatantState.DEAD
    };

    // Unregister from navmesh crowd before removal
    this.combatantMovement.unregisterNavmeshAgent(combatantId);

    this.spatialGridManager.removeEntity(combatantId);
    this.combatants.delete(combatantId);

    return snapshot;
  }

  // Public API
  handlePlayerShot(
    ray: THREE.Ray,
    damageCalculator: (distance: number, isHeadshot: boolean) => number,
    weaponType = 'rifle',
  ): CombatHitResult {
    return this.combatantCombat.handlePlayerShot(ray, damageCalculator, this.combatants, weaponType);
  }

  resolvePlayerAimPoint(ray: THREE.Ray): CombatHitResult {
    return this.combatantCombat.previewPlayerShot(ray, this.combatants);
  }

  checkPlayerHit(ray: THREE.Ray): { hit: boolean; point: THREE.Vector3; headshot: boolean } {
    return this.combatantCombat.checkPlayerHit(ray, this.playerPosition);
  }

  applyExplosionDamage(center: THREE.Vector3, radius: number, maxDamage: number, attackerId?: string, weaponType = 'grenade'): void {
    this.damageHandler.applyExplosionDamage(center, radius, maxDamage, attackerId, weaponType);
  }

  getCombatStats(): { us: number; opfor: number; total: number } {
    let us = 0;
    let opfor = 0;
    this.combatants.forEach(combatant => {
      if (combatant.state === CombatantState.DEAD) return;
      if (isBlufor(combatant.faction)) {
        us++;
      } else {
        opfor++;
      }
    });
    return { us, opfor, total: us + opfor };
  }

  getTeamKillStats(): { usKills: number; usDeaths: number; opforKills: number; opforDeaths: number } {
    let usKills = 0; let usDeaths = 0; let opforKills = 0; let opforDeaths = 0;
    this.combatants.forEach(combatant => {
      if (isBlufor(combatant.faction)) {
        usKills += combatant.kills || 0;
        usDeaths += combatant.deaths || 0;
      } else {
        opforKills += combatant.kills || 0;
        opforDeaths += combatant.deaths || 0;
      }
    });
    return { usKills, usDeaths, opforKills, opforDeaths };
  }

  getAllCombatants(): Combatant[] {
    return Array.from(this.combatants.values());
  }

  querySpatialRadius(center: THREE.Vector3, radius: number): string[] {
    return this.spatialGridManager.queryRadius(center, radius);
  }

  getCombatantLiveness(id: string): { exists: boolean; alive: boolean } {
    const combatant = this.combatants.get(id);
    if (!combatant) {
      return { exists: false, alive: false };
    }
    return {
      exists: true,
      alive: combatant.state !== CombatantState.DEAD && !combatant.isDying && combatant.health > 0
    };
  }

  configureDependencies(dependencies: CombatantSystemDependencies): void {
    this.setTerrainSystem(dependencies.terrainSystem);
    this.setCamera(dependencies.camera);
    this.setTicketSystem(dependencies.ticketSystem);
    this.setPlayerHealthSystem(dependencies.playerHealthSystem);
    this.setZoneManager(dependencies.zoneManager);
    this.setGameModeManager(dependencies.gameModeManager);
    this.setHUDSystem(dependencies.hudSystem);
    this.setAudioManager(dependencies.audioManager);
    this.setPlayerSuppressionSystem(dependencies.playerSuppressionSystem);
  }

  // Setters for external systems
  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
    this.combatantMovement.setTerrainSystem(terrainSystem);
    this.squadManager.setTerrainSystem(terrainSystem);
    this.combatantAI.setTerrainSystem(terrainSystem);
    this.combatantCombat.setTerrainSystem(terrainSystem);
    this.spawnManager.setTerrainSystem(terrainSystem);
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
    this.combatantCombat.setCamera(camera);
  }

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.ticketSystem = ticketSystem;
    this.damageHandler.setTicketSystem(ticketSystem);
    this.combatantCombat.setTicketSystem(ticketSystem);
    this.combatantAI.setTicketSystem(ticketSystem);
    this.combatantMovement.setTicketSystem(ticketSystem);
  }

  setPlayerHealthSystem(playerHealthSystem: PlayerHealthSystem): void {
    this.playerHealthSystem = playerHealthSystem;
    this.combatantCombat.setPlayerHealthSystem(playerHealthSystem);
  }

  setZoneManager(zoneQuery: IZoneQuery): void {
    this.zoneQuery = zoneQuery;
    this.updateHelpers.setZoneManager(zoneQuery);
    this.combatantMovement.setZoneManager(zoneQuery);
    this.spawnManager.setZoneManager(zoneQuery);
    this.lodManager.setZoneManager(zoneQuery);
  }

  setHUDSystem(hudSystem: IHUDSystem): void {
    this.hudSystem = hudSystem;
    this.damageHandler.setHUDSystem(hudSystem);
    this.combatantCombat.setHUDSystem(hudSystem);
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
    this.combatantMovement.setGameModeManager(gameModeManager);
    this.spawnManager.setGameModeManager(gameModeManager);
    this.lodManager.setGameModeManager(gameModeManager);
    // Reinitialize spatial grid with correct world size
    const worldSize = gameModeManager.getWorldSize();
    this.spatialGridManager.reinitialize(worldSize);
    Logger.info('combat', `Spatial grid reinitialized with world size ${worldSize}`);
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager;
    this.combatantCombat.setAudioManager(audioManager);
  }

  setPlayerFaction(faction: Faction): void {
    this.combatantAI.setPlayerFaction(faction);
    this.spawnManager.setPlayerFaction(faction);
  }

  setPlayerSuppressionSystem(system: PlayerSuppressionSystem): void {
    this.combatantCombat.setPlayerSuppressionSystem(system);
  }

  setNavmeshSystem(navmeshSystem: NavmeshSystem): void {
    this.combatantMovement.setNavmeshSystem(navmeshSystem);
    this.lodManager.setNavmeshSystem(navmeshSystem);
  }

  // Game mode configuration methods
  setMaxCombatants(max: number): void {
    this.spawnManager.setMaxCombatants(max);
    Logger.info('combat', `Max combatants set to ${max}`);
  }

  setSquadSizes(min: number, max: number): void {
    this.spawnManager.setSquadSizes(min, max);
    Logger.info('combat', `Squad sizes set to ${min}-${max}`);
  }

  setReinforcementInterval(interval: number): void {
    this.spawnManager.setReinforcementInterval(interval);
    Logger.info('combat', `Reinforcement interval set to ${interval} seconds`);
  }

  setAutonomousSpawningEnabled(enabled: boolean): void {
    this.autonomousSpawningEnabled = enabled;
    this.spawnManager.setAutonomousSpawningEnabled(enabled);
    if (!enabled) {
      this.spawnManager.resetRuntimeStateForExternalPopulation();
    }
  }

  clearCombatantsForExternalPopulation(): void {
    const ids = Array.from(this.combatants.keys());
    for (const id of ids) {
      this.spatialGridManager.removeEntity(id);
    }
    this.combatants.clear();
    this.squadManager.dispose();
    this.playerSquadId = undefined;
    this.spawnManager.resetRuntimeStateForExternalPopulation();
    this.combatantAI.setSquads(this.squadManager.getAllSquads());
  }

  setSpatialBounds(size: number): void {
    this.spatialGridManager.reinitialize(size);
    // Re-insert all existing combatants
    this.combatants.forEach((c, id) => {
      this.spatialGridManager.syncEntity(id, c.position);
    });
    Logger.info('combat', `Spatial bounds resized to ${size}m`);
  }

  enableCombat(): void {
    this.combatEnabled = true;
    Logger.info('combat', 'Combat AI activated');
  }

  // Get the renderer for external configuration
  getRenderer(): CombatantRenderer {
    return this.combatantRenderer;
  }

  getTelemetry() {
    return this.profiler.getTelemetry();
  }

  dispose(): void {
    // Clean up modules
    this.combatantRenderer.dispose();
    this.squadManager.dispose();

    // Clean up pools
    this.tracerPool.dispose();
    this.muzzleFlashSystem.dispose();
    this.impactEffectsPool.dispose();

    // Clear combatants
    this.combatants.clear();

    Logger.info('combat', 'Combatant system disposed');
  }
}
