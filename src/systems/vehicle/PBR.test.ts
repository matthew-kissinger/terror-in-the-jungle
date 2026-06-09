// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * PBR (Patrol Boat River) behavior tests.
 *
 * Authoritative scope: docs/tasks/cycle-voda-3-watercraft.md
 * §"pbr-integration (R2)".
 *
 * L2 (one system + scene mocks) per docs/TESTING.md. Assertions are
 * behavior-driven: we observe the IVehicle surface, the mount parenting
 * contract, the seat layout the player + NPC paths consume, and the
 * lifecycle teardown — not internal field names or specific tuning
 * constants.
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { PBR, PBR_HULL_DIMENSIONS, type PBRMount } from './PBR';
import { Emplacement } from './Emplacement';
import { VehicleManager } from './VehicleManager';
import {
  createPBR,
  spawnScenarioPBRs,
  PBR_SCENARIO_SPAWNS,
  buildPBRHullMesh,
} from './PBRSpawn';
import { M2HBEmplacementSystem } from '../combat/weapons/M2HBEmplacement';
import { Faction } from '../combat/types';
import type {
  BuoyancySamplerLike,
  WaterInteractionOptions,
  WaterInteractionSample,
} from './WatercraftBuoyancyTypes';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

// ---------- Fakes ----------

function makeFlatWater(surfaceY = 0): BuoyancySamplerLike {
  return {
    sampleWaterInteraction(
      position: THREE.Vector3,
      _options?: WaterInteractionOptions,
    ): WaterInteractionSample {
      const depth = Math.max(0, surfaceY - position.y);
      const immersion01 = Math.min(1, depth / 1.6);
      return {
        source: depth > 0 ? 'global' : 'none',
        surfaceY: depth > 0 ? surfaceY : null,
        depth,
        submerged: depth > 0,
        immersion01,
        buoyancyScalar: immersion01,
        flowVelocity: new THREE.Vector3(),
      };
    },
  };
}

