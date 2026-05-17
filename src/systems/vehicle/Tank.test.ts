/**
 * Tank IVehicle behavior tests.
 *
 * Authoritative scope: docs/rearch/TANK_SYSTEMS_2026-05-13.md
 * Task brief: docs/tasks/cycle-vekhikl-3-tank-chassis.md (R2 — m48-tank-integration)
 *
 * L2 (one system + scene mocks) per docs/TESTING.md. Assertions are
 * behavior-driven: we observe that the chassis moves when commanded and
 * stays put when not, that the seat API admits and ejects occupants,
 * and that the scenario spawn registers tanks at distinct positions for
 * the two scenarios the cycle ships against (Open Frontier + A Shau).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Tank } from './Tank';
import { VehicleManager } from './VehicleManager';
import { createM48Tank, spawnScenarioM48Tanks, M48_SCENARIO_SPAWNS } from './M48TankSpawn';
import { Faction } from '../combat/types';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

function makeFlatTerrain(height = 0): ITerrainRuntime {
  return {
    getHeightAt: () => height,
    getEffectiveHeightAt: () => height,
    getSlopeAt: () => 0,
    getNormalAt: (_x, _z, target) => {
      const v = target ?? new THREE.Vector3();
      return v.set(0, 1, 0);
    },
    getPlayableWorldSize: () => 4000,
    getWorldSize: () => 4000,
    isTerrainReady: () => true,
    hasTerrainAt: () => true,
    getActiveTerrainTileCount: () => 1,
    setSurfaceWetness: () => {},
    updatePlayerPosition: () => {},
    registerCollisionObject: () => {},
    unregisterCollisionObject: () => {},
    raycastTerrain: () => ({ hit: false }),
  };
}

describe('Tank IVehicle', () => {
  describe('IVehicle surface', () => {
    it('reports the ground category and the configured faction', () => {
      const object = new THREE.Object3D();
      const tank = new Tank('t1', object, Faction.US);
      expect(tank.category).toBe('ground');
      expect(tank.faction).toBe(Faction.US);
    });

    it('seeds physics from the placed object so first update does not snap to origin', () => {
      const object = new THREE.Object3D();
      object.position.set(50, 1.5, -30);
      const scene = new THREE.Scene();
      scene.add(object);

      const tank = new Tank('t_seeded', object, Faction.US);
      tank.setTerrain(makeFlatTerrain(0));

      // One step with no control input — chassis should remain near the
      // seeded XZ anchor (terrain conform settles Y to axleOffset above
      // the flat surface, so XZ is the meaningful invariant here).
      tank.update(0.05);
      const pos = tank.getPosition();
      expect(pos.x).toBeCloseTo(50, 1);
      expect(pos.z).toBeCloseTo(-30, 1);
    });
  });

  describe('Seating (IVehicle + ITankModel role API)', () => {
    it('admits a driver into the pilot seat and ejects them on exit', () => {
      const tank = new Tank('t_seat', new THREE.Object3D(), Faction.US);
      expect(tank.hasFreeSeats('pilot')).toBe(true);
      expect(tank.enterVehicle('player', 'pilot')).toBe(0);
      expect(tank.getPilotId()).toBe('player');
      expect(tank.hasFreeSeats('pilot')).toBe(false);

      const exit = tank.exitVehicle('player');
      expect(exit).not.toBeNull();
      expect(tank.getPilotId()).toBeNull();
    });

    it('exposes a gunner seat the cycle #9 turret can mount onto', () => {
      const tank = new Tank('t_gun', new THREE.Object3D(), Faction.US);
      expect(tank.hasFreeSeats('gunner')).toBe(true);
      expect(tank.enterVehicle('npc_gunner_1', 'gunner')).not.toBeNull();
      expect(tank.hasFreeSeats('gunner')).toBe(false);
    });

    it('routes occupy / release by role for the TankPlayerAdapter (ITankModel shape)', () => {
      const tank = new Tank('t_role', new THREE.Object3D(), Faction.US);
      expect(tank.occupy('pilot', 'player')).toBe(true);
      expect(tank.getPilotId()).toBe('player');

      tank.release('pilot');
      expect(tank.getPilotId()).toBeNull();
      expect(tank.hasFreeSeats('pilot')).toBe(true);
    });
  });

  describe('Delegating to TrackedVehiclePhysics', () => {
    it('moves forward when the driver commands full throttle', () => {
      const scene = new THREE.Scene();
      const object = new THREE.Object3D();
      object.position.set(0, 1, 0);
      scene.add(object);

      const tank = new Tank('t_drive', object, Faction.US);
      tank.setTerrain(makeFlatTerrain(0));

      // Settle.
      for (let i = 0; i < 30; i += 1) tank.update(0.02);
      const startZ = tank.getPosition().z;

      // Forward throttle: -Z is chassis-forward in this engine.
      tank.setControls(1.0, 0, false);
      for (let i = 0; i < 180; i += 1) tank.update(0.02);

      const endZ = tank.getPosition().z;
      // Behavior: net forward translation. We don't pin the magnitude —
      // tuning constants in TrackedVehiclePhysics may change. -Z is
      // chassis-forward, so the integrated Z drops.
      expect(endZ).toBeLessThan(startZ - 1.0);
      // Forward speed (chassis-forward projection of velocity) is
      // positive when moving forward.
      expect(tank.getForwardSpeed()).toBeGreaterThan(0.5);
    });

    it('pivots in place when the driver commands pure turn', () => {
      const scene = new THREE.Scene();
      const object = new THREE.Object3D();
      object.position.set(0, 1, 0);
      scene.add(object);

      const tank = new Tank('t_pivot', object, Faction.US);
      tank.setTerrain(makeFlatTerrain(0));
      for (let i = 0; i < 30; i += 1) tank.update(0.02);

      const yawBefore = new THREE.Euler().setFromQuaternion(tank.getQuaternion(), 'YXZ').y;
      const posBefore = tank.getPosition().clone();

      tank.setControls(0, 1.0, false);
      for (let i = 0; i < 240; i += 1) tank.update(0.02);

      const yawAfter = new THREE.Euler().setFromQuaternion(tank.getQuaternion(), 'YXZ').y;
      const posAfter = tank.getPosition();

      // Yaw advanced.
      expect(Math.abs(yawAfter - yawBefore)).toBeGreaterThan(0.1);
      // Translation is small (in-place pivot characteristic).
      const horizontalDrift = Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z);
      expect(horizontalDrift).toBeLessThan(1.0);
    });

    it('respects tracks-blown immobilization by ignoring driver commands', () => {
      const scene = new THREE.Scene();
      const object = new THREE.Object3D();
      object.position.set(0, 1, 0);
      scene.add(object);

      const tank = new Tank('t_blown', object, Faction.US);
      tank.setTerrain(makeFlatTerrain(0));
      for (let i = 0; i < 30; i += 1) tank.update(0.02);

      tank.setTracksBlown(true);
      tank.setControls(1.0, 0, false);
      const startPos = tank.getPosition().clone();
      for (let i = 0; i < 240; i += 1) tank.update(0.02);
      const endPos = tank.getPosition();

      const horizontalDrift = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
      expect(horizontalDrift).toBeLessThan(0.5);
    });
  });

  describe('Lifecycle', () => {
    it('disposes by removing the scene object and marking destroyed', () => {
      const scene = new THREE.Scene();
      const object = new THREE.Object3D();
      scene.add(object);
      const tank = new Tank('t_dispose', object, Faction.US);

      expect(scene.children).toContain(object);
      tank.dispose();

      expect(scene.children).not.toContain(object);
      expect(tank.isDestroyed()).toBe(true);
      expect(tank.getHealthPercent()).toBe(0);
    });

    it('is a no-op when update is called after dispose', () => {
      const tank = new Tank('t_post_dispose', new THREE.Object3D(), Faction.US);
      tank.dispose();
      // Should not throw.
      tank.update(0.016);
      expect(tank.isDestroyed()).toBe(true);
    });
  });
});

describe('M48 scenario spawn', () => {
  it('registers an M48 with the VehicleManager and attaches the procedural mesh to the scene', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const { tank, root } = createM48Tank(scene, vm, {
      vehicleId: 'm48_test',
      position: new THREE.Vector3(10, 0, 20),
      faction: Faction.US,
    });

    expect(scene.children).toContain(root);
    expect(tank.category).toBe('ground');
    expect(tank.faction).toBe(Faction.US);
    expect(vm.getVehicle('m48_test')).toBe(tank);
  });

  it('spawn table covers Open Frontier and A Shau with distinct vehicle ids', () => {
    expect(M48_SCENARIO_SPAWNS.open_frontier.vehicleId)
      .not.toBe(M48_SCENARIO_SPAWNS.a_shau_valley.vehicleId);
    expect(M48_SCENARIO_SPAWNS.open_frontier.faction).toBe(Faction.US);
    expect(M48_SCENARIO_SPAWNS.a_shau_valley.faction).toBe(Faction.US);
  });

  it('spawnScenarioM48Tanks registers both modes when both are requested', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const spawned = spawnScenarioM48Tanks({
      modes: ['open_frontier', 'a_shau_valley'],
      scene,
      vehicleManager: vm,
    });

    expect(spawned).toHaveLength(2);
    // Both should be registered ground-category vehicles.
    const ground = vm.getVehiclesByCategory('ground');
    expect(ground).toHaveLength(2);
  });

  it('spawns at the table positions when no resolver is supplied', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    spawnScenarioM48Tanks({
      modes: ['open_frontier', 'a_shau_valley'],
      scene,
      vehicleManager: vm,
    });

    const ofTank = vm.getVehicle(M48_SCENARIO_SPAWNS.open_frontier.vehicleId)!;
    const ashauTank = vm.getVehicle(M48_SCENARIO_SPAWNS.a_shau_valley.vehicleId)!;
    expect(ofTank.getPosition().x).toBeCloseTo(M48_SCENARIO_SPAWNS.open_frontier.position.x, 2);
    expect(ofTank.getPosition().z).toBeCloseTo(M48_SCENARIO_SPAWNS.open_frontier.position.z, 2);
    expect(ashauTank.getPosition().x).toBeCloseTo(M48_SCENARIO_SPAWNS.a_shau_valley.position.x, 2);
    expect(ashauTank.getPosition().z).toBeCloseTo(M48_SCENARIO_SPAWNS.a_shau_valley.position.z, 2);
  });

  it('honours an optional resolvePosition (terrain-snap callback)', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const snapped = new THREE.Vector3(123, 7.5, 456);
    spawnScenarioM48Tanks({
      modes: ['open_frontier'],
      scene,
      vehicleManager: vm,
      resolvePosition: () => snapped,
    });

    const tank = vm.getVehicle(M48_SCENARIO_SPAWNS.open_frontier.vehicleId)!;
    expect(tank.getPosition().x).toBeCloseTo(snapped.x, 2);
    expect(tank.getPosition().z).toBeCloseTo(snapped.z, 2);
  });
});

describe('Tank damage states (R2, tank-damage-states)', () => {
  function makeTank(opts?: {
    damageConfig?: Partial<import('./Tank').TankDamageConfig>;
    rng?: () => number;
  }) {
    return new Tank(
      'dmg_test',
      new THREE.Object3D(),
      Faction.US,
      undefined,
      undefined,
      undefined,
      { maxHp: 1000, ...(opts?.damageConfig ?? {}) },
      opts?.rng,
    );
  }

  const hp = (t: Tank) => t.getHp();
  const origin = new THREE.Vector3();

  describe('HP band ladder', () => {
    it('reports healthy at full HP and transitions through damaged → critical → wrecked', () => {
      // RNG always returns 1 → substate roll always misses (p < 1 always).
      const tank = makeTank({ rng: () => 0.999999 });
      expect(tank.getHpBand()).toBe('healthy');
      expect(tank.getHealthPercent()).toBeCloseTo(1, 5);

      // 100 → 60 (40% damage, fraction 0.60) → damaged threshold (<= 0.66).
      const r1 = tank.applyDamage(400, origin, 'AP');
      expect(hp(tank)).toBe(600);
      expect(tank.getHpBand()).toBe('damaged');
      expect(r1.bandTransition).toBe('damaged');

      // 60 → 30 (another 30% damage, fraction 0.30) → critical (<= 0.33).
      const r2 = tank.applyDamage(300, origin, 'AP');
      expect(hp(tank)).toBe(300);
      expect(tank.getHpBand()).toBe('critical');
      expect(r2.bandTransition).toBe('critical');

      // 30 → 0 (another 30%) → wrecked.
      const r3 = tank.applyDamage(300, origin, 'AP');
      expect(hp(tank)).toBe(0);
      expect(tank.getHpBand()).toBe('wrecked');
      expect(r3.bandTransition).toBe('wrecked');
    });

    it('does not transition bands when a hit lands within the same band', () => {
      const tank = makeTank({ rng: () => 0.999999 });
      // 100 → 80, still healthy (frac 0.80 > 0.66).
      const r = tank.applyDamage(200, origin, 'HE');
      expect(tank.getHpBand()).toBe('healthy');
      expect(r.bandTransition).toBeUndefined();
    });

    it('fires the bandTransition listener exactly when bands change', () => {
      const events: string[] = [];
      const tank = makeTank({ rng: () => 0.999999 });
      tank.setBandTransitionListener((b) => events.push(b));

      tank.applyDamage(100, origin, 'AP'); // 1000 → 900 healthy
      tank.applyDamage(300, origin, 'AP'); // 900 → 600 damaged
      tank.applyDamage(310, origin, 'AP'); // 600 → 290 critical
      tank.applyDamage(290, origin, 'AP'); // 290 → 0 wrecked

      expect(events).toEqual(['damaged', 'critical', 'wrecked']);
    });
  });

  describe('Substate triggers', () => {
    it('do not fire when HP is above the critical threshold', () => {
      // RNG would always pass the trigger probability if it were rolled.
      const tank = makeTank({ rng: () => 0 });
      tank.applyDamage(200, origin, 'AP'); // healthy → still healthy
      tank.applyDamage(200, origin, 'AP'); // healthy → damaged

      const flags = tank.getSubstates();
      expect(flags.tracksBlown).toBe(false);
      expect(flags.turretJammed).toBe(false);
      expect(flags.engineKilled).toBe(false);
    });

    it('can fire at critical HP and surface through the result + listener', () => {
      const events: string[] = [];
      // RNG=0 forces every trigger roll to pass, so every critical-band hit
      // fires a substate. We use small damage steps so we control exactly
      // which hit is the "first critical hit."
      const tank = makeTank({ rng: () => 0 });
      tank.setSubstateListener((s) => events.push(s));

      // Step down into critical with small hits that don't push through the
      // threshold in one shot (so the critical-substate roll fires on the
      // hit that *enters* critical, observable as the first listener event).
      tank.applyDamage(200, origin, 'AP'); // 1000 → 800 healthy (frac 0.80)
      tank.applyDamage(200, origin, 'AP'); // 800 → 600 damaged (frac 0.60)
      expect(events).toHaveLength(0); // no substate above critical
      tank.applyDamage(300, origin, 'AP'); // 600 → 300 critical — substate fires
      expect(tank.getHpBand()).toBe('critical');
      expect(events).toHaveLength(1);

      // The triggered substate matches the listener event, and its flag is set.
      const triggered = events[0] as 'tracks-blown' | 'turret-jammed' | 'engine-killed';
      const flags = tank.getSubstates();
      if (triggered === 'tracks-blown') expect(flags.tracksBlown).toBe(true);
      if (triggered === 'turret-jammed') expect(flags.turretJammed).toBe(true);
      if (triggered === 'engine-killed') expect(flags.engineKilled).toBe(true);
    });

    it('immobilizes the chassis when a tracks-blown substate fires', () => {
      // rng=0 always triggers, and with rng=0 the weighted draw picks the
      // first candidate in iteration order — `tracks-blown`. Test holds as
      // long as `tracks-blown` is among the first candidates considered
      // (iteration order is part of the implementation, not the public
      // contract, so we keep the assertion to the observable effect).
      const scene = new THREE.Scene();
      const object = new THREE.Object3D();
      object.position.set(0, 1, 0);
      scene.add(object);

      const tank = new Tank('t_blown_dmg', object, Faction.US,
        undefined, undefined, undefined,
        { maxHp: 1000 },
        () => 0,
      );
      tank.setTerrain({
        getHeightAt: () => 0,
        getEffectiveHeightAt: () => 0,
        getSlopeAt: () => 0,
        getNormalAt: (_x, _z, t) => (t ?? new THREE.Vector3()).set(0, 1, 0),
        getPlayableWorldSize: () => 4000,
        getWorldSize: () => 4000,
        isTerrainReady: () => true,
        hasTerrainAt: () => true,
        getActiveTerrainTileCount: () => 1,
        setSurfaceWetness: () => {},
        updatePlayerPosition: () => {},
        registerCollisionObject: () => {},
        unregisterCollisionObject: () => {},
        raycastTerrain: () => ({ hit: false }),
      });

      // Drop into critical, then trigger the first substate. With rng=0 the
      // weighted draw lands on the first candidate (tracks-blown).
      tank.applyDamage(700, origin, 'HE');
      tank.applyDamage(50, origin, 'HE');
      expect(tank.getSubstates().tracksBlown).toBe(true);

      // Drive the chassis: cannot move forward.
      for (let i = 0; i < 30; i += 1) tank.update(0.02);
      tank.setControls(1.0, 0, false);
      const start = tank.getPosition().clone();
      for (let i = 0; i < 240; i += 1) tank.update(0.02);
      const end = tank.getPosition();
      expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(0.5);
    });

    it('freezes turret aim when a turret-jammed substate fires', () => {
      // Force the turret-jammed substate directly by triggering the random
      // path until that flag is set. We rely only on the observable
      // contract: after `setJammed(true)`, target updates are no-ops.
      const tank = makeTank({ rng: () => 0 });
      tank.applyDamage(700, origin, 'AP'); // → critical
      // Repeated hits with rng=0 will fire substates until all three are
      // active; once turret-jammed is set, the test invariant holds.
      tank.applyDamage(50, origin, 'AP');
      tank.applyDamage(50, origin, 'AP');
      tank.applyDamage(50, origin, 'AP');
      expect(tank.getSubstates().turretJammed).toBe(true);

      const turret = tank.getTurret();
      const yawBefore = turret.getTargetYaw();
      turret.setTargetYaw(1.5);
      expect(turret.getTargetYaw()).toBe(yawBefore); // jammed → no-op
    });

    it('clamps throttle when an engine-killed substate fires (chassis cannot drive)', () => {
      // Force the engine-killed flag through the substate path. Same
      // approach as the turret-jammed test: apply enough critical-band
      // hits with rng=0 that all three substates trigger, then assert
      // the observable contract on the chassis.
      const scene = new THREE.Scene();
      const obj = new THREE.Object3D();
      obj.position.set(0, 1, 0);
      scene.add(obj);
      const drivenTank = new Tank(
        't_eng_drive',
        obj,
        Faction.US,
        undefined,
        undefined,
        undefined,
        { maxHp: 1000 },
        () => 0,
      );
      drivenTank.setTerrain({
        getHeightAt: () => 0,
        getEffectiveHeightAt: () => 0,
        getSlopeAt: () => 0,
        getNormalAt: (_x, _z, t) => (t ?? new THREE.Vector3()).set(0, 1, 0),
        getPlayableWorldSize: () => 4000,
        getWorldSize: () => 4000,
        isTerrainReady: () => true,
        hasTerrainAt: () => true,
        getActiveTerrainTileCount: () => 1,
        setSurfaceWetness: () => {},
        updatePlayerPosition: () => {},
        registerCollisionObject: () => {},
        unregisterCollisionObject: () => {},
        raycastTerrain: () => ({ hit: false }),
      });
      drivenTank.applyDamage(700, origin, 'HEAT');
      // Fire substates until engine-killed lands. Bounded loop — at most
      // three critical-band hits cover the worst case (engine-killed is
      // last in the pool).
      for (let i = 0; i < 3 && !drivenTank.getSubstates().engineKilled; i += 1) {
        drivenTank.applyDamage(50, origin, 'HEAT');
      }
      expect(drivenTank.getSubstates().engineKilled).toBe(true);

      // Settle, then floor it. The chassis will not advance because
      // throttle is clamped — regardless of any other substate flags.
      for (let i = 0; i < 30; i += 1) drivenTank.update(0.02);
      drivenTank.setControls(1.0, 0, false);
      const start = drivenTank.getPosition().clone();
      for (let i = 0; i < 240; i += 1) drivenTank.update(0.02);
      const end = drivenTank.getPosition();
      expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(0.5);
    });

    it('can stack all three substates on the same vehicle', () => {
      // Every roll triggers, every weighted pick lands on the first remaining bucket.
      const tank = makeTank({ rng: () => 0 });
      tank.applyDamage(700, origin, 'AP'); // → critical

      // Three critical-band hits in a row — each triggers a fresh substate.
      tank.applyDamage(50, origin, 'AP');
      tank.applyDamage(50, origin, 'AP');
      tank.applyDamage(50, origin, 'AP');

      const flags = tank.getSubstates();
      expect(flags.tracksBlown).toBe(true);
      expect(flags.turretJammed).toBe(true);
      expect(flags.engineKilled).toBe(true);
      // Tank is fully crippled but not yet wrecked — still queryable.
      expect(tank.isDestroyed()).toBe(false);
      expect(tank.getTurret().getYaw()).toBe(0); // pose is still readable
    });
  });

  describe('Wrecked state', () => {
    it('reports zero HP and ignores further damage', () => {
      const tank = makeTank({ rng: () => 0.99 });
      tank.applyDamage(1000, origin, 'AP');
      expect(tank.getHp()).toBe(0);
      expect(tank.getHpBand()).toBe('wrecked');
      expect(tank.getHealthPercent()).toBe(0);
      expect(tank.isDestroyed()).toBe(true);

      // Further damage is a no-op (no band change, no substate, HP stays 0).
      const r = tank.applyDamage(500, origin, 'HE');
      expect(r.newHp).toBe(0);
      expect(r.bandTransition).toBeUndefined();
      expect(r.substateTriggered).toBeUndefined();
    });

    it('forces engine-killed + turret-jammed on wreck regardless of prior substates', () => {
      const tank = makeTank({ rng: () => 0.99 });
      tank.applyDamage(1000, origin, 'AP');
      const flags = tank.getSubstates();
      expect(flags.engineKilled).toBe(true);
      expect(flags.turretJammed).toBe(true);
    });

    it('ignores zero / negative damage even on a healthy tank', () => {
      const tank = makeTank();
      const r = tank.applyDamage(0, origin, 'AP');
      expect(r.newHp).toBe(1000);
      const r2 = tank.applyDamage(-10, origin, 'AP');
      expect(r2.newHp).toBe(1000);
      expect(tank.getHpBand()).toBe('healthy');
    });
  });
});

describe('VehicleManager.spawnScenarioM48Tanks surface', () => {
  it('registers M48 tanks through the VehicleManager pass-through method', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const ids = vm.spawnScenarioM48Tanks({
      scene,
      modes: ['open_frontier', 'a_shau_valley'],
    });

    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(vm.getVehicle(id)?.category).toBe('ground');
    }
  });

  it('answers getTankByOccupant only when the seated vehicle is a Tank', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const { tank } = createM48Tank(scene, vm, {
      vehicleId: 'm48_occupant',
      position: new THREE.Vector3(),
      faction: Faction.US,
    });
    tank.enterVehicle('player', 'pilot');

    expect(vm.getTankByOccupant('player')).toBe(tank);
    expect(vm.getTankByOccupant('not_seated')).toBeNull();
  });
});
