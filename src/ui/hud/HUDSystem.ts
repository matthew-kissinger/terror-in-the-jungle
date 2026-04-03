import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { Faction } from '../../systems/combat/types';
import { ZoneManager } from '../../systems/world/ZoneManager';
import { TicketSystem, GameState } from '../../systems/world/TicketSystem';
import { HUDStyles } from './HUDStyles';
import { HUDElements } from './HUDElements';
import { HUDZoneDisplay } from './HUDZoneDisplay';
import { PlayerStatsTracker } from '../../systems/player/PlayerStatsTracker';
import { movementStatsTracker } from '../../systems/player/MovementStatsTracker';
import { MatchEndScreen, MatchStats } from '../end/MatchEndScreen';
import { ScoreboardPanel } from './ScoreboardPanel';
import { StatsPanel } from './StatsPanel';
import type { GrenadeSystem } from '../../systems/weapons/GrenadeSystem';
import type { MortarSystem } from '../../systems/weapons/MortarSystem';
import type { PlayerHealthSystem } from '../../systems/player/PlayerHealthSystem';
import type { AudioManager } from '../../systems/audio/AudioManager';
import { IHUDSystem } from '../../types/SystemInterfaces';
import { ViewportManager } from '../design/responsive';
import { GameEventBus } from '../../core/GameEventBus';
import { InputContextManager } from '../../systems/input/InputContextManager';
import { HUDLayout } from '../layout/HUDLayout';
import type { GamePhase } from './GameStatusPanel';
import type { InventorySlotDefinition } from '../../systems/player/InventoryManager';
import type {
  ActorMode,
  GameplayInputMode,
  GameplayOverlay,
  InteractionContext,
  VehicleUIContext,
} from '../layout/types';

