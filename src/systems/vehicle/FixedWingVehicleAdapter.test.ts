import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FixedWingVehicleAdapter } from './FixedWingVehicleAdapter';
import { Faction } from '../combat/types';

function createMockModel() {
  return {
    getAircraftPositionTo: vi.fn((id: string, target: THREE.Vector3) => {
      target.set(100, 50, -200);
      return true;
    }),
    getAircraftQuaternionTo: vi.fn((id: string, target: THREE.Quaternion) => {
      target.identity();
      return true;
    }),
    getPhysics: vi.fn().mockReturnValue({
      getVelocity: () => new THREE.Vector3(30, 0, 0),
    }),
  } as any;
}

describe('FixedWingVehicleAdapter', () => {
  let adapter: FixedWingVehicleAdapter;

  beforeEach(() => {
    adapter = new FixedWingVehicleAdapter('fw1', 'A1_SKYRAIDER', Faction.US, createMockModel());
  });

  it('exposes a single pilot seat in the fixed_wing category', () => {
    expect(adapter.category).toBe('fixed_wing');
    const seats = adapter.getSeats();
    expect(seats.length).toBe(1);
    expect(seats[0].role).toBe('pilot');
  });

  it('boards one occupant and reports the seat as full', () => {
    expect(adapter.hasFreeSeats()).toBe(true);
    expect(adapter.hasFreeSeats('pilot')).toBe(true);

    const seatIndex = adapter.enterVehicle('player', 'pilot');
    expect(seatIndex).toBe(0);
    expect(adapter.getPilotId()).toBe('player');
    expect(adapter.hasFreeSeats()).toBe(false);

    // Second occupant is refused.
    expect(adapter.enterVehicle('npc1')).toBeNull();
  });

  it('exits the pilot and returns a valid world position', () => {
    adapter.enterVehicle('player');
    const exitPos = adapter.exitVehicle('player');
    expect(exitPos).not.toBeNull();
    expect(exitPos!.x).toBeDefined();
    expect(adapter.getPilotId()).toBeNull();
  });

  it('exposes position and velocity for the aircraft', () => {
    const pos = adapter.getPosition();
    expect(pos.x).toBe(100);
    const vel = adapter.getVelocity();
    expect(vel.x).toBe(30);
  });

  it('is not destroyed by default', () => {
    expect(adapter.isDestroyed()).toBe(false);
    expect(adapter.getHealthPercent()).toBe(100);
  });

  it('clears occupants on dispose', () => {
    adapter.enterVehicle('player');
    adapter.dispose();
    expect(adapter.getPilotId()).toBeNull();
  });
});
