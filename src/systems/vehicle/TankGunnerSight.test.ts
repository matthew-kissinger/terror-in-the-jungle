/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { TankGunnerAdapter } from './TankGunnerAdapter';
import { Tank } from './Tank';
import type { TankTurret } from './TankTurret';
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

describe('TankGunnerAdapter — gunner panel lifecycle (jsdom)', () => {
  let adapter: TankGunnerAdapter;
  let tank: Tank;
  let turret: TankTurret;
  let host: HTMLElement;

  beforeEach(() => {
    const object = new THREE.Object3D();
    object.position.set(0, 1, 0);
    new THREE.Scene().add(object);
    tank = new Tank('m48_1', object, Faction.US);
    turret = tank.getTurret();
    adapter = new TankGunnerAdapter(tank, turret);

    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  it('mounts the FJ gunner panel into the HUD host on gunner-seat entry', () => {
    adapter.setHudPanelHost(host);
    expect(adapter.getPanel().mounted).toBe(false);

    adapter.onEnter(createTransitionContext(createPlayerState()));

    expect(adapter.getPanel().mounted).toBe(true);
    // The panel DOM is actually attached under the host.
    expect(host.contains(adapter.getPanel().element)).toBe(true);
    // And the tank-gunner reticle was selected on the renderer.
    // (mode wiring is covered in the node-env adapter test; here we confirm
    // the DOM panel mounted under a real host.)
  });

  it('unmounts the panel on dismount so it does not linger over the infantry HUD', () => {
    adapter.setHudPanelHost(host);
    const ctx = createTransitionContext(createPlayerState());
    adapter.onEnter(ctx);
    expect(adapter.getPanel().mounted).toBe(true);

    adapter.onExit(ctx);
    expect(adapter.getPanel().mounted).toBe(false);
    expect(host.contains(adapter.getPanel().element)).toBe(false);
  });

  it('reflects RELOADING in the panel after a shot and READY again once reloaded', () => {
    let nowMs = 1000;
    adapter.setHudPanelHost(host, () => nowMs);
    adapter.reloadSeconds = 3.5;
    const ctx = createTransitionContext(createPlayerState());
    adapter.onEnter(ctx);

    const stateEl = () =>
      adapter.getPanel().element.querySelector('[data-ref="state"]')?.textContent;
    expect(stateEl()).toBe('READY');

    // Hold the trigger → the gate stamps the shot, panel shows RELOADING.
    (ctx.input.isMouseButtonPressed as ReturnType<typeof vi.fn>).mockImplementation(
      (b: number) => b === 0,
    );
    adapter.update(createUpdateContext(ctx));
    expect(stateEl()).toBe('RELOADING');

    // Advance past the reload, release the trigger, tick → READY again.
    nowMs += 3500;
    (ctx.input.isMouseButtonPressed as ReturnType<typeof vi.fn>).mockReturnValue(false);
    adapter.update(createUpdateContext(ctx));
    expect(stateEl()).toBe('READY');
  });

  it('does not require a host (stays headless-safe when none is injected)', () => {
    // No setHudPanelHost call → onEnter must not throw and must not mount.
    expect(() => adapter.onEnter(createTransitionContext(createPlayerState()))).not.toThrow();
    expect(adapter.getPanel().mounted).toBe(false);
  });
});