function makeFlatTerrain(height = -200): ITerrainRuntime {
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

// ---------- Bare PBR (no mounts) — IVehicle contract ----------

describe('PBR IVehicle', () => {
  it('reports the watercraft category and the configured faction', () => {
    const object = new THREE.Object3D();
    const pbr = new PBR('pbr_1', object, Faction.US);
    expect(pbr.category).toBe('watercraft');
    expect(pbr.faction).toBe(Faction.US);
  });

  it('seeds physics from the placed object so the first update does not snap to origin', () => {
    const scene = new THREE.Scene();
    const object = new THREE.Object3D();
    object.position.set(75, 0, -40);
    scene.add(object);

    const pbr = new PBR('pbr_seeded', object, Faction.US);
    pbr.setWaterSampler(makeFlatWater(0));
    pbr.setTerrain(makeFlatTerrain(-200));
    pbr.update(0.05);

    const pos = pbr.getPosition();
    expect(pos.x).toBeCloseTo(75, 0);
    expect(pos.z).toBeCloseTo(-40, 0);
  });

  it('exposes a pilot seat, two gunner seats, and a passenger seat', () => {
    const pbr = new PBR('pbr_seats', new THREE.Object3D(), Faction.US);
    const seats = pbr.getSeats();
    const roles = seats.map(s => s.role).sort();
    expect(roles).toEqual(['gunner', 'gunner', 'passenger', 'pilot']);
  });

  it('lets a driver board the pilot seat and ejects them on exit', () => {
    const pbr = new PBR('pbr_pilot', new THREE.Object3D(), Faction.US);
    expect(pbr.hasFreeSeats('pilot')).toBe(true);
    expect(pbr.enterVehicle('player', 'pilot')).not.toBeNull();
    expect(pbr.getPilotId()).toBe('player');
    expect(pbr.hasFreeSeats('pilot')).toBe(false);

    const exit = pbr.exitVehicle('player');
    expect(exit).not.toBeNull();
    expect(pbr.getPilotId()).toBeNull();
  });

  it('admits two distinct gunners — one per mount', () => {
    const pbr = new PBR('pbr_gunners', new THREE.Object3D(), Faction.US);
    expect(pbr.enterVehicle('npc_fwd', 'gunner')).not.toBeNull();
    expect(pbr.hasFreeSeats('gunner')).toBe(true);
    expect(pbr.enterVehicle('npc_aft', 'gunner')).not.toBeNull();
    expect(pbr.hasFreeSeats('gunner')).toBe(false);
  });
});

// ---------- Mount parenting contract ----------

describe('PBR mount parenting', () => {
  function makeBoatAndSystem() {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const m2hbSystem = new M2HBEmplacementSystem(scene);
    return { scene, vm, m2hbSystem };
  }

  it('construction via the spawn helper wires exactly two emplacement mounts', () => {
    const { scene, vm, m2hbSystem } = makeBoatAndSystem();
    const { pbr, mounts } = createPBR(scene, vm, m2hbSystem, {
      vehicleId: 'pbr_mount_test',
      position: new THREE.Vector3(0, 0, 0),
      faction: Faction.US,
    });

    expect(mounts).toHaveLength(2);
    expect(pbr.getMounts()).toHaveLength(2);
    // Forward + aft indices both addressable.
    expect(pbr.getMount(0)).not.toBeNull();
    expect(pbr.getMount(1)).not.toBeNull();

    // Each mount is a real Emplacement instance with category 'emplacement'.
    for (const m of mounts) {
      expect(m.emplacement).toBeInstanceOf(Emplacement);
      expect(m.emplacement.category).toBe('emplacement');
    }
  });

  it('mount transforms inherit the hull pose (parent-child wiring)', () => {
    // Move the hull and verify both mounts report a world position
    // composed through the hull transform. This is the central contract
    // the PBR depends on so the M2HB world-space muzzle-origin path
    // (getWorldPosition) follows the boat as it moves.
    const { scene, vm, m2hbSystem } = makeBoatAndSystem();
    const { pbr, root, mounts } = createPBR(scene, vm, m2hbSystem, {
      vehicleId: 'pbr_xform',
      position: new THREE.Vector3(100, 5, -50),
      faction: Faction.US,
    });

    // Force a world-matrix refresh so getWorldPosition sees the placed pose.
    scene.updateMatrixWorld(true);

    const hullPos = pbr.getPosition();
    expect(hullPos.x).toBeCloseTo(100, 1);
    expect(hullPos.z).toBeCloseTo(-50, 1);

    // Mount world positions = hull pose + mount local offset (yaw=0 placement).
    const fwd = mounts.find(m => m.index === 0)!;
    const aft = mounts.find(m => m.index === 1)!;
    const fwdPos = fwd.emplacement.getPosition();
    const aftPos = aft.emplacement.getPosition();
    expect(fwdPos.x).toBeCloseTo(100, 1);
    expect(aftPos.x).toBeCloseTo(100, 1);
    // Forward mount is at hull-local -Z; aft at +Z. World Z reflects that.
    expect(fwdPos.z).toBeLessThan(hullPos.z);
    expect(aftPos.z).toBeGreaterThan(hullPos.z);

    // Now rotate the hull 90° and verify the mounts' world positions
    // rotate with it (composed transform).
    root.rotation.y = Math.PI / 2;
    scene.updateMatrixWorld(true);
    const fwdAfter = fwd.emplacement.getPosition();
    // After a 90° hull yaw, the forward mount (local -Z) projects onto +X
    // (or -X depending on rotation sign). The defining behavior: the
    // world XZ offset between forward + aft mounts is no longer pure Z;
    // it now has a significant X component.
    const aftAfter = aft.emplacement.getPosition();
    const dx = Math.abs(fwdAfter.x - aftAfter.x);
    const dz = Math.abs(fwdAfter.z - aftAfter.z);
    expect(dx).toBeGreaterThan(dz);
  });

  it('mounts are registered with the VehicleManager as separate emplacements', () => {
    const { scene, vm, m2hbSystem } = makeBoatAndSystem();
    createPBR(scene, vm, m2hbSystem, {
      vehicleId: 'pbr_reg',
      position: new THREE.Vector3(),
      faction: Faction.US,
    });

    // PBR + 2 emplacements = 3 vehicles total.
    expect(vm.getVehicleCount()).toBe(3);
    expect(vm.getVehicle('pbr_reg')!.category).toBe('watercraft');
    expect(vm.getVehicle('pbr_reg_mount_fwd')!.category).toBe('emplacement');
    expect(vm.getVehicle('pbr_reg_mount_aft')!.category).toBe('emplacement');
  });

  it('M2HBEmplacementSystem binds one weapon per mount', () => {
    const { scene, vm, m2hbSystem } = makeBoatAndSystem();
    createPBR(scene, vm, m2hbSystem, {
      vehicleId: 'pbr_bind',
      position: new THREE.Vector3(),
      faction: Faction.US,
    });

    expect(m2hbSystem.getBindingCount()).toBe(2);
    expect(m2hbSystem.getWeapon('pbr_bind_mount_fwd')).not.toBeNull();
    expect(m2hbSystem.getWeapon('pbr_bind_mount_aft')).not.toBeNull();
  });
});

// ---------- Drivetrain — throttle drives forward motion ----------

describe('PBR drivetrain', () => {
  it('throttle drives forward translation', () => {
    const scene = new THREE.Scene();
    const object = new THREE.Object3D();
    object.position.set(0, 0, 0);
    scene.add(object);

    const pbr = new PBR('pbr_drive', object, Faction.US);
    pbr.setWaterSampler(makeFlatWater(0));
    pbr.setTerrain(makeFlatTerrain(-200));

    // Settle on the water surface first.
    const DT = 1 / 60;
    for (let i = 0; i < 60; i += 1) pbr.update(DT);

    const startPos = pbr.getPosition().clone();
    pbr.setControls(1.0, 0);
    for (let i = 0; i < 240; i += 1) pbr.update(DT); // 4 s of throttle

    const endPos = pbr.getPosition();
    const horizontalTravel = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
    // Behavior: net horizontal motion + positive forward speed. Magnitudes
    // are intentionally loose — the WatercraftPhysics tuning (drag,
    // damping, channel coupling) shifts between cycles, so we pin the
    // sign of the motion rather than a specific m/s number.
    expect(horizontalTravel).toBeGreaterThan(0.2);
    expect(pbr.getForwardSpeed()).toBeGreaterThan(0.2);
  });
});

// ---------- Lifecycle ----------

describe('PBR lifecycle', () => {
  it('applies damage to the hull and disables mounts when wrecked', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const m2hb = new M2HBEmplacementSystem(scene);
    const { pbr, mounts } = createPBR(scene, vm, m2hb, {
      vehicleId: 'pbr_damage',
      position: new THREE.Vector3(0, 0, 0),
      faction: Faction.US,
    });

    pbr.applyDamage(175, new THREE.Vector3());
    expect(pbr.getHealthPercent()).toBeCloseTo(0.5, 5);
    expect(pbr.isDestroyed()).toBe(false);
    expect(mounts.every(m => !m.emplacement.isDestroyed())).toBe(true);

    pbr.applyDamage(400, new THREE.Vector3());
    expect(pbr.getHealthPercent()).toBe(0);
    expect(pbr.isDestroyed()).toBe(true);
    expect(mounts.every(m => m.emplacement.isDestroyed())).toBe(true);
  });

  it('dispose removes the hull from the scene and tears down both mounts', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const m2hbSystem = new M2HBEmplacementSystem(scene);
    const { pbr, root, mounts } = createPBR(scene, vm, m2hbSystem, {
      vehicleId: 'pbr_dispose',
      position: new THREE.Vector3(),
      faction: Faction.US,
    });

    expect(scene.children).toContain(root);
    // Mount tripod roots are children of the hull root.
    for (const m of mounts) {
      expect(root.children).toContain(m.root);
    }

    pbr.dispose();

    expect(scene.children).not.toContain(root);
    expect(pbr.isDestroyed()).toBe(true);
    expect(pbr.getHealthPercent()).toBe(0);
    // Mount emplacements are also disposed (their internal destroyed flag is set).
    for (const m of mounts) {
      expect(m.emplacement.isDestroyed()).toBe(true);
    }
  });

  it('update after dispose is a no-op (does not throw)', () => {
    const pbr = new PBR('pbr_post', new THREE.Object3D(), Faction.US);
    pbr.dispose();
    expect(() => pbr.update(0.016)).not.toThrow();
  });
});

