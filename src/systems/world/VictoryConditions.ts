import { Faction } from '../combat/types';
import { ZoneManager, ZoneState } from './ZoneManager';
import { GamePhase, PhaseTimings } from './TicketSystemPhases';

export type VictoryReason = 'KILL_TARGET_REACHED' | 'TICKETS_DEPLETED' | 'TOTAL_CONTROL' | 'TIME_LIMIT' | 'ADMIN_COMMAND';

export interface VictoryResult {
  winner: Faction | null;
  reason: VictoryReason | null;
  shouldEnterOvertime: boolean;
}

export interface VictoryCheckParams {
  // TDM params
  isTDM: boolean;
  killTarget: number;
  usKills: number;
  opforKills: number;

  // Ticket params
  usTickets: number;
  opforTickets: number;

  // Zone control params
  zoneManager: ZoneManager | undefined;

  // Phase params
  currentPhase: GamePhase;
  matchDuration: number;
  phaseTimings: PhaseTimings;
}

export class VictoryConditions {
  /**
   * Check all victory conditions and return result
   */
  checkVictory(params: VictoryCheckParams): VictoryResult {
    // Check TDM kill target
    if (params.isTDM && params.killTarget > 0) {
      if (params.usKills >= params.killTarget) {
        return { winner: Faction.US, reason: 'KILL_TARGET_REACHED', shouldEnterOvertime: false };
      }
      if (params.opforKills >= params.killTarget) {
        return { winner: Faction.OPFOR, reason: 'KILL_TARGET_REACHED', shouldEnterOvertime: false };
      }
    }

    // Check ticket depletion (only if not in TDM)
    if (!params.isTDM) {
      if (params.usTickets <= 0) {
        return { winner: Faction.OPFOR, reason: 'TICKETS_DEPLETED', shouldEnterOvertime: false };
      }

      if (params.opforTickets <= 0) {
        return { winner: Faction.US, reason: 'TICKETS_DEPLETED', shouldEnterOvertime: false };
      }
    }

    // Check total zone control (instant win, only if not in TDM)
    if (!params.isTDM && params.zoneManager) {
      const totalControlResult = this.checkTotalZoneControl(params.zoneManager);
      if (totalControlResult.winner) {
        return totalControlResult;
      }
    }

    // Check time-based win conditions
    return this.checkTimeLimits(
      params.currentPhase,
      params.matchDuration,
      params.phaseTimings,
      params.usTickets,
      params.opforTickets
    );
  }

  /**
   * Check if either faction controls all capturable zones
   */
  private checkTotalZoneControl(zoneManager: ZoneManager): VictoryResult {
    const zones = zoneManager.getAllZones();
    const capturableZones = zones.filter(z => !z.isHomeBase);

    // Only check total control if there are capturable zones
    if (capturableZones.length > 0) {
      const usControlled = capturableZones.filter(z => z.state === ZoneState.US_CONTROLLED).length;
      const opforControlled = capturableZones.filter(z => z.state === ZoneState.OPFOR_CONTROLLED).length;

      if (usControlled === capturableZones.length) {
        return { winner: Faction.US, reason: 'TOTAL_CONTROL', shouldEnterOvertime: false };
      } else if (opforControlled === capturableZones.length) {
        return { winner: Faction.OPFOR, reason: 'TOTAL_CONTROL', shouldEnterOvertime: false };
      }
    }

    return { winner: null, reason: null, shouldEnterOvertime: false };
  }

  /**
   * Check time-based victory conditions and overtime eligibility
   */
  private checkTimeLimits(
    currentPhase: GamePhase,
    matchDuration: number,
    phaseTimings: PhaseTimings,
    usTickets: number,
    opforTickets: number
  ): VictoryResult {
    const { totalCombatDuration, totalOvertimeDuration } = phaseTimings;

    // If in COMBAT phase and combat duration is reached
    if (currentPhase === 'COMBAT' && matchDuration >= totalCombatDuration) {
      const ticketDifference = Math.abs(usTickets - opforTickets);
      if (ticketDifference < 50) {
        // Tickets are close - enter overtime
        return { winner: null, reason: null, shouldEnterOvertime: true };
      } else {
        // If not close, end game by time limit
        const winner = usTickets > opforTickets ? Faction.US : Faction.OPFOR;
        return { winner, reason: 'TIME_LIMIT', shouldEnterOvertime: false };
      }
    }

    // If in OVERTIME phase and overtime duration is reached
    if (currentPhase === 'OVERTIME' && matchDuration >= totalOvertimeDuration) {
      const winner = usTickets > opforTickets ? Faction.US : Faction.OPFOR;
      return { winner, reason: 'TIME_LIMIT', shouldEnterOvertime: false };
    }

    // No victory condition met
    return { winner: null, reason: null, shouldEnterOvertime: false };
  }
}
