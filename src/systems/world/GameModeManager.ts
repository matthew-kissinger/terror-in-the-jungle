import { Logger } from '../../utils/Logger';
import { GameSystem } from '../../types';
import {
  DeployPolicyConfig,
  GameMode,
  GameModeConfig,
  GameModeDefinition,
  MapIntelPolicyConfig,
  RespawnPolicyConfig
} from '../../config/gameModeTypes';
import { getGameModeDefinition } from '../../config/gameModeDefinitions';
import { ZoneManager } from './ZoneManager';
import { CombatantSystem } from '../combat/CombatantSystem';
import { TicketSystem } from './TicketSystem';
import { MinimapSystem } from '../../ui/minimap/MinimapSystem';
import { FullMapSystem } from '../../ui/map/FullMapSystem';
import type { HUDSystem } from '../../ui/hud/HUDSystem';
import { InfluenceMapSystem } from '../combat/InfluenceMapSystem';
import type { PlayerController } from '../player/PlayerController';
import type { PlayerRespawnManager } from '../player/PlayerRespawnManager';
import type { WarSimulator } from '../strategy/WarSimulator';
import type { ITerrainRuntimeController } from '../../types/SystemInterfaces';
import {
  createGameModeRuntime,
  GameModeRuntime,
  GameModeRuntimeContext,
  GameModeRuntimeSystems
} from './runtime/GameModeRuntime';
import {
  createDeploySession,
  DeploySessionKind,
  DeploySessionModel
} from './runtime/DeployFlowSession';

type GameModeDefinitionResolver = (mode: GameMode) => GameModeDefinition;
type GameModeRuntimeFactory = (definition: GameModeDefinition) => GameModeRuntime;

interface GameModeManagerDependencies {
  zoneManager: ZoneManager;
  combatantSystem: CombatantSystem;
  ticketSystem: TicketSystem;
  terrainSystem: ITerrainRuntimeController;
  minimapSystem: MinimapSystem;
  fullMapSystem: FullMapSystem;
  influenceMapSystem: InfluenceMapSystem;
  warSimulator?: WarSimulator;
  hudSystem: HUDSystem;
  playerController: PlayerController;
  playerRespawnManager: PlayerRespawnManager;
}

export class GameModeManager implements GameSystem {
  public currentMode: GameMode = GameMode.ZONE_CONTROL;
  private currentConfig: GameModeConfig;
  private currentDefinition: GameModeDefinition;
  private currentRuntime: GameModeRuntime;

  // Systems to configure
  private zoneManager?: ZoneManager;
  private combatantSystem?: CombatantSystem;
  private ticketSystem?: TicketSystem;
  private terrainSystem?: ITerrainRuntimeController;
  private minimapSystem?: MinimapSystem;
  private fullMapSystem?: FullMapSystem;
  private influenceMapSystem?: InfluenceMapSystem;
  private warSimulator?: WarSimulator;
  private hudSystem?: HUDSystem;
  private playerController?: PlayerController;
  private playerRespawnManager?: PlayerRespawnManager;

  // Callbacks
  private onModeChange?: (mode: GameMode, config: GameModeConfig) => void;

  constructor(
    private readonly definitionResolver: GameModeDefinitionResolver = getGameModeDefinition,
    private readonly runtimeFactory: GameModeRuntimeFactory = createGameModeRuntime
  ) {
    this.currentDefinition = this.definitionResolver(this.currentMode);
    this.currentConfig = this.currentDefinition.config;
    this.currentRuntime = this.runtimeFactory(this.currentDefinition);
  }

  async init(): Promise<void> {
    Logger.info('world', 'Initializing Game Mode Manager...');
    Logger.info('world', `Default mode: ${this.currentConfig.name}`);
  }

  update(_deltaTime: number): void {
    // Game mode manager doesn't need regular updates
  }

  dispose(): void {
    // Cleanup if needed
  }

  // Set connected systems
  public connectSystems(
    zoneManager: ZoneManager,
    combatantSystem: CombatantSystem,
    ticketSystem: TicketSystem,
    terrainSystem: ITerrainRuntimeController,
    minimapSystem: MinimapSystem,
    fullMapSystem: FullMapSystem
  ): void {
    this.zoneManager = zoneManager;
    this.combatantSystem = combatantSystem;
    this.ticketSystem = ticketSystem;
    this.terrainSystem = terrainSystem;
    this.minimapSystem = minimapSystem;
    this.fullMapSystem = fullMapSystem;
    const fullMapRuntimeTarget = this.fullMapSystem as unknown as {
      setTerrainRuntime?: (runtime: ITerrainRuntimeController) => void;
    };
    fullMapRuntimeTarget.setTerrainRuntime?.(terrainSystem);
    this.applyMapIntelPolicy(this.currentDefinition.policies.mapIntel);
  }