interface HUDSystemDependencies {
  combatantSystem: CombatantSystem;
  zoneManager: ZoneManager;
  ticketSystem: TicketSystem;
  audioManager: AudioManager;
  grenadeSystem: GrenadeSystem;
  mortarSystem: MortarSystem;
}

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
  private zoneDisplay: HUDZoneDisplay;
  private statsTracker: PlayerStatsTracker;
  private matchEndScreen: MatchEndScreen;
  private scoreboard: ScoreboardPanel;
  private personalStatsPanel: StatsPanel;
  private scoreboardCombatantProxy: CombatantSystem;
  private isScoreboardVisible = false;
  private onPlayAgainCallback?: () => void;
  private hudLayout: HUDLayout;
  private viewportUnsubscribe?: () => void;
  private eventUnsubscribes: (() => void)[] = [];
  private timerAccumulator = 0;
  private ticketAccumulator = 0;
  private objectiveAccumulator = 0;
  private readonly TIMER_INTERVAL = 1.0;      // 1Hz - timer only needs second ticks
  private readonly TICKET_INTERVAL = 0.1;     // 10Hz - ticket counts should feel responsive
  private readonly OBJECTIVE_INTERVAL = 0.5;  // 2Hz - zone/objective display

  constructor(camera?: THREE.Camera, ticketSystem?: TicketSystem, playerHealthSystem?: PlayerHealthSystem, _playerRespawnManager?: unknown) {
    this.camera = camera;
    this.styles = HUDStyles.getInstance();
    this.elements = new HUDElements(camera);
    this.zoneDisplay = new HUDZoneDisplay(this.elements);
    this.playerHealthSystem = playerHealthSystem;
    this.statsTracker = new PlayerStatsTracker();
    this.hudLayout = new HUDLayout();
    this.matchEndScreen = new MatchEndScreen();
    this.scoreboardCombatantProxy = this.createScoreboardCombatantProxy();
    this.scoreboard = new ScoreboardPanel(this.statsTracker, this.scoreboardCombatantProxy);
    this.scoreboard.setOnClose(() => this.toggleScoreboard(false));
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

  getPresentationController() {
    return this.hudLayout.getPresentationController();
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
    this.elements.ticketDisplay.setTickets(300, 300);
    this.elements.mobileStatusBar.setTickets(300, 300);

    // Subscribe to game events (additive - direct setter calls still work).
    // player_kill, player_killed, zone_captured/lost are still handled via
    // direct method calls from combat/zone systems. These subscriptions are
    // migration targets: once dual-emit is validated, direct calls can be removed.
    this.eventUnsubscribes.push(
      GameEventBus.subscribe('match_phase_change', (e) => {
        this.setPhase(e.phase === 'ended' ? 'ended' : e.phase === 'playing' ? 'playing' : 'loading');
      }),
    );

    Logger.info('hud', ' HUD System initialized');
  }

  update(deltaTime: number): void {
    const isTDM = this.ticketSystem ? this.ticketSystem.isTDMMode() : false;

    this.objectiveAccumulator += deltaTime;
    this.ticketAccumulator += deltaTime;
    this.timerAccumulator += deltaTime;

    // 2Hz - objectives
    if (this.objectiveAccumulator >= this.OBJECTIVE_INTERVAL) {
      if (this.zoneManager) {
        this.zoneDisplay.updateObjectivesDisplay(this.zoneManager, isTDM, this.camera?.position);
      }
      if (this.ticketSystem) {
        this.updateGameStatus(this.ticketSystem);
      }
      this.objectiveAccumulator = 0;
    }

    // 10Hz - tickets and bleed
    if (this.ticketAccumulator >= this.TICKET_INTERVAL) {
      if (this.ticketSystem) {
        this.elements.ticketDisplay.setMode(isTDM, this.ticketSystem.getKillTarget());
        const usTickets = this.ticketSystem.getTickets(Faction.US);
        const opforTickets = this.ticketSystem.getTickets(Faction.NVA);
        this.elements.ticketDisplay.setTickets(usTickets, opforTickets);
        this.elements.mobileStatusBar.setTickets(usTickets, opforTickets);
        // Update bleed indicator (conquest only)
        if (!isTDM) {
          const bleed = this.ticketSystem.getTicketBleedRate();
          if (bleed.usTickets > 0) {
            this.elements.ticketDisplay.setBleedIndicator('us', bleed.usTickets);
          } else if (bleed.opforTickets > 0) {
            this.elements.ticketDisplay.setBleedIndicator('opfor', bleed.opforTickets);
          } else {
            this.elements.ticketDisplay.setBleedIndicator(null);
          }
        }
      }
      this.ticketAccumulator = 0;
    }

    // 1Hz - match timer
    if (this.timerAccumulator >= this.TIMER_INTERVAL) {
      if (this.ticketSystem) {
        const timeRemaining = this.ticketSystem.getMatchTimeRemaining();
        this.elements.matchTimer.setTime(timeRemaining);
        this.elements.mobileStatusBar.setTime(timeRemaining);
      }
      this.timerAccumulator = 0;
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
    for (const unsub of this.eventUnsubscribes) unsub();
    this.eventUnsubscribes.length = 0;
    this.viewportUnsubscribe?.();
    this.hudLayout.dispose();
    this.scoreboard.dispose();
    this.personalStatsPanel.dispose();
    this.elements.dispose();
    this.styles.dispose();
    this.matchEndScreen.dispose();
    Logger.info('hud', 'HUD System disposed');
  }

  configureDependencies(dependencies: HUDSystemDependencies): void {
    this.setCombatantSystem(dependencies.combatantSystem);
    this.setZoneManager(dependencies.zoneManager);
    this.setTicketSystem(dependencies.ticketSystem);
    this.setAudioManager(dependencies.audioManager);
    this.setGrenadeSystem(dependencies.grenadeSystem);
    this.setMortarSystem(dependencies.mortarSystem);
  }

  // Public API

  showHitMarker(type: 'hit' | 'kill' | 'headshot' = 'hit'): void {
    this.elements.showHitMarker(type);
  }

  addKill(isHeadshot: boolean = false): void {
    this.elements.killCounter.addKill();
    this.elements.showHitMarker('kill');
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
    this.elements.killCounter.addDeath();
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
    movementStatsTracker.startMatch();
    this.hudLayout.setState({
      phase: 'playing',
      overlay: 'none',
      scoreboardVisible: false,
    });
    Logger.info('hud', ' Match statistics tracking started');
  }

  private updateGameStatus(ticketSystem: TicketSystem): void {
    const gameState = ticketSystem.getGameState();
    const bleedRate = ticketSystem.getTicketBleedRate();

    let bleedText = '';
    if (bleedRate.bleedPerSecond > 0) {
      if (bleedRate.usTickets > bleedRate.opforTickets) {
        bleedText = `US -${bleedRate.usTickets.toFixed(1)}/s`;
      } else if (bleedRate.opforTickets > bleedRate.usTickets) {
        bleedText = `OPFOR -${bleedRate.opforTickets.toFixed(1)}/s`;
      }
    }

    this.elements.gameStatusPanel.setGameState(
      gameState.phase as GamePhase,
      gameState.winner ?? null,
      bleedText
    );
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
      shotsHit: playerStats.shotsHit,
      movementSummary: movementStatsTracker.getPlayerSummary(),
    };

    // Release pointer lock and set menu context so the user can interact with the end screen
    document.exitPointerLock();
    InputContextManager.getInstance().setContext('menu');

    Logger.info('hud', ' Showing match end screen with stats:', matchStats);
    this.hudLayout.setState({
      phase: 'ended',
      overlay: 'none',
      scoreboardVisible: false,
      actorMode: 'infantry',
      interaction: null,
      vehicleContext: null,
    });
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

  setFactionLabels(blufor: string, opfor: string): void {
    this.elements.ticketDisplay.setFactionLabels(blufor, opfor);
  }

  setAudioManager(audioManager: AudioManager): void {
    this.personalStatsPanel.setAudioManager(audioManager);
  }

  setGrenadeSystem(system: GrenadeSystem): void {
    this.grenadeSystem = system;
  }

  setMortarSystem(system: MortarSystem): void {
    this.mortarSystem = system;
  }

  updateTickets(usTickets: number, opforTickets: number): void {
    this.elements.ticketDisplay.setTickets(usTickets, opforTickets);
  }

  showMessage(message: string, duration: number = 3000): void {
    this.elements.showMessage(message, duration);
  }

  updateAmmoDisplay(magazine: number, reserve: number): void {
    this.elements.updateAmmoDisplay(magazine, reserve);
    // Also update the mobile WeaponPill ammo display
    this.elements.weaponPill.setAmmo(magazine, reserve);
    // Broadcast ammo update via DOM event for TouchActionButtons weapon cycler.
    // Also persist on data attributes so late-mounting components can read initial values.
    document.documentElement.dataset.ammoMag = String(magazine);
    document.documentElement.dataset.ammoRes = String(reserve);
    document.dispatchEvent(new CustomEvent('hud:ammo', { detail: { magazine, reserve } }));
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
    this.hudLayout.setState({ actorMode: 'helicopter' });
  }

  hideHelicopterInstruments(): void {
    this.elements.hideHelicopterInstruments();
    this.hudLayout.setState({
      actorMode: 'infantry',
      vehicleContext: null,
    });
  }

  updateHelicopterInstruments(collective: number, rpm: number, autoHover: boolean, engineBoost: boolean): void {
    this.elements.updateHelicopterInstruments(collective, rpm, autoHover, engineBoost);
  }

  updateHelicopterFlightData(airspeed: number, heading: number, verticalSpeed: number): void {
    this.elements.updateHelicopterFlightData(airspeed, heading, verticalSpeed);
  }

  setHelicopterAircraftRole(role: import('../../systems/helicopter/AircraftConfigs').AircraftRole): void {
    this.elements.setHelicopterAircraftRole(role);
  }

  setHelicopterWeaponStatus(name: string, ammo: number): void {
    this.elements.setHelicopterWeaponStatus(name, ammo);
  }

  setHelicopterDamage(healthPercent: number): void {
    this.elements.setHelicopterDamage(healthPercent);
  }

  // Fixed-wing instruments methods
  showFixedWingInstruments(): void {
    this.elements.showFixedWingInstruments();
    this.hudLayout.setState({ actorMode: 'plane' });
  }

  hideFixedWingInstruments(): void {
    this.elements.hideFixedWingInstruments();
    this.hudLayout.setState({
      actorMode: 'infantry',
      vehicleContext: null,
    });
  }

  updateFixedWingFlightData(airspeed: number, heading: number, verticalSpeed: number): void {
    this.elements.updateFixedWingFlightData(airspeed, heading, verticalSpeed);
  }

  updateFixedWingThrottle(throttle: number): void {
    this.elements.updateFixedWingThrottle(throttle);
  }

  setFixedWingStallWarning(stalled: boolean): void {
    this.elements.setFixedWingStallWarning(stalled);
  }

  setFixedWingStallSpeed(speed: number): void {
    this.elements.setFixedWingStallSpeed(speed);
  }

  setFixedWingAutoLevel(active: boolean): void {
    this.elements.setFixedWingAutoLevel(active);
  }

  // Squad deploy prompt methods (IHUDSystem)
  showSquadDeployPrompt(): void {
    this.showInteractionPrompt('Press G to deploy squad');
  }

  hideSquadDeployPrompt(): void {
    this.hideInteractionPrompt();
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
    // Parse ammo string and dispatch for mobile weapon cycler (updateAmmoDisplay
    // is suppressed during weapon switch, so the cycler never gets initial values)
    const parts = ammo.split('/').map(s => parseInt(s.trim(), 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      document.documentElement.dataset.ammoMag = String(parts[0]);
      document.documentElement.dataset.ammoRes = String(parts[1]);
      document.dispatchEvent(new CustomEvent('hud:ammo', { detail: { magazine: parts[0], reserve: parts[1] } }));
    }
  }

  // Unified weapon bar API (shared across desktop bar + mobile pill)
  setWeaponSelectCallback(callback: (slotIndex: number) => void): void {
    this.elements.unifiedWeaponBar.setOnWeaponSelect(callback);
    this.elements.weaponPill.setOnWeaponSelect(callback);
  }

  setActiveWeaponSlot(slot: number): void {
    this.elements.unifiedWeaponBar.setActiveSlot(slot);
    this.elements.weaponPill.setActiveSlot(slot);
  }

  setWeaponBarLayout(slotDefinitions: InventorySlotDefinition[], weaponCycleSlots: number[]): void {
    this.elements.setWeaponBarLayout(slotDefinitions, weaponCycleSlots);
  }

  // Scoreboard toggle
  toggleScoreboard(visible: boolean): void {
    this.isScoreboardVisible = visible;
    this.scoreboard.toggle(visible);
    this.hudLayout.setState({ scoreboardVisible: visible });
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
  setVehicle(vehicle: ActorMode): void {
    this.hudLayout.setState({ actorMode: vehicle });
  }

  /** Set ADS state (dims non-essential HUD when aiming). */
  setADS(ads: boolean): void {
    this.hudLayout.setState({ ads });
  }

  setOverlay(overlay: GameplayOverlay): void {
    if (overlay !== 'none' && this.isScoreboardVisible) {
      this.toggleScoreboard(false);
    }
    this.hudLayout.setState({ overlay });
  }

  setInputMode(inputMode: GameplayInputMode): void {
    this.hudLayout.setState({ inputMode });
  }

  setInteractionContext(context: InteractionContext | null): void {
    this.hudLayout.setState({ interaction: context });
    if (context) {
      this.elements.showInteractionPrompt(context.promptText);
    } else {
      this.elements.hideInteractionPrompt();
    }
  }

  setVehicleContext(context: VehicleUIContext | null): void {
    this.hudLayout.setState({
      vehicleContext: context,
      actorMode: context?.kind ?? 'infantry',
    });
  }

  isScoreboardCurrentlyVisible(): boolean {
    return this.isScoreboardVisible;
  }
}
