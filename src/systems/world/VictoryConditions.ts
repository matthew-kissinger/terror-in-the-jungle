// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Faction } from '../combat/types';
import { type CaptureZone, ZoneState } from './ZoneManager';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import { GamePhase, PhaseTimings } from './TicketSystemPhases';

export type VictoryReason = 'KILL_TARGET_REACHED' | 'TICKETS_DEPLETED' | 'TOTAL_CONTROL' | 'TIME_LIMIT' | 'ADMIN_COMMAND';

interface VictoryResult {
  winner: Faction | null;
  reason: VictoryReason | null;
  shouldEnterOvertime: boolean;
}

interface VictoryCheckParams {
  // TDM params
  isTDM: boolean;
  killTarget: number;
  usKills: number;
  opforKills: number;

  // Ticket params
  usTickets: number;
  opforTickets: number;

  // Zone control params
  zoneManager: IZoneQuery | undefined;

  // Phase params
  currentPhase: GamePhase;
  matchDuration: number;
  phaseTimings: PhaseTimings;
}

export class VictoryConditions {
  private countedTotalZones = 0;
  private countedUsControlled = 0;
  private countedOpforControlled = 0;
  private readonly countZoneControl = (zone: CaptureZone): void => {
    this.countedTotalZones++;
    switch (zone.state) {
      case ZoneState.BLUFOR_CONTROLLED:
        this.countedUsControlled++;
        break;
      case ZoneState.OPFOR_CONTROLLED:
        this.countedOpforControlled++;
        break;
    }
  };

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
        return { winner: Faction.NVA, reason: 'KILL_TARGET_REACHED', shouldEnterOvertime: false };
      }
    }

    // Check ticket depletion (only if not in TDM)
    if (!params.isTDM) {
      if (params.usTickets <= 0) {
        return { winner: Faction.NVA, reason: 'TICKETS_DEPLETED', shouldEnterOvertime: false };
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
  private checkTotalZoneControl(zoneQuery: IZoneQuery): VictoryResult {
    this.resetZoneControlCounts();
    const iterableZoneQuery = zoneQuery as IZoneQuery & {
      forEachCapturableZone?: (callback: (zone: CaptureZone) => void) => void;
    };
    if (iterableZoneQuery.forEachCapturableZone) {
      iterableZoneQuery.forEachCapturableZone(this.countZoneControl);
    } else {
      const capturableZones = zoneQuery.getCapturableZones();
      for (const zone of capturableZones) {
        this.countZoneControl(zone);
      }
    }

    // Only check total control if there are capturable zones
    if (this.countedTotalZones > 0) {
      if (this.countedUsControlled === this.countedTotalZones) {
        return { winner: Faction.US, reason: 'TOTAL_CONTROL', shouldEnterOvertime: false };
      } else if (this.countedOpforControlled === this.countedTotalZones) {
        return { winner: Faction.NVA, reason: 'TOTAL_CONTROL', shouldEnterOvertime: false };
      }
    }

    return { winner: null, reason: null, shouldEnterOvertime: false };
  }

  private resetZoneControlCounts(): void {
    this.countedTotalZones = 0;
    this.countedUsControlled = 0;
    this.countedOpforControlled = 0;
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
        const winner = usTickets > opforTickets ? Faction.US : Faction.NVA;
        return { winner, reason: 'TIME_LIMIT', shouldEnterOvertime: false };
      }
    }

    // If in OVERTIME phase and overtime duration is reached
    if (currentPhase === 'OVERTIME' && matchDuration >= totalOvertimeDuration) {
      const winner = usTickets > opforTickets ? Faction.US : Faction.NVA;
      return { winner, reason: 'TIME_LIMIT', shouldEnterOvertime: false };
    }

    // No victory condition met
    return { winner: null, reason: null, shouldEnterOvertime: false };
  }
}
