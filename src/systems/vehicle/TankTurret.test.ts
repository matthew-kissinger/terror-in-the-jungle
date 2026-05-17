/**
 * Behavior tests for `TankTurret` (cycle-vekhikl-4-tank-turret-and-cannon R1).
 *
 * Per docs/TESTING.md these assert observable outcomes (yaw / pitch
 * advance, slew capping, mechanical envelope, world-space barrel
 * direction respecting chassis + turret + barrel rotations) — not
 * specific tuning constants, scratch-allocation patterns, or private
 * field names. The default M48 slew rates and pitch envelope are part
 * of the public contract (`getSlewRates`, `getPitchLimits`), not
 * hardcoded constants the test re-asserts.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TankTurret } from './TankTurret';

const DEG = Math.PI / 180;

function makeChassis(): THREE.Object3D {
  const scene = new THREE.Scene();
  const chassis = new THREE.Object3D();
  scene.add(chassis);
  return chassis;
}

describe('TankTurret', () => {
  describe('construction + scene-graph wiring', () => {
    it('parents the turret rig as a child of the chassis on construct', () => {
      const chassis = makeChassis();
      expect(chassis.children).toHaveLength(0);
      const turret = new TankTurret(chassis);
      // Yaw node is direct child of chassis; pitch node is grandchild.
      expect(chassis.children).toHaveLength(1);
      expect(turret.getYawNode().parent).toBe(chassis);
      expect(turret.getPitchNode().parent).toBe(turret.getYawNode());
    });

    it('reports unconstrained yaw (null limits) by default', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis);
      expect(turret.getYawLimits()).toBeNull();
    });

    it('exposes pitch limits and slew rates as part of the public contract', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis);
      const limits = turret.getPitchLimits();
      // Mechanical envelope per the cycle brief — interface guarantee,
      // not a private tuning constant.
      expect(limits.min).toBeCloseTo(-10 * DEG, 5);
      expect(limits.max).toBeCloseTo(20 * DEG, 5);
      const rates = turret.getSlewRates();
      expect(rates.yaw).toBeGreaterThan(0);
      expect(rates.pitch).toBeGreaterThan(0);
    });

    it('removes its nodes from the chassis on dispose', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis);
      expect(chassis.children).toHaveLength(1);
      turret.dispose();
      expect(chassis.children).toHaveLength(0);
    });

    it('is a no-op when update is called after dispose', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis);
      turret.setTargetYaw(45 * DEG);
      turret.dispose();
      turret.update(1.0);
      // Slewed state never advances after dispose.
      expect(turret.getYaw()).toBe(0);
    });

    it('does not advance aim when dt is zero or negative', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis);
      turret.setTargetYaw(45 * DEG);
      turret.setTargetPitch(15 * DEG);
      turret.update(0);
      expect(turret.getYaw()).toBe(0);
      expect(turret.getPitch()).toBe(0);
      turret.update(-0.1);
      expect(turret.getYaw()).toBe(0);
      expect(turret.getPitch()).toBe(0);
    });
  });

  describe('slew capping', () => {
    it('caps yaw movement at the configured slew rate over a single tick (target far away → ramp not jump)', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis, { yawSlewRate: 90 * DEG });

      // Request a 170° swing in 0.1 s — without capping the turret would
      // jump straight there; with the 90°/s cap it must travel exactly 9°.
      turret.setTargetYaw(170 * DEG);
      turret.update(0.1);
      expect(turret.getYaw()).toBeCloseTo(9 * DEG, 5);

      // Still far from target — another short tick advances another 9°.
      turret.update(0.1);
      expect(turret.getYaw()).toBeCloseTo(18 * DEG, 5);
    });

    it('caps barrel pitch movement at the configured slew rate', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis, {
        barrelPitchSlewRate: 10 * DEG,
        pitchLimits: { min: -30 * DEG, max: 30 * DEG },
      });

      turret.setTargetPitch(20 * DEG);
      turret.update(0.5); // 10°/s × 0.5s = 5°
      expect(turret.getPitch()).toBeCloseTo(5 * DEG, 5);
    });

    it('arrives at the requested target when given enough time', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis, {
        yawSlewRate: 60 * DEG,
        barrelPitchSlewRate: 30 * DEG,
        pitchLimits: { min: -30 * DEG, max: 30 * DEG },
      });

      turret.setTargetYaw(30 * DEG);
      turret.setTargetPitch(15 * DEG);
      turret.update(2.0);
      expect(turret.getYaw()).toBeCloseTo(30 * DEG, 5);
      expect(turret.getPitch()).toBeCloseTo(15 * DEG, 5);
    });
  });

  describe('pitch envelope clamping', () => {
    it('clamps pitch requests above the maximum (+20° default) into the envelope', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis, {
        barrelPitchSlewRate: 1000 * DEG, // make slew effectively instant
      });

      // Request way above the +20° max.
      turret.setTargetPitch(60 * DEG);
      turret.update(1.0);
      expect(turret.getPitch()).toBeCloseTo(20 * DEG, 5);
    });

    it('clamps pitch requests below the minimum (-10° default) into the envelope', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis, {
        barrelPitchSlewRate: 1000 * DEG,
      });

      turret.setTargetPitch(-45 * DEG);
      turret.update(1.0);
      expect(turret.getPitch()).toBeCloseTo(-10 * DEG, 5);
    });

    it('reports the target after clamping (not the raw requested value)', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis);
      turret.setTargetPitch(90 * DEG);
      expect(turret.getTargetPitch()).toBeCloseTo(20 * DEG, 5);
      turret.setTargetPitch(-90 * DEG);
      expect(turret.getTargetPitch()).toBeCloseTo(-10 * DEG, 5);
    });
  });

  describe('yaw unconstrained wrap-around', () => {
    it('accepts any yaw target (full 360° traverse)', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis, { yawSlewRate: 1000 * DEG });

      turret.setTargetYaw(170 * DEG);
      turret.update(1.0);
      expect(turret.getYaw()).toBeCloseTo(170 * DEG, 5);
    });

    it('slews along the shortest angular path (rear quadrant → reverse direction)', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis, { yawSlewRate: 90 * DEG });

      // Start at yaw = +170°. A target of -170° is geometrically 20° away
      // (going through ±180°), not 340° away.
      turret.setTargetYaw(170 * DEG);
      turret.update(10); // converge
      expect(turret.getYaw()).toBeCloseTo(170 * DEG, 5);

      // Request -170°. With 20° to go and 90°/s cap, 0.1 s travels 9°.
      turret.setTargetYaw(-170 * DEG);
      turret.update(0.1);

      // Shortest-path angular distance from current to target after the
      // step should be 20° − 9° = 11° (within rounding).
      const y = turret.getYaw();
      const target = -170 * DEG;
      let diff = target - y;
      // Wrap diff to (-PI, PI].
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff <= -Math.PI) diff += 2 * Math.PI;
      const distToTarget = Math.abs(diff);
      expect(distToTarget).toBeLessThan(12 * DEG);
      expect(distToTarget).toBeGreaterThan(10 * DEG);
    });

    it('wraps current yaw to (-π, π] after each slew step', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis, { yawSlewRate: 1000 * DEG });
      // Request a target deep in the negative half-circle.
      turret.setTargetYaw(-3 * Math.PI); // -540°
      turret.update(10);
      const y = turret.getYaw();
      expect(y).toBeGreaterThan(-Math.PI);
      expect(y).toBeLessThanOrEqual(Math.PI);
      // -540° wraps to +180° in (-π, π] (since -180° is excluded).
      expect(Math.abs(y)).toBeCloseTo(Math.PI, 3);
    });
  });

  describe('barrel world-space transform composition', () => {
    /**
     * Helper: world-space forward of the chassis is local -Z transformed
     * by chassis quaternion. The barrel direction we get from the turret
     * should equal: rotate chassis-forward by (turret-yaw around Y) then
     * by (barrel-pitch around X). We test composition of all three.
     */

    it('reports barrel direction along chassis-forward when turret is zeroed', () => {
      const chassis = makeChassis();
      // Chassis yaws 90° around Y → chassis-forward (-Z local) points along -X world.
      chassis.rotation.set(0, Math.PI * 0.5, 0);
      chassis.updateMatrixWorld(true);

      const turret = new TankTurret(chassis);
      turret.update(0.016); // commits identity rotation to the rig
      chassis.updateMatrixWorld(true);

      const dir = turret.getBarrelDirectionWorld(new THREE.Vector3());
      // Chassis +Y rotation of 90° rotates local -Z onto world -X.
      expect(dir.x).toBeCloseTo(-1, 4);
      expect(dir.y).toBeCloseTo(0, 4);
      expect(dir.z).toBeCloseTo(0, 4);
    });

    it('rotates barrel direction by turret yaw on top of chassis yaw', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis, { yawSlewRate: 1000 * DEG });

      // Chassis identity; turret turns 90° left (CCW around +Y).
      turret.setTargetYaw(Math.PI * 0.5);
      turret.update(1.0);
      chassis.updateMatrixWorld(true);

      const dir = turret.getBarrelDirectionWorld(new THREE.Vector3());
      // Local-Z forward (-1 along Z) rotated +90° around Y → -X in world.
      expect(dir.x).toBeCloseTo(-1, 4);
      expect(dir.y).toBeCloseTo(0, 4);
      expect(dir.z).toBeCloseTo(0, 4);
    });

    it('lifts barrel direction upward when pitch is positive (elevation)', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis, { barrelPitchSlewRate: 1000 * DEG });

      // No chassis yaw; barrel elevates +15°.
      turret.setTargetPitch(15 * DEG);
      turret.update(1.0);
      chassis.updateMatrixWorld(true);

      const dir = turret.getBarrelDirectionWorld(new THREE.Vector3());
      // Local -Z rotated by +15° around X: x stays 0, y = sin(15°), z = -cos(15°).
      expect(dir.x).toBeCloseTo(0, 4);
      expect(dir.y).toBeCloseTo(Math.sin(15 * DEG), 4);
      expect(dir.z).toBeCloseTo(-Math.cos(15 * DEG), 4);
    });

    it('composes chassis yaw + turret yaw + barrel pitch into barrel direction', () => {
      const chassis = makeChassis();
      chassis.rotation.set(0, Math.PI * 0.5, 0); // chassis facing world -X
      chassis.updateMatrixWorld(true);

      const turret = new TankTurret(chassis, {
        yawSlewRate: 1000 * DEG,
        barrelPitchSlewRate: 1000 * DEG,
      });
      turret.setTargetYaw(Math.PI * 0.5); // turret turns another +90° relative to chassis
      turret.setTargetPitch(10 * DEG); // elevation
      turret.update(1.0);
      chassis.updateMatrixWorld(true);

      const dir = turret.getBarrelDirectionWorld(new THREE.Vector3());
      // Total yaw = chassis +90° + turret +90° = +180°, so chassis-forward
      // (-Z local) becomes +Z world. Pitch +10° rotates around the X axis
      // of the post-yaw frame (which is now world -X), so the elevated
      // direction lifts Y up and keeps the Z magnitude as cos(10°).
      // Direction vector: (0, sin(10°), +cos(10°)).
      expect(dir.x).toBeCloseTo(0, 4);
      expect(dir.y).toBeCloseTo(Math.sin(10 * DEG), 4);
      expect(dir.z).toBeCloseTo(Math.cos(10 * DEG), 4);
    });

    it('places the barrel tip world-position consistent with chassis + turret + pitch', () => {
      const chassis = makeChassis();
      chassis.position.set(100, 5, -50);
      chassis.updateMatrixWorld(true);

      const turret = new TankTurret(chassis, {
        yawNodeLocalOffset: new THREE.Vector3(0, 2, 0),
        pitchNodeLocalOffset: new THREE.Vector3(0, 0, 0),
        barrelTipLocalOffset: new THREE.Vector3(0, 0, -5),
      });
      // Identity rig: barrel tip is (0, 0, -5) in pitchNode-local, which
      // is (0, 2, -5) in chassis-local (yawNode raised 2 m), which is
      // (100, 7, -55) in world.
      turret.update(0.016);
      chassis.updateMatrixWorld(true);

      const tip = turret.getBarrelTipWorldPosition(new THREE.Vector3());
      expect(tip.x).toBeCloseTo(100, 4);
      expect(tip.y).toBeCloseTo(7, 4);
      expect(tip.z).toBeCloseTo(-55, 4);
    });

    it('writes to the caller-provided target vector and returns it', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis);
      const out = new THREE.Vector3(99, 99, 99);
      const returned = turret.getBarrelTipWorldPosition(out);
      expect(returned).toBe(out);
      expect(out.x === 99 && out.y === 99 && out.z === 99).toBe(false);
    });
  });

  describe('aim targets', () => {
    it('exposes the requested target separately from the current angle', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis);
      turret.setTargetYaw(45 * DEG);
      turret.setTargetPitch(10 * DEG);
      expect(turret.getTargetYaw()).toBeCloseTo(45 * DEG, 5);
      expect(turret.getTargetPitch()).toBeCloseTo(10 * DEG, 5);
      // Without an update, current angles haven't moved.
      expect(turret.getYaw()).toBe(0);
      expect(turret.getPitch()).toBe(0);
    });
  });

  describe('jammed state (R2, tank-damage-states)', () => {
    it('ignores setTargetYaw / setTargetPitch while jammed and resumes after unjam', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis, {
        yawSlewRate: 1000 * DEG,
        barrelPitchSlewRate: 1000 * DEG,
      });

      // Set a clear initial target and let it settle.
      turret.setTargetYaw(30 * DEG);
      turret.setTargetPitch(10 * DEG);
      turret.update(1.0);
      expect(turret.getYaw()).toBeCloseTo(30 * DEG, 5);
      expect(turret.getPitch()).toBeCloseTo(10 * DEG, 5);

      // Jam, then request a wildly different aim. Targets should not advance.
      turret.setJammed(true);
      expect(turret.isJammed()).toBe(true);
      turret.setTargetYaw(-120 * DEG);
      turret.setTargetPitch(-9 * DEG);
      expect(turret.getTargetYaw()).toBeCloseTo(30 * DEG, 5);
      expect(turret.getTargetPitch()).toBeCloseTo(10 * DEG, 5);

      // Slewing settles toward the last target (already there) — barrel stays put.
      turret.update(1.0);
      expect(turret.getYaw()).toBeCloseTo(30 * DEG, 5);
      expect(turret.getPitch()).toBeCloseTo(10 * DEG, 5);

      // Unjam, request a new target — slewing resumes from current pose.
      turret.setJammed(false);
      expect(turret.isJammed()).toBe(false);
      turret.setTargetYaw(-30 * DEG);
      turret.setTargetPitch(0);
      turret.update(1.0);
      expect(turret.getYaw()).toBeCloseTo(-30 * DEG, 5);
      expect(turret.getPitch()).toBeCloseTo(0, 5);
    });

    it('preserves the current pose when jammed (does not zero the barrel)', () => {
      const chassis = makeChassis();
      const turret = new TankTurret(chassis, {
        yawSlewRate: 1000 * DEG,
        barrelPitchSlewRate: 1000 * DEG,
      });
      turret.setTargetYaw(45 * DEG);
      turret.setTargetPitch(15 * DEG);
      turret.update(1.0);
      const yawBefore = turret.getYaw();
      const pitchBefore = turret.getPitch();

      turret.setJammed(true);
      // Many update ticks while jammed — pose must not drift.
      for (let i = 0; i < 60; i += 1) turret.update(0.05);

      expect(turret.getYaw()).toBeCloseTo(yawBefore, 5);
      expect(turret.getPitch()).toBeCloseTo(pitchBefore, 5);
    });
  });
});
