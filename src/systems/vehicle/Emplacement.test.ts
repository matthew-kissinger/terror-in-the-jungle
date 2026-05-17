import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Faction } from '../combat/types';
import { Emplacement } from './Emplacement';

const DEG = Math.PI / 180;

/**
 * Behavior tests for `Emplacement` (cycle-vekhikl-2-stationary-weapons R1).
 *
 * Per docs/TESTING.md we assert observable behavior — seat occupancy, barrel
 * orientation outcomes, slew clamping — not internal field names or specific
 * tuning constants. The default M2HB pitch envelope (-10°/+60°) is treated as
 * an interface guarantee (it ships in the public `getPitchLimits()`), not a
 * private constant.
 */
describe('Emplacement', () => {
  function makeRig() {
    const scene = new THREE.Scene();
    const tripod = new THREE.Object3D();
    tripod.position.set(0, 0, 0);
    scene.add(tripod);
    return { scene, tripod };
  }

  describe('IVehicle identity', () => {
    it('reports the emplacement category and configured faction', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_1', tripod, Faction.US);
      expect(emp.category).toBe('emplacement');
      expect(emp.faction).toBe(Faction.US);
    });

    it('is stationary: position tracks the placed object, velocity is zero', () => {
      const { tripod } = makeRig();
      tripod.position.set(12, 4, -7);
      const emp = new Emplacement('m2hb_2', tripod, Faction.OPFOR);

      expect(emp.getPosition().toArray()).toEqual([12, 4, -7]);
      expect(emp.getVelocity().length()).toBe(0);
      expect(emp.getHealthPercent()).toBe(1);
    });

    it('returns a fresh velocity vector each call so callers can mutate safely', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_3', tripod);
      const v1 = emp.getVelocity();
      v1.set(99, 99, 99);
      const v2 = emp.getVelocity();
      expect(v2.length()).toBe(0);
    });
  });

  describe('seating', () => {
    it('seats a player as gunner and reports the gunner as the pilot-equivalent', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_seat', tripod, Faction.US);

      expect(emp.hasFreeSeats('gunner')).toBe(true);
      expect(emp.enterVehicle('player', 'gunner')).toBe(0);
      expect(emp.getPilotId()).toBe('player');
      expect(emp.hasFreeSeats('gunner')).toBe(false);
      expect(emp.hasFreeSeats('passenger')).toBe(true);
    });

    it('accepts an ammo-handler passenger independently of the gunner seat', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_twoseat', tripod);

      expect(emp.enterVehicle('npc_ammo', 'passenger')).toBe(1);
      expect(emp.getOccupant(1)).toBe('npc_ammo');
      expect(emp.getPilotId()).toBeNull(); // no gunner yet

      expect(emp.enterVehicle('player', 'gunner')).toBe(0);
      expect(emp.getPilotId()).toBe('player');
    });

    it('refuses to seat a third occupant when both seats are full', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_full', tripod);

      emp.enterVehicle('a');
      emp.enterVehicle('b');
      expect(emp.enterVehicle('c')).toBeNull();
    });

    it('exits an occupant and returns a world-space exit position offset from the tripod', () => {
      const { tripod } = makeRig();
      tripod.position.set(10, 0, 5);
      const emp = new Emplacement('m2hb_exit', tripod);

      emp.enterVehicle('player', 'gunner');
      const exit = emp.exitVehicle('player');
      expect(exit).not.toBeNull();
      // Default gunner exit offset is (0, 0, -1.8); position is (10, 0, 5).
      expect(exit!.toArray()).toEqual([10, 0, 3.2]);
      expect(emp.getPilotId()).toBeNull();
      expect(emp.hasFreeSeats('gunner')).toBe(true);
    });

    it('returns null when exiting an occupant who was never seated', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_noexit', tripod);
      expect(emp.exitVehicle('ghost')).toBeNull();
    });
  });

  describe('barrel aim slew', () => {
    it('walks the barrel toward the target aim and arrives when given enough time', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_aim', tripod);

      emp.setAim(45 * DEG, 20 * DEG);
      // Default slew is 80°/s yaw, 60°/s pitch; one second is enough for both.
      emp.update(1.0);
      expect(emp.getYaw()).toBeCloseTo(45 * DEG, 5);
      expect(emp.getPitch()).toBeCloseTo(20 * DEG, 5);
    });

    it('caps angular velocity at the configured slew rates over a single tick', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_cap', tripod, Faction.US, {
        config: { yawSlewRate: 90 * DEG, pitchSlewRate: 30 * DEG },
      });

      // Request a huge swing in 0.1 s: yaw should travel 9°, pitch 3°.
      emp.setAim(180 * DEG, 60 * DEG);
      emp.update(0.1);
      expect(emp.getYaw()).toBeCloseTo(9 * DEG, 5);
      expect(emp.getPitch()).toBeCloseTo(3 * DEG, 5);
    });

    it('clamps pitch requests into the mechanical envelope', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_pitch', tripod, Faction.US, {
        config: {
          pitchLimits: { min: -10 * DEG, max: 60 * DEG },
          pitchSlewRate: 1000 * DEG, // make the slew instant for this assertion
        },
      });

      emp.setAim(0, 90 * DEG);
      emp.update(1.0);
      expect(emp.getPitch()).toBeCloseTo(60 * DEG, 5);

      emp.setAim(0, -45 * DEG);
      emp.update(1.0);
      expect(emp.getPitch()).toBeCloseTo(-10 * DEG, 5);
    });

    it('honors a limited yaw arc when configured (e.g. sandbag emplacement)', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_arc', tripod, Faction.US, {
        config: {
          yawLimits: { min: -45 * DEG, max: 45 * DEG },
          yawSlewRate: 1000 * DEG,
        },
      });

      emp.setAim(120 * DEG, 0);
      emp.update(1.0);
      expect(emp.getYaw()).toBeCloseTo(45 * DEG, 5);

      emp.setAim(-120 * DEG, 0);
      emp.update(1.0);
      expect(emp.getYaw()).toBeCloseTo(-45 * DEG, 5);
    });

    it('allows full 360° traverse when yawLimits is null (default)', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_360', tripod, Faction.US, {
        config: { yawLimits: null, yawSlewRate: 1000 * DEG },
      });
      emp.setAim(170 * DEG, 0);
      emp.update(1.0);
      expect(emp.getYaw()).toBeCloseTo(170 * DEG, 5);
    });

    it('writes the slewed angles into the rig nodes when they are supplied', () => {
      const { tripod } = makeRig();
      const yawNode = new THREE.Object3D();
      const pitchNode = new THREE.Object3D();
      tripod.add(yawNode);
      yawNode.add(pitchNode);

      const emp = new Emplacement('m2hb_rig', tripod, Faction.US, {
        yawNode,
        pitchNode,
        config: { yawSlewRate: 1000 * DEG, pitchSlewRate: 1000 * DEG },
      });

      emp.setAim(30 * DEG, 15 * DEG);
      emp.update(1.0);

      expect(yawNode.rotation.y).toBeCloseTo(30 * DEG, 5);
      expect(pitchNode.rotation.x).toBeCloseTo(15 * DEG, 5);
    });

    it('does not throw when no rig nodes are supplied (pure-data use)', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_norig', tripod);
      emp.setAim(10 * DEG, 5 * DEG);
      expect(() => emp.update(0.5)).not.toThrow();
    });

    it('does not advance aim when dt is zero or negative', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_dt0', tripod);
      emp.setAim(45 * DEG, 30 * DEG);

      emp.update(0);
      expect(emp.getYaw()).toBe(0);
      expect(emp.getPitch()).toBe(0);

      emp.update(-0.1);
      expect(emp.getYaw()).toBe(0);
    });

    it('exposes the requested target separately from the current angle', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_target', tripod);

      emp.setAim(45 * DEG, 10 * DEG);
      const target = emp.getTargetAim();
      expect(target.yaw).toBeCloseTo(45 * DEG, 5);
      expect(target.pitch).toBeCloseTo(10 * DEG, 5);

      // Without an update, the current angles haven't moved yet.
      expect(emp.getYaw()).toBe(0);
    });
  });

  describe('lifecycle', () => {
    it('removes the tripod from the scene on dispose and reports destroyed', () => {
      const { scene, tripod } = makeRig();
      const emp = new Emplacement('m2hb_dispose', tripod);

      expect(scene.children).toHaveLength(1);
      emp.dispose();
      expect(scene.children).toHaveLength(0);
      expect(emp.isDestroyed()).toBe(true);
      expect(emp.getHealthPercent()).toBe(0);
    });

    it('ignores update calls after dispose', () => {
      const { tripod } = makeRig();
      const emp = new Emplacement('m2hb_post', tripod);
      emp.setAim(45 * DEG, 10 * DEG);
      emp.dispose();
      emp.update(1.0);
      expect(emp.getYaw()).toBe(0);
      expect(emp.getPitch()).toBe(0);
    });
  });
});
