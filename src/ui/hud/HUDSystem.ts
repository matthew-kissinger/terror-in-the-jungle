import { Logger } from '../../utils/Logger';
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
import { Scoreboard } from './Scoreboard';
import { PersonalStatsPanel } from './PersonalStatsPanel';
import type { GrenadeSystem } from '../../systems/weapons/GrenadeSystem';
import type { PlayerHealthSystem } from '../../systems/player/PlayerHealthSystem';
import { IHUDSystem } from '../../types/SystemInterfaces';

export class HUDSystem implements GameSystem, IHUDSystem {
  private combatantSystem?: CombatantSystem;
  private zoneManager?: ZoneManager;
  private ticketSystem?: TicketSystem;
  private playerHealthSystem?: PlayerHealthSystem;
  private grenadeSystem?: GrenadeSystem;
  private camera?: THREE.Camera;

  private styles: HUDStyles;
  private elements: HUDElements;
  private updater: HUDUpdater;
  private statsTracker: PlayerStatsTracker;
  private matchEndScreen: MatchEndScreen;
  private scoreboard: Scoreboard;
  private personalStatsPanel: PersonalStatsPanel;
  private scoreboardCombatantProxy: CombatantSystem;
  private isScoreboardVisible = false;

  constructor(camera?: THREE.Camera, ticketSystem?: TicketSystem, playerHealthSystem?: PlayerHealthSystem, _playerRespawnManager?: unknown) {
    this.camera = camera;
    this.styles = HUDStyles.getInstance();
    this.elements = new HUDElements(camera);
    this.updater = new HUDUpdater(this.elements);
    this.playerHealthSystem = playerHealthSystem;
    this.statsTracker = new PlayerStatsTracker();
    this.matchEndScreen = new MatchEndScreen();
    this.scoreboardCombatantProxy = this.createScoreboardCombatantProxy();
    this.scoreboard = new Scoreboard(this.statsTracker, this.scoreboardCombatantProxy);
    this.personalStatsPanel = new PersonalStatsPanel(this.statsTracker);

    // Setup return to menu callback
    this.matchEndScreen.onReturnToMenu(() => {
      Logger.info('hud', ' Returning to main menu (reloading page)');
      window.location.reload();
    });

    // Parameters are optional for backward compatibility
  }

  async init(): Promise<void> {
    Logger.info('hud', ' Initializing HUD System...');

    // Inject styles
    this.styles.inject();

    // Add HUD to DOM
    this.elements.attachToDOM();
    this.scoreboard.attachToDOM();
    this.personalStatsPanel.attachToDOM();

    // Initialize ticket display
    this.updater.updateTicketDisplay(300, 300);

    // Setup respawn button click handler
    if (this.elements.respawnButton) {
      this.elements.respawnButton.onclick = () => {
        if (this.playerHealthSystem && this.playerHealthSystem.isAlive()) {
          Logger.info('hud', ' Respawn button clicked');
          this.playerHealthSystem.voluntaryRespawn();
        }
      };
    }

    Logger.info('hud', ' HUD System initialized');
  }

  update(deltaTime: number): void {
    const isTDM = this.ticketSystem ? this.ticketSystem.isTDMMode() : false;

    // Update objectives display
    if (this.zoneManager) {
      this.updater.updateObjectivesDisplay(this.zoneManager, isTDM);
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
        this.ticketSystem.getTickets(Faction.OPFOR),
        isTDM,
        this.ticketSystem.getKillTarget()
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
        this.elements.updateGrenadePower(aimingState.power, aimingState.estimatedDistance, aimingState.cookingTime);
      } else {
        this.elements.hideGrenadePowerMeter();
      }
    }

    // Update kill feed
    this.elements.updateKillFeed(deltaTime);

    // Update damage numbers
    this.elements.updateDamageNumbers();

    // Update score popups
    this.elements.updateScorePopups();

    this.personalStatsPanel.update();

