import * as THREE from 'three';
import { GameSystem } from '../../types';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { AssetLoader } from '../assets/AssetLoader';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { Combatant, CombatantState, Faction, isBlufor, isOpfor } from './types';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashSystem } from '../effects/MuzzleFlashSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { TicketSystem } from '../world/TicketSystem';
import { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { ZoneManager } from '../world/ZoneManager';
import { AudioManager } from '../audio/AudioManager';
import { GameModeManager } from '../world/GameModeManager';
import { Logger } from '../../utils/Logger';
import { VoiceCalloutSystem } from '../audio/VoiceCalloutSystem';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';

// Refactored modules
import { CombatantFactory } from './CombatantFactory';
import { CombatantAI } from './CombatantAI';
import { CombatantCombat, CombatHitResult } from './CombatantCombat';
import { CombatantMovement } from './CombatantMovement';
import { CombatantRenderer } from './CombatantRenderer';
import { SquadManager } from './SquadManager';
import { SpatialOctree } from './SpatialOctree';
import { spatialGridManager } from './SpatialGridManager';
import { InfluenceMapSystem } from './InfluenceMapSystem';
import { RallyPointSystem } from './RallyPointSystem';
import { IHUDSystem } from '../../types/SystemInterfaces';

// New focused modules
import { CombatantSpawnManager } from './CombatantSpawnManager';
import { CombatantLODManager } from './CombatantLODManager';
import { CombatantProfiler } from './CombatantProfiler';
import { CombatantSystemDamage } from './CombatantSystemDamage';
import { CombatantSystemSetters } from './CombatantSystemSetters';
import { CombatantSystemUpdate } from './CombatantSystemUpdate';
import { AILineOfSight } from './ai/AILineOfSight';
import { getRaycastBudgetStats } from './ai/RaycastBudget';
import { getCombatFireRaycastBudgetStats } from './ai/CombatFireRaycastBudget';

export class CombatantSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private globalBillboardSystem: GlobalBillboardSystem;
  private assetLoader: AssetLoader;
  private chunkManager?: ImprovedChunkManager;
  private ticketSystem?: TicketSystem;
  private playerHealthSystem?: PlayerHealthSystem;
  private zoneManager?: ZoneManager;
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
  private spatialGrid: SpatialOctree;
  public influenceMap?: InfluenceMapSystem;
  public sandbagSystem?: import('../weapons/SandbagSystem').SandbagSystem;
  private rallyPointSystem?: RallyPointSystem;

  // New focused modules
  private spawnManager: CombatantSpawnManager;
  private lodManager: CombatantLODManager;
  private profiler: CombatantProfiler;
  private damageHandler: CombatantSystemDamage;
  private setters: CombatantSystemSetters;
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

  // Player proxy
  private playerProxyId: string = 'player_proxy';
  private combatEnabled = false;
  private readonly secondarySpatialSyncEnabled: boolean;
  private readonly secondarySpatialDedupEnabled: boolean;

  // Player squad
  public shouldCreatePlayerSquad = false;
  public playerSquadId?: string;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    globalBillboardSystem: GlobalBillboardSystem,
    assetLoader: AssetLoader,
    chunkManager?: ImprovedChunkManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.globalBillboardSystem = globalBillboardSystem;
    this.assetLoader = assetLoader;
    this.chunkManager = chunkManager;

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
    this.combatantMovement = new CombatantMovement(chunkManager, undefined);
    this.squadManager = new SquadManager(this.combatantFactory, chunkManager);

    // Use legacy spatial grid for internal queries (AI, etc.)
    // SpatialGridManager (singleton) is used for hit detection
    this.spatialGrid = new SpatialOctree(4000, 12, 6); // 4000m world, 12 entities/node, 6 max depth

    // Initialize the singleton spatial grid manager (will be reinitialized when game mode is set)
    spatialGridManager.initialize(4000);

    // Set spatial grid manager on CombatantMovement for cluster manager optimizations
    this.combatantMovement.setSpatialGridManager(spatialGridManager);

    // Initialize new focused modules
    this.spawnManager = new CombatantSpawnManager(
      this.combatants,
      this.spatialGrid,
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
      this.spatialGrid
    );

    this.profiler = new CombatantProfiler(
      this.combatants,
      this.spatialGrid
    );

    // Initialize extracted modules
    this.damageHandler = new CombatantSystemDamage(
      this.combatants,
      this.squadManager,
      this.spawnManager
    );

    this.setters = new CombatantSystemSetters(
      this.combatantMovement,
      this.combatantCombat,
      this.combatantAI,
      this.squadManager,
      this.spawnManager,
      this.lodManager,
      this.spatialGrid
    );

    this.updateHelpers = new CombatantSystemUpdate(
      this.combatants,
      this.playerProxyId,
      this.playerPosition,
      this.combatantFactory,
      this.squadManager,
      this.spatialGrid
    );

    // Combat query consumers use primary combat spatial ownership by default.
    this.combatantCombat.setSpatialQueryProvider((center, radius) => this.spatialGrid.queryRadius(center, radius));

    this.secondarySpatialSyncEnabled = this.resolveSecondarySpatialSyncEnabled();
    this.secondarySpatialDedupEnabled = this.resolveSecondarySpatialDedupEnabled();
  }

  async init(): Promise<void> {
    Logger.info('Combat', 'Initializing Combatant System (BLUFOR vs OPFOR)...');

    // Create billboard meshes for each faction and state
    await this.combatantRenderer.createFactionBillboards();

    // Update AI with all squads
    this.combatantAI.setSquads(this.squadManager.getAllSquads());

    // Expose profiling to console for debugging
    if (typeof window !== 'undefined') {
      (window as any).combatProfile = () => this.getCombatProfile();
    }

    Logger.info('Combat', 'Combatant System initialized');
    Logger.info('Combat', 'Use window.combatProfile() in console to see combat performance breakdown');
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
      this.profiler.profiling.aiUpdateMs = 0;
      return;
    }

    // Ensure player proxy exists
    this.updateHelpers.ensurePlayerProxy();

    // Update spawn manager (progressive spawns, reinforcement waves, respawns)
    if (this.autonomousSpawningEnabled) {
      this.spawnManager.update(deltaTime, this.combatEnabled, this.ticketSystem);
    }

    // Periodic squad objective reassignment using influence map
    this.updateHelpers.updateSquadObjectives(deltaTime);

    // Update influence map with current game state
    let t0 = performance.now();
    if (this.influenceMap && this.zoneManager) {
      this.influenceMap.setCombatants(this.combatants);
      this.influenceMap.setZones(this.zoneManager.getAllZones());
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
    this.profiler.profiling.aiScheduling = this.lodManager.getFrameSchedulingStats();
    this.profiler.profiling.losCache = AILineOfSight.getCacheStats();
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

    // Secondary sync path is experimental; primary spatial ownership is the octree updated in LOD manager.
    if (this.secondarySpatialSyncEnabled) {
      t0 = performance.now();
      spatialGridManager.syncAllPositions(
        this.combatants,
        this.playerPosition,
        this.secondarySpatialDedupEnabled ? this.lodManager.getSpatiallyUpdatedIds() : undefined
      );
      this.profiler.profiling.spatialSyncMs = performance.now() - t0;
    } else {
      this.profiler.profiling.spatialSyncMs = 0;
    }

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
    const terrainResolver =
      (this.chunkManager as any)?.getTerrainHeightAt
      ?? (this.chunkManager as any)?.getHeightAt
      ?? (this.chunkManager as any)?.getEffectiveHeightAt;

    let terrainHeight = Number.NaN;
    if (typeof terrainResolver === 'function') {
      terrainHeight = Number(terrainResolver.call(this.chunkManager, data.x, data.z));
    }
    if (!Number.isFinite(terrainHeight)) {
      terrainHeight = getHeightQueryCache().getHeightAt(data.x, data.z);
    }
    if (Number.isFinite(terrainHeight)) {
      position.y = terrainHeight + 3;
    }

    const combatant = this.combatantFactory.createCombatant(
      data.faction,
      position,
      data.squadId ? { squadId: data.squadId, squadRole: 'follower' } : undefined
    );
    combatant.health = Math.min(data.health, combatant.maxHealth);
    this.combatants.set(combatant.id, combatant);
    this.spatialGrid.updatePosition(combatant.id, combatant.position);
    spatialGridManager.syncEntity(combatant.id, combatant.position);
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

    // Remove from all spatial structures
    this.spatialGrid.remove(combatantId);
    spatialGridManager.removeEntity(combatantId);
    this.combatants.delete(combatantId);

    return snapshot;
  }

  // Public API
  handlePlayerShot(
    ray: THREE.Ray,
    damageCalculator: (distance: number, isHeadshot: boolean) => number
  ): CombatHitResult {
    return this.combatantCombat.handlePlayerShot(ray, damageCalculator, this.combatants);
  }

  checkPlayerHit(ray: THREE.Ray): { hit: boolean; point: THREE.Vector3; headshot: boolean } {
    return this.combatantCombat.checkPlayerHit(ray, this.playerPosition);
  }

  applyExplosionDamage(center: THREE.Vector3, radius: number, maxDamage: number, attackerId?: string): void {
    this.damageHandler.applyExplosionDamage(center, radius, maxDamage, attackerId);
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
    return this.spatialGrid.queryRadius(center, radius);
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

  private resolveSecondarySpatialSyncEnabled(): boolean {
    const fromGlobal = (globalThis as any).__SPATIAL_SECONDARY_SYNC__;
    if (typeof fromGlobal === 'boolean') return fromGlobal;
    if (typeof window === 'undefined') return true;
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('spatialSecondarySync');
      if (raw === '0' || raw === 'false') return false;
      return true;
    } catch {
      return true;
    }
  }

  private resolveSecondarySpatialDedupEnabled(): boolean {
    const fromGlobal = (globalThis as any).__SPATIAL_DEDUP_SYNC__;
    if (typeof fromGlobal === 'boolean') return fromGlobal;
    if (typeof window === 'undefined') return true;
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('spatialDedupSync');
      if (raw === '0' || raw === 'false') return false;
      return true;
    } catch {
      return true;
    }
  }

  // Setters for external systems
  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
    this.setters.setChunkManager(chunkManager);
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
    this.setters.setCamera(camera);
  }

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.ticketSystem = ticketSystem;
    this.damageHandler.setTicketSystem(ticketSystem);
    this.setters.setTicketSystem(ticketSystem);
  }

  setPlayerHealthSystem(playerHealthSystem: PlayerHealthSystem): void {
    this.playerHealthSystem = playerHealthSystem;
    this.setters.setPlayerHealthSystem(playerHealthSystem);
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
    this.updateHelpers.setZoneManager(zoneManager);
    this.setters.setZoneManager(zoneManager);
  }

  setHUDSystem(hudSystem: IHUDSystem): void {
    this.hudSystem = hudSystem;
    this.damageHandler.setHUDSystem(hudSystem);
    this.setters.setHUDSystem(hudSystem);
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
    this.setters.setGameModeManager(gameModeManager);
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager;
    this.setters.setAudioManager(audioManager);
  }

  setVoiceCalloutSystem(voiceCalloutSystem: VoiceCalloutSystem): void {
    this.setters.setVoiceCalloutSystem(voiceCalloutSystem);
  }

  setPlayerSuppressionSystem(system: import('../player/PlayerSuppressionSystem').PlayerSuppressionSystem): void {
    this.setters.setPlayerSuppressionSystem(system);
  }

  // Game mode configuration methods
  setMaxCombatants(max: number): void {
    this.setters.setMaxCombatants(max);
  }

  setSquadSizes(min: number, max: number): void {
    this.setters.setSquadSizes(min, max);
  }

  setReinforcementInterval(interval: number): void {
    this.setters.setReinforcementInterval(interval);
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
      this.spatialGrid.remove(id);
      spatialGridManager.removeEntity(id);
    }
    this.combatants.clear();
    this.squadManager.dispose();
    this.playerSquadId = undefined;
    this.spawnManager.resetRuntimeStateForExternalPopulation();
    this.combatantAI.setSquads(this.squadManager.getAllSquads());
  }

  setSpatialBounds(size: number): void {
    this.spatialGrid = new SpatialOctree(size, 12, 6);
    spatialGridManager.initialize(size);
    // Re-insert all existing combatants
    this.combatants.forEach((c, id) => {
      this.spatialGrid.updatePosition(id, c.position);
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