  public configureDependencies(dependencies: GameModeManagerDependencies): void {
    this.connectSystems(
      dependencies.zoneManager,
      dependencies.combatantSystem,
      dependencies.ticketSystem,
      dependencies.terrainSystem,
      dependencies.minimapSystem,
      dependencies.fullMapSystem
    );
    this.setInfluenceMapSystem(dependencies.influenceMapSystem);
    if (dependencies.warSimulator) {
      this.setWarSimulator(dependencies.warSimulator);
    }
    this.setHUDSystem(dependencies.hudSystem);
    this.setPlayerController(dependencies.playerController);
    this.setPlayerRespawnManager(dependencies.playerRespawnManager);
  }

  public setInfluenceMapSystem(influenceMapSystem: InfluenceMapSystem): void {
    this.influenceMapSystem = influenceMapSystem;
  }

  public setWarSimulator(warSimulator: WarSimulator): void {
    this.warSimulator = warSimulator;
    this.warSimulator.setCurrentGameMode(this.currentConfig.id);
  }

  public setHUDSystem(hudSystem: HUDSystem): void {
    this.hudSystem = hudSystem;
  }

  public setPlayerController(playerController: PlayerController): void {
    this.playerController = playerController;
  }

  public setPlayerRespawnManager(playerRespawnManager: PlayerRespawnManager): void {
    this.playerRespawnManager = playerRespawnManager;
  }

  // Get current mode
  public getCurrentMode(): GameMode {
    return this.currentMode;
  }

  // Get current config
  public getCurrentConfig(): GameModeConfig {
    return this.currentConfig;
  }

  public getCurrentDefinition(): GameModeDefinition {
    return this.currentDefinition;
  }

  public getCurrentRuntime(): GameModeRuntime {
    return this.currentRuntime;
  }

  public getDeployPolicy(): DeployPolicyConfig {
    return this.currentDefinition.policies.deploy;
  }

  public getRespawnPolicy(): RespawnPolicyConfig {
    return this.currentDefinition.policies.respawn;
  }

  public getMapIntelPolicy(): MapIntelPolicyConfig {
    return this.currentDefinition.policies.mapIntel;
  }

  public getDeploySession(kind: DeploySessionKind = 'respawn'): DeploySessionModel {
    return createDeploySession(this.currentDefinition, kind);
  }

  public updateRuntime(deltaTime: number, gameStarted: boolean): void {
    this.currentRuntime.update?.(
      this.createRuntimeContext(this.currentDefinition),
      deltaTime,
      gameStarted
    );
  }

  // Set game mode (called from menu)
  public setGameMode(mode: GameMode): void {
    if (mode === this.currentMode) {
      Logger.info('world', `GameModeManager: Re-applying current mode: ${mode}`);
      this.applyModeConfiguration();
      this.currentRuntime.onReapply?.(this.createRuntimeContext(this.currentDefinition));
      return;
    }

    const previousDefinition = this.currentDefinition;
    const previousRuntime = this.currentRuntime;
    const nextDefinition = this.definitionResolver(mode);
    const nextRuntime = this.runtimeFactory(nextDefinition);

    previousRuntime.onExit?.(this.createRuntimeContext(previousDefinition, { nextDefinition }));

    Logger.info('world', `GameModeManager: Switching game mode to: ${mode}`);
    this.currentMode = mode;
    this.currentDefinition = nextDefinition;
    this.currentConfig = nextDefinition.config;
    this.currentRuntime = nextRuntime;
    Logger.info('world', `GameModeManager: World size is now ${this.currentConfig.worldSize}, zones: ${this.currentConfig.zones.length}`);

    // Apply configuration to connected systems
    this.applyModeConfiguration();

    this.currentRuntime.onEnter?.(
      this.createRuntimeContext(this.currentDefinition, { previousDefinition })
    );

    // Notify listeners
    if (this.onModeChange) {
      this.onModeChange(mode, this.currentConfig);
    }
  }

