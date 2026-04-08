import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFixedWingPilotCommand, createIdleFixedWingPilotIntent } from './FixedWingControlLaw';
import { FixedWingPhysics } from './FixedWingPhysics';
import { FIXED_WING_CONFIGS } from './FixedWingConfigs';
import { buildOrbitAnchorFromHeading } from './FixedWingOperations';

function flatTerrain() {
  return { height: 0, normal: new THREE.Vector3(0, 1, 0) };
}

function makeAirbornePhysics(config: (typeof FIXED_WING_CONFIGS)[keyof typeof FIXED_WING_CONFIGS]['physics']) {
  const fw = new FixedWingPhysics(new THREE.Vector3(0, 600, 0), config);
  fw.getVelocity().set(0, 0, -config.v2Speed * 1.2);
  fw.update(1 / 60, flatTerrain());
  return fw;
}

describe('FixedWingControlLaw', () => {
  it('buffers rotation demand until takeoff speed', () => {
    const cfg = FIXED_WING_CONFIGS.A1_SKYRAIDER;
    const intent = {
      ...createIdleFixedWingPilotIntent(),
      throttleTarget: 1,
      pitchIntent: 1,
      assistEnabled: true,
    };

    const command = buildFixedWingPilotCommand({
      phase: 'ground_roll',
      airspeed: cfg.physics.vrSpeed * 0.7,
      forwardAirspeed: cfg.physics.vrSpeed * 0.7,
      verticalSpeed: 0,
      altitude: cfg.physics.gearClearance,
      altitudeAGL: 0,
      aoaDeg: 0,
      sideslipDeg: 0,
      headingDeg: 90,
      pitchDeg: 0,
      rollDeg: 0,
      pitchRateDeg: 0,
      rollRateDeg: 0,
      throttle: 1,
      brake: 0,
      weightOnWheels: true,
      isStalled: false,
    }, cfg.physics, cfg.pilotProfile, intent);

    expect(command.pitchCommand).toBe(0);
    expect(command.rollCommand).toBe(0);
  });

  it('takes off and climbs cleanly in trainer assisted mode', () => {
    const cfg = FIXED_WING_CONFIGS.A1_SKYRAIDER;
    const fw = new FixedWingPhysics(new THREE.Vector3(0, cfg.physics.gearClearance, 0), cfg.physics);
    let peakAltitude = 0;

    for (let i = 0; i < 1600; i++) {
      const snapshot = fw.getFlightSnapshot();
      const shouldRotate = snapshot.airspeed >= cfg.physics.vrSpeed * 0.92;
      const intent = {
        ...createIdleFixedWingPilotIntent(),
        throttleTarget: 1,
        pitchIntent: shouldRotate ? 1 : 0,
        assistEnabled: true,
      };

      fw.setCommand(buildFixedWingPilotCommand(snapshot, cfg.physics, cfg.pilotProfile, intent));
      fw.update(1 / 60, flatTerrain());
      peakAltitude = Math.max(peakAltitude, fw.getFlightSnapshot().altitudeAGL);
    }

    const finalSnapshot = fw.getFlightSnapshot();
    expect(peakAltitude).toBeGreaterThan(50);
    expect(finalSnapshot.isStalled).toBe(false);
    expect(finalSnapshot.weightOnWheels).toBe(false);
  });

  it('recenters from a fast-jet bank after intent release', () => {
    const cfg = FIXED_WING_CONFIGS.F4_PHANTOM;
    const fw = makeAirbornePhysics(cfg.physics);

    for (let i = 0; i < 180; i++) {
      const snapshot = fw.getFlightSnapshot();
      const intent = {
        ...createIdleFixedWingPilotIntent(),
        throttleTarget: 0.9,
        bankIntent: 1,
        assistEnabled: true,
      };
      fw.setCommand(buildFixedWingPilotCommand(snapshot, cfg.physics, cfg.pilotProfile, intent));
      fw.update(1 / 60, flatTerrain());
    }

    for (let i = 0; i < 120; i++) {
      const snapshot = fw.getFlightSnapshot();
      const intent = {
        ...createIdleFixedWingPilotIntent(),
        throttleTarget: 0.9,
        assistEnabled: true,
      };
      fw.setCommand(buildFixedWingPilotCommand(snapshot, cfg.physics, cfg.pilotProfile, intent));
      fw.update(1 / 60, flatTerrain());
    }

    const finalSnapshot = fw.getFlightSnapshot();
    expect(Math.abs(finalSnapshot.rollDeg)).toBeLessThan(10);
    expect(finalSnapshot.weightOnWheels).toBe(false);
  });

  it('holds a stable airborne gunship orbit with orbit intent enabled', () => {
    const cfg = FIXED_WING_CONFIGS.AC47_SPOOKY;
    const orbitRadius = cfg.operation.orbitRadius ?? 650;
    const fw = makeAirbornePhysics(cfg.physics);
    const initialPosition = fw.getPosition().clone();
    const initialHeadingRad = THREE.MathUtils.degToRad(fw.getFlightSnapshot().headingDeg);
    const anchor = buildOrbitAnchorFromHeading(
      initialPosition,
      initialHeadingRad,
      orbitRadius,
      cfg.operation.orbitTurnDirection ?? -1,
    );

    for (let i = 0; i < 360; i++) {
      const snapshot = fw.getFlightSnapshot();
      const intent = {
        ...createIdleFixedWingPilotIntent(),
        throttleTarget: 0.78,
        assistEnabled: true,
        orbitHoldEnabled: true,
        orbitCenterX: anchor.centerX,
        orbitCenterZ: anchor.centerZ,
        orbitRadius,
        orbitBankDeg: cfg.operation.orbitBankDeg ?? 16,
        orbitTurnDirection: cfg.operation.orbitTurnDirection ?? -1,
      };

      fw.setCommand(buildFixedWingPilotCommand(
        snapshot,
        cfg.physics,
        cfg.pilotProfile,
        intent,
        { positionX: fw.getPosition().x, positionZ: fw.getPosition().z },
      ));
      fw.update(1 / 60, flatTerrain());
    }

    const finalSnapshot = fw.getFlightSnapshot();
    const finalPosition = fw.getPosition();
    const radius = Math.hypot(finalPosition.x - anchor.centerX, finalPosition.z - anchor.centerZ);
    expect(finalSnapshot.weightOnWheels).toBe(false);
    expect(finalSnapshot.isStalled).toBe(false);
    expect(Math.abs(finalSnapshot.rollDeg)).toBeGreaterThan(5);
    expect(Math.abs(radius - orbitRadius)).toBeLessThan(orbitRadius * 0.35);
  });
});
