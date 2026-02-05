import { ZoneManager, ZoneState } from './ZoneManager';

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
  calculateTicketBleed(zoneManager: ZoneManager | undefined): TicketBleedRate {
    if (!zoneManager) {
      return { usTickets: 0, opforTickets: 0, bleedPerSecond: 0 };
    }

    const zones = zoneManager.getAllZones();
    const capturableZones = zones.filter(z => !z.isHomeBase);

    if (capturableZones.length === 0) {
      return { usTickets: 0, opforTickets: 0, bleedPerSecond: 0 };
    }

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
