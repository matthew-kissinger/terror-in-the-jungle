/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { TankPlayerAdapter } from './TankPlayerAdapter';
import { Tank } from './Tank';
import { Faction } from '../combat/types';
import type { VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// CSS-module proxy so the panel's class lookups resolve under jsdom.
vi.mock('../../ui/hud/TankGunnerPanel.module.css', () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

function createPlayerState(): PlayerState {
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    speed: 10,
    runSpeed: 20,
    isRunning: false,
    isGrounded: true,
    isJumping: false,
    jumpForce: 12,
    gravity: -25,
    isCrouching: false,
    isInHelicopter: false,
    helicopterId: null,
    isInFixedWing: false,
    fixedWingId: null,
  };
}

function createTransitionContext(playerState: PlayerState): VehicleTransitionContext {
  return {
    playerState,
    vehicleId: 'm48_1',
    position: new THREE.Vector3(40, 5, 60),
    setPosition: vi.fn(),
    input: {
      setInHelicopter: vi.fn(),
      setFlightVehicleMode: vi.fn(),
      setInputContext: vi.fn(),
      isKeyPressed: vi.fn(() => false),
      isMouseButtonPressed: vi.fn(() => false),
      getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
      clearMouseMovement: vi.fn(),
      getIsPointerLocked: vi.fn(() => false),
      getTouchControls: vi.fn(() => null),
      getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
      getTouchFlightCyclicInput: vi.fn(() => ({ pitch: 0, roll: 0 })),
      relockPointer: vi.fn(),
    } as any,
    cameraController: {
      saveInfantryAngles: vi.fn(),
      restoreInfantryAngles: vi.fn(),
      setVehicleFollowCamera: vi.fn(),
    } as any,
    hudSystem: { setVehicleContext: vi.fn() } as any,
    gameRenderer: { setCrosshairMode: vi.fn() } as any,
  };
}

function createUpdateContext(ctx: VehicleTransitionContext): VehicleUpdateContext {
  return {
    deltaTime: 1 / 60,
    input: ctx.input,
    cameraController: ctx.cameraController,
    hudSystem: ctx.hudSystem,
  };
}

describe('TankPlayerAdapter — gunner panel lifecycle in the crew adapter (jsdom)', () => {
  let adapter: TankPlayerAdapter;
  let tank: Tank;
  let host: HTMLElement;
  let ctx: VehicleTransitionContext;

  beforeEach(() => {
    const object = new THREE.Object3D();
    object.position.set(0, 1, 0);
    new THREE.Scene().add(object);
    tank = new Tank('m48_1', object, Faction.US);
    adapter = new TankPlayerAdapter(tank);
    host = document.createElement('div');
    document.body.appendChild(host);
    ctx = createTransitionContext(createPlayerState());
  });

  it('mounts the panel on swap into the gunner station and unmounts on swap back to the driver hatch', () => {
    adapter.setHudPanelHost(host);
    adapter.onEnter(ctx); // driver hatch by default — no panel
    expect(host.childElementCount).toBe(0);

    const updateCtx = createUpdateContext(ctx);
    adapter.swapSeat(updateCtx); // up into the gunner station
    expect(host.childElementCount).toBeGreaterThan(0);

    adapter.swapSeat(updateCtx); // back down to the driver hatch
    expect(host.childElementCount).toBe(0);
  });

  it('late host injection mounts the panel when the player is already in the gunner seat (session hook fires after onEnter)', () => {
    adapter.playerSeat = 'gunner';
    adapter.onEnter(ctx); // boards straight into the gunner seat, host not yet set
    expect(host.childElementCount).toBe(0);

    // Composer's onSessionEnter hook lands after onEnter.
    adapter.setHudPanelHost(host);
    expect(host.childElementCount).toBeGreaterThan(0);
  });

  it('dismount and host teardown both unmount the panel', () => {
    adapter.setHudPanelHost(host);
    adapter.playerSeat = 'gunner';
    adapter.onEnter(ctx);
    expect(host.childElementCount).toBeGreaterThan(0);

    adapter.onExit(ctx);
    expect(host.childElementCount).toBe(0);

    // Re-board, then the composer clears the host on session exit.
    adapter.onEnter(ctx);
    expect(host.childElementCount).toBeGreaterThan(0);
    adapter.setHudPanelHost(null);
    expect(host.childElementCount).toBe(0);
  });
});
