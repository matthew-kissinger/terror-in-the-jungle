import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { NPCFlightController, buildAirSupportMission } from './NPCFlightController';
import { FIXED_WING_CONFIGS } from '../vehicle/FixedWingConfigs';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('NPCFlightController', () => {
  let fc: NPCFlightController;
  let aircraft: THREE.Group;
  const startPos = new THREE.Vector3(0, 100, -500);
  const spookyConfig = FIXED_WING_CONFIGS.AC47_SPOOKY.physics;

  beforeEach(() => {
    aircraft = new THREE.Group();
    fc = new NPCFlightController(aircraft, startPos, spookyConfig);
  });

  it('starts in idle state', () => {
    expect(fc.getState()).toBe('idle');
  });

  it('transitions to takeoff when mission set', () => {
    const mission = buildAirSupportMission(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      300, 40, 'orbit',
    );
    fc.setMission(mission);
    expect(fc.getState()).toBe('takeoff');
  });

  it('update moves the aircraft via physics', () => {
    const mission = buildAirSupportMission(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      300, 40, 'orbit',
    );
    fc.setMission(mission);

    const posBefore = fc.getPosition().clone();
    // Run several physics steps
    for (let i = 0; i < 100; i++) {
      fc.update(0.016, 0);
    }
    const posAfter = fc.getPosition();

    // Aircraft should have moved
    expect(posAfter.distanceTo(posBefore)).toBeGreaterThan(1);
  });

  it('syncs aircraft mesh to physics state', () => {
    const mission = buildAirSupportMission(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      300, 40, 'orbit',
    );
    fc.setMission(mission);

    fc.update(0.1, 0);

    // Aircraft mesh position should match physics position
    const physPos = fc.getPosition();
    expect(aircraft.position.x).toBeCloseTo(physPos.x, 2);
    expect(aircraft.position.y).toBeCloseTo(physPos.y, 2);
    expect(aircraft.position.z).toBeCloseTo(physPos.z, 2);
  });

  it('isMissionComplete returns true when idle', () => {
    expect(fc.isMissionComplete()).toBe(true);

    const mission = buildAirSupportMission(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      300, 40, 'orbit',
    );
    fc.setMission(mission);
    expect(fc.isMissionComplete()).toBe(false);
  });

  it('dispose clears mission', () => {
    const mission = buildAirSupportMission(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      300, 40, 'orbit',
    );
    fc.setMission(mission);
    fc.dispose();
    expect(fc.getState()).toBe('idle');
  });
});

describe('buildAirSupportMission', () => {
  it('creates orbit mission with orbitPoint', () => {
    const target = new THREE.Vector3(100, 0, 200);
    const mission = buildAirSupportMission(
      target,
      new THREE.Vector3(0, 0, 1),
      300, 40, 'orbit',
    );

    expect(mission.waypoints).toHaveLength(1);
    expect(mission.cruiseAltitude).toBe(300);
    expect(mission.cruiseSpeed).toBe(40);
    expect(mission.orbitPoint).toBeDefined();
    expect(mission.orbitPoint!.x).toBe(100);
    expect(mission.orbitRadius).toBe(200);
  });

  it('creates attack_run mission with attackTarget', () => {
    const target = new THREE.Vector3(100, 0, 200);
    const mission = buildAirSupportMission(
      target,
      new THREE.Vector3(0, 0, 1),
      80, 60, 'attack_run',
    );

    expect(mission.attackTarget).toBeDefined();
    expect(mission.attackTarget!.x).toBe(100);
    expect(mission.orbitPoint).toBeUndefined();
  });

  it('creates flyover mission with no orbit or attack target', () => {
    const target = new THREE.Vector3(100, 0, 200);
    const mission = buildAirSupportMission(
      target,
      new THREE.Vector3(0, 0, 1),
      200, 50, 'flyover',
    );

    expect(mission.orbitPoint).toBeUndefined();
    expect(mission.attackTarget).toBeUndefined();
    expect(mission.waypoints).toHaveLength(1);
  });

  it('uses custom home position when provided', () => {
    const home = new THREE.Vector3(-500, 0, -500);
    const mission = buildAirSupportMission(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      300, 40, 'orbit',
      home,
    );

    expect(mission.homePosition.x).toBe(-500);
    expect(mission.homePosition.z).toBe(-500);
  });

  it('defaults home position to start of approach', () => {
    const mission = buildAirSupportMission(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      300, 40, 'orbit',
    );

    // Start pos should be target + (-approach * 500)
    expect(mission.homePosition.z).toBe(-500);
  });
});
