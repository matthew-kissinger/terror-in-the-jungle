import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZoneCaptureLogic } from './ZoneCaptureLogic';
import { CaptureZone, ZoneState } from './ZoneManager';
import { Faction } from '../combat/types';

function createZone(): CaptureZone {
  return {
    id: 'zone_test',
    name: 'Test Zone',
    position: new THREE.Vector3(0, 0, 0),
    radius: 20,
    height: 20,
    owner: null,
    state: ZoneState.NEUTRAL,
    captureProgress: 0,
    captureSpeed: 1,
    currentFlagHeight: 0,
    isHomeBase: false,
    ticketBleedRate: 1
  };
}

describe('ZoneCaptureLogic', () => {
  it('requires dwell time before neutral capture begins', () => {
    const logic = new ZoneCaptureLogic();
    const zone = createZone();

    // Dwell is 1.0s - progress should be zero while dwell timer hasn't been met
    logic.updateZoneCaptureState(zone, { us: 1, opfor: 0 }, 0.4);
    expect(zone.captureProgress).toBe(0);

    logic.updateZoneCaptureState(zone, { us: 1, opfor: 0 }, 0.4);
    expect(zone.captureProgress).toBe(0);

    // After dwell threshold crossed (0.4+0.4+0.4 = 1.2s > 1.0s), progress begins
    logic.updateZoneCaptureState(zone, { us: 1, opfor: 0 }, 0.4);
    expect(zone.captureProgress).toBeGreaterThan(0);
  });

  it('applies tug-of-war pressure with net advantage while contested', () => {
    const logic = new ZoneCaptureLogic();
    const zone = createZone();

    for (let i = 0; i < 4; i++) {
      logic.updateZoneCaptureState(zone, { us: 4, opfor: 3 }, 1.0);
    }

    expect(zone.state).toBe(ZoneState.CONTESTED);
    expect(zone.captureProgress).toBeGreaterThan(0);

    // Sustained opposite advantage should eventually reverse and capture for OPFOR.
    for (let i = 0; i < 30; i++) {
      logic.updateZoneCaptureState(zone, { us: 1, opfor: 5 }, 1.0);
    }
    expect(zone.owner).toBe(Faction.OPFOR);
    expect([ZoneState.OPFOR_CONTROLLED, ZoneState.CONTESTED]).toContain(zone.state);
  });

  it('can neutralize and fully takeover owned zone when attackers hold advantage', () => {
    const logic = new ZoneCaptureLogic();
    const zone = createZone();
    zone.owner = Faction.US;
    zone.state = ZoneState.US_CONTROLLED;
    zone.captureProgress = 100;
    zone.captureSpeed = 10;

    for (let i = 0; i < 15; i++) {
      logic.updateZoneCaptureState(zone, { us: 0, opfor: 3 }, 1.0);
    }

    expect(zone.owner).toBe(Faction.OPFOR);
    expect(zone.state).toBe(ZoneState.OPFOR_CONTROLLED);
    expect(zone.captureProgress).toBe(100);
  });
});
