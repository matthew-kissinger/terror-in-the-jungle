import { GameSystem } from '../../types';
import { Faction } from '../combat/types';
import { ZoneManager } from './ZoneManager';
import { Logger } from '../../utils/Logger';
import { TicketSystemPhases, GamePhase } from './TicketSystemPhases';
import { TicketBleedCalculator, TicketBleedRate } from './TicketBleedCalculator';
import { VictoryConditions, VictoryReason } from './VictoryConditions';

export type { TicketBleedRate } from './TicketBleedCalculator';

export interface GameState {
  gameActive: boolean;
  winner?: Faction;
  matchDuration: number;
  phase: GamePhase;
  isTDM: boolean;
  killTarget?: number;
}

export class TicketSystem implements GameSystem {
  private usTickets = 300;
  private opforTickets = 300;
  private maxTickets = 300;

  private usKills = 0;
  private opforKills = 0;
  private killTarget = 0;
  private isTDM = false;

  private zoneManager?: ZoneManager;
  private gameState: GameState = {
    gameActive: true,
    matchDuration: 0,
    phase: 'SETUP',
    isTDM: false
  };

  // Ticket bleed configuration
  private deathPenalty = 2; // tickets lost per death

  // Extracted modules
  private phaseManager = new TicketSystemPhases();
  private bleedCalculator = new TicketBleedCalculator();
  private victoryChecker = new VictoryConditions();

  // Event callbacks
  private onTicketUpdate?: (usTickets: number, opforTickets: number) => void;
  private onGameEnd?: (winner: Faction, gameState: GameState) => void;

  constructor() {
    Logger.info('tickets', 'Initializing Ticket System...');
  }

  async init(): Promise<void> {
    Logger.info('tickets', 'Ticket System initialized');
    Logger.info('tickets', `Starting tickets: US ${this.usTickets}, OPFOR ${this.opforTickets}`);
  }

  update(deltaTime: number): void {
    this.gameState.matchDuration += deltaTime;

    this.updateGamePhase();

    // If game was ended by phase update (e.g., time limit in checkVictoryConditions)
    if (!this.gameState.gameActive) {
      // Notify listeners of ticket changes only if the game has ended for consistent final state reporting
      if (this.onTicketUpdate) {
        this.onTicketUpdate(this.usTickets, this.opforTickets);
      }
      return;
    }

    // Apply ticket bleed only if game is active, not in TDM mode, and in COMBAT or OVERTIME phase
    if (!this.isTDM && (this.gameState.phase === 'COMBAT' || this.gameState.phase === 'OVERTIME')) {
      this.updateTicketBleed(deltaTime);
    }

    // Always check victory conditions if game is still active
    this.checkVictoryConditions();

    // Notify listeners of ticket changes
    if (this.onTicketUpdate) {
      this.onTicketUpdate(this.usTickets, this.opforTickets);
    }
  }

  private updateGamePhase(): void {
    this.gameState.phase = this.phaseManager.determinePhase(
      this.gameState.matchDuration,
      this.gameState.phase,
      this.usTickets,
      this.opforTickets
    );
  }

  private updateTicketBleed(deltaTime: number): void {
    if (!this.zoneManager) return;

    const bleedRates = this.bleedCalculator.calculateTicketBleed(this.zoneManager);
    const result = this.bleedCalculator.applyTicketBleed(
      this.usTickets,
      this.opforTickets,
      bleedRates,
      deltaTime
    );

    this.usTickets = result.usTickets;
    this.opforTickets = result.opforTickets;
  }

  private checkVictoryConditions(): void {
    if (!this.gameState.gameActive) return;

    const result = this.victoryChecker.checkVictory({
      isTDM: this.isTDM,
      killTarget: this.killTarget,
      usKills: this.usKills,
      opforKills: this.opforKills,
      usTickets: this.usTickets,
      opforTickets: this.opforTickets,
      zoneManager: this.zoneManager,
      currentPhase: this.gameState.phase,
      matchDuration: this.gameState.matchDuration,
      phaseTimings: this.phaseManager.getPhaseTimings()
    });

    if (result.shouldEnterOvertime) {
      this.gameState.phase = 'OVERTIME';
      Logger.info('tickets', 'OVERTIME! Close match detected');
    } else if (result.winner && result.reason) {
      this.endGame(result.winner, result.reason);
    }
  }

  private endGame(winner: Faction, reason: VictoryReason): void {
    if (!this.gameState.gameActive) return;

    this.gameState.gameActive = false;
    this.gameState.winner = winner;
    this.gameState.phase = 'ENDED';

    Logger.info('tickets', `GAME OVER! ${winner} wins by ${reason}`);
    Logger.info('tickets', `Final scores: US ${Math.round(this.usTickets)}, OPFOR ${Math.round(this.opforTickets)}`);
    Logger.info('tickets', `Match duration: ${Math.round(this.gameState.matchDuration)}s`);

    if (this.onGameEnd) {
      this.onGameEnd(winner, this.gameState);
    }
  }

