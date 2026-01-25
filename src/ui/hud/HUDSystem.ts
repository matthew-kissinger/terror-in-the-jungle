import * as THREE from 'three';
import { GameSystem } from '../../types';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { Faction } from '../../systems/combat/types';
import { ZoneManager } from '../../systems/world/ZoneManager';
import { TicketSystem, GameState } from '../../systems/world/TicketSystem';
import { HUDStyles } from './HUDStyles';
import { HUDElements } from './HUDElements';
import { HUDUpdater } from './HUDUpdater';
import { PlayerStatsTracker } from '../../systems/player/PlayerStatsTracker';
import { MatchEndScreen, MatchStats } from '../end/MatchEndScreen';

export class HUDSystem implements GameSystem {
  private combatantSystem?: CombatantSystem;
  private zoneManager?: ZoneManager;
  private ticketSystem?: TicketSystem;
  private playerHealthSystem?: any;
  private grenadeSystem?: any;
  private camera?: any;

  private styles: HUDStyles;
  private elements: HUDElements;
  private updater: HUDUpdater;
  private statsTracker: PlayerStatsTracker;
  private matchEndScreen: MatchEndScreen;

  constructor(camera?: any, ticketSystem?: any, playerHealthSystem?: any, playerRespawnManager?: any) {
    this.camera = camera;
    this.styles = HUDStyles.getInstance();
    this.elements = new HUDElements(camera);
    this.updater = new HUDUpdater(this.elements);
    this.playerHealthSystem = playerHealthSystem;
    this.statsTracker = new PlayerStatsTracker();
    this.matchEndScreen = new MatchEndScreen();

    // Setup return to menu callback
    this.matchEndScreen.onReturnToMenu(() => {
      console.log('🔄 Returning to main menu (reloading page)');
      window.location.reload();
    });

    // Parameters are optional for backward compatibility
  }

  async init(): Promise<void> {
    console.log('📊 Initializing HUD System...');

    // Inject styles
    this.styles.inject();

    // Add HUD to DOM
    this.elements.attachToDOM();

    // Initialize ticket display
    this.updater.updateTicketDisplay(300, 300);

    // Setup respawn button click handler
    if (this.elements.respawnButton) {
      this.elements.respawnButton.onclick = () => {
        if (this.playerHealthSystem && this.playerHealthSystem.isAlive()) {
          console.log('🔄 Respawn button clicked');
          this.playerHealthSystem.voluntaryRespawn();
        }
      };
    }

    console.log('✅ HUD System initialized');
  }

  update(deltaTime: number): void {
    // Update objectives display
    if (this.zoneManager) {
      this.updater.updateObjectivesDisplay(this.zoneManager);
    }

    // Update combat statistics
    if (this.combatantSystem) {
      this.updater.updateCombatStats(this.combatantSystem);
    }

    // Update game status and tickets
    if (this.ticketSystem) {
      this.updater.updateGameStatus(this.ticketSystem);
      this.updater.updateTicketDisplay(
        this.ticketSystem.getTickets(Faction.US),
        this.ticketSystem.getTickets(Faction.OPFOR)
      );
      // Update match timer
      const timeRemaining = this.ticketSystem.getMatchTimeRemaining();
      this.updater.updateTimer(timeRemaining);
    }

    // Update grenade power meter
    if (this.grenadeSystem) {
      const aimingState = this.grenadeSystem.getAimingState();
      if (aimingState.isAiming) {
        this.elements.showGrenadePowerMeter();
        this.elements.updateGrenadePower(aimingState.power);
      } else {
        this.elements.hideGrenadePowerMeter();
      }
    }

    // Update kill feed
    this.elements.updateKillFeed(deltaTime);

    // Update damage numbers
    this.elements.updateDamageNumbers();
  }

  dispose(): void {
    this.elements.dispose();
    this.styles.dispose();
    this.matchEndScreen.dispose();
    console.log('🧹 HUD System disposed');
  }

  // Public API

  showHitMarker(type: 'normal' | 'kill' | 'headshot' = 'normal'): void {
    this.elements.showHitMarker(type);
  }

  addKill(): void {
    this.updater.addKill();
    this.statsTracker.addKill();
  }

