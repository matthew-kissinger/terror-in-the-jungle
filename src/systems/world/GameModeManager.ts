import { GameSystem } from '../../types';
import { GameMode, GameModeConfig, getGameModeConfig } from '../../config/gameModes';
import { ZoneManager } from './ZoneManager';
import { CombatantSystem } from '../combat/CombatantSystem';
import { TicketSystem } from './TicketSystem';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { MinimapSystem } from '../../ui/minimap/MinimapSystem';

export class GameModeManager implements GameSystem {
  public currentMode: GameMode = GameMode.ZONE_CONTROL;
  private currentConfig: GameModeConfig;

  // Systems to configure
  private zoneManager?: ZoneManager;
  private combatantSystem?: CombatantSystem;
  private ticketSystem?: TicketSystem;
  private chunkManager?: ImprovedChunkManager;
  private minimapSystem?: MinimapSystem;

  // Callbacks
  private onModeChange?: (mode: GameMode, config: GameModeConfig) => void;

  constructor() {
    this.currentConfig = getGameModeConfig(this.currentMode);
  }

  async init(): Promise<void> {
    console.log('🎮 Initializing Game Mode Manager...');
    console.log(`Default mode: ${this.currentConfig.name}`);
  }

  update(deltaTime: number): void {
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
      console.log(`🎮 GameModeManager: Re-applying current mode: ${mode}`);
      this.applyModeConfiguration();
      return;
    }

    console.log(`🎮 GameModeManager: Switching game mode to: ${mode}`);
    this.currentMode = mode;
    this.currentConfig = getGameModeConfig(mode);
    console.log(`🎮 GameModeManager: World size is now ${this.currentConfig.worldSize}, zones: ${this.currentConfig.zones.length}`);

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
      if (typeof (this.combatantSystem as any).reseedForcesForMode === 'function') {
        (this.combatantSystem as any).reseedForcesForMode();
      }
    }

    // Configure ticket system
    if (this.ticketSystem) {
      this.ticketSystem.setMaxTickets(config.maxTickets);
      this.ticketSystem.setMatchDuration(config.matchDuration);
      this.ticketSystem.setDeathPenalty(config.deathPenalty);
    }

    // Configure chunk manager render distance
    if (this.chunkManager) {
      this.chunkManager.setRenderDistance(config.chunkRenderDistance);
    }

    // Configure minimap scale
    if (this.minimapSystem) {
      this.minimapSystem.setWorldScale(config.minimapScale);
    }

    console.log(`✅ Applied ${config.name} configuration`);
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