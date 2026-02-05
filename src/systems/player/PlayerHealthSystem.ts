import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Faction } from '../combat/types';
import { ZoneManager } from '../world/ZoneManager';
import { TicketSystem } from '../world/TicketSystem';
import { PlayerHealthUI } from './PlayerHealthUI';
import { PlayerHealthEffects } from './PlayerHealthEffects';
import { PlayerRespawnManager } from './PlayerRespawnManager';
import { Logger } from '../../utils/Logger';
import type { PlayerController } from './PlayerController';
import type { HUDSystem } from '../../ui/hud/HUDSystem';
import type { FirstPersonWeapon } from './FirstPersonWeapon';

const _cameraDir = new THREE.Vector3();

export interface PlayerState {
  health: number;
  maxHealth: number;
  isAlive: boolean;
  isDead: boolean;
  deathTime: number;
  respawnTime: number;
  invulnerabilityTime: number;
}

export class PlayerHealthSystem implements GameSystem {
  private playerState: PlayerState = {
    health: 150,
    maxHealth: 150,
    isAlive: true,
    isDead: false,
    deathTime: 0,
    respawnTime: 3.0,
    invulnerabilityTime: 0
  };

  private healthRegenDelay = 5.0;
  private lastDamageTime = 0;
  private readonly healthRegenRate = 20;

  // Modules
  private ui: PlayerHealthUI;
  private effects: PlayerHealthEffects;
  private respawnManager: PlayerRespawnManager;

  // Camera reference for damage indicators
  private camera?: THREE.Camera;
  private ticketSystem?: TicketSystem;
  private hudSystem?: HUDSystem;
  private playerController?: PlayerController;

  constructor() {
    this.ui = new PlayerHealthUI();
    this.effects = new PlayerHealthEffects();
    // Respawn manager will be set later
    this.respawnManager = null as any;

    this.setupCallbacks();
  }

  private setupCallbacks(): void {
    // Setup respawn callbacks
    if (this.respawnManager) {
      this.respawnManager.setRespawnCallback((_position: THREE.Vector3) => {
      this.playerState.health = this.playerState.maxHealth;
      this.playerState.isAlive = true;
      this.playerState.isDead = false;
      // Reset and hand over to spawn-protection application from respawn flow
      this.playerState.invulnerabilityTime = 0;

      this.effects.clearDamageIndicators();
      this.updateHealthDisplay();
      this.effects.stopHeartbeat();
    });
    }
  }

  async init(): Promise<void> {
    Logger.info('Combat', 'Initializing Player Health System...');

    this.ui.init();
    this.effects.init();
    this.updateHealthDisplay();

    Logger.info('Combat', 'Player Health System initialized');
  }

  update(deltaTime: number): void {
    if (this.playerState.isDead) {
      this.updateDeathState(deltaTime);
      return;
    }

    // Update invulnerability
    if (this.playerState.invulnerabilityTime > 0) {
      this.playerState.invulnerabilityTime -= deltaTime;
      if (this.playerState.invulnerabilityTime <= 0) {
        this.ui.setSpawnProtection(false);
        Logger.debug('Combat', 'Spawn protection ended');
      }
    }

    // Health regeneration
    const timeSinceLastDamage = (Date.now() - this.lastDamageTime) / 1000;
    if (timeSinceLastDamage > this.healthRegenDelay && this.playerState.health < this.playerState.maxHealth) {
      this.playerState.health = Math.min(
        this.playerState.maxHealth,
        this.playerState.health + this.healthRegenRate * deltaTime
      );
      this.updateHealthDisplay();
    }

    // Update effects
    this.effects.updateDamageIndicators(deltaTime);
    this.updateLowHealthEffects();
    this.effects.renderDamageOverlay(this.playerState.health, this.playerState.maxHealth);
  }

  private updateHealthDisplay(): void {
    this.ui.updateHealthDisplay(this.playerState.health, this.playerState.maxHealth);
  }

  private updateLowHealthEffects(): void {
    const isLowHealth = this.playerState.health < 30;
    this.ui.setLowHealthEffect(isLowHealth);

    if (isLowHealth) {
      this.effects.startHeartbeat();
    } else {
      this.effects.stopHeartbeat();
    }
  }

