// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * NVA T-54 scenario-spawn tests. The faction-flipped sibling of the M48
 * scenario-spawn coverage in `Tank.test.ts`: same `Tank` IVehicle +
 * `TrackedVehiclePhysics` skid-steer model, spawned as `Faction.NVA` enemy
 * armor with a slightly longer 100 mm gun.
 *
 * L2 (one system + scene mocks) per docs/TESTING.md — behavior-driven:
 * the spawn registers an NVA tank, mounts the procedural turret + main gun
 * on the articulation rig, points the barrel-tip fire origin down the longer
 * gun, conforms to terrain on `setTerrain`, and fields exactly one tank per
 * scenario mode with no overlap against the US M48 table.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Tank } from './Tank';
import { VehicleManager } from './VehicleManager';
import {
  buildT54ChassisMesh,
  createT54Tank,
  mountT54TurretMeshes,
  spawnScenarioT54Tanks,
  T54_SCENARIO_SPAWN_GROUPS,
} from './T54TankSpawn';
import { T54_HULL_DIMENSIONS, T54_PHYSICS_CONFIG, T54_SPAWN_OFFSETS } from '../../config/vehicles/t54-config';
import { M48_PHYSICS_CONFIG } from '../../config/vehicles/m48-config';
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
  } as unknown as ITerrainRuntime;
}

describe('T-54 chassis mesh', () => {
  it('builds a perf-tagged chassis root with a hull + two tracks', () => {
    const root = buildT54ChassisMesh();
    expect(root.name).toBe('t54_chassis_root');
    expect(root.userData.perfCategory).toBe('ground_vehicles');
    expect(root.getObjectByName('t54_hull')).toBeDefined();
    // Hull + 2 track boxes are direct mesh children.
    const meshChildren = root.children.filter((c) => (c as THREE.Mesh).isMesh);
    expect(meshChildren).toHaveLength(3);
  });
});

describe('T-54 scenario spawn', () => {
  it('registers an NVA Tank with the VehicleManager and attaches the procedural mesh to the scene', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const { tank, root } = createT54Tank(scene, vm, {
      vehicleId: 't54_test',
      position: new THREE.Vector3(10, 0, 20),
      faction: Faction.NVA,
    });

    expect(scene.children).toContain(root);
    expect(tank.category).toBe('ground');
    expect(tank.faction).toBe(Faction.NVA);
    expect(vm.getVehicle('t54_test')).toBe(tank);
    // It is a real Tank (so the player/NPC tank adapters + cannon route engage).
    expect(tank).toBeInstanceOf(Tank);
  });

  it('mounts the turret bulk on the yaw node and the main gun on the pitch node', () => {
    const tank = new Tank('t54_rig', new THREE.Object3D(), Faction.NVA, undefined, T54_PHYSICS_CONFIG);
    mountT54TurretMeshes(tank);
    const yawNode = tank.getTurret().getYawNode();
    const pitchNode = tank.getTurret().getPitchNode();

    // Turret bulk traverses with yaw.
    expect(yawNode.getObjectByName('t54_turret')).toBeDefined();
    expect(yawNode.getObjectByName('t54_turret_ring')).toBeDefined();
    expect(yawNode.getObjectByName('t54_cupola')).toBeDefined();
    // Barrel + mantlet elevate with the pitch node.
    expect(pitchNode.getObjectByName('t54_mantlet')).toBeDefined();
    expect(pitchNode.getObjectByName('t54_barrel')).toBeDefined();
    expect(pitchNode.getObjectByName('t54_muzzle_brake')).toBeDefined();
  });

  it('points the barrel-tip fire origin ~5.5 m forward of the trunnion (longer 100 mm gun)', () => {
    const { tank } = createT54Tank(new THREE.Scene(), new VehicleManager(), {
      vehicleId: 't54_barrel',
      position: new THREE.Vector3(0, 0, 0),
      faction: Faction.NVA,
    });
    const turret = tank.getTurret();
    const tip = new THREE.Vector3();
    turret.getBarrelTipWorldPosition(tip);
    const trunnion = turret.getPitchNode().getWorldPosition(new THREE.Vector3());
    // The 100 mm D-10T tip sits 5.5 m down-bore of the trunnion (vs the M48's 5.0 m).
    expect(tip.distanceTo(trunnion)).toBeCloseTo(5.5, 2);
  });

  it('conforms to terrain on setTerrain so the chassis rests grounded', () => {
    const { tank } = createT54Tank(new THREE.Scene(), new VehicleManager(), {
      vehicleId: 't54_grounded',
      position: new THREE.Vector3(5, 0, 5),
      faction: Faction.NVA,
    });

    tank.setTerrain(makeFlatTerrain(30));

    // Grounded at terrain height + the tracked-vehicle axle offset (~0.55 m).
    const y = tank.getPosition().y;
    expect(y).toBeGreaterThan(30);
    expect(y).toBeLessThan(31);
  });

  it('honours the initial yaw on the chassis root', () => {
    const { root } = createT54Tank(new THREE.Scene(), new VehicleManager(), {
      vehicleId: 't54_yaw',
      position: new THREE.Vector3(),
      faction: Faction.NVA,
      initialYaw: Math.PI * 0.5,
    });
    expect(root.rotation.y).toBeCloseTo(Math.PI * 0.5, 4);
  });
});

