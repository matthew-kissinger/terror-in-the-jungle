import * as THREE from 'three';
import { GameSystem } from '../../types';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { AssetLoader } from '../assets/AssetLoader';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { Combatant, CombatantState, Faction, SquadCommand } from './types';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashPool } from '../effects/MuzzleFlashPool';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { TicketSystem } from '../world/TicketSystem';
import { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { ZoneManager } from '../world/ZoneManager';
import { AudioManager } from '../audio/AudioManager';
import { GameModeManager } from '../world/GameModeManager';
import { Logger } from '../../utils/Logger';

// Refactored modules
import { CombatantFactory } from './CombatantFactory';
import { CombatantAI } from './CombatantAI';
import { CombatantCombat } from './CombatantCombat';
import { CombatantMovement } from './CombatantMovement';
import { CombatantRenderer } from './CombatantRenderer';
import { SquadManager } from './SquadManager';
import { SpatialOctree } from './SpatialOctree';
import { spatialGridManager } from './SpatialGridManager';
import { InfluenceMapSystem } from './InfluenceMapSystem';
import { RallyPointSystem } from './RallyPointSystem';

// New focused modules
import { CombatantSpawnManager } from './CombatantSpawnManager';
import { CombatantLODManager } from './CombatantLODManager';
import { CombatantProfiler } from './CombatantProfiler';
import { CombatantSystemDamage } from './CombatantSystemDamage';
import { CombatantSystemSetters } from './CombatantSystemSetters';
import { CombatantSystemUpdate } from './CombatantSystemUpdate';

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
  private hudSystem?: any;
  private gameModeManager?: GameModeManager;

  // Refactored modules
  private combatantFactory: CombatantFactory;
  private combatantAI: CombatantAI;
  public combatantCombat: CombatantCombat;
  private combatantMovement: CombatantMovement;
  private combatantRenderer: CombatantRenderer;
  private squadManager: SquadManager;
  private spatialGrid: SpatialOctree;
  private influenceMap?: InfluenceMapSystem;
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
  private muzzleFlashPool: MuzzleFlashPool;
  private impactEffectsPool: ImpactEffectsPool;
  private explosionEffectsPool: ExplosionEffectsPool;

  // Combatant management
  public combatants: Map<string, Combatant> = new Map();
  private playerPosition = new THREE.Vector3();

  // Player proxy
  private playerProxyId: string = 'player_proxy';
  private combatEnabled = false;

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
    this.muzzleFlashPool = new MuzzleFlashPool(this.scene, 128);
    this.impactEffectsPool = new ImpactEffectsPool(this.scene, 128);
    this.explosionEffectsPool = new ExplosionEffectsPool(this.scene, 16);

    // Initialize modules
    this.combatantFactory = new CombatantFactory();
    this.combatantAI = new CombatantAI();
    this.combatantRenderer = new CombatantRenderer(scene, camera, assetLoader);
    this.combatantCombat = new CombatantCombat(
      scene,
      this.tracerPool,
      this.muzzleFlashPool,
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
  }

  async init(): Promise<void> {
    Logger.info('Combat', 'Initializing Combatant System (US vs OPFOR)...');

    // Create billboard meshes for each faction and state
    await this.combatantRenderer.createFactionBillboards();

    // Spawn initial forces
    const createdPlayerSquadId = this.spawnManager.spawnInitialForces(this.shouldCreatePlayerSquad, this.playerSquadId);
    if (createdPlayerSquadId) {
      this.playerSquadId = createdPlayerSquadId;
    }

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

    if (!this.combatEnabled) {
      // Still update positions and billboards for visual consistency
      this.lodManager.updateCombatants(deltaTime);
      this.combatantRenderer.updateBillboards(this.combatants, this.playerPosition);
      this.combatantRenderer.updateShaderUniforms(deltaTime);
      const duration = performance.now() - updateStart;
      this.profiler.updateTiming(duration);
      return;
    }

    // Ensure player proxy exists
    this.updateHelpers.ensurePlayerProxy();

    // Update spawn manager (progressive spawns, reinforcement waves, respawns)
    this.spawnManager.update(deltaTime, this.combatEnabled, this.ticketSystem);

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

    // Update LOD counts in profiler
    this.profiler.setLODCounts(
      this.lodManager.lodHighCount,
      this.lodManager.lodMediumCount,
      this.lodManager.lodLowCount,
      this.lodManager.lodCulledCount
    );

    // Count engaging combatants
    this.profiler.updateEngagementCounts();

    // Sync spatial grid manager with all combatant positions
    t0 = performance.now();
    spatialGridManager.syncAllPositions(this.combatants, this.playerPosition);
    this.profiler.profiling.spatialSyncMs = performance.now() - t0;

    // Update billboard rotations
    t0 = performance.now();
    this.combatantRenderer.updateBillboards(this.combatants, this.playerPosition);
    this.combatantRenderer.updateShaderUniforms(deltaTime);
    this.profiler.profiling.billboardUpdateMs = performance.now() - t0;

    // Update effect pools
    t0 = performance.now();
    this.tracerPool.update();
    this.muzzleFlashPool.update();
    this.impactEffectsPool.update(deltaTime);
    this.profiler.profiling.effectPoolsMs = performance.now() - t0;

    const duration = performance.now() - updateStart;
    this.profiler.profiling.totalMs = duration;
    this.profiler.updateTiming(duration);
  }

  // Reseed forces when switching game modes to honor new HQ layouts and caps
  public reseedForcesForMode(): void {
    this.spawnManager.reseedForcesForMode();
    this.combatantAI.setSquads(this.squadManager.getAllSquads());
  }


  // Public API
  handlePlayerShot(
    ray: THREE.Ray,
    damageCalculator: (distance: number, isHeadshot: boolean) => number
  ): { hit: boolean; point: THREE.Vector3; killed?: boolean; headshot?: boolean } {
    return this.combatantCombat.handlePlayerShot(ray, damageCalculator, this.combatants);
  }

  checkPlayerHit(ray: THREE.Ray): { hit: boolean; point: THREE.Vector3; headshot: boolean } {
    return this.combatantCombat.checkPlayerHit(ray, this.playerPosition);
  }

  applyExplosionDamage(center: THREE.Vector3, radius: number, maxDamage: number): void {
    this.damageHandler.applyExplosionDamage(center, radius, maxDamage);
  }

  getCombatStats(): { us: number; opfor: number; total: number } {
    let us = 0;
    let opfor = 0;

    this.combatants.forEach(combatant => {
      if (combatant.state === CombatantState.DEAD) return;
      if (combatant.faction === Faction.US) {
        us++;
      } else {
        opfor++;
      }
    });

    return { us, opfor, total: us + opfor };
  }

  getAllCombatants(): Combatant[] {
    return Array.from(this.combatants.values());
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

  setHUDSystem(hudSystem: any): void {
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

  setPlayerSuppressionSystem(system: any): void {
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
    this.muzzleFlashPool.dispose();
    this.impactEffectsPool.dispose();

    // Clear combatants
    this.combatants.clear();

    Logger.info('combat', 'Combatant system disposed');
  }
}