  private updateDeathState(deltaTime: number): void {
    this.playerState.deathTime -= deltaTime;
  }

  // Public API

  takeDamage(amount: number, sourcePosition?: THREE.Vector3, playerPosition?: THREE.Vector3): boolean {
    if (this.playerState.isDead || this.playerState.invulnerabilityTime > 0) {
      return false;
    }

    this.playerState.health = Math.max(0, this.playerState.health - amount);
    this.lastDamageTime = Date.now();

    Logger.debug('Combat', `Player took ${amount} damage, health: ${Math.round(this.playerState.health)}`);

    // Add damage effects with camera direction
    let cameraDirection: THREE.Vector3 | undefined;
    if (this.camera) {
      this.camera.getWorldDirection(_cameraDir);
      cameraDirection = _cameraDir;
    }
    this.effects.addDamageIndicator(amount, sourcePosition, playerPosition, cameraDirection);

    // Apply camera shake based on damage amount
    if (this.playerController) {
      this.playerController.applyDamageShake(amount);
    }

    // Check for death
    if (this.playerState.health <= 0) {
      this.onPlayerDeath();
      return true;
    }

    this.updateHealthDisplay();
    return false;
  }

  // Apply spawn protection for a duration (seconds)
  applySpawnProtection(durationSeconds: number): void {
    if (durationSeconds <= 0) return;
    this.playerState.invulnerabilityTime = durationSeconds;
    this.ui.setSpawnProtection(true);
    Logger.info('Combat', `Spawn protection applied for ${durationSeconds}s`);
  }

  private onPlayerDeath(): void {
    if (this.playerState.isDead) return;

    this.playerState.isAlive = false;
    this.playerState.isDead = true;
    this.playerState.deathTime = this.playerState.respawnTime;

    // Track player death in HUD
    if (this.hudSystem) {
      this.hudSystem.addDeath();
    }

    this.respawnManager.onPlayerDeath();
    this.effects.stopHeartbeat();
  }

  // Voluntary respawn - kills player to allow respawning at different location
  voluntaryRespawn(): void {
    if (this.playerState.isDead) return;

    Logger.info('Combat', 'Player initiated voluntary respawn');

    // Kill the player by setting health to 0
    this.playerState.health = 0;
    this.updateHealthDisplay();

    // Trigger death sequence
    this.onPlayerDeath();

    // Apply ticket penalty for voluntary respawn
    if (this.ticketSystem) {
      this.ticketSystem.removeTickets(Faction.US, 1); // Extra penalty for voluntary respawn
    }
  }

  // Getters

  getHealth(): number {
    return this.playerState.health;
  }

  getMaxHealth(): number {
    return this.playerState.maxHealth;
  }

  isAlive(): boolean {
    return this.playerState.isAlive;
  }

  isDead(): boolean {
    return this.playerState.isDead;
  }

  hasSpawnProtection(): boolean {
    return this.playerState.invulnerabilityTime > 0;
  }

  // System connections

  setZoneManager(manager: ZoneManager): void {
    if (this.respawnManager) {
      this.respawnManager.setZoneManager(manager);
    }
  }

  setTicketSystem(system: TicketSystem): void {
    // TicketSystem is now handled through GameModeManager
    this.ticketSystem = system;
  }

  setPlayerController(playerController: PlayerController): void {
    this.playerController = playerController;
    if (this.respawnManager) {
      this.respawnManager.setPlayerController(playerController);
    }
  }

  setFirstPersonWeapon(weapon: FirstPersonWeapon): void {
    if (this.respawnManager) {
      this.respawnManager.setFirstPersonWeapon(weapon);
    }
  }

  setRespawnManager(respawnManager: PlayerRespawnManager): void {
    this.respawnManager = respawnManager;
    this.setupCallbacks();
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  setHUDSystem(hudSystem: HUDSystem): void {
    this.hudSystem = hudSystem;
  }

  dispose(): void {
    this.ui.dispose();
    this.effects.dispose();
    Logger.info('Combat', 'Player Health System disposed');
  }
}
