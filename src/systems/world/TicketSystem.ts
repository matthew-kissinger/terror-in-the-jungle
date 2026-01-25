import { GameSystem } from '../../types';
import { Faction } from '../combat/types';
import { ZoneManager, ZoneState } from './ZoneManager';

export interface TicketBleedRate {
  usTickets: number;
  opforTickets: number;
  bleedPerSecond: number;
}

export interface GameState {
  gameActive: boolean;
  winner?: Faction;
  matchDuration: number;
  phase: 'SETUP' | 'COMBAT' | 'OVERTIME' | 'ENDED';
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
  private readonly baseBleedRate = 1.0; // tickets per second when losing all zones
  private deathPenalty = 2; // tickets lost per death
  private readonly setupDuration = 10; // seconds
  private combatDuration = 900; // 15 minutes
  private readonly overtimeDuration = 120; // 2 minutes

  // Event callbacks
  private onTicketUpdate?: (usTickets: number, opforTickets: number) => void;
  private onGameEnd?: (winner: Faction, gameState: GameState) => void;

  constructor() {
    console.log('🎫 Initializing Ticket System...');
  }

  async init(): Promise<void> {
    console.log('🎫 Ticket System initialized');
    console.log(`Starting tickets: US ${this.usTickets}, OPFOR ${this.opforTickets}`);
  }

  update(deltaTime: number): void {
    this.gameState.matchDuration += deltaTime;

    // Handle game phases
    this.updateGamePhase();

    if (this.gameState.gameActive && this.gameState.phase === 'COMBAT') {
      // Calculate and apply ticket bleed
      this.updateTicketBleed(deltaTime);

      // Check victory conditions
      this.checkVictoryConditions();
    }

    // Notify listeners of ticket changes
    if (this.onTicketUpdate) {
      this.onTicketUpdate(this.usTickets, this.opforTickets);
    }
  }

  private updateGamePhase(): void {
    const duration = this.gameState.matchDuration;

    if (duration < this.setupDuration) {
      this.gameState.phase = 'SETUP';
    } else if (duration < this.setupDuration + this.combatDuration) {
      this.gameState.phase = 'COMBAT';
    } else {
      // Check if overtime is needed (close score)
      const ticketDifference = Math.abs(this.usTickets - this.opforTickets);
      if (ticketDifference < 50 && this.gameState.phase !== 'OVERTIME') {
        this.gameState.phase = 'OVERTIME';
        console.log('⚡ OVERTIME! Close match detected');
      } else if (duration > this.setupDuration + this.combatDuration + this.overtimeDuration) {
        this.endGame(this.usTickets > this.opforTickets ? Faction.US : Faction.OPFOR, 'TIME_LIMIT');
      }
    }
  }

  private updateTicketBleed(deltaTime: number): void {
    if (!this.zoneManager || this.isTDM) return;

    const bleedRates = this.calculateTicketBleed();

    // Apply bleed to both factions
    this.usTickets = Math.max(0, this.usTickets - (bleedRates.usTickets * deltaTime));
    this.opforTickets = Math.max(0, this.opforTickets - (bleedRates.opforTickets * deltaTime));
  }

  private calculateTicketBleed(): TicketBleedRate {
    if (!this.zoneManager) {
      return { usTickets: 0, opforTickets: 0, bleedPerSecond: 0 };
    }

    const zones = this.zoneManager.getAllZones();
    const capturableZones = zones.filter(z => !z.isHomeBase);

    let usControlled = 0;
    let opforControlled = 0;

    // Count zone control
    capturableZones.forEach(zone => {
      switch (zone.state) {
        case ZoneState.US_CONTROLLED:
          usControlled++;
          break;
        case ZoneState.OPFOR_CONTROLLED:
          opforControlled++;
          break;
      }
    });

    const totalZones = capturableZones.length;
    const usControlRatio = usControlled / totalZones;
    const opforControlRatio = opforControlled / totalZones;

    // Calculate bleed rates
    // Faction loses tickets when they control less than 50% of zones
    let usBleed = 0;
    let opforBleed = 0;

    if (usControlRatio < 0.5) {
      usBleed = this.baseBleedRate * (0.5 - usControlRatio) * 2; // Double the deficit
    }

    if (opforControlRatio < 0.5) {
      opforBleed = this.baseBleedRate * (0.5 - opforControlRatio) * 2;
    }

    // If one faction controls all zones, enemy bleeds faster
    if (usControlled === totalZones && totalZones > 0) {
      opforBleed = this.baseBleedRate * 2;
    } else if (opforControlled === totalZones && totalZones > 0) {
      usBleed = this.baseBleedRate * 2;
    }

    return {
      usTickets: usBleed,
      opforTickets: opforBleed,
      bleedPerSecond: Math.max(usBleed, opforBleed)
    };
  }