describe('T-54 scenario spawn table', () => {
  it('fields NVA-only tanks with distinct ids per scenario mode', () => {
    const allDefs = Object.values(T54_SCENARIO_SPAWN_GROUPS).flat();
    expect(allDefs.length).toBeGreaterThan(0);
    for (const def of allDefs) {
      expect(def.faction).toBe(Faction.NVA);
    }
    const ids = allDefs.map((def) => def.vehicleId);
    expect(new Set(ids).size).toBe(ids.length);
    // Exactly one T-54 per large scenario mode.
    expect(T54_SCENARIO_SPAWN_GROUPS.open_frontier).toHaveLength(1);
    expect(T54_SCENARIO_SPAWN_GROUPS.a_shau_valley).toHaveLength(1);
  });

  it('anchors the T-54s at the OPFOR positions inherited from the M48 table', () => {
    const ofDef = T54_SCENARIO_SPAWN_GROUPS.open_frontier[0];
    expect(ofDef.position.x).toBeCloseTo(T54_SPAWN_OFFSETS.open_frontier.x, 2);
    expect(ofDef.position.z).toBeCloseTo(T54_SPAWN_OFFSETS.open_frontier.z, 2);
    const ashauDef = T54_SCENARIO_SPAWN_GROUPS.a_shau_valley[0];
    expect(ashauDef.position.x).toBeCloseTo(T54_SPAWN_OFFSETS.a_shau_valley.x, 2);
    expect(ashauDef.position.z).toBeCloseTo(T54_SPAWN_OFFSETS.a_shau_valley.z, 2);
  });

  it('spawnScenarioT54Tanks registers one NVA tank per requested mode', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const spawned = spawnScenarioT54Tanks({
      modes: ['open_frontier', 'a_shau_valley'],
      scene,
      vehicleManager: vm,
    });

    expect(spawned).toHaveLength(2);
    const ground = vm.getVehiclesByCategory('ground');
    expect(ground).toHaveLength(2);
    for (const { tank } of spawned) {
      expect(tank.faction).toBe(Faction.NVA);
    }
  });

  it('honours an optional resolvePosition (terrain-snap callback)', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const snapped = new THREE.Vector3(123, 7.5, 456);

    spawnScenarioT54Tanks({
      modes: ['open_frontier'],
      scene,
      vehicleManager: vm,
      resolvePosition: () => snapped,
    });

    const tank = vm.getVehicle(T54_SCENARIO_SPAWN_GROUPS.open_frontier[0].vehicleId)!;
    expect(tank.getPosition().x).toBeCloseTo(snapped.x, 2);
    expect(tank.getPosition().z).toBeCloseTo(snapped.z, 2);
  });
});

describe('T-54 physics + hull config', () => {
  it('carries the lighter+lower historical T-54 chassis deltas', () => {
    expect(T54_PHYSICS_CONFIG.mass).toBe(36000);
    expect(T54_PHYSICS_CONFIG.trackSeparation).toBeCloseTo(2.64, 3);
    expect(T54_PHYSICS_CONFIG.hullLength).toBeCloseTo(6.04, 3);
  });

  it('shares M48 climb authority so US and NVA armor crest jungle grades alike', () => {
    // Climb-authority tuning (tank-hill-authority) is deliberately kept in
    // lockstep across both chassis. Assert the parity relationship, not the
    // specific magnitudes, so a future retune that moves both together still
    // passes.
    expect(T54_PHYSICS_CONFIG.maxClimbSlope).toBe(M48_PHYSICS_CONFIG.maxClimbSlope);
    expect(T54_PHYSICS_CONFIG.slopeDriveFloor).toBe(M48_PHYSICS_CONFIG.slopeDriveFloor);
    expect(T54_PHYSICS_CONFIG.slopeGravityScale).toBe(M48_PHYSICS_CONFIG.slopeGravityScale);
  });

  it('is lighter + lower than the M48 it replaces (period-correct enemy armor)', () => {
    expect(T54_HULL_DIMENSIONS.length).toBeCloseTo(6.04, 3);
    expect(T54_HULL_DIMENSIONS.width).toBeCloseTo(3.27, 3);
    expect(T54_HULL_DIMENSIONS.height).toBeCloseTo(2.4, 3);
  });
});