// ---------- Scenario spawn ----------

describe('PBR scenario spawn', () => {
  it('registers a PBR with the VehicleManager and adds its hull to the scene', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const m2hbSystem = new M2HBEmplacementSystem(scene);

    const { pbr, root } = createPBR(scene, vm, m2hbSystem, {
      vehicleId: 'pbr_test',
      position: new THREE.Vector3(10, 0, 20),
      faction: Faction.US,
    });

    expect(scene.children).toContain(root);
    expect(pbr.category).toBe('watercraft');
    expect(pbr.faction).toBe(Faction.US);
    expect(vm.getVehicle('pbr_test')).toBe(pbr);
  });

  it('spawn table covers Open Frontier and A Shau with distinct vehicle ids', () => {
    expect(PBR_SCENARIO_SPAWNS.open_frontier.vehicleId)
      .not.toBe(PBR_SCENARIO_SPAWNS.a_shau_valley.vehicleId);
    expect(PBR_SCENARIO_SPAWNS.open_frontier.faction).toBe(Faction.US);
    expect(PBR_SCENARIO_SPAWNS.a_shau_valley.faction).toBe(Faction.US);
  });

  it('spawnScenarioPBRs registers both scenarios when both are requested', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const m2hbSystem = new M2HBEmplacementSystem(scene);

    const spawned = spawnScenarioPBRs({
      modes: ['open_frontier', 'a_shau_valley'],
      scene,
      vehicleManager: vm,
      m2hbSystem,
    });

    expect(spawned).toHaveLength(2);
    // 2 PBRs + 4 emplacements = 6 vehicles total.
    expect(vm.getVehiclesByCategory('watercraft')).toHaveLength(2);
    expect(vm.getVehiclesByCategory('emplacement')).toHaveLength(4);
  });

  it('honours an optional resolvePosition callback (terrain / water snap)', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const m2hbSystem = new M2HBEmplacementSystem(scene);

    const snapped = new THREE.Vector3(321, 8.5, 654);
    spawnScenarioPBRs({
      modes: ['open_frontier'],
      scene,
      vehicleManager: vm,
      m2hbSystem,
      resolvePosition: () => snapped,
    });
    scene.updateMatrixWorld(true);

    const pbr = vm.getVehicle(PBR_SCENARIO_SPAWNS.open_frontier.vehicleId)!;
    expect(pbr.getPosition().x).toBeCloseTo(snapped.x, 1);
    expect(pbr.getPosition().z).toBeCloseTo(snapped.z, 1);
  });

  it('VehicleManager pass-through registers the PBR through the manager method', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const m2hbSystem = new M2HBEmplacementSystem(scene);

    const ids = vm.spawnScenarioPBRs({
      scene,
      m2hbSystem,
      modes: ['a_shau_valley'],
    });

    expect(ids).toContain(PBR_SCENARIO_SPAWNS.a_shau_valley.vehicleId);
    expect(vm.getVehicle(ids[0])!.category).toBe('watercraft');
  });
});