    if (this.isScoreboardVisible) {
      this.scoreboard.toggle(true);
    }
  }

  dispose(): void {
    this.scoreboard.dispose();
    this.personalStatsPanel.dispose();
    this.elements.dispose();
    this.styles.dispose();
    this.matchEndScreen.dispose();
    Logger.info('hud', 'HUD System disposed');
  }

  // Public API

  showHitMarker(type: 'hit' | 'kill' | 'headshot' = 'hit'): void {
    this.elements.showHitMarker(type);
  }

  addKill(isHeadshot: boolean = false): void {
    this.updater.addKill();
    this.statsTracker.addKill();
    this.personalStatsPanel.onKill();

    // Get kill streak multiplier
    const multiplier = this.statsTracker.getKillStreakMultiplier();

    // Spawn kill popup
    this.elements.spawnScorePopup('kill', 100, multiplier);

    // Spawn headshot bonus popup if applicable
    if (isHeadshot) {
      this.elements.spawnScorePopup('headshot', 50);
    }
  }

  addDeath(): void {
    this.updater.addDeath();
    this.statsTracker.addDeath();
    this.personalStatsPanel.onDeath();
  }

  addZoneCapture(): void {
    this.statsTracker.addZoneCapture();
    // Spawn score popup for zone capture
    this.elements.spawnScorePopup('capture', 200);
  }

  addCaptureAssist(): void {
    // Spawn score popup for partial capture contribution
    this.elements.spawnScorePopup('assist', 25);
  }

  addAssist(): void {
    this.statsTracker.addAssist();
    // Spawn score popup for kill assist
    this.elements.spawnScorePopup('assist', 50);
  }

  spawnScorePopup(type: 'capture' | 'defend' | 'secured' | 'kill' | 'headshot' | 'assist', points: number, multiplier?: number): void {
    this.elements.spawnScorePopup(type, points, multiplier);
  }

  startMatch(): void {
    this.statsTracker.startMatch();
    Logger.info('hud', ' Match statistics tracking started');
  }

  private handleGameEnd(winner: Faction, gameState: GameState): void {
    if (!this.ticketSystem) return;

    const playerStats = this.statsTracker.getStats();
    const teamKillStats = this.combatantSystem?.getTeamKillStats() ?? {
      usKills: 0,
      usDeaths: 0,
      opforKills: 0,
      opforDeaths: 0
    };
    const matchStats: MatchStats = {
      kills: playerStats.kills,
      deaths: playerStats.deaths,
      assists: playerStats.assists,
      zonesCaptured: playerStats.zonesCaptured,
      matchDuration: gameState.matchDuration,
      usTickets: this.ticketSystem.getTickets(Faction.US),
      opforTickets: this.ticketSystem.getTickets(Faction.OPFOR),
      usTeamKills: teamKillStats.usKills + playerStats.kills,
      usTeamDeaths: teamKillStats.usDeaths + playerStats.deaths,
      opforTeamKills: teamKillStats.opforKills,
      opforTeamDeaths: teamKillStats.opforDeaths,
      // Detailed stats
      headshots: playerStats.headshots,
      damageDealt: playerStats.damageDealt,
      accuracy: playerStats.shotsFired > 0 ? playerStats.shotsHit / playerStats.shotsFired : 0,
      longestKill: playerStats.longestKill,
      grenadesThrown: playerStats.grenadesThrown,
      grenadeKills: playerStats.grenadeKills,
      bestKillStreak: playerStats.bestKillStreak,
      shotsFired: playerStats.shotsFired,
      shotsHit: playerStats.shotsHit
    };

    Logger.info('hud', ' Showing match end screen with stats:', matchStats);
    this.matchEndScreen.show(winner, gameState, matchStats);
  }

  private createScoreboardCombatantProxy(): CombatantSystem {
    return {
      getAllCombatants: () => this.combatantSystem?.getAllCombatants() ?? [],
      getTeamKillStats: () =>
        this.combatantSystem?.getTeamKillStats() ?? {
          usKills: 0,
          usDeaths: 0,
          opforKills: 0,
          opforDeaths: 0
        }
    } as CombatantSystem;
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

  setGrenadeSystem(system: GrenadeSystem): void {
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
    Logger.info('hud', ' HUDSystem: showInteractionPrompt called with:', text);
    this.elements.showInteractionPrompt(text);
  }

  hideInteractionPrompt(): void {
    Logger.info('hud', ' HUDSystem: hideInteractionPrompt called');
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
    isHeadshot: boolean = false,
    weaponType: string = 'unknown'
  ): void {
    this.elements.addKillToFeed(killerName, killerFaction, victimName, victimFaction, isHeadshot, weaponType);
  }

  // Damage number methods
  spawnDamageNumber(worldPos: THREE.Vector3, damage: number, isHeadshot: boolean = false, isKill: boolean = false): void {
    this.elements.spawnDamageNumber(worldPos, damage, isHeadshot, isKill);
  }

  // Weapon switch feedback method
  showWeaponSwitch(weaponName: string, weaponIcon: string, ammo: string): void {
    this.elements.showWeaponSwitch(weaponName, weaponIcon, ammo);
  }

  // Scoreboard toggle
  toggleScoreboard(visible: boolean): void {
    this.isScoreboardVisible = visible;
    this.scoreboard.toggle(visible);
  }

  /** Toggle scoreboard visibility (for touch: tap to show, tap again to hide). */
  toggleScoreboardVisibility(): void {
    this.toggleScoreboard(!this.isScoreboardVisible);
  }
}
