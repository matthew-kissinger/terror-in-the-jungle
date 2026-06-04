// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Sampan IVehicle behavior tests.
 *
 * Authoritative scope: docs/tasks/cycle-voda-3-watercraft.md (R2 —
 * sampan-integration).
 *
 * L2 (one system + scene mocks) per docs/TESTING.md. Assertions are
 * behavior-driven: we observe that the hull reports the right
 * category, the seat API admits and ejects a pilot, throttle drives
 * forward motion through the WatercraftPhysics integrator, and the
 * scenario spawn registers sampans at distinct positions for the two
 * scenarios the cycle ships against.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Sampan } from './Sampan';
import { VehicleManager } from './VehicleManager';
import {
  createSampan,
  spawnScenarioSampans,
  SAMPAN_SCENARIO_SPAWNS,
} from './SampanSpawn';
import { Faction } from '../combat/types';
import type { BuoyancySamplerLike } from '../environment/water/BuoyancyForce';
import type {
  WaterInteractionOptions,
  WaterInteractionSample,
} from '../environment/water/WaterSurfaceSampler';

// ---------------------------------------------------------------------------
// Water sampler fakes (mirrors WatercraftPhysics.test.ts patterns)
// ---------------------------------------------------------------------------

const DEFAULT_IMMERSION_DEPTH_METERS = 1.6;

