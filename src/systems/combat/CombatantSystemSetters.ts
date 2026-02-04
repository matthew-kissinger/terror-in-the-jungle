import * as THREE from 'three';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { TicketSystem } from '../world/TicketSystem';
import { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { ZoneManager } from '../world/ZoneManager';
import { AudioManager } from '../audio/AudioManager';
import { GameModeManager } from '../world/GameModeManager';
import { Logger } from '../../utils/Logger';
import { spatialGridManager } from './SpatialGridManager';
import { CombatantMovement } from './CombatantMovement';
import { CombatantCombat } from './CombatantCombat';
import { CombatantAI } from './CombatantAI';
import { VoiceCalloutSystem } from '../audio/VoiceCalloutSystem';
import { SquadManager } from './SquadManager';
import { CombatantSpawnManager } from './CombatantSpawnManager';
import { CombatantLODManager } from './CombatantLODManager';
import { SpatialOctree } from './SpatialOctree';
import { IHUDSystem } from '../../types/SystemInterfaces';

/**
 * Manages setter methods for external system dependencies
 * Extracted from CombatantSystem for better organization
 */
export class CombatantSystemSetters {
  constructor(
    private combatantMovement: CombatantMovement,
    private combatantCombat: CombatantCombat,
    private combatantAI: CombatantAI,
    private squadManager: SquadManager,
    private spawnManager: CombatantSpawnManager,
    private lodManager: CombatantLODManager,
    private spatialGrid: SpatialOctree
  ) {}

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.combatantMovement.setChunkManager(chunkManager);
    this.squadManager.setChunkManager(chunkManager);
    this.combatantAI.setChunkManager(chunkManager);
    this.combatantCombat.setChunkManager(chunkManager);
  }

  setCamera(camera: THREE.Camera): void {
    this.combatantCombat.setCamera(camera);
  }

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.combatantCombat.setTicketSystem(ticketSystem);
  }

  setPlayerHealthSystem(playerHealthSystem: PlayerHealthSystem): void {
    this.combatantCombat.setPlayerHealthSystem(playerHealthSystem);
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.combatantMovement.setZoneManager(zoneManager);
    this.spawnManager.setZoneManager(zoneManager);
    this.lodManager.setZoneManager(zoneManager);
  }

  setHUDSystem(hudSystem: IHUDSystem): void {
    this.combatantCombat.setHUDSystem(hudSystem);
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.combatantMovement.setGameModeManager(gameModeManager);
    this.spawnManager.setGameModeManager(gameModeManager);
    this.lodManager.setGameModeManager(gameModeManager);
    // Update spatial grid world size
    const worldSize = gameModeManager.getWorldSize();
    this.spatialGrid.setWorldSize(worldSize);
    // Reinitialize spatial grid manager with correct world size
    spatialGridManager.reinitialize(worldSize);
    Logger.info('combat', `Spatial grid reinitialized with world size ${worldSize}`);
  }

  setAudioManager(audioManager: AudioManager): void {
    this.combatantCombat.setAudioManager(audioManager);
  }

  setVoiceCalloutSystem(voiceCalloutSystem: VoiceCalloutSystem): void {
    this.combatantCombat.setVoiceCalloutSystem(voiceCalloutSystem);
    this.combatantAI.setVoiceCalloutSystem(voiceCalloutSystem);
  }

  setPlayerSuppressionSystem(system: any): void {
    this.combatantCombat.setPlayerSuppressionSystem(system);
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
}
