import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { Faction, Alliance, getAlliance } from '../../systems/combat/types';
import { ZoneManager } from '../../systems/world/ZoneManager';
import { TicketSystem, GameState } from '../../systems/world/TicketSystem';
import { HUDStyles } from './HUDStyles';
import { HUDElements } from './HUDElements';
import { HUDUpdater } from './HUDUpdater';
import { PlayerStatsTracker } from '../../systems/player/PlayerStatsTracker';
import { MatchEndScreen, MatchStats } from '../end/MatchEndScreen';
import { ScoreboardPanel } from './ScoreboardPanel';
import { StatsPanel } from './StatsPanel';
import type { GrenadeSystem } from '../../systems/weapons/GrenadeSystem';
import type { MortarSystem } from '../../systems/weapons/MortarSystem';
import type { PlayerHealthSystem } from '../../systems/player/PlayerHealthSystem';
import { IHUDSystem } from '../../types/SystemInterfaces';
import { ViewportManager } from '../design/responsive';
import { HUDLayout } from '../layout/HUDLayout';

export class HUDSystem implements GameSystem, IHUDSystem {
  private combatantSystem?: CombatantSystem;
  private zoneManager?: ZoneManager;
  private ticketSystem?: TicketSystem;
  private playerHealthSystem?: PlayerHealthSystem;
  private grenadeSystem?: GrenadeSystem;
  private mortarSystem?: MortarSystem;
  private camera?: THREE.Camera;

  private styles: HUDStyles;
  private elements: HUDElements;
  private updater: HUDUpdater;
  private statsTracker: PlayerStatsTracker;
  private matchEndScreen: MatchEndScreen;
  private scoreboard: ScoreboardPanel;
  private personalStatsPanel: StatsPanel;
  private scoreboardCombatantProxy: CombatantSystem;
  private isScoreboardVisible = false;
  private onPlayAgainCallback?: () => void;
  private hudLayout: HUDLayout;
  private viewportUnsubscribe?: () => void;
  private staticHudAccumulator = 0;
  private readonly STATIC_HUD_INTERVAL = 0.2; // 5Hz for mostly-static HUD text/state

  constructor(camera?: THREE.Camera, ticketSystem?: TicketSystem, playerHealthSystem?: PlayerHealthSystem, _playerRespawnManager?: unknown) {
    this.camera = camera;
    this.styles = HUDStyles.getInstance();
    this.elements = new HUDElements(camera);
    this.updater = new HUDUpdater(this.elements);
    this.playerHealthSystem = playerHealthSystem;
    this.statsTracker = new PlayerStatsTracker();
    this.hudLayout = new HUDLayout();
    this.matchEndScreen = new MatchEndScreen();
    this.scoreboardCombatantProxy = this.createScoreboardCombatantProxy();
    this.scoreboard = new ScoreboardPanel(this.statsTracker, this.scoreboardCombatantProxy);
    this.personalStatsPanel = new StatsPanel(this.statsTracker);

    // Setup return to menu callback
    this.matchEndScreen.onReturnToMenu(() => {
      Logger.info('hud', ' Returning to main menu (reloading page)');
      window.location.reload();
    });

    // Play Again uses callback when set (e.g. by GameEngineInit); otherwise MatchEndScreen falls back to reload
    this.matchEndScreen.onPlayAgain(() => {
      if (this.onPlayAgainCallback) this.onPlayAgainCallback();
    });

  }

  /** Set callback for Play Again button (programmatic match restart). Called from bootstrap. */
  setPlayAgainCallback(callback: () => void): void {
    this.onPlayAgainCallback = callback;
  }

  /** Get the grid layout system (for component migration). */
  getLayout(): HUDLayout {
    return this.hudLayout;
  }

  async init(): Promise<void> {
    Logger.info('hud', ' Initializing HUD System...');

    // Initialize grid layout system (Phase 1: coexists with existing UI)
    this.hudLayout.init();

    // Inject styles
    this.styles.inject();

    // Subscribe to viewport changes for responsive HUD
    this.viewportUnsubscribe = ViewportManager.getInstance().subscribe((info) => {
      const isSmall = info.viewportClass === 'phone' || info.viewportClass === 'tablet';
      const root = document.documentElement;
      // Set on :root so body-level elements (scoreboard, stats panel, kill feed) also inherit
      root.style.setProperty('--hud-scale', String(info.scale));
      root.style.setProperty('--hud-bottom-offset', isSmall ? '8px' : '16px');
      root.style.setProperty('--hud-edge-inset', isSmall ? '10px' : '16px');
      root.style.setProperty('--hud-is-touch', info.isTouch ? '1' : '0');
    });

    // Add HUD to DOM (pass layout for grid-based mounting)
    this.elements.attachToDOM(this.hudLayout);
    this.scoreboard.mount(this.hudLayout.getRoot());
    this.personalStatsPanel.mount(this.hudLayout.getSlot('stats'));

    // Initialize ticket display
    this.updater.updateTicketDisplay(300, 300);

    Logger.info('hud', ' HUD System initialized');
  }

