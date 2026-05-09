import { ZoneState } from './ZoneManager';
import type { IZoneQuery } from '../../types/SystemInterfaces';

export interface TicketBleedRate {
  usTickets: number;
  opforTickets: number;
  bleedPerSecond: number;
}

export class TicketBleedCalculator {
  private readonly baseBleedRate = 1.0; // tickets per second when losing all zones

  /**
   * Get base bleed rate (for testing/debugging)
   */
  getBaseBleedRate(): number {
    return this.baseBleedRate;
  }

  /**
   * Calculate ticket bleed rates based on zone control
   */
  calculateTicketBleed(zoneQuery: IZoneQuery | undefined): TicketBleedRate {
    if (!zoneQuery) {
      return { usTickets: 0, opforTickets: 0, bleedPerSecond: 0 };
    }

    const capturableZones = zoneQuery.getCapturableZones();

    if (capturableZones.length === 0) {
      return { usTickets: 0, opforTickets: 0, bleedPerSecond: 0 };
    }

    let usControlled = 0;
    let opforControlled = 0;

    // Count zone control
    capturableZones.forEach(zone => {
      switch (zone.state) {
        case ZoneState.BLUFOR_CONTROLLED:
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
    // Faction loses tickets when they control less than 50% of zones.
    // Graduated: holding a supermajority (70%+) increases bleed against the weaker side.
    let usBleed = 0;
    let opforBleed = 0;

    if (usControlRatio < 0.5) {
      usBleed = this.baseBleedRate * (0.5 - usControlRatio) * 2;
    }

    if (opforControlRatio < 0.5) {
      opforBleed = this.baseBleedRate * (0.5 - opforControlRatio) * 2;
    }

    // Supermajority acceleration: controlling 70%+ zones multiplies bleed
    if (usControlRatio >= 1.0 && totalZones > 0) {
      opforBleed = this.baseBleedRate * 3;   // Total control: 3x
    } else if (usControlRatio >= 0.7) {
      opforBleed *= 1.5;                      // Supermajority: 1.5x
    }

    if (opforControlRatio >= 1.0 && totalZones > 0) {
      usBleed = this.baseBleedRate * 3;
    } else if (opforControlRatio >= 0.7) {
      usBleed *= 1.5;
    }

    return {
      usTickets: usBleed,
      opforTickets: opforBleed,
      bleedPerSecond: Math.max(usBleed, opforBleed)
    };
  }

  /**
   * Apply ticket bleed to both factions
   */
  applyTicketBleed(
    usTickets: number,
    opforTickets: number,
    bleedRates: TicketBleedRate,
    deltaTime: number
  ): { usTickets: number; opforTickets: number } {
    return {
      usTickets: Math.max(0, usTickets - (bleedRates.usTickets * deltaTime)),
      opforTickets: Math.max(0, opforTickets - (bleedRates.opforTickets * deltaTime))
    };
  }
}