  // Public API for game events

  onCombatantDeath(faction: Faction): void {
    if (!this.gameState.gameActive) return;

    if (faction === Faction.US) {
      this.opforKills++;
      this.usTickets = Math.max(0, this.usTickets - this.deathPenalty);
      Logger.info('tickets', `US soldier KIA, tickets: ${Math.round(this.usTickets)}, OPFOR kills: ${this.opforKills}`);
    } else {
      this.usKills++;
      this.opforTickets = Math.max(0, this.opforTickets - this.deathPenalty);
      Logger.info('tickets', `OPFOR soldier KIA, tickets: ${Math.round(this.opforTickets)}, US kills: ${this.usKills}`);
    }
    this.checkVictoryConditions();
  }

  // Getters

  getTickets(faction: Faction): number {
    if (this.isTDM) {
      return faction === Faction.US ? this.usKills : this.opforKills;
    }
    return faction === Faction.US ? this.usTickets : this.opforTickets;
  }

  getKills(faction: Faction): number {
    return faction === Faction.US ? this.usKills : this.opforKills;
  }

  getKillTarget(): number {
    return this.killTarget;
  }

  isTDMMode(): boolean {
    return this.isTDM;
  }

  getTicketBleedRate(): TicketBleedRate {
    return this.bleedCalculator.calculateTicketBleed(this.zoneManager);
  }

  // Testing/debug access to internal values
  getBaseBleedRate(): number {
    return this.bleedCalculator.getBaseBleedRate();
  }

  getSetupDuration(): number {
    return this.phaseManager.getSetupDuration();
  }

  getCombatDuration(): number {
    return this.phaseManager.getCombatDuration();
  }

  getOvertimeDuration(): number {
    return this.phaseManager.getOvertimeDuration();
  }

  getGameState(): GameState {
    return { ...this.gameState };
  }

  isGameActive(): boolean {
    return this.gameState.gameActive;
  }

  getMatchTimeRemaining(): number {
    return this.phaseManager.getPhaseTimeRemaining(
      this.gameState.matchDuration,
      this.gameState.phase
    );
  }

  // System connections

  setZoneManager(manager: ZoneManager | undefined): void {
    this.zoneManager = manager;
  }

  // Game mode configuration methods
  setMaxTickets(tickets: number): void {
    this.maxTickets = tickets;
    this.usTickets = tickets;
    this.opforTickets = tickets;
    Logger.info('tickets', `Ticket count set to ${tickets} per team`);
  }

  setMatchDuration(duration: number): void {
    this.phaseManager.setCombatDuration(duration);
  }

  setDeathPenalty(penalty: number): void {
    this.deathPenalty = penalty;
    Logger.info('tickets', `Death penalty set to ${penalty} tickets`);
  }

  setTDMMode(enabled: boolean, target: number): void {
    this.isTDM = enabled;
    this.killTarget = target;
    this.usKills = 0;
    this.opforKills = 0;
    this.gameState.isTDM = enabled;
    this.gameState.killTarget = target;
    Logger.info('tickets', `TDM Mode: ${enabled ? 'ENABLED' : 'DISABLED'}, Target: ${target}`);
  }

  setTicketUpdateCallback(callback: (usTickets: number, opforTickets: number) => void): void {
    this.onTicketUpdate = callback;
  }

  setGameEndCallback(callback: (winner: Faction, gameState: GameState) => void): void {
    this.onGameEnd = callback;
  }

  // Admin/debug methods

  addTickets(faction: Faction, amount: number): void {
    if (faction === Faction.US) {
      this.usTickets = Math.min(this.maxTickets, this.usTickets + amount);
    } else {
      this.opforTickets = Math.min(this.maxTickets, this.opforTickets + amount);
    }
    Logger.info('tickets', `Added ${amount} tickets to ${faction}`);
  }

  removeTickets(faction: Faction, amount: number): void {
    if (faction === Faction.US) {
      this.usTickets = Math.max(0, this.usTickets - amount);
    } else {
      this.opforTickets = Math.max(0, this.opforTickets - amount);
    }
    Logger.info('tickets', `Removed ${amount} tickets from ${faction}. New totals: US ${this.usTickets}, OPFOR ${this.opforTickets}`);
  }

  forceEndGame(winner: Faction): void {
    this.endGame(winner, 'ADMIN_COMMAND');
  }

  restartMatch(): void {
    this.usTickets = this.maxTickets;
    this.opforTickets = this.maxTickets;
    this.usKills = 0;
    this.opforKills = 0;
    this.gameState = {
      gameActive: true,
      matchDuration: 0,
      phase: 'SETUP',
      isTDM: this.isTDM,
      killTarget: this.killTarget
    };
    Logger.info('tickets', 'Match restarted');
  }

  dispose(): void {
    Logger.info('tickets', 'Ticket System disposed');
  }
}
