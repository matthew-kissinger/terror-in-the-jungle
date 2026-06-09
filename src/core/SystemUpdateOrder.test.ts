// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SystemUpdater } from './SystemUpdater';
import { SYSTEM_UPDATE_SCHEDULE } from './SystemUpdateSchedule';
import type { SystemKeyToType } from './SystemRegistry';

/**
 * Frame-order guard (cycle-2026-06-09-weapon-input-and-gate-hardening, Phase 1).
 *
 * The 2026-06-09 helicopter-jitter fix (commit 8e99caac) proved the
 * SystemUpdater Vehicles-before-Player order is load-bearing for high-refresh
 * smoothness: piloted-vehicle physics publish an interpolated visual pose in
 * the Vehicles phase, and the chase cameras hard-copy that pose in the Player
 * phase, so swapping the two reintroduces a one-frame desync that aliases the
 * 60Hz fixed step against 120/144Hz displays (visible model shake/snap). A
 * reorder like 454c1fec can silently reintroduce that desync, so these tests
 * lock the contract against both an ordering swap and a double-update.
 *
 * These are behavior tests: they guard the observable frame-ordering contract
 * (which phase's systems run first, and that vehicle systems tick exactly once
 * per frame), not private internals or tuning constants.
 */

/** A minimally-mocked system that records its call order under a label. */
function recordingSystem(order: string[], label: string, extra: Record<string, unknown> = {}) {
  return {
    update: vi.fn(() => { order.push(label); }),
    ...extra,
  };
}

function createRefs(order: string[]): SystemKeyToType {
  const helicopterModel = recordingSystem(order, 'vehicles:helicopter');
  const fixedWingModel = recordingSystem(order, 'vehicles:fixedWing');
  const vehicleManager = recordingSystem(order, 'vehicles:manager', {
    getAllVehicles: vi.fn(() => []),
  });

  return {
    spatialGridManager: { resetFrameTelemetry: vi.fn() },
    minimapSystem: { setCommandPosition: vi.fn(), update: vi.fn() },
    fullMapSystem: {
      setCommandPosition: vi.fn(),
      getIsVisible: vi.fn(() => false),
      update: vi.fn(),
    },
    compassSystem: { update: vi.fn() },
    hudSystem: { update: vi.fn(), showMessage: vi.fn() },
    helicopterModel,
    fixedWingModel,
    vehicleManager,
    firstPersonWeapon: recordingSystem(order, 'player:weapon'),
    playerController: {
      getPosition: vi.fn(() => new THREE.Vector3(0, 2, 0)),
      setPosition: vi.fn(),
      update: vi.fn(() => { order.push('player:controller'); }),
    },
  } as unknown as SystemKeyToType;
}

describe('SystemUpdater frame ordering', () => {
  it('runs every vehicle-phase system before the player phase', () => {
    const updater = new SystemUpdater();
    const order: string[] = [];
    const refs = createRefs(order);

    updater.updateSystems(refs, [], undefined, 0.016, true);

    // The last vehicle-phase system must precede the first player-phase system.
    const lastVehicleIdx = Math.max(
      order.indexOf('vehicles:helicopter'),
      order.indexOf('vehicles:fixedWing'),
      order.indexOf('vehicles:manager'),
    );
    const firstPlayerIdx = Math.min(
      ...['player:controller', 'player:weapon']
        .map(label => order.indexOf(label))
        .filter(idx => idx >= 0),
    );

    expect(lastVehicleIdx).toBeGreaterThanOrEqual(0);
    expect(firstPlayerIdx).toBeGreaterThanOrEqual(0);
    expect(lastVehicleIdx).toBeLessThan(firstPlayerIdx);
  });

  it('ticks vehicle-phase systems exactly once even when also listed in the generic loop', () => {
    // The vehicle-phase systems are fallback-tracked, so SystemUpdater's generic
    // "Other" loop must skip them. If one is dropped from the schedule it would
    // tick twice per frame here -> physics integrated twice -> pose corruption.
    const updater = new SystemUpdater();
    const order: string[] = [];
    const refs = createRefs(order);

    updater.updateSystems(
      refs,
      [
        refs.helicopterModel,
        refs.fixedWingModel,
        refs.vehicleManager,
      ] as unknown as Parameters<SystemUpdater['updateSystems']>[1],
      undefined,
      0.016,
      true,
    );

    expect(refs.helicopterModel.update).toHaveBeenCalledTimes(1);
    expect(refs.fixedWingModel.update).toHaveBeenCalledTimes(1);
    expect(refs.vehicleManager.update).toHaveBeenCalledTimes(1);
  });

  it('declares the Vehicles phase ahead of the Player phase in the schedule', () => {
    const phaseOrder = SYSTEM_UPDATE_SCHEDULE.map(group => group.phase);
    const vehiclesPhaseIdx = phaseOrder.indexOf('Vehicles');
    const playerPhaseIdx = phaseOrder.indexOf('Player');

    expect(vehiclesPhaseIdx).toBeGreaterThanOrEqual(0);
    expect(playerPhaseIdx).toBeGreaterThanOrEqual(0);
    expect(vehiclesPhaseIdx).toBeLessThan(playerPhaseIdx);
  });

  it('runs systems in the order their phases are declared in the schedule', () => {
    // Ties the declarative schedule to the imperative updateSystems body: the
    // observed Vehicles->Player runtime order must agree with the declared
    // phase order, so a swap in either place is caught.
    const updater = new SystemUpdater();
    const order: string[] = [];
    const refs = createRefs(order);

    updater.updateSystems(refs, [], undefined, 0.016, true);

    const phaseOrder = SYSTEM_UPDATE_SCHEDULE.map(group => group.phase);
    const scheduleVehiclesFirst =
      phaseOrder.indexOf('Vehicles') < phaseOrder.indexOf('Player');

    const runtimeVehiclesIdx = order.indexOf('vehicles:helicopter');
    const runtimePlayerIdx = order.indexOf('player:controller');
    const runtimeVehiclesFirst = runtimeVehiclesIdx < runtimePlayerIdx;

    expect(runtimeVehiclesFirst).toBe(scheduleVehiclesFirst);
  });
});