// ---------- Procedural mesh sanity ----------

describe('PBR procedural hull mesh', () => {
  it('builds a hull group whose bounding box matches the documented dimensions', () => {
    const root = buildPBRHullMesh();
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    // The hull box dominates the bounding box; cabin extends a bit
    // vertically but does not exceed the hull length / beam.
    expect(size.z).toBeGreaterThanOrEqual(PBR_HULL_DIMENSIONS.length * 0.99);
    expect(size.x).toBeGreaterThanOrEqual(PBR_HULL_DIMENSIONS.beam * 0.99);
  });
});

// ---------- Mount aim in world space (B1) ----------

describe('PBR mount world-space aim composition', () => {
  /**
   * Player-fire path through M2HBEmplacementSystem.update derives the
   * barrel forward from yaw/pitch + the emplacement's world quaternion.
   * For a PBR mount parented under a (potentially rotated) hull, the
   * world-space direction must reflect both the hull's pose and the
   * mount's local tripod rotation. We observe behavior by intercepting
   * the combatant raycast and reading the ray direction the system
   * actually fires.
   */
  function makeRayCaptureCombatantSystem(): { cs: any; lastDirection: () => THREE.Vector3 | null } {
    let captured: THREE.Vector3 | null = null;
    const cs = {
      handlePlayerShot: vi.fn((ray: THREE.Ray) => {
        captured = ray.direction.clone();
        return { hit: false, point: new THREE.Vector3(), killed: false, headshot: false, damageDealt: 0 };
      }),
      impactEffectsPool: { spawn: vi.fn() },
    };
    return { cs, lastDirection: () => captured };
  }

  function makeFiringAdapter(vehicleId: string) {
    return {
      getActiveEmplacementId: () => vehicleId,
      consumeFireRequest: () => true,
    } as any;
  }

  it('forward mount on a yaw=0 hull fires along world -Z (the hull bow)', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const m2hb = new M2HBEmplacementSystem(scene);
    const { cs, lastDirection } = makeRayCaptureCombatantSystem();
    m2hb.setCombatantSystem(cs);

    const { mounts } = createPBR(scene, vm, m2hb, {
      vehicleId: 'pbr_aim_fwd',
      position: new THREE.Vector3(0, 0, 0),
      faction: Faction.US,
    });
    scene.updateMatrixWorld(true);

    const fwd = mounts.find(m => m.index === 0)!;
    m2hb.attachPlayerAdapter(fwd.vehicleId, makeFiringAdapter(fwd.vehicleId));
    m2hb.update(1 / 60);

    const dir = lastDirection();
    expect(dir).not.toBeNull();
    // The forward mount keeps the tripod's native -Z forward, so on a
    // yaw=0 hull the world-space fire direction is essentially -Z.
    expect(dir!.z).toBeLessThan(-0.95);
    expect(Math.abs(dir!.x)).toBeLessThan(0.05);
  });

  it('aft mount (rotated 180° on the hull) fires off the stern, not the bow', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const m2hb = new M2HBEmplacementSystem(scene);
    const { cs, lastDirection } = makeRayCaptureCombatantSystem();
    m2hb.setCombatantSystem(cs);

    const { mounts } = createPBR(scene, vm, m2hb, {
      vehicleId: 'pbr_aim_aft',
      position: new THREE.Vector3(0, 0, 0),
      faction: Faction.US,
    });
    scene.updateMatrixWorld(true);

    const aft = mounts.find(m => m.index === 1)!;
    m2hb.attachPlayerAdapter(aft.vehicleId, makeFiringAdapter(aft.vehicleId));
    m2hb.update(1 / 60);

    const dir = lastDirection();
    expect(dir).not.toBeNull();
    // The aft tripod has a local 180° yaw, so its barrel-forward
    // (local -Z) maps to world +Z (off the stern of a yaw=0 hull).
    expect(dir!.z).toBeGreaterThan(0.95);
    expect(Math.abs(dir!.x)).toBeLessThan(0.05);
  });

  it('forward mount on a hull yawed 90° fires along world +X (or -X), not world Z', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const m2hb = new M2HBEmplacementSystem(scene);
    const { cs, lastDirection } = makeRayCaptureCombatantSystem();
    m2hb.setCombatantSystem(cs);

    const { mounts } = createPBR(scene, vm, m2hb, {
      vehicleId: 'pbr_aim_yawed',
      position: new THREE.Vector3(0, 0, 0),
      faction: Faction.US,
      initialYaw: Math.PI / 2,
    });
    scene.updateMatrixWorld(true);

    const fwd = mounts.find(m => m.index === 0)!;
    m2hb.attachPlayerAdapter(fwd.vehicleId, makeFiringAdapter(fwd.vehicleId));
    m2hb.update(1 / 60);

    const dir = lastDirection();
    expect(dir).not.toBeNull();
    // After a 90° hull yaw, the forward mount's local -Z projects onto
    // world ±X. The defining behavior: the dominant axis is X, not Z.
    expect(Math.abs(dir!.x)).toBeGreaterThan(0.95);
    expect(Math.abs(dir!.z)).toBeLessThan(0.05);
  });
});

