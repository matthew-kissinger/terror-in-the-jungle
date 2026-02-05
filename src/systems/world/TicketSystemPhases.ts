import { Logger } from '../../utils/Logger';

export type GamePhase = 'SETUP' | 'COMBAT' | 'OVERTIME' | 'ENDED';

export interface PhaseConfig {
  setupDuration: number;
  combatDuration: number;
  overtimeDuration: number;
}

export interface PhaseTimings {
  totalCombatDuration: number;
  totalOvertimeDuration: number;
}

export class TicketSystemPhases {
  private setupDuration = 10; // seconds
  private combatDuration = 900; // 15 minutes
  private overtimeDuration = 120; // 2 minutes

  /**
   * Set custom match duration (combat phase length)
   */
  setCombatDuration(duration: number): void {
    this.combatDuration = duration;
    Logger.info('tickets', `Match duration set to ${duration} seconds`);
  }

  /**
   * Get combat duration (for testing/debugging)
   */
  getCombatDuration(): number {
    return this.combatDuration;
  }

  /**
   * Get setup duration (for testing/debugging)
   */
  getSetupDuration(): number {
    return this.setupDuration;
  }

  /**
   * Get overtime duration (for testing/debugging)
   */
  getOvertimeDuration(): number {
    return this.overtimeDuration;
  }

  /**
   * Get current phase configuration
   */
  getPhaseConfig(): PhaseConfig {
    return {
      setupDuration: this.setupDuration,
      combatDuration: this.combatDuration,
      overtimeDuration: this.overtimeDuration
    };
  }

  /**
   * Calculate phase timing boundaries
   */
  getPhaseTimings(): PhaseTimings {
    return {
      totalCombatDuration: this.setupDuration + this.combatDuration,
      totalOvertimeDuration: this.setupDuration + this.combatDuration + this.overtimeDuration
    };
  }

  /**
   * Determine current game phase based on match duration
   */
  determinePhase(
    matchDuration: number,
    currentPhase: GamePhase,
    usTickets: number,
    opforTickets: number
  ): GamePhase {
    const { totalCombatDuration, totalOvertimeDuration } = this.getPhaseTimings();

    if (matchDuration < this.setupDuration) {
      return 'SETUP';
    } else if (matchDuration < totalCombatDuration) {
      return 'COMBAT';
    } else if (matchDuration < totalOvertimeDuration) {
      // Combat duration is over. Check if overtime is needed.
      const ticketDifference = Math.abs(usTickets - opforTickets);
      if (ticketDifference < 50 && currentPhase !== 'OVERTIME') {
        Logger.info('tickets', 'OVERTIME! Close match detected');
        return 'OVERTIME';
      } else if (currentPhase !== 'OVERTIME' && currentPhase !== 'ENDED') {
        // If combat duration is past and tickets are not close, stay in COMBAT
        // Victory conditions will end the game by time limit
        return 'COMBAT';
      }
      return currentPhase;
    } else {
      // Past overtime duration - victory conditions will end the game if still in OVERTIME
      // Don't change phase here if already ENDED
      if (currentPhase !== 'ENDED') {
        return 'OVERTIME';
      }
      return currentPhase;
    }
  }

  /**
   * Calculate remaining time for current phase
   */
  getPhaseTimeRemaining(matchDuration: number, phase: GamePhase): number {
    if (phase === 'SETUP') {
      return this.setupDuration - matchDuration;
    } else if (phase === 'COMBAT') {
      return this.combatDuration - (matchDuration - this.setupDuration);
    } else if (phase === 'OVERTIME') {
      return this.overtimeDuration - (matchDuration - this.setupDuration - this.combatDuration);
    }

    return 0;
  }
}