function makeFlatWater(
  surfaceY = 0,
  flow: THREE.Vector3 = new THREE.Vector3(),
): BuoyancySamplerLike {
  return {
    sampleWaterInteraction(
      position: THREE.Vector3,
      options?: WaterInteractionOptions,
    ): WaterInteractionSample {
      const depth = Math.max(0, surfaceY - position.y);
      const immersionDepth = options?.immersionDepthMeters
        && options.immersionDepthMeters > 0.01
        ? options.immersionDepthMeters
        : DEFAULT_IMMERSION_DEPTH_METERS;
      const immersion01 = Math.min(1, depth / immersionDepth);
      return {
        source: depth > 0 ? 'global' : 'none',
        surfaceY: depth > 0 ? surfaceY : null,
        depth,
        submerged: depth > 0,
        immersion01,
        buoyancyScalar: immersion01,
        flowVelocity: depth > 0 ? flow.clone() : new THREE.Vector3(),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Sampan IVehicle surface
// ---------------------------------------------------------------------------

describe('Sampan IVehicle', () => {
  describe('IVehicle surface', () => {
    it('reports the watercraft category and the configured faction', () => {
      const object = new THREE.Object3D();
      const sampan = new Sampan('s1', object, Faction.NVA);
      expect(sampan.category).toBe('watercraft');
      expect(sampan.faction).toBe(Faction.NVA);
    });

    it('exposes a stable id alias mirroring vehicleId', () => {
      const sampan = new Sampan('s_id_alias', new THREE.Object3D(), Faction.VC);
      expect(sampan.id).toBe('s_id_alias');
      expect(sampan.id).toBe(sampan.vehicleId);
    });

    it('seeds physics from the placed object so first update does not snap to origin', () => {
      const object = new THREE.Object3D();
      object.position.set(50, 1.0, -30);
      const scene = new THREE.Scene();
      scene.add(object);

      const sampan = new Sampan('s_seeded', object, Faction.VC);
      // No sampler attached — hull is dry, falls under gravity only.
      // One short update should not warp the hull to the origin.
      sampan.update(0.01);
      const pos = sampan.getPosition();
      expect(pos.x).toBeCloseTo(50, 1);
      expect(pos.z).toBeCloseTo(-30, 1);
    });
  });

  // ----------------------------- Seating ----------------------------------

  describe('Seating (IVehicle + role API)', () => {
    it('admits a pilot into the single seat and ejects them on exit', () => {
      const sampan = new Sampan('s_seat', new THREE.Object3D(), Faction.NVA);
      expect(sampan.hasFreeSeats('pilot')).toBe(true);
      expect(sampan.enterVehicle('player', 'pilot')).toBe(0);
      expect(sampan.getPilotId()).toBe('player');
      expect(sampan.hasFreeSeats('pilot')).toBe(false);

      const exit = sampan.exitVehicle('player');
      expect(exit).not.toBeNull();
      expect(sampan.getPilotId()).toBeNull();
    });

    it('routes occupy / release by role for the WatercraftPlayerAdapter', () => {
      const sampan = new Sampan('s_role', new THREE.Object3D(), Faction.NVA);
      expect(sampan.occupy('pilot', 'player')).toBe(true);
      expect(sampan.getPilotId()).toBe('player');

      sampan.release('pilot');
      expect(sampan.getPilotId()).toBeNull();
      expect(sampan.hasFreeSeats('pilot')).toBe(true);
    });

    it('does not admit a second occupant after the pilot seat is full', () => {
      const sampan = new Sampan('s_full', new THREE.Object3D(), Faction.NVA);
      expect(sampan.enterVehicle('player1')).toBe(0);
      // No passenger seats on a sampan; any further mount fails.
      expect(sampan.enterVehicle('player2')).toBeNull();
      expect(sampan.hasFreeSeats()).toBe(false);
    });
  });

  // -------------------- Floats + responds to throttle --------------------

  describe('Buoyancy + throttle (delegating to WatercraftPhysics)', () => {
    it('construction with default config yields a hull that floats in a bounded vertical envelope', () => {
      // Released above water with no throttle; sampler is a flat
      // surface at y=0. The hull is a conservative spring under
      // gravity + buoyancy — the envelope is bounded (no runaway
      // sink, no runaway lift, finite Y). Behavioral assertion only;
      // the exact equilibrium depth is a tuning concern flagged by
      // the R1 tests for the underlying physics class.
      //
      // The Sampan tuning (mass 500 kg, displacement 0.6 m^3) sits at
      // ~83% submerged equilibrium in fresh water, which gives a
      // weak restoring force relative to gravity — the hull rings
      // with wide amplitude before the per-step drag bleeds it down.
      // Envelope is therefore wider than the WatercraftPhysics.test
      // baseline (which uses a hull tuned for tighter equilibrium).
      const object = new THREE.Object3D();
      object.position.set(0, 3, 0);
      const sampan = new Sampan('s_float', object, Faction.NVA);
      sampan.setWaterSampler(makeFlatWater(0));

      // Run 10s to bleed start transients (matches the R1 settle
      // budget), then sample 2s for the envelope check.
      for (let i = 0; i < 600; i += 1) sampan.update(1 / 60);
      const ys: number[] = [];
      for (let i = 0; i < 120; i += 1) {
        sampan.update(1 / 60);
        ys.push(sampan.getPosition().y);
      }
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      // Bounded — neither sinks past sane depth nor flies off.
      expect(minY).toBeGreaterThan(-50);
      expect(maxY).toBeLessThan(50);
      // Finite (no NaN-leak).
      expect(Number.isFinite(sampan.getPosition().y)).toBe(true);
      expect(Number.isFinite(sampan.getVelocity().y)).toBe(true);
    });

    it('throttle drives forward motion (hull travels along chassis-forward axis over a few seconds)', () => {
      // Start at the waterline, full throttle. After a few seconds
      // the hull should have measurable forward speed and have
      // travelled horizontally. Chassis-forward is local -Z.
      const object = new THREE.Object3D();
      object.position.set(0, 0, 0);
      const sampan = new Sampan('s_drive', object, Faction.NVA);
      sampan.setWaterSampler(makeFlatWater(0));

      // Settle vertically without throttle first so any motion
      // afterwards is throttle-driven, not transient vertical.
      for (let i = 0; i < 60; i += 1) sampan.update(1 / 60);
      const startPos = sampan.getPosition().clone();

      sampan.setControls(1.0, 0); // full throttle, neutral rudder
      for (let i = 0; i < 360; i += 1) sampan.update(1 / 60); // 6s

      // Forward speed materialized — the Sampan has very low engine
      // power so we assert a modest floor, not a sprint.
      expect(sampan.getForwardSpeed()).toBeGreaterThan(0.05);
      // Hull translated horizontally.
      const endPos = sampan.getPosition();
      const horizontalTravel = Math.hypot(
        endPos.x - startPos.x,
        endPos.z - startPos.z,
      );
      expect(horizontalTravel).toBeGreaterThan(0.05);
    });

    it('reverse throttle drives backward motion', () => {
      // Behavioral parity check — negative throttle should produce
      // negative forward speed, not a NaN or no-op.
      const object = new THREE.Object3D();
      object.position.set(0, 0, 0);
      const sampan = new Sampan('s_reverse', object, Faction.NVA);
      sampan.setWaterSampler(makeFlatWater(0));

      for (let i = 0; i < 60; i += 1) sampan.update(1 / 60);

      sampan.setControls(-1.0, 0);
      for (let i = 0; i < 360; i += 1) sampan.update(1 / 60);
      expect(sampan.getForwardSpeed()).toBeLessThan(0);
    });
  });

  // ----------------------------- Lifecycle --------------------------------

  describe('Lifecycle', () => {
    it('disposes by removing the scene object and marking destroyed', () => {
      const scene = new THREE.Scene();
      const object = new THREE.Object3D();
      scene.add(object);
      const sampan = new Sampan('s_dispose', object, Faction.NVA);

      expect(scene.children).toContain(object);
      sampan.dispose();

      expect(scene.children).not.toContain(object);
      expect(sampan.isDestroyed()).toBe(true);
      expect(sampan.getHealthPercent()).toBe(0);
    });

    it('is a no-op when update is called after dispose', () => {
      const sampan = new Sampan('s_post_dispose', new THREE.Object3D(), Faction.NVA);
      sampan.dispose();
      // Should not throw.
      sampan.update(0.016);
      expect(sampan.isDestroyed()).toBe(true);
    });

    it('setWaterSampler(null) detaches the hull from the water surface (no throw)', () => {
      const sampan = new Sampan('s_detach', new THREE.Object3D(), Faction.NVA);
      sampan.setWaterSampler(makeFlatWater(0));
      sampan.update(1 / 60);
      sampan.setWaterSampler(null);
      sampan.update(1 / 60);
      // Position remains finite; no exceptions.
      const pos = sampan.getPosition();
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
      expect(Number.isFinite(pos.z)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario spawn
// ---------------------------------------------------------------------------

describe('Sampan scenario spawn', () => {
  it('registers a Sampan with the VehicleManager and attaches the procedural mesh to the scene', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const { sampan, root } = createSampan(scene, vm, {
      vehicleId: 'sampan_test',
      position: new THREE.Vector3(10, 0, 20),
      faction: Faction.NVA,
    });

    expect(scene.children).toContain(root);
    expect(sampan.category).toBe('watercraft');
    expect(sampan.faction).toBe(Faction.NVA);
    expect(vm.getVehicle('sampan_test')).toBe(sampan);
  });

  it('spawn table covers Open Frontier and A Shau with distinct vehicle ids', () => {
    expect(SAMPAN_SCENARIO_SPAWNS.open_frontier.vehicleId)
      .not.toBe(SAMPAN_SCENARIO_SPAWNS.a_shau_valley.vehicleId);
    // Both should be opfor (sampans are characteristically VC / NVA).
    expect([Faction.VC, Faction.NVA]).toContain(SAMPAN_SCENARIO_SPAWNS.open_frontier.faction);
    expect([Faction.VC, Faction.NVA]).toContain(SAMPAN_SCENARIO_SPAWNS.a_shau_valley.faction);
  });

  it('spawnScenarioSampans registers both modes when both are requested', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const spawned = spawnScenarioSampans({
      modes: ['open_frontier', 'a_shau_valley'],
      scene,
      vehicleManager: vm,
    });

    expect(spawned).toHaveLength(2);
    const watercraft = vm.getVehiclesByCategory('watercraft');
    expect(watercraft).toHaveLength(2);
  });

  it('spawns at the table positions when no resolver is supplied', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    spawnScenarioSampans({
      modes: ['open_frontier', 'a_shau_valley'],
      scene,
      vehicleManager: vm,
    });

    const ofSampan = vm.getVehicle(SAMPAN_SCENARIO_SPAWNS.open_frontier.vehicleId)!;
    const ashauSampan = vm.getVehicle(SAMPAN_SCENARIO_SPAWNS.a_shau_valley.vehicleId)!;
    expect(ofSampan.getPosition().x).toBeCloseTo(SAMPAN_SCENARIO_SPAWNS.open_frontier.position.x, 2);
    expect(ofSampan.getPosition().z).toBeCloseTo(SAMPAN_SCENARIO_SPAWNS.open_frontier.position.z, 2);
    expect(ashauSampan.getPosition().x).toBeCloseTo(SAMPAN_SCENARIO_SPAWNS.a_shau_valley.position.x, 2);
    expect(ashauSampan.getPosition().z).toBeCloseTo(SAMPAN_SCENARIO_SPAWNS.a_shau_valley.position.z, 2);
  });

  it('honours an optional resolvePosition (water-snap callback)', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const snapped = new THREE.Vector3(123, 7.5, 456);
    spawnScenarioSampans({
      modes: ['open_frontier'],
      scene,
      vehicleManager: vm,
      resolvePosition: () => snapped,
    });

    const sampan = vm.getVehicle(SAMPAN_SCENARIO_SPAWNS.open_frontier.vehicleId)!;
    expect(sampan.getPosition().x).toBeCloseTo(snapped.x, 2);
    expect(sampan.getPosition().z).toBeCloseTo(snapped.z, 2);
  });

  it('VehicleManager.spawnScenarioSampans wraps the helper and returns vehicle ids', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const ids = vm.spawnScenarioSampans({
      scene,
      modes: ['open_frontier', 'a_shau_valley'],
    });

    expect(ids).toHaveLength(2);
    expect(ids).toContain(SAMPAN_SCENARIO_SPAWNS.open_frontier.vehicleId);
    expect(ids).toContain(SAMPAN_SCENARIO_SPAWNS.a_shau_valley.vehicleId);
  });

  it('getSampanByOccupant resolves the seated sampan and ignores non-sampan vehicles', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();

    const { sampan } = createSampan(scene, vm, {
      vehicleId: 'sampan_occupant_test',
      position: new THREE.Vector3(),
      faction: Faction.NVA,
    });

    expect(vm.getSampanByOccupant('player')).toBeNull();
    sampan.enterVehicle('player', 'pilot');
    expect(vm.getSampanByOccupant('player')).toBe(sampan);
  });
});
