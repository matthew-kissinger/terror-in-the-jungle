import { Logger } from '../../utils/Logger';
import { CaptureZone, ZoneState } from './ZoneManager';
import { Faction } from '../combat/types';

export class ZoneCaptureLogic {
  private readonly CAPTURE_SPEED = 1; // Progress per second with 1 attacker
  private readonly CONTEST_THRESHOLD = 0.3; // Ratio needed to contest

  updateZoneCaptureState(
    zone: CaptureZone,
    occupants: { us: number; opfor: number },
    deltaTime: number
  ): void {
    if (zone.isHomeBase) return; // Skip home bases

    const { us, opfor } = occupants;
    const total = us + opfor;

    if (total === 0) {
      // No one in zone, no change
      zone.state = this.getStateForOwner(zone.owner);
      return;
    }

    // Calculate capture dynamics
    const usRatio = us / total;
    const opforRatio = opfor / total;

    // Determine if zone is contested
    if (usRatio > this.CONTEST_THRESHOLD && opforRatio > this.CONTEST_THRESHOLD) {
      zone.state = ZoneState.CONTESTED;
      // No progress change when contested
    } else if (usRatio > opforRatio) {
      // US capturing
      if (zone.owner !== Faction.US) {
        zone.captureProgress += zone.captureSpeed * deltaTime * us;
        zone.state = ZoneState.CONTESTED;

        if (zone.captureProgress >= 100) {
          zone.captureProgress = 100;
          zone.owner = Faction.US;
          zone.state = ZoneState.US_CONTROLLED;
          Logger.info('world', ` Zone ${zone.name} captured by US!`);
        }
      } else {
        zone.state = ZoneState.US_CONTROLLED;
      }
    } else if (opforRatio > usRatio) {
      // OPFOR capturing
      if (zone.owner !== Faction.OPFOR) {
        zone.captureProgress += zone.captureSpeed * deltaTime * opfor;
        zone.state = ZoneState.CONTESTED;

        if (zone.captureProgress >= 100) {
          zone.captureProgress = 100;
          zone.owner = Faction.OPFOR;
          zone.state = ZoneState.OPFOR_CONTROLLED;
          Logger.info('world', ` Zone ${zone.name} captured by OPFOR!`);
        }
      } else {
        zone.state = ZoneState.OPFOR_CONTROLLED;
      }
    }

    // Neutralize progress if switching sides
    if (zone.owner === Faction.US && opforRatio > usRatio) {
      zone.captureProgress -= zone.captureSpeed * deltaTime * opfor;
      if (zone.captureProgress <= 0) {
        zone.captureProgress = 0;
        zone.owner = null;
        zone.state = ZoneState.NEUTRAL;
      }
    } else if (zone.owner === Faction.OPFOR && usRatio > opforRatio) {
      zone.captureProgress -= zone.captureSpeed * deltaTime * us;
      if (zone.captureProgress <= 0) {
        zone.captureProgress = 0;
        zone.owner = null;
        zone.state = ZoneState.NEUTRAL;
      }
    }
  }

  getStateForOwner(owner: Faction | null): ZoneState {
    if (!owner) return ZoneState.NEUTRAL;
    return owner === Faction.US ? ZoneState.US_CONTROLLED : ZoneState.OPFOR_CONTROLLED;
  }

  calculateTicketBleedRate(zones: Map<string, CaptureZone>): { us: number; opfor: number } {
    let usBleed = 0;
    let opforBleed = 0;

    const capturedZones = Array.from(zones.values()).filter(z => !z.isHomeBase && z.owner !== null);
    const usZones = capturedZones.filter(z => z.owner === Faction.US).length;
    const opforZones = capturedZones.filter(z => z.owner === Faction.OPFOR).length;

    // Majority holder causes ticket bleed for opponent
    if (usZones > opforZones) {
      opforBleed = (usZones - opforZones) * 0.5; // 0.5 tickets per second per zone advantage
    } else if (opforZones > usZones) {
      usBleed = (opforZones - usZones) * 0.5;
    }

    return { us: usBleed, opfor: opforBleed };
  }
}