  addDeath(): void {
    this.updater.addDeath();
    this.statsTracker.addDeath();
  }

  addZoneCapture(): void {
    this.statsTracker.addZoneCapture();
  }

  startMatch(): void {
    this.statsTracker.startMatch();
    console.log('📊 Match statistics tracking started');
  }

  private handleGameEnd(winner: Faction, gameState: GameState): void {
    if (!this.ticketSystem) return;

    const playerStats = this.statsTracker.getStats();
    const matchStats: MatchStats = {
      kills: playerStats.kills,
      deaths: playerStats.deaths,
      zonesCaptured: playerStats.zonesCaptured,
      matchDuration: gameState.matchDuration,
      usTickets: this.ticketSystem.getTickets(Faction.US),
      opforTickets: this.ticketSystem.getTickets(Faction.OPFOR)
    };

    console.log('🏆 Showing match end screen with stats:', matchStats);
    this.matchEndScreen.show(winner, gameState, matchStats);
  }

  setCombatantSystem(system: CombatantSystem): void {
    this.combatantSystem = system;
  }

  setZoneManager(manager: ZoneManager): void {
    this.zoneManager = manager;
  }

  setTicketSystem(system: TicketSystem): void {
    this.ticketSystem = system;

    // Register callback for game end
    system.setGameEndCallback((winner: Faction, gameState: GameState) => {
      this.handleGameEnd(winner, gameState);
    });
  }

  setGrenadeSystem(system: any): void {
    this.grenadeSystem = system;
  }

  updateTickets(usTickets: number, opforTickets: number): void {
    this.updater.updateTicketDisplay(usTickets, opforTickets);
  }

  showMessage(message: string, duration: number = 3000): void {
    this.elements.showMessage(message, duration);
  }

  updateAmmoDisplay(magazine: number, reserve: number): void {
    this.elements.updateAmmoDisplay(magazine, reserve);
  }

  showInteractionPrompt(text: string): void {
    console.log('🎮 HUDSystem: showInteractionPrompt called with:', text);
    this.elements.showInteractionPrompt(text);
  }

  hideInteractionPrompt(): void {
    console.log('🎮 HUDSystem: hideInteractionPrompt called');
    this.elements.hideInteractionPrompt();
  }


  updateElevation(elevation: number): void {
    this.elements.updateElevation(elevation);
  }

  // Helicopter mouse control indicator methods (only available in helicopter)
  showHelicopterMouseIndicator(): void {
    this.elements.showHelicopterMouseIndicator();
  }

  hideHelicopterMouseIndicator(): void {
    this.elements.hideHelicopterMouseIndicator();
  }

  updateHelicopterMouseMode(controlMode: boolean): void {
    this.elements.updateHelicopterMouseMode(controlMode);
  }

  // Helicopter instruments methods (only visible in helicopter)
  showHelicopterInstruments(): void {
    this.elements.showHelicopterInstruments();
  }

  hideHelicopterInstruments(): void {
    this.elements.hideHelicopterInstruments();
  }

  updateHelicopterInstruments(collective: number, rpm: number, autoHover: boolean, engineBoost: boolean): void {
    this.elements.updateHelicopterInstruments(collective, rpm, autoHover, engineBoost);
  }

  // Grenade power meter methods
  showGrenadePowerMeter(): void {
    this.elements.showGrenadePowerMeter();
  }

  hideGrenadePowerMeter(): void {
    this.elements.hideGrenadePowerMeter();
  }

  updateGrenadePower(power: number): void {
    this.elements.updateGrenadePower(power);
  }

  // Kill feed methods
  addKillToFeed(
    killerName: string,
    killerFaction: Faction,
    victimName: string,
    victimFaction: Faction,
    isHeadshot: boolean = false
  ): void {
    this.elements.addKillToFeed(killerName, killerFaction, victimName, victimFaction, isHeadshot);
  }

  // Damage number methods
  spawnDamageNumber(worldPos: THREE.Vector3, damage: number, isHeadshot: boolean = false, isKill: boolean = false): void {
    this.elements.spawnDamageNumber(worldPos, damage, isHeadshot, isKill);
  }
}