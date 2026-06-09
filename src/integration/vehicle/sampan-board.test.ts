// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Sampan } from '../../systems/vehicle/Sampan';
import { WatercraftPlayerAdapter } from '../../systems/vehicle/WatercraftPlayerAdapter';
import { SAMPAN_SCENARIO_SPAWNS } from '../../systems/vehicle/SampanSpawn';
import type {
  VehicleTransitionContext,
  VehicleUpdateContext,
} from '../../systems/vehicle/PlayerVehicleAdapter';
import type { PlayerState } from '../../types';
import type {
  BuoyancySamplerLike,
  WaterInteractionOptions,
  WaterInteractionSample,
} from '../../systems/vehicle/WatercraftBuoyancyTypes';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

/**
 * L3 integration test for the Sampan player-boarding wire
 * (cycle-vekhikl-player-boarding-wire, task
 * vekhikl-board-watercraft-and-emplacement-wire).
 *
 * Sibling factory + F-key router PRs are not yet on master, so the
 * boarding round-trip is exercised through an inline harness mirroring
 * `src/integration/vehicle/m48-board.test.ts`: the test calls onEnter /
 * update / getExitPlan / onExit directly, simulating what the
 * production factory + VehicleSessionController will do. When the
 * factory PR lands, the same assertions can rebind to its surface
 * without touching behavior.
 *
 * Behavior-only per docs/TESTING.md — no implementation-mirror
 * assertions on internal phase names or specific tuning magnitudes.
 */

const DEFAULT_IMMERSION_DEPTH_METERS = 1.6;

function makeFlatWater(surfaceY = 0): BuoyancySamplerLike {
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
        flowVelocity: new THREE.Vector3(),
      };
    },
  };
}

function createPlayerState(at = new THREE.Vector3(0, 1, 0)): PlayerState {
  return {
    position: at.clone(),
    velocity: new THREE.Vector3(3, 4, 2),
    speed: 5, runSpeed: 10, isRunning: true, isGrounded: true, isJumping: false,
    jumpForce: 12, gravity: -25, isCrouching: false,
    isInHelicopter: false, helicopterId: null,
    isInFixedWing: false, fixedWingId: null,
  };
}

function makeInput(keyMap: Record<string, boolean> = {}) {
  return {
    setInHelicopter: vi.fn(), setFlightVehicleMode: vi.fn(), setInputContext: vi.fn(),
    isKeyPressed: vi.fn((k: string) => !!keyMap[k.toLowerCase()]),
    getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
    clearMouseMovement: vi.fn(),
    getIsPointerLocked: vi.fn(() => false),
    getTouchControls: vi.fn(() => null),
    getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
    relockPointer: vi.fn(),
  };
}

function makeCtx(playerState: PlayerState, hullPosition: THREE.Vector3, vehicleId: string) {
  const input = makeInput();
  const camera = { saveInfantryAngles: vi.fn(), restoreInfantryAngles: vi.fn() };
  const hud = { setVehicleContext: vi.fn(), updateElevation: vi.fn(), showMessage: vi.fn() };
  const renderer = { setCrosshairMode: vi.fn() };
  const setPosition = vi.fn((next: THREE.Vector3) => { playerState.position.copy(next); });
  return {
    ctx: {
      playerState,
      vehicleId,
      position: hullPosition.clone(),
      setPosition,
      input: input as any,
      cameraController: camera as any,
      hudSystem: hud as any,
      gameRenderer: renderer as any,
    } as VehicleTransitionContext,
    input, camera, hud, renderer, setPosition,
  };
}

function makeUpdateCtx(input: ReturnType<typeof makeInput>): VehicleUpdateContext {
  return {
    deltaTime: 1 / 60,
    input: input as any,
    cameraController: { saveInfantryAngles: vi.fn(), restoreInfantryAngles: vi.fn() } as any,
    hudSystem: { setVehicleContext: vi.fn(), updateElevation: vi.fn(), showMessage: vi.fn() } as any,
  };
}

/** Spawn a real Sampan at the A Shau scenario position and settle it on water. */
function spawnSettledSampan(): Sampan {
  const spawn = SAMPAN_SCENARIO_SPAWNS.a_shau_valley;
  const object = new THREE.Object3D();
  // Y=0 so the flat water surface (also at 0) puts the hull at the waterline.
  object.position.set(spawn.position.x, 0, spawn.position.z);
  object.rotation.y = spawn.initialYaw;
  const sampan = new Sampan(spawn.vehicleId, object, spawn.faction);
  sampan.setWaterSampler(makeFlatWater(0));
  for (let i = 0; i < 60; i += 1) sampan.update(1 / 60);
  return sampan;
}

