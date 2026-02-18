import { Logger } from '../../utils/Logger';
import { GameSystem } from '../../types';
import { GameMode, GameModeConfig, getGameModeConfig } from '../../config/gameModes';
import { ZoneManager } from './ZoneManager';
import { CombatantSystem } from '../combat/CombatantSystem';
import { TicketSystem } from './TicketSystem';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { MinimapSystem } from '../../ui/minimap/MinimapSystem';
import { InfluenceMapSystem } from '../combat/InfluenceMapSystem';
import type { WarSimulator } from '../strategy/WarSimulator';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';

export class GameModeManager implements GameSystem {
  public currentMode: GameMode = GameMode.ZONE_CONTROL;
  private currentConfig: GameModeConfig;

  // Systems to configure
  private zoneManager?: ZoneManager;
  private combatantSystem?: CombatantSystem;
  private ticketSystem?: TicketSystem;
  private chunkManager?: ImprovedChunkManager;
  private minimapSystem?: MinimapSystem;
  private influenceMapSystem?: InfluenceMapSystem;
  private warSimulator?: WarSimulator;

  // Callbacks
  private onModeChange?: (mode: GameMode, config: GameModeConfig) => void;

  constructor() {
    this.currentConfig = getGameModeConfig(this.currentMode);
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
    chunkManager: ImprovedChunkManager,
    minimapSystem: MinimapSystem
  ): void {
    this.zoneManager = zoneManager;
    this.combatantSystem = combatantSystem;
    this.ticketSystem = ticketSystem;
    this.chunkManager = chunkManager;
    this.minimapSystem = minimapSystem;
  }

  public setInfluenceMapSystem(influenceMapSystem: InfluenceMapSystem): void {
    this.influenceMapSystem = influenceMapSystem;
  }

  public setWarSimulator(warSimulator: WarSimulator): void {
    this.warSimulator = warSimulator;
  }

  // Get current mode
  public getCurrentMode(): GameMode {
    return this.currentMode;
  }

  // Get current config
  public getCurrentConfig(): GameModeConfig {
    return this.currentConfig;
  }

  // Set game mode (called from menu)
  public setGameMode(mode: GameMode): void {
    if (mode === this.currentMode) {
      Logger.info('world', `GameModeManager: Re-applying current mode: ${mode}`);
      this.applyModeConfiguration();
      return;
    }

    Logger.info('world', `GameModeManager: Switching game mode to: ${mode}`);
    this.currentMode = mode;
    this.currentConfig = getGameModeConfig(mode);
    Logger.info('world', `GameModeManager: World size is now ${this.currentConfig.worldSize}, zones: ${this.currentConfig.zones.length}`);

    // Notify listeners
    if (this.onModeChange) {
      this.onModeChange(mode, this.currentConfig);
    }

    // Apply configuration to connected systems
    this.applyModeConfiguration();
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
        this.combatantSystem.reseedForcesForMode();
      }
    }

    // Configure ticket system
    if (this.ticketSystem) {
      this.ticketSystem.setMaxTickets(config.maxTickets);
      this.ticketSystem.setMatchDuration(config.matchDuration);
      this.ticketSystem.setDeathPenalty(config.deathPenalty);

      if (config.id === GameMode.TEAM_DEATHMATCH) {
        this.ticketSystem.setTDMMode(true, config.maxTickets);
      } else {
        this.ticketSystem.setTDMMode(false, 0);
      }
    }

    // Configure chunk manager render distance
    if (this.chunkManager) {
      this.chunkManager.setRenderDistance(config.chunkRenderDistance);
    }

    // Configure minimap scale - use minimapScale for small modes, worldSize for large
    if (this.minimapSystem) {
      const minimapWorldSize = config.worldSize > 3200 ? config.worldSize : config.minimapScale;
      this.minimapSystem.setWorldScale(minimapWorldSize);
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
        const heightCache = getHeightQueryCache();
        this.warSimulator.configure(
          config.warSimulator,
          (x: number, z: number) => heightCache.getHeightAt(x, z)
        );

        // Spawn strategic forces from zone config
        if (this.zoneManager) {
          const zones = this.zoneManager.getAllZones().map(z => ({
            id: z.id,
            name: z.name,
            position: { x: z.position.x, z: z.position.z },
            isHomeBase: z.isHomeBase,
            owner: z.owner
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
    return this.currentConfig.playerCanSpawnAtZones;
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
}