  private checkVictoryConditions(): void {
    // Check TDM kill target
    if (this.isTDM && this.killTarget > 0) {
      if (this.usKills >= this.killTarget) {
        this.endGame(Faction.US, 'KILL_TARGET_REACHED');
        return;
      }
      if (this.opforKills >= this.killTarget) {
        this.endGame(Faction.OPFOR, 'KILL_TARGET_REACHED');
        return;
      }
    }

    // Check ticket depletion
    if (this.usTickets <= 0) {
      this.endGame(Faction.OPFOR, 'TICKETS_DEPLETED');
      return;
    }

    if (this.opforTickets <= 0) {
      this.endGame(Faction.US, 'TICKETS_DEPLETED');
      return;
    }

    // Check total zone control (instant win)
    if (this.zoneManager) {
      const zones = this.zoneManager.getAllZones();
      const capturableZones = zones.filter(z => !z.isHomeBase);

      const usControlled = capturableZones.filter(z => z.state === ZoneState.US_CONTROLLED).length;
      const opforControlled = capturableZones.filter(z => z.state === ZoneState.OPFOR_CONTROLLED).length;

      if (usControlled === capturableZones.length && capturableZones.length > 0) {
        this.endGame(Faction.US, 'TOTAL_CONTROL');
      } else if (opforControlled === capturableZones.length && capturableZones.length > 0) {
        this.endGame(Faction.OPFOR, 'TOTAL_CONTROL');
      }
    }
  }

  private endGame(winner: Faction, reason: string): void {
    if (!this.gameState.gameActive) return;

    this.gameState.gameActive = false;
    this.gameState.winner = winner;
    this.gameState.phase = 'ENDED';

    console.log(`🏆 GAME OVER! ${winner} wins by ${reason}`);
    console.log(`Final scores: US ${Math.round(this.usTickets)}, OPFOR ${Math.round(this.opforTickets)}`);
    console.log(`Match duration: ${Math.round(this.gameState.matchDuration)}s`);

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
      console.log(`💀 US soldier KIA, tickets: ${Math.round(this.usTickets)}, OPFOR kills: ${this.opforKills}`);
    } else {
      this.usKills++;
      this.opforTickets = Math.max(0, this.opforTickets - this.deathPenalty);
      console.log(`💀 OPFOR soldier KIA, tickets: ${Math.round(this.opforTickets)}, US kills: ${this.usKills}`);
    }
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
    return this.calculateTicketBleed();
  }

  getGameState(): GameState {
    return { ...this.gameState };
  }

  isGameActive(): boolean {
    return this.gameState.gameActive;
  }

  getMatchTimeRemaining(): number {
    const elapsed = this.gameState.matchDuration;

    if (this.gameState.phase === 'SETUP') {
      return this.setupDuration - elapsed;
    } else if (this.gameState.phase === 'COMBAT') {
      return this.combatDuration - (elapsed - this.setupDuration);
    } else if (this.gameState.phase === 'OVERTIME') {
      return this.overtimeDuration - (elapsed - this.setupDuration - this.combatDuration);
    }

    return 0;
  }

  // System connections

  setZoneManager(manager: ZoneManager): void {
    this.zoneManager = manager;
  }

  // Game mode configuration methods
  setMaxTickets(tickets: number): void {
    this.maxTickets = tickets;
    this.usTickets = tickets;
    this.opforTickets = tickets;
    console.log(`🎮 Ticket count set to ${tickets} per team`);
  }

  setMatchDuration(duration: number): void {
    this.combatDuration = duration;
    console.log(`🎮 Match duration set to ${duration} seconds`);
  }

  setDeathPenalty(penalty: number): void {
    this.deathPenalty = penalty;
    console.log(`🎮 Death penalty set to ${penalty} tickets`);
  }

  setTDMMode(enabled: boolean, target: number): void {
    this.isTDM = enabled;
    this.killTarget = target;
    this.usKills = 0;
    this.opforKills = 0;
    this.gameState.isTDM = enabled;
    this.gameState.killTarget = target;
    console.log(`🎮 TDM Mode: ${enabled ? 'ENABLED' : 'DISABLED'}, Target: ${target}`);
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
    console.log(`🎫 Added ${amount} tickets to ${faction}`);
  }

  removeTickets(faction: Faction, amount: number): void {
    if (faction === Faction.US) {
      this.usTickets = Math.max(0, this.usTickets - amount);
    } else {
      this.opforTickets = Math.max(0, this.opforTickets - amount);
    }
    console.log(`🎫 Removed ${amount} tickets from ${faction}. New totals: US ${this.usTickets}, OPFOR ${this.opforTickets}`);
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
    console.log('🔄 Match restarted');
  }

  dispose(): void {
    console.log('🧹 Ticket System disposed');
  }
}