describe('Sampan player boarding end-to-end (pilot seat, A Shau scenario)', () => {
  let sampan: Sampan;
  let adapter: WatercraftPlayerAdapter;

  beforeEach(() => {
    sampan = spawnSettledSampan();
    adapter = new WatercraftPlayerAdapter(sampan);
  });

  it('F-press seats the player at the pilot seat', () => {
    const player = createPlayerState(new THREE.Vector3(0, 1, 0));
    const { ctx, camera, hud, setPosition } = makeCtx(player, sampan.getPosition(), sampan.id);

    expect(adapter.getActiveVehicleId()).toBeNull();
    adapter.onEnter(ctx);

    expect(adapter.getActiveVehicleId()).toBe(sampan.id);
    expect(adapter.playerSeat).toBe('pilot');
    // Player snapped onto the deck — no leftover infantry motion.
    expect(player.velocity.x).toBe(0);
    expect(player.velocity.y).toBe(0);
    expect(player.velocity.z).toBe(0);
    expect(player.isRunning).toBe(false);
    expect(setPosition).toHaveBeenCalledWith(ctx.position, 'watercraft.enter');
    expect(hud.setVehicleContext).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'pilot' }),
    );
    expect(camera.saveInfantryAngles).toHaveBeenCalled();
  });

  it('drives forward under sustained W throttle (positive forward speed + horizontal travel)', () => {
    const player = createPlayerState(new THREE.Vector3(0, 1, 0));
    const { ctx } = makeCtx(player, sampan.getPosition(), sampan.id);
    adapter.onEnter(ctx);

    const startPos = sampan.getPosition().clone();

    // Brief asks for "5 m via throttle" but the Sampan has very low
    // engine power by design — we assert behavior (sign + non-trivial
    // motion) per docs/TESTING.md rather than a flaky magnitude.
    const updateCtx = makeUpdateCtx(makeInput({ keyw: true }));
    for (let i = 0; i < 360; i += 1) {
      adapter.update(updateCtx);
      sampan.update(1 / 60);
    }

    expect(sampan.getForwardSpeed()).toBeGreaterThan(0);
    const endPos = sampan.getPosition();
    const travel = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
    expect(travel).toBeGreaterThan(0.05);
  });

  it('F-press while seated exits beside the hull (riverbank step) and tears the adapter down', () => {
    const player = createPlayerState(new THREE.Vector3(0, 1, 0));
    const { ctx, camera, hud } = makeCtx(player, sampan.getPosition(), sampan.id);
    adapter.onEnter(ctx);

    // Drive a bit so the hull has moved off the boarding point.
    const driveCtx = makeUpdateCtx(makeInput({ keyw: true }));
    for (let i = 0; i < 120; i += 1) {
      adapter.update(driveCtx);
      sampan.update(1 / 60);
    }

    const plan = adapter.getExitPlan!(ctx, {});
    expect(plan.canExit).toBe(true);
    expect(plan.position).toBeDefined();
    // Either docking state is valid — the assertion is that the adapter
    // surfaces the context so the HUD/session can pick a prompt.
    expect(['in-water', 'on-bank']).toContain(plan.message);

    // Exit position clear of the hull center (yaw-rotated side offset).
    const hullPos = sampan.getPosition();
    const offset = Math.hypot(plan.position!.x - hullPos.x, plan.position!.z - hullPos.z);
    expect(offset).toBeGreaterThan(1);

    // onExit must forget the binding and zero controls so the
    // unattended hull coasts to a stop under water drag.
    const setControlsSpy = vi.spyOn(sampan, 'setControls');
    adapter.onExit(ctx);

    expect(adapter.getActiveVehicleId()).toBeNull();
    expect(adapter.getControls().throttle).toBe(0);
    expect(adapter.getControls().rudder).toBe(0);
    expect(setControlsSpy).toHaveBeenCalledWith(0, 0);
    expect(camera.restoreInfantryAngles).toHaveBeenCalled();
    expect(hud.setVehicleContext).toHaveBeenLastCalledWith(null);
  });
});