  update(deltaTime: number): void {
    const isTDM = this.ticketSystem ? this.ticketSystem.isTDMMode() : false;
    this.staticHudAccumulator += deltaTime;
    if (this.staticHudAccumulator >= this.STATIC_HUD_INTERVAL) {
      // Update objectives display
      if (this.zoneManager) {
        this.updater.updateObjectivesDisplay(this.zoneManager, isTDM, this.camera?.position);
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
          this.ticketSystem.getTickets(Faction.NVA),
          isTDM,
          this.ticketSystem.getKillTarget()
        );
        // Update match timer
        const timeRemaining = this.ticketSystem.getMatchTimeRemaining();
        this.updater.updateTimer(timeRemaining);
      }

      this.staticHudAccumulator = 0;
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

    // Update mortar indicator
    if (this.mortarSystem) {
      if (this.mortarSystem.isCurrentlyDeployed()) {
        const aim = this.mortarSystem.getAimingState();
        this.elements.showMortarIndicator();
        this.elements.updateMortarState(aim.pitch, aim.yaw, aim.power, this.mortarSystem.isCurrentlyAiming());
      } else {
        this.elements.hideMortarIndicator();
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
    this.viewportUnsubscribe?.();
    this.hudLayout.dispose();
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

  addZoneCapture(zoneName?: string, isLost?: boolean): void {
    this.statsTracker.addZoneCapture();
    // Spawn score popup for zone capture
    this.elements.spawnScorePopup('capture', 200);
    // Show zone capture notification
    if (zoneName && this.elements.zoneCaptureNotification) {
      if (isLost) {
        this.elements.zoneCaptureNotification.showLost(zoneName);
      } else {
        this.elements.zoneCaptureNotification.showCapture(zoneName);
      }
    }
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
    this.hudLayout.setPhase('playing');
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
      opforTickets: this.ticketSystem.getTickets(Faction.NVA),
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
    this.hudLayout.setPhase('ended');
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

  setMortarSystem(system: MortarSystem): void {
    this.mortarSystem = system;
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
    this.elements.showInteractionPrompt(text);
  }

  hideInteractionPrompt(): void {
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
    this.hudLayout.setState({ vehicle: 'helicopter' });
  }

  hideHelicopterInstruments(): void {
    this.elements.hideHelicopterInstruments();
    this.hudLayout.setState({ vehicle: 'infantry' });
  }

  updateHelicopterInstruments(collective: number, rpm: number, autoHover: boolean, engineBoost: boolean): void {
    this.elements.updateHelicopterInstruments(collective, rpm, autoHover, engineBoost);
  }

  // Mortar indicator methods (IHUDSystem)
  showMortarIndicator(): void {
    this.elements.showMortarIndicator();
  }

  hideMortarIndicator(): void {
    this.elements.hideMortarIndicator();
  }

  updateMortarState(pitch: number, yaw: number, power: number, isAiming: boolean): void {
    this.elements.updateMortarState(pitch, yaw, power, isAiming);
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

  // Unified weapon bar API
  setWeaponSelectCallback(callback: (slotIndex: number) => void): void {
    this.elements.unifiedWeaponBar.setOnWeaponSelect(callback);
  }

  setActiveWeaponSlot(slot: number): void {
    this.elements.unifiedWeaponBar.setActiveSlot(slot);
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

  /** Set the HUD game phase (controls slot visibility via CSS). */
  setPhase(phase: 'menu' | 'loading' | 'playing' | 'paused' | 'ended'): void {
    this.hudLayout.setPhase(phase);
  }

  /** Set the vehicle context (hides infantry-only slots in helicopter). */
  setVehicle(vehicle: 'infantry' | 'helicopter'): void {
    this.hudLayout.setState({ vehicle });
  }

  /** Set ADS state (dims non-essential HUD when aiming). */
  setADS(ads: boolean): void {
    this.hudLayout.setState({ ads });
  }
}