// ---------- Mount slew double-step regression (B2) ----------

describe('PBR mount slew step cadence', () => {
  it('VehicleManager fan-out plus PBR.update advances mount yaw once per frame, not twice', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const m2hb = new M2HBEmplacementSystem(scene);

    const { mounts } = createPBR(scene, vm, m2hb, {
      vehicleId: 'pbr_slew',
      position: new THREE.Vector3(0, 0, 0),
      faction: Faction.US,
    });

    const fwd = mounts.find(m => m.index === 0)!;
    const { yaw: yawSlewRate } = fwd.emplacement.getSlewRates();

    // Aim the mount somewhere far enough that one second of slew will
    // not reach the target — the advance is then bounded by the rate.
    fwd.emplacement.setAim(Math.PI * 0.9, 0);
    expect(fwd.emplacement.getYaw()).toBeCloseTo(0, 6);

    // Step the VehicleManager (PBR + 2 mounts) for one whole second of
    // fixed-step updates. If PBR.update double-stepped the mounts, the
    // observed yaw advance would be ~2 * yawSlewRate * 1.0 radians.
    const DT = 1 / 60;
    for (let i = 0; i < 60; i++) {
      vm.update(DT);
    }

    const advanced = fwd.emplacement.getYaw();
    // One second of slew at yawSlewRate. Allow a tiny tolerance for
    // floating-point accumulation.
    expect(advanced).toBeGreaterThan(yawSlewRate * 0.95);
    expect(advanced).toBeLessThan(yawSlewRate * 1.1);
  });
});

// Silence unused-import warnings if vitest tree-shakes the type imports.
export type _PBRMountType = PBRMount;