  // Apply mode-specific configuration
  private applyModeConfiguration(): void {
    const config = this.currentConfig;

    // Configure zone manager with mode-specific zones
    if (this.zoneManager) {
      this.zoneManager.setGameModeConfig(config);
    }

    // Configure combatant system
    if (this.combatantSystem) {
      this.combatantSystem.setMaxCombatants(config.maxCombatants);
      this.combatantSystem.setSquadSizes(config.squadSize.min, config.squadSize.max);
      this.combatantSystem.setReinforcementInterval(config.reinforcementInterval);
      // Skip standard spawning when WarSimulator handles force generation
      if (!config.warSimulator?.enabled) {
        this.combatantSystem.setAutonomousSpawningEnabled(true);
        this.combatantSystem.reseedForcesForMode();
      } else {
        this.combatantSystem.setAutonomousSpawningEnabled(false);
        this.combatantSystem.clearCombatantsForExternalPopulation();
      }
    }

    // Configure ticket system
    if (this.ticketSystem) {
      this.ticketSystem.setMaxTickets(config.maxTickets);
      this.ticketSystem.setMatchDuration(config.matchDuration);
      this.ticketSystem.setDeathPenalty(config.deathPenalty);

      const isTDM = this.currentDefinition.policies.objective.kind === 'deathmatch';
      this.ticketSystem.setTDMMode(isTDM, isTDM ? config.maxTickets : 0);
    }

    // Configure terrain runtime render distance
    if (this.terrainSystem) {
      this.terrainSystem.setRenderDistance(config.chunkRenderDistance);
    }

    if (this.warSimulator) {
      this.warSimulator.setCurrentGameMode(config.id);
    }

    // Configure minimap scale (local player-centered view area)
    if (this.minimapSystem) {
      this.minimapSystem.setWorldScale(config.minimapScale);
    }

    // Apply scale overrides for large maps
    if (config.scaleConfig && this.combatantSystem) {
      const sc = config.scaleConfig;
      if (sc.aiEngagementRange !== undefined) {
        this.combatantSystem.combatantAI.setEngagementRange(sc.aiEngagementRange);
      }
      if (sc.lodHighRange !== undefined && sc.lodMediumRange !== undefined && sc.lodLowRange !== undefined) {
        (this.combatantSystem as any).lodManager?.setLODRanges(sc.lodHighRange, sc.lodMediumRange, sc.lodLowRange);
      }
      if (sc.spatialBounds !== undefined) {
        this.combatantSystem.setSpatialBounds(sc.spatialBounds);
      }
    }

    // Reinitialize influence map for world size
    if (this.influenceMapSystem) {
      const gridSize = config.scaleConfig?.influenceMapGridSize;
      this.influenceMapSystem.reinitialize(config.worldSize, gridSize);
    }

    // Configure or disable WarSimulator
    if (this.warSimulator) {
      if (config.warSimulator?.enabled) {
        if (!this.terrainSystem) {
          throw new Error('GameModeManager requires terrainSystem before WarSimulator configuration');
        }
        this.warSimulator.configure(
          config.warSimulator,
          (x: number, z: number) => this.terrainSystem!.getHeightAt(x, z),
          {
            worldSize: config.worldSize,
            zones: config.zones,
            features: config.features,
          },
        );

        // Spawn strategic forces from zone config
        if (this.zoneManager) {
          const zones = this.zoneManager.getAllZones().map(z => ({
            id: z.id,
            name: z.name,
            position: { x: z.position.x, z: z.position.z },
            isHomeBase: z.isHomeBase,
            owner: z.owner,
            state: z.state,
            ticketBleedRate: z.ticketBleedRate
          }));
          this.warSimulator.spawnStrategicForces(zones);
        }
      } else {
        this.warSimulator.disable();
      }
    }

    Logger.info('world', `Applied ${config.name} configuration`);
  }

  // Register mode change callback
  public onModeChanged(callback: (mode: GameMode, config: GameModeConfig) => void): void {
    this.onModeChange = callback;
  }

  // Helper to check if player spawning at zones is allowed
  public canPlayerSpawnAtZones(): boolean {
    return this.currentDefinition.policies.respawn.allowControlledZoneSpawns;
  }

  // Get spawn protection duration
  public getSpawnProtectionDuration(): number {
    return this.currentConfig.spawnProtectionDuration;
  }

  // Get respawn time
  public getRespawnTime(): number {
    return this.currentConfig.respawnTime;
  }

  // Get world size
  public getWorldSize(): number {
    return this.currentConfig.worldSize;
  }

  // Get view distance
  public getViewDistance(): number {
    return this.currentConfig.viewDistance;
  }

  private createRuntimeContext(
    definition: GameModeDefinition,
    options?: {
      previousDefinition?: GameModeDefinition;
      nextDefinition?: GameModeDefinition;
    }
  ): GameModeRuntimeContext {
    return {
      definition,
      mode: definition.id,
      config: definition.config,
      previousDefinition: options?.previousDefinition,
      previousMode: options?.previousDefinition?.id,
      previousConfig: options?.previousDefinition?.config,
      nextDefinition: options?.nextDefinition,
      nextMode: options?.nextDefinition?.id,
      nextConfig: options?.nextDefinition?.config,
      services: {
        applyMapIntelPolicy: (policy: MapIntelPolicyConfig) => this.applyMapIntelPolicy(policy)
      },
      ...this.getRuntimeSystems()
    };
  }

  private getRuntimeSystems(): GameModeRuntimeSystems {
    return {
      zoneManager: this.zoneManager,
      combatantSystem: this.combatantSystem,
      ticketSystem: this.ticketSystem,
      terrainSystem: this.terrainSystem,
      minimapSystem: this.minimapSystem,
      influenceMapSystem: this.influenceMapSystem,
      warSimulator: this.warSimulator,
      hudSystem: this.hudSystem,
      playerController: this.playerController,
      playerRespawnManager: this.playerRespawnManager
    };
  }

  private applyMapIntelPolicy(policy: MapIntelPolicyConfig): void {
    this.minimapSystem?.setMapIntelPolicy(policy);
    this.fullMapSystem?.setMapIntelPolicy(policy);
  }
}
