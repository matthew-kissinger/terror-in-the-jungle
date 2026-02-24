import { Logger } from '../../utils/Logger';
import { CaptureZone, ZoneState } from './ZoneManager';
import { Faction, isBlufor, isOpfor } from '../combat/types';

export class ZoneCaptureLogic {
  private readonly neutralCaptureFaction = new Map<string, Faction>();
  private readonly dwellTimers = new Map<string, { us: number; opfor: number }>();
  private readonly CAPTURE_DWELL_SECONDS = 1.0;

  updateZoneCaptureState(
    zone: CaptureZone,
    occupants: { us: number; opfor: number },
    deltaTime: number
  ): void {
    if (zone.isHomeBase) return; // Skip home bases

    const { us, opfor } = occupants;
    const dwell = this.updateDwellTimers(zone.id, us, opfor, deltaTime);
    if (us === 0 && opfor === 0) {
      // No one in zone, no change
      zone.state = this.getStateForOwner(zone.owner);
      return;
    }

    const advantage = us - opfor;
    const pressure = Math.abs(advantage);
    const bothPresent = us > 0 && opfor > 0;

    // Owned zone behavior: attackers reduce control based on net advantage.
    if (zone.owner === Faction.US) {
      if (advantage >= 0) {
        zone.captureProgress = Math.min(100, zone.captureProgress + zone.captureSpeed * deltaTime * Math.max(0, advantage));
        zone.state = bothPresent ? ZoneState.CONTESTED : ZoneState.US_CONTROLLED;
      } else {
        if (dwell.opfor < this.CAPTURE_DWELL_SECONDS) {
          zone.state = bothPresent ? ZoneState.CONTESTED : ZoneState.US_CONTROLLED;
          return;
        }
        zone.captureProgress -= zone.captureSpeed * deltaTime * pressure;
        zone.state = bothPresent ? ZoneState.CONTESTED : ZoneState.US_CONTROLLED;
        if (zone.captureProgress <= 0) {
          zone.captureProgress = 0;
          zone.owner = null;
          zone.state = ZoneState.NEUTRAL;
          this.neutralCaptureFaction.delete(zone.id);
        }
      }
      return;
    }

    if (zone.owner !== null && isOpfor(zone.owner)) {
      if (advantage <= 0) {
        zone.captureProgress = Math.min(100, zone.captureProgress + zone.captureSpeed * deltaTime * Math.max(0, -advantage));
        zone.state = bothPresent ? ZoneState.CONTESTED : ZoneState.OPFOR_CONTROLLED;
      } else {
        if (dwell.us < this.CAPTURE_DWELL_SECONDS) {
          zone.state = bothPresent ? ZoneState.CONTESTED : ZoneState.OPFOR_CONTROLLED;
          return;
        }
        zone.captureProgress -= zone.captureSpeed * deltaTime * pressure;
        zone.state = bothPresent ? ZoneState.CONTESTED : ZoneState.OPFOR_CONTROLLED;
        if (zone.captureProgress <= 0) {
          zone.captureProgress = 0;
          zone.owner = null;
          zone.state = ZoneState.NEUTRAL;
          this.neutralCaptureFaction.delete(zone.id);
        }
      }
      return;
    }

    // Neutral zone behavior: one faction builds progress; opposite pressure first erodes then flips direction.
    if (pressure === 0) {
      zone.state = ZoneState.CONTESTED;
      return;
    }

    const capturingFaction = advantage > 0 ? Faction.US : Faction.NVA;
    const capturingDwell = capturingFaction === Faction.US ? dwell.us : dwell.opfor;
    if (capturingDwell < this.CAPTURE_DWELL_SECONDS) {
      zone.state = bothPresent ? ZoneState.CONTESTED : ZoneState.NEUTRAL;
      return;
    }
    const activeFaction = this.neutralCaptureFaction.get(zone.id);

    if (activeFaction && activeFaction !== capturingFaction) {
      zone.captureProgress -= zone.captureSpeed * deltaTime * pressure;
      zone.state = bothPresent ? ZoneState.CONTESTED : ZoneState.NEUTRAL;
      if (zone.captureProgress <= 0) {
        zone.captureProgress = 0;
        this.neutralCaptureFaction.set(zone.id, capturingFaction);
      }
      return;
    }

    this.neutralCaptureFaction.set(zone.id, capturingFaction);
    zone.captureProgress += zone.captureSpeed * deltaTime * pressure;
    zone.state = bothPresent ? ZoneState.CONTESTED : ZoneState.NEUTRAL;

    if (zone.captureProgress >= 100) {
      zone.captureProgress = 100;
      zone.owner = capturingFaction;
      zone.state = isBlufor(capturingFaction) ? ZoneState.US_CONTROLLED : ZoneState.OPFOR_CONTROLLED;
      this.neutralCaptureFaction.delete(zone.id);
      Logger.info('world', ` Zone ${zone.name} captured by ${zone.owner}!`);
    }
  }

  private updateDwellTimers(zoneId: string, us: number, opfor: number, deltaTime: number): { us: number; opfor: number } {
    const timers = this.dwellTimers.get(zoneId) ?? { us: 0, opfor: 0 };
    timers.us = us > 0 ? Math.min(this.CAPTURE_DWELL_SECONDS + 2, timers.us + deltaTime) : 0;
    timers.opfor = opfor > 0 ? Math.min(this.CAPTURE_DWELL_SECONDS + 2, timers.opfor + deltaTime) : 0;
    this.dwellTimers.set(zoneId, timers);
    return timers;
  }

  getStateForOwner(owner: Faction | null): ZoneState {
    if (!owner) return ZoneState.NEUTRAL;
    return isBlufor(owner) ? ZoneState.US_CONTROLLED : ZoneState.OPFOR_CONTROLLED;
  }

  calculateTicketBleedRate(zones: Map<string, CaptureZone>): { us: number; opfor: number } {
    let usBleed = 0;
    let opforBleed = 0;

    const capturedZones = Array.from(zones.values()).filter(z => !z.isHomeBase && z.owner !== null);
    const usZones = capturedZones.filter(z => z.owner === Faction.US).length;
    const opforZones = capturedZones.filter(z => z.owner !== null && isOpfor(z.owner)).length;

    // Majority holder causes ticket bleed for opponent
    if (usZones > opforZones) {
      opforBleed = (usZones - opforZones) * 0.5; // 0.5 tickets per second per zone advantage
    } else if (opforZones > usZones) {
      usBleed = (opforZones - usZones) * 0.5;
    }

    return { us: usBleed, opfor: opforBleed };
  }
}
