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

  it('has correct category', () => {
    expect(adapter.category).toBe('fixed_wing');
  });

  it('has a pilot seat', () => {
    const seats = adapter.getSeats();
    expect(seats.length).toBe(1);
    expect(seats[0].role).toBe('pilot');
  });

  it('allows entering the pilot seat', () => {
    const seatIndex = adapter.enterVehicle('player', 'pilot');
    expect(seatIndex).toBe(0);
    expect(adapter.getPilotId()).toBe('player');
  });

  it('returns null when all seats are occupied', () => {
    adapter.enterVehicle('player');
    const result = adapter.enterVehicle('npc1');
    expect(result).toBeNull();
  });

  it('exits and returns a world position', () => {
    adapter.enterVehicle('player');
    const exitPos = adapter.exitVehicle('player');
    expect(exitPos).not.toBeNull();
    expect(exitPos!.x).toBeDefined();
    expect(adapter.getPilotId()).toBeNull();
  });

  it('reports free seats correctly', () => {
    expect(adapter.hasFreeSeats()).toBe(true);
    expect(adapter.hasFreeSeats('pilot')).toBe(true);
    adapter.enterVehicle('player');
    expect(adapter.hasFreeSeats()).toBe(false);
  });

  it('returns position from model', () => {
    const pos = adapter.getPosition();
    expect(pos.x).toBe(100);
  });

  it('returns velocity from physics', () => {
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
